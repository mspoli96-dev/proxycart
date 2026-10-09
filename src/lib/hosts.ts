import { STORE_IDS, type StoreId } from "./catalog";

export const APP_HOST = "webytex-proxycart.vercel.app";

export const STORE_HOSTS: Record<StoreId, string> = {
  maple: "proxycart-maple-supply.vercel.app",
  northbound: "proxycart-northbound-goods.vercel.app",
  harbour: "proxycart-harbour-print.vercel.app",
};

export function storeForHost(host: string | null | undefined): StoreId | null {
  const normalized = (host ?? "").split(":")[0].trim().toLowerCase();
  return STORE_IDS.find(storeId => STORE_HOSTS[storeId] === normalized) ?? null;
}

export function storeForOrigin(origin: string): StoreId | null {
  try {
    const url = new URL(origin);
    return url.protocol === "https:" ? storeForHost(url.host) : null;
  } catch {
    return null;
  }
}

export function storeUrl(storeId: StoreId, runId?: string): string {
  const url = new URL(`https://${STORE_HOSTS[storeId]}/`);
  if (runId) url.searchParams.set("run", runId);
  return url.toString();
}
