import type { RunSnapshot, StoreEvent } from "../src/lib/contracts";
import type { MandateRecord } from "../src/lib/mandate";
import type { StoreConditions } from "../src/lib/pricing";
import { conditionsFromHash, type ConditionFlag } from "../src/lib/server/run-store";
import type { AgentApi, RequiredAction, SessionItem, SessionState } from "../src/lib/server/agent";
import type { DecisionRecord, RunRecord, RunStore } from "../src/lib/server/run-store";

export class MemoryRunStore implements RunStore {
  runs = new Map<string, RunRecord>();
  budgets = new Map<string, number>();
  flags = new Map<string, Set<string>>();
  eventLog = new Map<string, StoreEvent[]>();
  decisionLog = new Map<string, DecisionRecord[]>();
  claims = new Set<string>();
  seen = new Map<string, Record<string, number>>();
  finishedRuns = new Map<string, string>();
  finals = new Map<string, RunSnapshot>();
  mandates = new Map<string, MandateRecord>();
  usedMandates = new Set<string>();
  reserved: string[] = [];
  released: string[] = [];
  refuseReservation = false;

  async reserve(_visitorId: string, runId: string) { if (this.refuseReservation) throw new Error("refused"); this.reserved.push(runId); }
  async release(_visitorId: string, runId: string) { this.released.push(runId); }
  async saveRun(run: RunRecord) { this.runs.set(run.id, { ...run }); }
  async getRun(runId: string) { return this.runs.get(runId) ?? null; }
  async budget(runId: string, fallbackCents: number) { return this.budgets.get(runId) ?? fallbackCents; }
  async setBudget(runId: string, cents: number) { this.budgets.set(runId, cents); }
  async conditions(runId: string): Promise<StoreConditions> { return conditionsFromHash(Object.fromEntries([...(this.flags.get(runId) ?? [])].map(flag => [flag, "1"]))); }
  async setCondition(runId: string, flag: ConditionFlag) {
    const flags = this.flags.get(runId) ?? new Set<string>();
    if (flags.has(flag)) return false;
    flags.add(flag);
    this.flags.set(runId, flags);
    return true;
  }
  async addEvent(runId: string, event: StoreEvent) { this.eventLog.set(runId, [...(this.eventLog.get(runId) ?? []), event]); }
  async events(runId: string) { return this.eventLog.get(runId) ?? []; }
  async claim(runId: string, key: string) { const id = `${runId}:${key}`; if (this.claims.has(id)) return false; this.claims.add(id); return true; }
  async addDecision(runId: string, decision: DecisionRecord) { this.decisionLog.set(runId, [...(this.decisionLog.get(runId) ?? []), decision]); }
  async decisions(runId: string) { return this.decisionLog.get(runId) ?? []; }
  async markSeen(runId: string, itemIds: string[], at: number) {
    const map = { ...(this.seen.get(runId) ?? {}) };
    for (const id of itemIds) map[id] ??= at;
    this.seen.set(runId, map);
    return map;
  }
  async finish(runId: string, reason: string) { if (this.finishedRuns.has(runId)) return false; this.finishedRuns.set(runId, reason); return true; }
  async finishedReason(runId: string) { return this.finishedRuns.get(runId) ?? null; }
  async saveFinal(runId: string, snapshot: RunSnapshot) { this.finals.set(runId, snapshot); }
  async final(runId: string) { return this.finals.get(runId) ?? null; }
  async saveMandate(mandate: MandateRecord) { this.mandates.set(mandate.code, mandate); }
  async mandate(code: string) { return this.mandates.get(code) ?? null; }
  async useMandate(code: string) { if (this.usedMandates.has(code)) return false; this.usedMandates.add(code); return true; }
}

export class FakeAgent implements AgentApi {
  state: SessionState = { id: "sess_1", status: "in_progress", error: null, required_actions: [] };
  itemList: SessionItem[] = [];
  sent: unknown[][] = [];
  removed: string[] = [];
  created: Array<{ runId: string; model: string }> = [];
  failCreate = false;

  async createSession(runId: string, model: string) { if (this.failCreate) throw new Error("boom"); this.created.push({ runId, model }); return this.state.id; }
  async session() { return structuredClone(this.state); }
  async items() { return structuredClone(this.itemList); }
  async send(_sessionId: string, events: unknown[]) { this.sent.push(events); this.state = { ...this.state, status: "in_progress", required_actions: [] }; }
  async remove(sessionId: string) { this.removed.push(sessionId); }

  require(action: RequiredAction) { this.state = { ...this.state, status: "requires_action", required_actions: [action] }; }
}
