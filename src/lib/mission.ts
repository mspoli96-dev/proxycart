import type { ProductKind } from "./catalog";

export const MISSION = {
  title: "Welcome kits for 20 new hires",
  quantities: { hoodie: 20, tumbler: 20, notebook: 20 } satisfies Record<ProductKind, number>,
  budgetCents: 125_000,
  deadlineBusinessDays: 4,
} as const;

export type Mission = typeof MISSION;

export const BUDGET_OPTIONS_CENTS = [120_000, 116_000, 110_000] as const;

export function isBudgetOption(value: unknown): value is (typeof BUDGET_OPTIONS_CENTS)[number] {
  return typeof value === "number" && (BUDGET_OPTIONS_CENTS as readonly number[]).includes(value);
}
