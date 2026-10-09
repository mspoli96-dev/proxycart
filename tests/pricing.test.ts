import { describe, expect, it } from "vitest";
import { formatCad, STORES } from "../src/lib/catalog";
import { MISSION } from "../src/lib/mission";
import { BASE_CONDITIONS, cheapestCompliantPlan, evaluatePlan, priceCart, shippingCents } from "../src/lib/pricing";

const signedIn = { ...BASE_CONDITIONS, harbourSignedIn: true };
const soldOut = { harbourSignedIn: true, hoodiesSoldOutAt: ["northbound" as const], stockOutArmed: false };

describe("store pricing", () => {
  it("prices a cart from the catalog, never from the caller", () => {
    const cart = priceCart("northbound", [{ sku: "NB-HD-11", quantity: 20 }], BASE_CONDITIONS);
    expect(cart.subtotalCents).toBe(72_000);
    expect(cart.shippingCents).toBe(3_000);
    expect(cart.totalCents).toBe(75_000);
    expect(cart.issues).toEqual([]);
  });

  it("shows team pricing at Harbour only after sign-in", () => {
    const lines = [{ sku: "HP-TM-22", quantity: 20 }];
    expect(priceCart("harbour", lines, BASE_CONDITIONS).subtotalCents).toBe(32_000);
    expect(priceCart("harbour", lines, signedIn).subtotalCents).toBe(24_000);
  });

  it("applies Harbour free shipping from CAD 300", () => {
    expect(shippingCents(STORES.harbour, 29_999)).toBe(2_000);
    expect(shippingCents(STORES.harbour, 30_000)).toBe(0);
    expect(shippingCents(STORES.maple, 0)).toBe(0);
  });

  it("merges duplicate lines and flags unknown products and stock", () => {
    const cart = priceCart("northbound", [{ sku: "NB-HD-11", quantity: 15 }, { sku: "NB-HD-11", quantity: 15 }, { sku: "XX-1", quantity: 1 }], BASE_CONDITIONS);
    expect(cart.lines).toHaveLength(1);
    expect(cart.lines[0].quantity).toBe(30);
    expect(cart.issues).toEqual(["Heavyweight Team Hoodie: only 25 left at Northbound Goods.", "XX-1 is not sold by Northbound Goods."]);
  });

  it("marks hoodies sold out only at the store that ran out", () => {
    const cart = priceCart("northbound", [{ sku: "NB-HD-11", quantity: 20 }], soldOut);
    expect(cart.issues).toEqual(["Heavyweight Team Hoodie is sold out at Northbound Goods."]);
  });

  it("rejects fractional and oversized quantities", () => {
    expect(priceCart("maple", [{ sku: "MS-NB-03", quantity: 1.5 }], BASE_CONDITIONS).issues).toHaveLength(1);
    expect(priceCart("maple", [{ sku: "MS-NB-03", quantity: 501 }], BASE_CONDITIONS).issues).toHaveLength(1);
  });
});

describe("cheapest compliant plan", () => {
  it("has no plan within budget unless the agent signs in at Harbour", () => {
    const best = cheapestCompliantPlan(BASE_CONDITIONS);
    expect(best?.totalCents).toBe(126_500);
    expect(best!.totalCents).toBeGreaterThan(MISSION.budgetCents);
  });

  it("splits hoodies to Northbound and the rest to Harbour after sign-in", () => {
    const best = cheapestCompliantPlan(signedIn);
    expect(best?.totalCents).toBe(115_500);
    expect(best?.stores.map(store => store.storeId).sort()).toEqual(["harbour", "northbound"]);
  });

  it("moves everything to Harbour when Northbound sells out of hoodies", () => {
    const best = cheapestCompliantPlan(soldOut);
    expect(best?.totalCents).toBe(118_500);
    expect(best?.stores.map(store => store.storeId)).toEqual(["harbour"]);
  });
});

describe("plan evaluation", () => {
  const optimal = [
    { storeId: "northbound" as const, lines: [{ sku: "NB-HD-11", quantity: 20 }] },
    { storeId: "harbour" as const, lines: [{ sku: "HP-TM-22", quantity: 20 }, { sku: "HP-NB-23", quantity: 20 }] },
  ];

  it("accepts the optimal plan and recomputes every total", () => {
    const result = evaluatePlan(optimal, signedIn, MISSION.budgetCents, 115_500);
    expect(result.valid).toBe(true);
    expect(result.totalCents).toBe(115_500);
    expect(result.bestCents).toBe(115_500);
    expect(result.carts.find(cart => cart.storeId === "harbour")?.shippingCents).toBe(0);
  });

  it("flags notebooks that arrive after the deadline", () => {
    const late = [{ storeId: "northbound" as const, lines: [{ sku: "NB-HD-11", quantity: 20 }, { sku: "NB-NB-13", quantity: 20 }] }, { storeId: "harbour" as const, lines: [{ sku: "HP-TM-22", quantity: 20 }] }];
    const result = evaluatePlan(late, signedIn, MISSION.budgetCents);
    expect(result.meetsDeadline).toBe(false);
    expect(result.valid).toBe(false);
    expect(result.issues.join(" ")).toContain("after the 4-day deadline");
  });

  it("flags incomplete quantities and budget overruns", () => {
    const result = evaluatePlan([{ storeId: "maple", lines: [{ sku: "MS-HD-01", quantity: 20 }] }], BASE_CONDITIONS, 50_000);
    expect(result.complete).toBe(false);
    expect(result.withinBudget).toBe(false);
    expect(result.issues).toContain("The mission needs 20 tumblers; this plan has 0.");
  });

  it("treats a reduced budget below the best possible total as impossible", () => {
    const result = evaluatePlan(optimal, signedIn, 110_000);
    expect(result.withinBudget).toBe(false);
    expect(result.bestCents).toBeGreaterThan(110_000);
  });

  it("formats Canadian dollars with grouping", () => {
    expect(formatCad(115_500)).toBe("CAD 1,155.00");
    expect(formatCad(825)).toBe("CAD 8.25");
  });
});
