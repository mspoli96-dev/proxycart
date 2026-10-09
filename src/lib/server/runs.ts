import { randomUUID } from "node:crypto";
import type { MandateView, RespondRequest, RunSnapshot, RunStatus, Scenario } from "../contracts";
import { storeForOrigin } from "../hosts";
import { issueMandate } from "../mandate";
import { isBudgetOption, MISSION } from "../mission";
import { BASE_CONDITIONS } from "../pricing";
import { agentModel, RUN_MAX_MS, signingSecret } from "./config";
import { budgetOutput, buildSnapshot, evaluateArguments, LIMIT_OUTPUT, mandatesOutput, MAX_APPROVAL_REQUESTS, originEvent, parsePlanArguments, pendingFrom, PURCHASE_TOOL_NAME, REJECTED_OUTPUT, returnedOutput, sessionStatus, signInEvent, signInFields, toolResultEvent, type AgentApi, type RequiredAction, type SessionState } from "./agent";
import type { RunRecord, RunStore } from "./run-store";
import { PublicError } from "./security";

export interface RunDeps {
  store: RunStore;
  agent: AgentApi;
  now: () => number;
}

function startingSnapshot(run: RunRecord, now: number, status: RunStatus = "starting"): RunSnapshot {
  return { id: run.id, source: "live", status, model: run.model, scenario: run.scenario, startedAt: run.createdAt, elapsedMs: Math.max(0, now - run.createdAt), budgetCents: MISSION.budgetCents, conditions: { ...BASE_CONDITIONS }, steps: [], pending: null, finalMessage: null };
}

export async function startRun(deps: RunDeps, visitorId: string, scenario: Scenario): Promise<RunSnapshot> {
  const id = randomUUID();
  await deps.store.reserve(visitorId, id);
  const createdAt = deps.now();
  const run: RunRecord = { id, visitorId, sessionId: null, model: agentModel(), scenario, createdAt, deadlineAt: createdAt + RUN_MAX_MS };
  await deps.store.saveRun(run);
  try {
    run.sessionId = await deps.agent.createSession(id, run.model);
    await deps.store.saveRun(run);
  } catch {
    await deps.store.finish(id, "failed");
    await deps.store.saveFinal(id, startingSnapshot(run, deps.now(), "failed"));
    await deps.store.release(visitorId, id).catch(() => {});
    throw new PublicError("The agent could not start. Please try again later, or watch a recorded run.", 502);
  }
  return startingSnapshot(run, deps.now());
}

function stripScreenshots(snapshot: RunSnapshot): RunSnapshot {
  return { ...snapshot, steps: snapshot.steps.map(step => (step.kind === "action" ? { ...step, screenshot: null } : step)) };
}

async function closeRun(deps: RunDeps, run: RunRecord, reason: Exclude<RunStatus, "starting" | "running" | "waiting">, snapshot?: RunSnapshot): Promise<RunSnapshot> {
  if (!(await deps.store.finish(run.id, reason))) return (await deps.store.final(run.id)) ?? snapshot ?? startingSnapshot(run, deps.now(), reason);
  let final = snapshot;
  if (run.sessionId) {
    if (reason === "cancelled" || reason === "expired") await deps.agent.send(run.sessionId, [{ type: "agent.session.input.cancel" }]).catch(() => {});
    if (!final) {
      try {
        final = await collectSnapshot(deps, run, reason, false);
      } catch {
        final = undefined;
      }
    }
  }
  final = stripScreenshots({ ...(final ?? startingSnapshot(run, deps.now())), status: reason, pending: null });
  await deps.store.saveFinal(run.id, final);
  if (run.sessionId) await deps.agent.remove(run.sessionId).catch(() => {});
  await deps.store.release(run.visitorId, run.id).catch(() => {});
  return final;
}

async function collectSnapshot(deps: RunDeps, run: RunRecord, forcedStatus: RunStatus | null, includeLatestScreenshot: boolean, session?: SessionState): Promise<RunSnapshot> {
  const now = deps.now();
  const [state, items, conditions, budgetCents, decisions, events] = await Promise.all([
    session ? Promise.resolve(session) : deps.agent.session(run.sessionId!),
    deps.agent.items(run.sessionId!),
    deps.store.conditions(run.id),
    deps.store.budget(run.id, MISSION.budgetCents),
    deps.store.decisions(run.id),
    deps.store.events(run.id),
  ]);
  const seen = await deps.store.markSeen(run.id, items.map((item, index) => item.id ?? `item-${index}`), now);
  const status = forcedStatus ?? sessionStatus(state, items);
  return buildSnapshot({ run, status, items, seen, decisions, events, conditions, budgetCents, pending: pendingFrom(state, conditions, budgetCents), now, includeLatestScreenshot });
}

