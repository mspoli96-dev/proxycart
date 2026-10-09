import { findProduct, PRODUCT_KINDS, STORE_IDS, STORES, type Product, type ProductKind, type Store, type StoreId } from "./catalog";
import { MISSION, type Mission } from "./mission";

export interface StoreConditions {
  harbourSignedIn: boolean;
  hoodiesSoldOutAt: StoreId[];
  stockOutArmed: boolean;
}

export const BASE_CONDITIONS: StoreConditions = Object.freeze({ harbourSignedIn: false, hoodiesSoldOutAt: [], stockOutArmed: false }) as StoreConditions;

export interface CartLine {
  sku: string;
  quantity: number;
}

export interface PricedLine {
  sku: string;
  name: string;
  kind: ProductKind;
  quantity: number;
  unitCents: number;
  lineCents: number;
  stock: number;
  arrivesInBusinessDays: number;
}

export interface PricedCart {
  storeId: StoreId;
  lines: PricedLine[];
  subtotalCents: number;
  shippingCents: number;
  totalCents: number;
  arrivesInBusinessDays: number;
  issues: string[];
}

export interface PlanStore {
  storeId: StoreId;
  lines: CartLine[];
}

export interface PlanEvaluation {
  carts: PricedCart[];
  totalCents: number;
  budgetCents: number;
  quantities: Record<ProductKind, number>;
  issues: string[];
  withinBudget: boolean;
  meetsDeadline: boolean;
  complete: boolean;
  valid: boolean;
  bestCents: number | null;
  reportedTotalCents: number | null;
}

export interface CheapestPlan {
  stores: PlanStore[];
  totalCents: number;
}

export const MAX_LINE_QUANTITY = 500;

export function effectiveStock(storeId: StoreId, product: Product, conditions: StoreConditions): number {
  if (product.kind === "hoodie" && conditions.hoodiesSoldOutAt.includes(storeId)) return 0;
  return product.stock;
}

export function unitPriceCents(store: Store, product: Product, conditions: StoreConditions): number {
  if (store.signInForTeamPricing && conditions.harbourSignedIn && product.teamPriceCents !== undefined) return product.teamPriceCents;
  return product.priceCents;
}

export function shippingCents(store: Store, subtotalCents: number): number {
  if (subtotalCents <= 0) return 0;
  if (store.freeShippingFromCents !== null && subtotalCents >= store.freeShippingFromCents) return 0;
  return store.shippingCents;
}

export function mergeLines(lines: readonly CartLine[]): CartLine[] {
  const merged = new Map<string, number>();
  for (const line of lines) merged.set(line.sku, (merged.get(line.sku) ?? 0) + line.quantity);
  return [...merged].map(([sku, quantity]) => ({ sku, quantity })).sort((a, b) => a.sku.localeCompare(b.sku));
}

export function priceCart(storeId: StoreId, lines: readonly CartLine[], conditions: StoreConditions): PricedCart {
  const store = STORES[storeId];
  const issues: string[] = [];
  const priced: PricedLine[] = [];
  for (const { sku, quantity } of mergeLines(lines)) {
    const product = findProduct(storeId, sku);
    if (!product) {
      issues.push(`${sku} is not sold by ${store.name}.`);
      continue;
    }
    if (!Number.isInteger(quantity) || quantity < 1 || quantity > MAX_LINE_QUANTITY) {
      issues.push(`${product.name}: the quantity must be a whole number from 1 to ${MAX_LINE_QUANTITY}.`);
      continue;
    }
    const stock = effectiveStock(storeId, product, conditions);
    if (quantity > stock) issues.push(stock === 0 ? `${product.name} is sold out at ${store.name}.` : `${product.name}: only ${stock} left at ${store.name}.`);
    const unitCents = unitPriceCents(store, product, conditions);
    priced.push({ sku, name: product.name, kind: product.kind, quantity, unitCents, lineCents: unitCents * quantity, stock, arrivesInBusinessDays: product.arrivesInBusinessDays });
  }
  const subtotalCents = priced.reduce((sum, line) => sum + line.lineCents, 0);
  const shipping = shippingCents(store, subtotalCents);
  return {
    storeId,
    lines: priced,
    subtotalCents,
    shippingCents: shipping,
    totalCents: subtotalCents + shipping,
    arrivesInBusinessDays: priced.reduce((latest, line) => Math.max(latest, line.arrivesInBusinessDays), 0),
    issues,
  };
}

