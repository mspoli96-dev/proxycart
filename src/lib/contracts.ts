import { z } from "zod";
import type { StoreId } from "./catalog";
import type { PlanEvaluation, StoreConditions } from "./pricing";

export type Scenario = "standard" | "stock-out";
export const SCENARIOS: readonly Scenario[] = ["standard", "stock-out"];

export type StoreEventKind = "visit" | "signed-in" | "sign-in-failed" | "quote" | "checkout-blocked" | "order-placed" | "stock-changed";

export interface StoreEvent {
  at: number;
  storeId: StoreId;
  kind: StoreEventKind;
  detail: string;
  amountCents?: number | null;
  orderNumber?: string | null;
  mandate?: string | null;
}

export interface MandateView {
  storeId: StoreId;
  code: string;
  amountCents: number;
  expiresAt: number;
}

export type ActionStatus = "in_progress" | "completed" | "failed" | "incomplete";
export type ApprovalDecision = "approve" | "reject" | "reduce-budget" | "returned";

export type TimelineStep =
  | { kind: "action"; id: string; at: number; title: string; status: ActionStatus; screenshot: string | null }
  | { kind: "message"; id: string; at: number; text: string }
  | { kind: "origin"; id: string; at: number; origin: string; storeId: StoreId | null; decision: "approve" | "deny" }
  | { kind: "sign-in"; id: string; at: number; storeId: StoreId | null; decision: "submit" | "cancel" }
  | { kind: "approval"; id: string; at: number; evaluation: PlanEvaluation; summary: string; changeReason: string | null; decision: ApprovalDecision; newBudgetCents: number | null; mandates: MandateView[] }
  | { kind: "store"; id: string; at: number; event: StoreEvent };

export type PendingAction =
  | { kind: "origin"; requestId: string; origin: string; storeId: StoreId | null; reason: string | null }
  | { kind: "sign-in"; requestId: string; storeId: StoreId | null; reason: string | null }
  | { kind: "approval"; callId: string; evaluation: PlanEvaluation; summary: string; changeReason: string | null };

export type RunStatus = "starting" | "running" | "waiting" | "completed" | "failed" | "cancelled" | "expired";

export interface RunSnapshot {
  id: string;
  source: "live" | "recorded";
  status: RunStatus;
  model: string;
  scenario: Scenario;
  startedAt: number;
  elapsedMs: number;
  budgetCents: number;
  conditions: StoreConditions;
  steps: TimelineStep[];
  pending: PendingAction | null;
  finalMessage: string | null;
}

export interface RecordedRun extends RunSnapshot {
  title: string;
  description: string;
  recordedAt: string;
}

export interface LiveConfig {
  liveEnabled: boolean;
  model: string;
  unavailableReason: string | null;
}

const money = z.number().nonnegative().max(1_000_000);

export const purchasePlanArguments = z.object({
  stores: z.array(z.object({
    store: z.enum(["maple", "northbound", "harbour"]),
    lines: z.array(z.object({
      sku: z.string().min(1).max(24),
      quantity: z.number().int().min(1).max(500),
      unit_price_cad: money,
    })).min(1).max(6),
    subtotal_cad: money,
    shipping_cad: money,
    total_cad: money,
  })).min(1).max(3),
  total_cad: money,
  summary: z.string().min(1).max(900),
  change_reason: z.string().max(500).nullish(),
});

export type PurchasePlanArguments = z.infer<typeof purchasePlanArguments>;

export const startRunRequest = z.object({
  scenario: z.enum(["standard", "stock-out"]),
  consent: z.literal(true),
});

export const respondRequest = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("origin"), requestId: z.string().min(1).max(200), decision: z.enum(["approve", "deny"]) }),
  z.object({ kind: z.literal("sign-in"), requestId: z.string().min(1).max(200), decision: z.enum(["submit", "cancel"]) }),
  z.object({ kind: z.literal("approval"), callId: z.string().min(1).max(200), decision: z.enum(["approve", "reject", "reduce-budget"]), budgetCents: z.number().int().optional() }),
]);

export type RespondRequest = z.infer<typeof respondRequest>;

export const RUN_ID_PATTERN = /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/;
