import { Redis } from "@upstash/redis";
import { STORE_IDS, type StoreId } from "../catalog";
import type { MandateView, RunSnapshot, Scenario, StoreEvent } from "../contracts";
import type { MandateRecord } from "../mandate";
import { BASE_CONDITIONS, type PlanEvaluation, type StoreConditions } from "../pricing";
import { CONCURRENT_LIMIT, GLOBAL_DAILY_LIMIT, monthlyBudgetMicroUsd, redisConfiguration, RUN_MAX_MS, RUN_RESERVE_MICRO_USD, RUN_TTL_SECONDS, VISITOR_DAILY_LIMIT } from "./config";
import { PublicError } from "./security";

export interface RunRecord {
  id: string;
  visitorId: string;
  sessionId: string | null;
  model: string;
  scenario: Scenario;
  createdAt: number;
  deadlineAt: number;
}

export interface DecisionRecord {
  at: number;
  kind: "origin" | "sign-in" | "approval";
  requestId: string;
  decision: string;
  origin?: string;
  storeId?: StoreId | null;
  evaluation?: PlanEvaluation;
  summary?: string;
  changeReason?: string | null;
  newBudgetCents?: number | null;
  mandates?: MandateView[];
}

export interface RunStore {
  reserve(visitorId: string, runId: string): Promise<void>;
  release(visitorId: string, runId: string): Promise<void>;
  saveRun(run: RunRecord): Promise<void>;
  getRun(runId: string): Promise<RunRecord | null>;
  budget(runId: string, fallbackCents: number): Promise<number>;
  setBudget(runId: string, cents: number): Promise<void>;
  conditions(runId: string): Promise<StoreConditions>;
  setCondition(runId: string, flag: ConditionFlag): Promise<boolean>;
  addEvent(runId: string, event: StoreEvent): Promise<void>;
  events(runId: string): Promise<StoreEvent[]>;
  claim(runId: string, key: string): Promise<boolean>;
  addDecision(runId: string, decision: DecisionRecord): Promise<void>;
  decisions(runId: string): Promise<DecisionRecord[]>;
  markSeen(runId: string, itemIds: string[], at: number): Promise<Record<string, number>>;
  finish(runId: string, reason: string): Promise<boolean>;
  finishedReason(runId: string): Promise<string | null>;
  saveFinal(runId: string, snapshot: RunSnapshot): Promise<void>;
  final(runId: string): Promise<RunSnapshot | null>;
  saveMandate(mandate: MandateRecord): Promise<void>;
  mandate(code: string): Promise<MandateRecord | null>;
  useMandate(code: string): Promise<boolean>;
}

export const admissionScript = `
redis.call('ZREMRANGEBYSCORE', KEYS[4], '-inf', ARGV[2])
if redis.call('GET', KEYS[5]) == ARGV[1] then return 1 end
if redis.call('EXISTS', KEYS[5]) == 1 then return -1 end
if redis.call('ZCARD', KEYS[4]) >= tonumber(ARGV[6]) then return -5 end
if tonumber(redis.call('GET', KEYS[1]) or '0') >= tonumber(ARGV[4]) then return -2 end
if tonumber(redis.call('GET', KEYS[2]) or '0') >= tonumber(ARGV[5]) then return -3 end
if tonumber(redis.call('GET', KEYS[3]) or '0') + tonumber(ARGV[7]) > tonumber(ARGV[8]) then return -4 end
redis.call('INCR', KEYS[1])
redis.call('EXPIRE', KEYS[1], 172800)
redis.call('INCR', KEYS[2])
redis.call('EXPIRE', KEYS[2], 172800)
redis.call('INCRBY', KEYS[3], ARGV[7])
redis.call('EXPIRE', KEYS[3], 5356800)
redis.call('ZADD', KEYS[4], tonumber(ARGV[2]) + tonumber(ARGV[3]) * 1000, ARGV[1])
redis.call('EXPIRE', KEYS[4], ARGV[3])
redis.call('SET', KEYS[5], ARGV[1], 'EX', ARGV[3])
return 1
`;

export const releaseScript = `
redis.call('ZREM', KEYS[1], ARGV[1])
if redis.call('GET', KEYS[2]) == ARGV[1] then redis.call('DEL', KEYS[2]) end
return 1
`;

const NS = "proxycart";
const runKey = (runId: string, part?: string) => `${NS}:run:${runId}${part ? `:${part}` : ""}`;
const mandateKey = (code: string, part?: string) => `${NS}:mandate:${code}${part ? `:${part}` : ""}`;
const activeKeys = (visitorId: string) => [`${NS}:{admission}:active`, `${NS}:{admission}:visitor-active:${visitorId}`];
const MANDATE_TTL_SECONDS = 20 * 60;
const EVENT_LIMIT = 200;

export type ConditionFlag = "harbourSignedIn" | "stockOutArmed" | `soldOut:${StoreId}`;

export function conditionsFromHash(values: Record<string, string>): StoreConditions {
  return {
    harbourSignedIn: values.harbourSignedIn === "1",
    hoodiesSoldOutAt: STORE_IDS.filter(storeId => values[`soldOut:${storeId}`] === "1"),
    stockOutArmed: values.stockOutArmed === "1",
  };
}

export function hashFromRedis(value: unknown): Record<string, string> {
  if (Array.isArray(value)) {
    const entries: Record<string, string> = {};
    for (let index = 0; index + 1 < value.length; index += 2) entries[String(value[index])] = String(value[index + 1]);
    return entries;
  }
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).map(([field, entry]) => [field, String(entry)]));
  return {};
}

function parse<T>(value: unknown): T | null {
  if (value === null || value === undefined) return null;
  if (typeof value !== "string") return value as T;
  try { return JSON.parse(value) as T; } catch { return null; }
}

