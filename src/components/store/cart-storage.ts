"use client";

import type { CartLine } from "../../lib/pricing";

export function cartKey(storeId: string, runId: string | null): string {
  return `proxycart:cart:${storeId}:${runId ?? "browse"}`;
}

export function readCart(key: string): CartLine[] {
  try {
    const value = JSON.parse(window.localStorage.getItem(key) ?? "[]") as unknown;
    if (!Array.isArray(value)) return [];
    return value.filter((line): line is CartLine => typeof line?.sku === "string" && Number.isInteger(line?.quantity) && line.quantity > 0 && line.quantity <= 500).slice(0, 12);
  } catch {
    return [];
  }
}

export function writeCart(key: string, lines: CartLine[]): void {
  try {
    window.localStorage.setItem(key, JSON.stringify(lines));
  } catch {
    return;
  }
}
