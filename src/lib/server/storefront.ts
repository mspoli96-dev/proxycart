import { createHash, randomInt, timingSafeEqual } from "node:crypto";
import { findProduct, STORES, type StoreId } from "../catalog";
import { RUN_ID_PATTERN, type StoreEvent } from "../contracts";
import { MANDATE_FAILURE_MESSAGES, maskMandateCode, normalizeMandateCode, verifyMandate } from "../mandate";
import { BASE_CONDITIONS, priceCart, type CartLine, type PricedCart, type StoreConditions } from "../pricing";
import { DEMO_ACCOUNT_EMAIL, demoAccountPassword, signingSecret } from "./config";
import type { RunRecord, RunStore } from "./run-store";

export const RUN_COOKIE = "pxc_run";
const CHECKOUT_GRACE_MS = 5 * 60_000;
const ORDER_PREFIX: Record<StoreId, string> = { maple: "MS", northbound: "NB", harbour: "HP" };

export interface StoreContext {
  runId: string | null;
  run: RunRecord | null;
  conditions: StoreConditions;
}

export type CheckoutResult =
  | { ok: true; orderNumber: string; cart: PricedCart; mandate: string; message: string }
  | { ok: false; cart: PricedCart | null; message: string };

export function validRunId(value: unknown): value is string {
  return typeof value === "string" && RUN_ID_PATTERN.test(value);
}

export async function storeContext(store: RunStore, runId: string | null): Promise<StoreContext> {
  if (!validRunId(runId)) return { runId: null, run: null, conditions: { ...BASE_CONDITIONS } };
  const run = await store.getRun(runId);
  if (!run) return { runId: null, run: null, conditions: { ...BASE_CONDITIONS } };
  return { runId, run, conditions: await store.conditions(runId) };
}

export async function recordVisit(store: RunStore, runId: string, storeId: StoreId, page: string, now = Date.now()): Promise<void> {
  await store.addEvent(runId, { at: now, storeId, kind: "visit", detail: page });
}

function sha256(value: string): Buffer {
  return createHash("sha256").update(value).digest();
}

export async function signIn(store: RunStore, runId: string, email: unknown, password: unknown, now = Date.now()): Promise<boolean> {
  const run = validRunId(runId) ? await store.getRun(runId) : null;
  if (!run) return false;
  const emailMatches = typeof email === "string" && email.trim().toLowerCase() === DEMO_ACCOUNT_EMAIL;
  const passwordMatches = typeof password === "string" && password.length <= 200 && timingSafeEqual(sha256(password), sha256(demoAccountPassword()));
  const event: StoreEvent = emailMatches && passwordMatches
    ? { at: now, storeId: "harbour", kind: "signed-in", detail: "Team buyer signed in. Team pricing unlocked." }
    : { at: now, storeId: "harbour", kind: "sign-in-failed", detail: "Sign-in rejected." };
  if (event.kind === "signed-in") await store.setCondition(runId, "harbourSignedIn");
  await store.addEvent(runId, event);
  return event.kind === "signed-in";
}

export async function quote(store: RunStore, storeId: StoreId, runId: string | null, lines: CartLine[]): Promise<PricedCart> {
  const context = await storeContext(store, runId);
  return priceCart(storeId, lines, context.conditions);
}

async function block(store: RunStore, runId: string, storeId: StoreId, message: string, cart: PricedCart | null, now: number): Promise<CheckoutResult> {
  await store.addEvent(runId, { at: now, storeId, kind: "checkout-blocked", detail: message, amountCents: cart?.totalCents ?? null });
  return { ok: false, cart, message };
}

export async function checkout(store: RunStore, storeId: StoreId, runId: string | null, lines: CartLine[], codeInput: unknown, now = Date.now()): Promise<CheckoutResult> {
  if (!validRunId(runId)) return { ok: false, cart: null, message: "This demo store only accepts orders that belong to a ProxyCart run." };
  const run = await store.getRun(runId);
  if (!run) return { ok: false, cart: null, message: "This demo store only accepts orders that belong to a ProxyCart run." };
  if (now > run.deadlineAt + CHECKOUT_GRACE_MS) return block(store, runId, storeId, "Payment blocked: this ProxyCart run has ended.", null, now);
  let conditions = await store.conditions(runId);
  const hoodie = lines.map(line => findProduct(storeId, line.sku)).find(product => product?.kind === "hoodie");
  if (hoodie && (run.scenario === "stock-out" || conditions.stockOutArmed) && conditions.hoodiesSoldOutAt.length === 0) {
    if (await store.setCondition(runId, `soldOut:${storeId}`)) await store.addEvent(runId, { at: now, storeId, kind: "stock-changed", detail: `${hoodie.name} sold out while the order was being placed.` });
    conditions = { ...conditions, hoodiesSoldOutAt: [storeId] };
  }
  const cart = priceCart(storeId, lines, conditions);
  if (cart.lines.length === 0) return block(store, runId, storeId, "The cart is empty.", cart, now);
  if (cart.issues.length > 0) return block(store, runId, storeId, `Order not placed: ${cart.issues.join(" ")}`, cart, now);
  const code = normalizeMandateCode(codeInput);
  if (!code) return block(store, runId, storeId, "Payment blocked: enter the mandate code issued after the buyer's approval.", cart, now);
  const secret = signingSecret();
  if (!secret) return { ok: false, cart, message: "Checkout is temporarily unavailable." };
  const check = verifyMandate(await store.mandate(code), { runId, storeId, amountCents: cart.totalCents, lines }, secret, now);
  if (!check.ok) return block(store, runId, storeId, MANDATE_FAILURE_MESSAGES[check.reason], cart, now);
  if (!(await store.useMandate(code))) return block(store, runId, storeId, MANDATE_FAILURE_MESSAGES.used, cart, now);
  const orderNumber = `${ORDER_PREFIX[storeId]}-${String(randomInt(100_000, 1_000_000))}`;
  const masked = maskMandateCode(code);
  await store.addEvent(runId, { at: now, storeId, kind: "order-placed", detail: `Test order ${orderNumber} placed with mandate ${masked}.`, amountCents: cart.totalCents, orderNumber, mandate: masked });
  return { ok: true, orderNumber, cart, mandate: masked, message: `Test order ${orderNumber} placed at ${STORES[storeId].name}. No real payment was taken.` };
}