function emptyQuantities(): Record<ProductKind, number> {
  return { hoodie: 0, tumbler: 0, notebook: 0 };
}

export function cheapestCompliantPlan(conditions: StoreConditions, mission: Mission = MISSION): CheapestPlan | null {
  let best: CheapestPlan | null = null;
  const assignments = STORE_IDS.flatMap(hoodie => STORE_IDS.flatMap(tumbler => STORE_IDS.map(notebook => ({ hoodie, tumbler, notebook }))));
  for (const assignment of assignments) {
    const byStore = new Map<StoreId, CartLine[]>();
    let possible = true;
    for (const kind of PRODUCT_KINDS) {
      const storeId = assignment[kind];
      const product = STORES[storeId].products.find(candidate => candidate.kind === kind);
      if (!product || product.arrivesInBusinessDays > mission.deadlineBusinessDays) { possible = false; break; }
      byStore.set(storeId, [...(byStore.get(storeId) ?? []), { sku: product.sku, quantity: mission.quantities[kind] }]);
    }
    if (!possible) continue;
    const carts = [...byStore].map(([storeId, lines]) => priceCart(storeId, lines, conditions));
    if (carts.some(cart => cart.issues.length > 0)) continue;
    const totalCents = carts.reduce((sum, cart) => sum + cart.totalCents, 0);
    if (!best || totalCents < best.totalCents) best = { stores: [...byStore].map(([storeId, lines]) => ({ storeId, lines })), totalCents };
  }
  return best;
}

export function evaluatePlan(plan: readonly PlanStore[], conditions: StoreConditions, budgetCents: number, reportedTotalCents: number | null = null, mission: Mission = MISSION): PlanEvaluation {
  const grouped = new Map<StoreId, CartLine[]>();
  for (const entry of plan) grouped.set(entry.storeId, [...(grouped.get(entry.storeId) ?? []), ...entry.lines]);
  const carts = [...grouped].map(([storeId, lines]) => priceCart(storeId, lines, conditions));
  const issues = carts.flatMap(cart => cart.issues);
  const quantities = emptyQuantities();
  for (const line of carts.flatMap(cart => cart.lines)) quantities[line.kind] += line.quantity;
  for (const kind of PRODUCT_KINDS) {
    if (quantities[kind] !== mission.quantities[kind]) issues.push(`The mission needs ${mission.quantities[kind]} ${kind}s; this plan has ${quantities[kind]}.`);
  }
  const late = carts.flatMap(cart => cart.lines.filter(line => line.arrivesInBusinessDays > mission.deadlineBusinessDays).map(line => `${line.name} arrives in ${line.arrivesInBusinessDays} business days, after the ${mission.deadlineBusinessDays}-day deadline.`));
  issues.push(...late);
  const totalCents = carts.reduce((sum, cart) => sum + cart.totalCents, 0);
  const withinBudget = totalCents <= budgetCents;
  const complete = PRODUCT_KINDS.every(kind => quantities[kind] === mission.quantities[kind]);
  const best = cheapestCompliantPlan(conditions, mission);
  return {
    carts,
    totalCents,
    budgetCents,
    quantities,
    issues,
    withinBudget,
    meetsDeadline: late.length === 0,
    complete,
    valid: issues.length === 0 && withinBudget && carts.length > 0,
    bestCents: best?.totalCents ?? null,
    reportedTotalCents,
  };
}
