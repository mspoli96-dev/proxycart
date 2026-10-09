export type StoreId = "maple" | "northbound" | "harbour";
export type ProductKind = "hoodie" | "tumbler" | "notebook";

export interface Product {
  sku: string;
  kind: ProductKind;
  name: string;
  detail: string;
  priceCents: number;
  teamPriceCents?: number;
  stock: number;
  arrivesInBusinessDays: number;
}

export interface Store {
  id: StoreId;
  name: string;
  tagline: string;
  city: string;
  accent: string;
  shippingCents: number;
  freeShippingFromCents: number | null;
  signInForTeamPricing: boolean;
  products: Product[];
}

export const STORE_IDS: readonly StoreId[] = ["maple", "northbound", "harbour"];
export const PRODUCT_KINDS: readonly ProductKind[] = ["hoodie", "tumbler", "notebook"];

export const KIND_LABELS: Record<ProductKind, string> = {
  hoodie: "Hoodies",
  tumbler: "Insulated tumblers",
  notebook: "A5 notebooks",
};

export const STORES: Record<StoreId, Store> = {
  maple: {
    id: "maple",
    name: "Maple Supply Co.",
    tagline: "Office basics for growing teams",
    city: "Mississauga, ON",
    accent: "#B45309",
    shippingCents: 2_500,
    freeShippingFromCents: null,
    signInForTeamPricing: false,
    products: [
      { sku: "MS-HD-01", kind: "hoodie", name: "Everyday Fleece Hoodie", detail: "Unisex, mixed sizes, embroidered logo", priceCents: 4_200, stock: 40, arrivesInBusinessDays: 3 },
      { sku: "MS-TM-02", kind: "tumbler", name: "Steel Travel Tumbler", detail: "473 ml, double-wall steel", priceCents: 1_550, stock: 100, arrivesInBusinessDays: 3 },
      { sku: "MS-NB-03", kind: "notebook", name: "Dot-grid Notebook A5", detail: "120 pages, lay-flat binding", priceCents: 900, stock: 200, arrivesInBusinessDays: 3 },
    ],
  },
  northbound: {
    id: "northbound",
    name: "Northbound Goods",
    tagline: "Team merch, shipped fast",
    city: "Calgary, AB",
    accent: "#0F766E",
    shippingCents: 3_000,
    freeShippingFromCents: null,
    signInForTeamPricing: false,
    products: [
      { sku: "NB-HD-11", kind: "hoodie", name: "Heavyweight Team Hoodie", detail: "Unisex, mixed sizes, printed logo", priceCents: 3_600, stock: 25, arrivesInBusinessDays: 2 },
      { sku: "NB-TM-12", kind: "tumbler", name: "Insulated Tumbler", detail: "500 ml, powder-coated", priceCents: 1_600, stock: 60, arrivesInBusinessDays: 2 },
      { sku: "NB-NB-13", kind: "notebook", name: "Recycled Notebook A5", detail: "96 pages, recycled paper", priceCents: 750, stock: 150, arrivesInBusinessDays: 6 },
    ],
  },
  harbour: {
    id: "harbour",
    name: "Harbour Print Studio",
    tagline: "Custom printed goods with team pricing",
    city: "Halifax, NS",
    accent: "#9F1239",
    shippingCents: 2_000,
    freeShippingFromCents: 30_000,
    signInForTeamPricing: true,
    products: [
      { sku: "HP-HD-21", kind: "hoodie", name: "Studio Hoodie", detail: "Unisex, mixed sizes, embroidered logo", priceCents: 4_800, teamPriceCents: 3_900, stock: 80, arrivesInBusinessDays: 2 },
      { sku: "HP-TM-22", kind: "tumbler", name: "Harbour Tumbler", detail: "500 ml, laser-engraved logo", priceCents: 1_600, teamPriceCents: 1_200, stock: 120, arrivesInBusinessDays: 2 },
      { sku: "HP-NB-23", kind: "notebook", name: "Linen Notebook A5", detail: "128 pages, linen cover", priceCents: 1_100, teamPriceCents: 825, stock: 90, arrivesInBusinessDays: 2 },
    ],
  },
};

export function isStoreId(value: unknown): value is StoreId {
  return typeof value === "string" && (STORE_IDS as readonly string[]).includes(value);
}

export function findProduct(storeId: StoreId, sku: string): Product | undefined {
  return STORES[storeId].products.find(product => product.sku === sku);
}

export function formatCad(cents: number): string {
  const sign = cents < 0 ? "-" : "";
  const absolute = Math.abs(cents);
  const dollars = Math.floor(absolute / 100).toLocaleString("en-CA");
  return `${sign}CAD ${dollars}.${String(absolute % 100).padStart(2, "0")}`;
}