export function admissionFailure(result: unknown): PublicError | null {
  if (result === 1) return null;
  if (result === -1) return new PublicError("You already have a live run in progress.", 429);
  if (result === -5) return new PublicError("Another visitor's live run is in progress. Please try again in a few minutes, or watch a recorded run.", 429);
  if (result === -2 || result === -3) return new PublicError("Today's live runs have been used. The recorded runs show the same agent at work.", 429);
  if (result === -4) return new PublicError("This month's live demo allowance has been used. The recorded runs are still available.", 429);
  return new PublicError("Live runs are temporarily unavailable. Please try again later.", 503);
}

export function createRunStore(client?: Redis, now: () => number = Date.now): RunStore {
  const redis = client ?? new Redis({ ...redisConfiguration(), retry: false, signal: () => AbortSignal.timeout(5_000), enableTelemetry: false, automaticDeserialization: false });
  const touch = (key: string) => redis.expire(key, RUN_TTL_SECONDS);
  return {
    async reserve(visitorId, runId) {
      const at = now();
      const day = new Date(at).toISOString().slice(0, 10);
      const keys = [`${NS}:{admission}:daily:${day}`, `${NS}:{admission}:visitor:${day}:${visitorId}`, `${NS}:{admission}:budget:${day.slice(0, 7)}`, ...activeKeys(visitorId)];
      let result: unknown;
      try {
        result = await redis.eval(admissionScript, keys, [runId, at, Math.ceil(RUN_MAX_MS / 1000) + 60, GLOBAL_DAILY_LIMIT, VISITOR_DAILY_LIMIT, CONCURRENT_LIMIT, RUN_RESERVE_MICRO_USD, monthlyBudgetMicroUsd()]);
      } catch {
        throw new PublicError("Live runs are temporarily unavailable. Please try again later.", 503);
      }
      const failure = admissionFailure(typeof result === "string" ? Number(result) : result);
      if (failure) throw failure;
    },
    async release(visitorId, runId) {
      await redis.eval(releaseScript, activeKeys(visitorId), [runId]);
    },
    async saveRun(run) {
      await redis.set(runKey(run.id), JSON.stringify(run), { ex: RUN_TTL_SECONDS });
    },
    async getRun(runId) {
      return parse<RunRecord>(await redis.get(runKey(runId)));
    },
    async budget(runId, fallbackCents) {
      const value = await redis.get(runKey(runId, "budget"));
      const cents = Number(value);
      return value !== null && Number.isSafeInteger(cents) && cents > 0 ? cents : fallbackCents;
    },
    async setBudget(runId, cents) {
      await redis.set(runKey(runId, "budget"), String(cents), { ex: RUN_TTL_SECONDS });
    },
    async conditions(runId) {
      return conditionsFromHash(hashFromRedis(await redis.hgetall(runKey(runId, "conditions"))));
    },
    async setCondition(runId, flag) {
      const changed = await redis.hsetnx(runKey(runId, "conditions"), flag, "1");
      await touch(runKey(runId, "conditions"));
      return changed === 1;
    },
    async addEvent(runId, event) {
      await redis.rpush(runKey(runId, "events"), JSON.stringify(event));
      await redis.ltrim(runKey(runId, "events"), -EVENT_LIMIT, -1);
      await touch(runKey(runId, "events"));
    },
    async events(runId) {
      const values = await redis.lrange(runKey(runId, "events"), 0, -1);
      return values.map(value => parse<StoreEvent>(value)).filter((event): event is StoreEvent => event !== null);
    },
    async claim(runId, key) {
      const result = await redis.set(runKey(runId, `claim:${key}`), "1", { nx: true, ex: RUN_TTL_SECONDS });
      return result === "OK";
    },
    async addDecision(runId, decision) {
      await redis.rpush(runKey(runId, "decisions"), JSON.stringify(decision));
      await touch(runKey(runId, "decisions"));
    },
    async decisions(runId) {
      const values = await redis.lrange(runKey(runId, "decisions"), 0, -1);
      return values.map(value => parse<DecisionRecord>(value)).filter((decision): decision is DecisionRecord => decision !== null);
    },
    async markSeen(runId, itemIds, at) {
      const key = runKey(runId, "seen");
      for (const id of itemIds) await redis.hsetnx(key, id, String(at));
      await touch(key);
      return Object.fromEntries(Object.entries(hashFromRedis(await redis.hgetall(key))).map(([id, value]) => [id, Number(value)]));
    },
    async finish(runId, reason) {
      return (await redis.set(runKey(runId, "finished"), reason, { nx: true, ex: RUN_TTL_SECONDS })) === "OK";
    },
    async finishedReason(runId) {
      const value = await redis.get(runKey(runId, "finished"));
      return typeof value === "string" ? value : null;
    },
    async saveFinal(runId, snapshot) {
      await redis.set(runKey(runId, "final"), JSON.stringify(snapshot), { ex: RUN_TTL_SECONDS });
    },
    async final(runId) {
      return parse<RunSnapshot>(await redis.get(runKey(runId, "final")));
    },
    async saveMandate(mandate) {
      await redis.set(mandateKey(mandate.code), JSON.stringify(mandate), { ex: MANDATE_TTL_SECONDS });
    },
    async mandate(code) {
      return parse<MandateRecord>(await redis.get(mandateKey(code)));
    },
    async useMandate(code) {
      return (await redis.set(mandateKey(code, "used"), "1", { nx: true, ex: MANDATE_TTL_SECONDS })) === "OK";
    },
  };
}

export function emptyConditions(): StoreConditions {
  return { ...BASE_CONDITIONS };
}
