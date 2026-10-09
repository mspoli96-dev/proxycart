import { cookies, headers } from "next/headers";
import { isStoreId, STORES, type ProductKind, type StoreId } from "../catalog";
import { storeForHost } from "../hosts";
import { BASE_CONDITIONS, effectiveStock, unitPriceCents, type StoreConditions } from "../pricing";
import { storesReady } from "./config";
import { createRunStore } from "./run-store";
import { recordVisit, RUN_COOKIE, storeContext, validRunId } from "./storefront";

export interface ProductView {
  sku: string;
  kind: ProductKind;
  name: string;
  detail: string;
  unitCents: number;
  listCents: number | null;
  stock: number;
  arrivesInBusinessDays: number;
}

export interface StoreView {
  id: StoreId;
  name: string;
  tagline: string;
  city: string;
  accent: string;
  shippingCents: number;
  freeShippingFromCents: number | null;
  signInForTeamPricing: boolean;
}

export interface StorePageData {
  store: StoreView;
  base: string;
  runId: string | null;
  signedIn: boolean;
  products: ProductView[];
}

export async function loadStorePage(storeParam: string, runParam: unknown, page: string): Promise<StorePageData | null> {
  if (!isStoreId(storeParam)) return null;
  const storeId = storeParam;
  const store = STORES[storeId];
  const [cookieStore, headerStore] = await Promise.all([cookies(), headers()]);
  const base = storeForHost(headerStore.get("host")) === storeId ? "" : `/stores/${storeId}`;
  const candidate = validRunId(runParam) ? runParam : cookieStore.get(RUN_COOKIE)?.value ?? null;
  let runId: string | null = null;
  let conditions: StoreConditions = { ...BASE_CONDITIONS };
  if (storesReady() && candidate) {
    try {
      const runStore = createRunStore();
      const context = await storeContext(runStore, candidate);
      runId = context.runId;
      conditions = context.conditions;
      if (runId) await recordVisit(runStore, runId, storeId, page);
    } catch {
      runId = null;
    }
  }
  const products = store.products.map(product => {
    const unitCents = unitPriceCents(store, product, conditions);
    return {
      sku: product.sku,
      kind: product.kind,
      name: product.name,
      detail: product.detail,
      unitCents,
      listCents: unitCents !== product.priceCents ? product.priceCents : null,
      stock: effectiveStock(storeId, product, conditions),
      arrivesInBusinessDays: product.arrivesInBusinessDays,
    };
  });
  const { products: _products, ...view } = store;
  return { store: view, base, runId, signedIn: store.signInForTeamPricing && conditions.harbourSignedIn, products };
}