async function approvalCount(deps: RunDeps, runId: string): Promise<number> {
  return (await deps.store.decisions(runId)).filter(decision => decision.kind === "approval").length;
}

async function autoResolve(deps: RunDeps, run: RunRecord, session: SessionState): Promise<boolean> {
  const conditions = await deps.store.conditions(run.id);
  const budgetCents = await deps.store.budget(run.id, MISSION.budgetCents);
  for (const action of session.required_actions) {
    if (action.type === "computer_use_approval_request" && action.request?.type === "browser_origin_access" && action.request_id && !storeForOrigin(action.request.origin ?? "")) {
      if (!(await deps.store.claim(run.id, `request:${action.request_id}`))) continue;
      await deps.agent.send(run.sessionId!, [originEvent(action.request_id, "deny")]);
      await deps.store.addDecision(run.id, { at: deps.now(), kind: "origin", requestId: action.request_id, decision: "deny", origin: action.request.origin ?? "", storeId: null });
      return true;
    }
    if (action.type !== "function_call" || !action.call_id) continue;
    if (action.name !== PURCHASE_TOOL_NAME) {
      if (!(await deps.store.claim(run.id, `call:${action.call_id}`))) continue;
      await deps.agent.send(run.sessionId!, [{ type: "agent.session.input.tool_result", call_id: action.call_id, turn_id: action.turn_id, success: false, error: "Unknown function." }]);
      return true;
    }
    const parsed = parsePlanArguments(action.arguments);
    if (!parsed.ok) {
      if (!(await deps.store.claim(run.id, `call:${action.call_id}`))) continue;
      await deps.agent.send(run.sessionId!, [{ type: "agent.session.input.tool_result", call_id: action.call_id, turn_id: action.turn_id, success: false, error: `The purchase plan could not be read: ${parsed.error}` }]);
      return true;
    }
    const evaluation = evaluateArguments(parsed.value, conditions, budgetCents);
    const overLimit = (await approvalCount(deps, run.id)) >= MAX_APPROVAL_REQUESTS;
    if (evaluation.valid && !overLimit) continue;
    if (!(await deps.store.claim(run.id, `call:${action.call_id}`))) continue;
    await deps.agent.send(run.sessionId!, [toolResultEvent(action, overLimit ? LIMIT_OUTPUT : returnedOutput(evaluation))]);
    await deps.store.addDecision(run.id, { at: deps.now(), kind: "approval", requestId: action.call_id, decision: overLimit ? "reject" : "returned", evaluation, summary: parsed.value.summary, changeReason: parsed.value.change_reason ?? null, newBudgetCents: null });
    return true;
  }
  return false;
}

export async function advanceRun(deps: RunDeps, run: RunRecord, includeLatestScreenshot = true): Promise<RunSnapshot> {
  if (await deps.store.finishedReason(run.id)) return (await deps.store.final(run.id)) ?? startingSnapshot(run, deps.now(), "failed");
  if (!run.sessionId) return startingSnapshot(run, deps.now());
  if (deps.now() > run.deadlineAt) return closeRun(deps, run, "expired");
  let session = await deps.agent.session(run.sessionId);
  if (session.status === "requires_action" && (await autoResolve(deps, run, session))) session = await deps.agent.session(run.sessionId);
  const snapshot = await collectSnapshot(deps, run, null, includeLatestScreenshot, session);
  if (snapshot.status === "completed" || snapshot.status === "failed") return closeRun(deps, run, snapshot.status, snapshot);
  return snapshot;
}

function findAction(session: SessionState, predicate: (action: RequiredAction) => boolean): RequiredAction {
  const action = session.required_actions.find(predicate);
  if (!action) throw new PublicError("That request is no longer waiting for a decision.", 409);
  return action;
}

