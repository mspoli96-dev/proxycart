import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { STORE_HOSTS } from "../src/lib/hosts";
import { buildSnapshot, missionInput, pendingFrom, signInFields, type RequiredAction } from "../src/lib/server/agent";
import { advanceRun, cancelRun, respondToRun, startRun, triggerStockOut, type RunDeps } from "../src/lib/server/runs";
import { checkout, signIn } from "../src/lib/server/storefront";
import { FakeAgent, MemoryRunStore } from "./fakes";

const optimalPlan = {
  stores: [
    { store: "northbound", lines: [{ sku: "NB-HD-11", quantity: 20, unit_price_cad: 36 }], subtotal_cad: 720, shipping_cad: 30, total_cad: 750 },
    { store: "harbour", lines: [{ sku: "HP-TM-22", quantity: 20, unit_price_cad: 12 }, { sku: "HP-NB-23", quantity: 20, unit_price_cad: 8.25 }], subtotal_cad: 405, shipping_cad: 0, total_cad: 405 },
  ],
  total_cad: 1155,
  summary: "Hoodies from Northbound, the rest from Harbour with team pricing.",
};

const approvalAction = (callId = "call_1", plan: unknown = optimalPlan): RequiredAction => ({ type: "function_call", name: "request_purchase_approval", call_id: callId, turn_id: "turn_1", arguments: JSON.stringify(plan) });

let store: MemoryRunStore;
let agent: FakeAgent;
let clock: number;
let deps: RunDeps;

beforeEach(() => {
  vi.stubEnv("SESSION_SECRET", "test-only-session-secret-with-enough-length");
  vi.stubEnv("PROXYCART_DEMO_PASSWORD", "test-only-password");
  store = new MemoryRunStore();
  agent = new FakeAgent();
  clock = 1_000_000;
  deps = { store, agent, now: () => clock };
});

afterEach(() => vi.unstubAllEnvs());

async function started(scenario: "standard" | "stock-out" = "standard") {
  const snapshot = await startRun(deps, "visitor-1", scenario);
  return (await store.getRun(snapshot.id))!;
}

describe("agent session configuration", () => {
  it("gives the agent only the three store URLs, each bound to the run", () => {
    const input = missionInput("11111111-1111-4111-8111-111111111111");
    for (const host of Object.values(STORE_HOSTS)) expect(input).toContain(`https://${host}/?run=11111111-1111-4111-8111-111111111111`);
    expect(input).toContain("CAD 1,250.00");
  });

  it("maps sign-in fields to the demo account without exposing anything else", () => {
    expect(signInFields([{ id: "f1", label: "Email", required: true, type: "email" }, { id: "f2", label: "Password", required: true, type: "password" }])).toEqual([{ field_id: "f1", value: "buyer@proxycart.example" }, { field_id: "f2", value: "test-only-password" }]);
    expect(signInFields([{ id: "f1", label: "One-time code", required: true, type: "text" }])).toBeNull();
  });

  it("turns required actions into pending decisions with recomputed plans", () => {
    const conditions = { harbourSignedIn: true, hoodiesSoldOutAt: [], stockOutArmed: false };
    const origin = pendingFrom({ id: "s", status: "requires_action", error: null, required_actions: [{ type: "computer_use_approval_request", request_id: "r1", request: { type: "browser_origin_access", origin: "https://proxycart-harbour-print.vercel.app", reason: null } }] }, conditions, 125_000);
    expect(origin).toMatchObject({ kind: "origin", storeId: "harbour" });
    const approval = pendingFrom({ id: "s", status: "requires_action", error: null, required_actions: [approvalAction()] }, conditions, 125_000);
    expect(approval?.kind).toBe("approval");
    if (approval?.kind === "approval") expect(approval.evaluation.totalCents).toBe(115_500);
  });

  it("orders timeline steps and only ships the newest screenshot", () => {
    const run = { id: "run", visitorId: "v", sessionId: "s", model: "gpt-6-luna", scenario: "standard" as const, createdAt: 0, deadlineAt: 600_000 };
    const snapshot = buildSnapshot({
      run, status: "running", now: 9_000, conditions: { harbourSignedIn: false, hoodiesSoldOutAt: [], stockOutArmed: false }, budgetCents: 125_000, pending: null, includeLatestScreenshot: true,
      items: [{ id: "a", type: "computer_use_call", status: "completed", title: "Open Maple", output: { image_url: "data:image/jpeg;base64,AAA" } }, { id: "b", type: "computer_use_call", status: "in_progress", title: "Compare prices", output: { image_url: "data:image/jpeg;base64,BBB" } }],
      seen: { a: 2_000, b: 5_000 },
      decisions: [{ at: 1_000, kind: "origin", requestId: "r", decision: "approve", origin: "https://proxycart-maple-supply.vercel.app", storeId: "maple" }],
      events: [{ at: 3_000, storeId: "maple", kind: "visit", detail: "catalogue" }],
    });
    expect(snapshot.steps.map(step => step.kind)).toEqual(["origin", "action", "store", "action"]);
    const actions = snapshot.steps.filter(step => step.kind === "action");
    expect(actions.map(step => step.kind === "action" ? step.screenshot : null)).toEqual([null, "data:image/jpeg;base64,BBB"]);
  });
});

