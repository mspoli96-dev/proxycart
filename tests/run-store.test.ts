import type { Redis } from "@upstash/redis";
import { describe, expect, it } from "vitest";
import { createRunStore, hashFromRedis } from "../src/lib/server/run-store";
import { LuaRedis } from "./backend-lua";

class UpstashFixture {
  lua = new LuaRedis();
  get at() { return this.lua.at; }
  set at(value: number) { this.lua.at = value; }
  eval = (script: string, keys: string[], args: (string | number)[]) => this.lua.eval(script, keys, args);
  strings = new Map<string, string>();
  hashes = new Map<string, Map<string, string>>();
  lists = new Map<string, string[]>();

  async get(key: string) { return this.strings.get(key) ?? null; }
  async set(key: string, value: string, options?: { nx?: boolean; ex?: number }) {
    if (options?.nx && this.strings.has(key)) return null;
    this.strings.set(key, value);
    return "OK";
  }
  async hsetnx(key: string, field: string, value: string) {
    const hash = this.hashes.get(key) ?? new Map<string, string>();
    if (hash.has(field)) return 0;
    hash.set(field, value);
    this.hashes.set(key, hash);
    return 1;
  }
  async hgetall(key: string) {
    const hash = this.hashes.get(key);
    return hash ? [...hash].flat() : null;
  }
  async rpush(key: string, value: string) { this.lists.set(key, [...(this.lists.get(key) ?? []), value]); return this.lists.get(key)!.length; }
  async ltrim(key: string, start: number) { this.lists.set(key, (this.lists.get(key) ?? []).slice(start)); return "OK"; }
  async lrange(key: string) { return this.lists.get(key) ?? []; }
  async expire() { return 1; }
}

function storeWith(fixture: UpstashFixture) {
  return createRunStore(fixture as unknown as Redis, () => fixture.at);
}

describe("Redis hashes", () => {
  it("reads flat arrays and objects the same way", () => {
    expect(hashFromRedis(["harbourSignedIn", "1", "soldOut:harbour", "1"])).toEqual({ harbourSignedIn: "1", "soldOut:harbour": "1" });
    expect(hashFromRedis({ harbourSignedIn: 1 })).toEqual({ harbourSignedIn: "1" });
    expect(hashFromRedis(null)).toEqual({});
  });

  it("keeps sign-in and stock-out conditions with raw Upstash responses", async () => {
    const store = storeWith(new UpstashFixture());
    expect(await store.conditions("run")).toEqual({ harbourSignedIn: false, hoodiesSoldOutAt: [], stockOutArmed: false });
    expect(await store.setCondition("run", "harbourSignedIn")).toBe(true);
    expect(await store.setCondition("run", "harbourSignedIn")).toBe(false);
    await store.setCondition("run", "soldOut:harbour");
    expect(await store.conditions("run")).toEqual({ harbourSignedIn: true, hoodiesSoldOutAt: ["harbour"], stockOutArmed: false });
  });

  it("remembers when each session item was first seen", async () => {
    const store = storeWith(new UpstashFixture());
    await store.markSeen("run", ["a"], 1_000);
    expect(await store.markSeen("run", ["a", "b"], 2_000)).toEqual({ a: 1_000, b: 2_000 });
  });

  it("claims requests and mandates exactly once", async () => {
    const store = storeWith(new UpstashFixture());
    expect(await store.claim("run", "request:r1")).toBe(true);
    expect(await store.claim("run", "request:r1")).toBe(false);
    expect(await store.useMandate("PXC-ABCD-EFGH")).toBe(true);
    expect(await store.useMandate("PXC-ABCD-EFGH")).toBe(false);
  });
});

describe("live run admission", () => {
  it("allows one concurrent live run across all visitors", async () => {
    const fixture = new UpstashFixture();
    const store = storeWith(fixture);
    await store.reserve("visitor-a", "run-1");
    await expect(store.reserve("visitor-a", "run-2")).rejects.toThrow("already have a live run");
    await expect(store.reserve("visitor-b", "run-3")).rejects.toThrow("Another visitor's live run");
    await store.release("visitor-a", "run-1");
    await expect(store.reserve("visitor-b", "run-3")).resolves.toBeUndefined();
  });

  it("frees the slot automatically when a run outlives its reservation", async () => {
    const fixture = new UpstashFixture();
    const store = storeWith(fixture);
    await store.reserve("visitor-a", "run-1");
    fixture.at += 12 * 60_000;
    await expect(store.reserve("visitor-b", "run-2")).resolves.toBeUndefined();
  });

  it("caps runs per visitor and per day", async () => {
    const fixture = new UpstashFixture();
    const store = storeWith(fixture);
    const run = async (visitor: string, id: string) => { await store.reserve(visitor, id); await store.release(visitor, id); };
    await run("visitor-a", "1");
    await run("visitor-a", "2");
    await expect(store.reserve("visitor-a", "3")).rejects.toThrow("Today's live runs");
    await run("visitor-b", "4");
    await run("visitor-c", "5");
    await expect(store.reserve("visitor-d", "6")).rejects.toThrow("Today's live runs");
  });

  it("stops at the monthly reservation budget", async () => {
    const fixture = new UpstashFixture();
    const store = storeWith(fixture);
    for (let day = 0; day < 4; day += 1) {
      for (let index = 0; index < 4; index += 1) {
        const id = `${day}-${index}`;
        if (day === 3 && index === 3) {
          await expect(store.reserve(`visitor-${id}`, id)).rejects.toThrow("This month's live demo allowance");
        } else {
          await store.reserve(`visitor-${id}`, id);
          await store.release(`visitor-${id}`, id);
        }
      }
      fixture.at += 24 * 60 * 60_000;
    }
  });
});