export async function respondToRun(deps: RunDeps, run: RunRecord, request: RespondRequest): Promise<RunSnapshot> {
  if (!run.sessionId || (await deps.store.finishedReason(run.id))) throw new PublicError("This run has already finished.", 409);
  const session = await deps.agent.session(run.sessionId);
  const at = deps.now();
  if (request.kind === "origin") {
    const action = findAction(session, item => item.request_id === request.requestId && item.request?.type === "browser_origin_access");
    const storeId = storeForOrigin(action.request?.origin ?? "");
    const decision = storeId ? request.decision : "deny";
    if (!(await deps.store.claim(run.id, `request:${request.requestId}`))) throw new PublicError("That request was already answered.", 409);
    await deps.agent.send(run.sessionId, [originEvent(request.requestId, decision)]);
    await deps.store.addDecision(run.id, { at, kind: "origin", requestId: request.requestId, decision, origin: action.request?.origin ?? "", storeId });
  } else if (request.kind === "sign-in") {
    const action = findAction(session, item => item.request_id === request.requestId && item.request?.type === "browser_authentication");
    const fields = request.decision === "submit" ? signInFields(action.request?.fields) : null;
    if (!(await deps.store.claim(run.id, `request:${request.requestId}`))) throw new PublicError("That request was already answered.", 409);
    await deps.agent.send(run.sessionId, [signInEvent(request.requestId, fields)]);
    await deps.store.addDecision(run.id, { at, kind: "sign-in", requestId: request.requestId, decision: fields ? "submit" : "cancel", storeId: storeForOrigin(action.request?.credential_origin ?? "") });
  } else {
    const action = findAction(session, item => item.type === "function_call" && item.call_id === request.callId && item.name === PURCHASE_TOOL_NAME);
    const parsed = parsePlanArguments(action.arguments);
    if (!parsed.ok) throw new PublicError("The agent's plan could not be read.", 409);
    const budgetCents = await deps.store.budget(run.id, MISSION.budgetCents);
    const evaluation = evaluateArguments(parsed.value, await deps.store.conditions(run.id), budgetCents);
    if (request.decision === "approve" && !evaluation.valid) throw new PublicError("This plan did not pass ProxyCart's checks, so it cannot be approved.", 409);
    if (request.decision === "reduce-budget" && (!isBudgetOption(request.budgetCents) || request.budgetCents >= budgetCents)) throw new PublicError("Choose one of the lower budgets offered.", 400);
    if (!(await deps.store.claim(run.id, `call:${request.callId}`))) throw new PublicError("That plan was already answered.", 409);
    let mandates: MandateView[] = [];
    let output: unknown = REJECTED_OUTPUT;
    if (request.decision === "approve") {
      const secret = signingSecret();
      if (!secret) throw new PublicError("Approvals are temporarily unavailable.", 503);
      const records = evaluation.carts.map(cart => issueMandate({ runId: run.id, storeId: cart.storeId, amountCents: cart.totalCents, lines: cart.lines.map(line => ({ sku: line.sku, quantity: line.quantity })) }, secret, at));
      for (const record of records) await deps.store.saveMandate(record);
      mandates = records.map(record => ({ storeId: record.storeId, code: record.code, amountCents: record.amountCents, expiresAt: record.expiresAt }));
      output = mandatesOutput(mandates);
    } else if (request.decision === "reduce-budget") {
      await deps.store.setBudget(run.id, request.budgetCents!);
      output = budgetOutput(request.budgetCents!);
    }
    await deps.agent.send(run.sessionId, [toolResultEvent(action, output)]);
    await deps.store.addDecision(run.id, { at, kind: "approval", requestId: request.callId, decision: request.decision, evaluation, summary: parsed.value.summary, changeReason: parsed.value.change_reason ?? null, newBudgetCents: request.decision === "reduce-budget" ? request.budgetCents ?? null : null, mandates });
  }
  return advanceRun(deps, run);
}

export async function triggerStockOut(deps: RunDeps, run: RunRecord): Promise<RunSnapshot> {
  if (await deps.store.finishedReason(run.id)) throw new PublicError("This run has already finished.", 409);
  await deps.store.setCondition(run.id, "stockOutArmed");
  return advanceRun(deps, run);
}

export async function cancelRun(deps: RunDeps, run: RunRecord): Promise<RunSnapshot> {
  return closeRun(deps, run, "cancelled");
}