describe("run lifecycle", () => {
  it("reserves capacity, creates the session and stores the run before the agent visits", async () => {
    const run = await started();
    expect(store.reserved).toEqual([run.id]);
    expect(agent.created).toEqual([{ runId: run.id, model: "gpt-6-luna" }]);
    expect(run.sessionId).toBe("sess_1");
  });

  it("releases capacity and reports a failure when the session cannot start", async () => {
    agent.failCreate = true;
    await expect(startRun(deps, "visitor-1", "standard")).rejects.toThrow("The agent could not start");
    expect(store.released).toHaveLength(1);
  });

  it("forces a deny for origins outside the demo stores", async () => {
    const run = await started();
    agent.require({ type: "computer_use_approval_request", request_id: "r1", request: { type: "browser_origin_access", origin: "https://example.com", reason: null } });
    await respondToRun(deps, run, { kind: "origin", requestId: "r1", decision: "approve" });
    expect(agent.sent[0]).toEqual([{ type: "agent.session.input.computer_use_approval_request_result", request_id: "r1", response: { type: "browser_origin_access", decision: "deny" } }]);
  });

  it("answers each request once", async () => {
    const run = await started();
    agent.require({ type: "computer_use_approval_request", request_id: "r1", request: { type: "browser_origin_access", origin: "https://proxycart-maple-supply.vercel.app", reason: null } });
    await respondToRun(deps, run, { kind: "origin", requestId: "r1", decision: "approve" });
    agent.require({ type: "computer_use_approval_request", request_id: "r1", request: { type: "browser_origin_access", origin: "https://proxycart-maple-supply.vercel.app", reason: null } });
    await expect(respondToRun(deps, run, { kind: "origin", requestId: "r1", decision: "approve" })).rejects.toThrow("already answered");
  });

  it("issues mandates that the stores accept for the exact carts and refuse otherwise", async () => {
    const run = await started();
    await signIn(store, run.id, "buyer@proxycart.example", "test-only-password", clock);
    agent.require(approvalAction());
    await respondToRun(deps, run, { kind: "approval", callId: "call_1", decision: "approve" });
    const output = JSON.parse((agent.sent[0][0] as { output: string }).output);
    expect(output.status).toBe("approved");
    const northbound = output.mandates.find((mandate: { store: string }) => mandate.store === "northbound");
    const harbour = output.mandates.find((mandate: { store: string }) => mandate.store === "harbour");
    expect(northbound.amount_cad).toBe("750.00");

    const changed = await checkout(store, "northbound", run.id, [{ sku: "NB-HD-11", quantity: 19 }], northbound.code, clock);
    expect(changed).toMatchObject({ ok: false });
    const wrongStore = await checkout(store, "harbour", run.id, [{ sku: "HP-TM-22", quantity: 20 }, { sku: "HP-NB-23", quantity: 20 }], northbound.code, clock);
    expect(wrongStore.message).toContain("different store");
    const forged = await checkout(store, "northbound", run.id, [{ sku: "NB-HD-11", quantity: 20 }], "PXC-AAAA-BBBB", clock);
    expect(forged.message).toContain("not issued");
    const placed = await checkout(store, "northbound", run.id, [{ sku: "NB-HD-11", quantity: 20 }], northbound.code, clock);
    expect(placed).toMatchObject({ ok: true });
    const reused = await checkout(store, "northbound", run.id, [{ sku: "NB-HD-11", quantity: 20 }], northbound.code, clock);
    expect(reused.message).toContain("already been used");
    const second = await checkout(store, "harbour", run.id, [{ sku: "HP-NB-23", quantity: 20 }, { sku: "HP-TM-22", quantity: 20 }], harbour.code, clock);
    expect(second).toMatchObject({ ok: true });
    const expired = await checkout(store, "harbour", run.id, [{ sku: "HP-TM-22", quantity: 20 }, { sku: "HP-NB-23", quantity: 20 }], harbour.code, clock + 16 * 60_000);
    expect(expired.ok).toBe(false);
  });

  it("refuses to approve a plan that fails the checks", async () => {
    const run = await started();
    agent.require(approvalAction());
    await expect(respondToRun(deps, run, { kind: "approval", callId: "call_1", decision: "approve" })).rejects.toThrow("did not pass");
  });

  it("returns invalid plans to the agent automatically", async () => {
    const run = await started();
    agent.require(approvalAction("call_2", { ...optimalPlan, stores: [optimalPlan.stores[0]] }));
    const snapshot = await advanceRun(deps, run);
    const output = JSON.parse((agent.sent[0][0] as { output: string }).output);
    expect(output.status).toBe("not_approved");
    expect(snapshot.steps.some(step => step.kind === "approval" && step.decision === "returned")).toBe(true);
  });

  it("lowers the budget only to one of the offered values", async () => {
    const run = await started();
    await signIn(store, run.id, "buyer@proxycart.example", "test-only-password", clock);
    agent.require(approvalAction());
    await expect(respondToRun(deps, run, { kind: "approval", callId: "call_1", decision: "reduce-budget", budgetCents: 1 })).rejects.toThrow("lower budgets");
    await respondToRun(deps, run, { kind: "approval", callId: "call_1", decision: "reduce-budget", budgetCents: 110_000 });
    expect(await store.budget(run.id, 0)).toBe(110_000);
    expect(JSON.parse((agent.sent[0][0] as { output: string }).output)).toMatchObject({ status: "changes_requested", new_budget_cad: "1100.00" });
  });

  it("sells out hoodies at the first store that tries to charge for them in the stock-out scenario", async () => {
    const run = await started("stock-out");
    const result = await checkout(store, "northbound", run.id, [{ sku: "NB-HD-11", quantity: 20 }], "PXC-AAAA-BBBB", clock);
    expect(result.message).toContain("sold out");
    expect((await store.conditions(run.id)).hoodiesSoldOutAt).toEqual(["northbound"]);
    expect((await store.events(run.id)).map(event => event.kind)).toEqual(["stock-changed", "checkout-blocked"]);
  });

  it("lets the buyer arm one stock-out that hits the next store charging for hoodies", async () => {
    const run = await started();
    await triggerStockOut(deps, run);
    expect((await store.conditions(run.id)).stockOutArmed).toBe(true);
    await signIn(store, run.id, "buyer@proxycart.example", "test-only-password", clock);
    const first = await checkout(store, "harbour", run.id, [{ sku: "HP-HD-21", quantity: 20 }], "PXC-AAAA-BBBB", clock);
    expect(first.message).toContain("sold out");
    const second = await checkout(store, "northbound", run.id, [{ sku: "NB-HD-11", quantity: 20 }], "PXC-AAAA-BBBB", clock);
    expect(second.message).not.toContain("sold out");
    expect((await store.conditions(run.id)).hoodiesSoldOutAt).toEqual(["harbour"]);
    expect((await store.events(run.id)).filter(event => event.kind === "stock-changed")).toHaveLength(1);
  });

  it("closes a finished run once: caches it, deletes the session and releases capacity", async () => {
    const run = await started();
    agent.state = { ...agent.state, status: "idle" };
    agent.itemList = [{ id: "m1", type: "message", role: "assistant", phase: "final_answer", content: [{ text: "Bought everything for CAD 1,155.00." }] }];
    const snapshot = await advanceRun(deps, run);
    expect(snapshot.status).toBe("completed");
    expect(snapshot.finalMessage).toBe("Bought everything for CAD 1,155.00.");
    expect(agent.removed).toEqual(["sess_1"]);
    expect(store.released).toEqual([run.id]);
    expect((await advanceRun(deps, run)).status).toBe("completed");
    expect(agent.removed).toHaveLength(1);
  });

  it("expires runs that pass the time limit and cancels the agent", async () => {
    const run = await started();
    clock += 11 * 60_000;
    const snapshot = await advanceRun(deps, run);
    expect(snapshot.status).toBe("expired");
    expect(agent.sent.flat()).toContainEqual({ type: "agent.session.input.cancel" });
  });

  it("lets the buyer stop a run", async () => {
    const run = await started();
    expect((await cancelRun(deps, run)).status).toBe("cancelled");
    expect(agent.removed).toEqual(["sess_1"]);
  });
});
