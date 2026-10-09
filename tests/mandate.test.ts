import { describe, expect, it } from "vitest";
import { cartFingerprint, issueMandate, maskMandateCode, MANDATE_TTL_MS, newMandateCode, normalizeMandateCode, verifyMandate } from "../src/lib/mandate";

const SECRET = "test-only-signing-secret-".repeat(2);
const lines = [{ sku: "NB-HD-11", quantity: 20 }];
const expected = { runId: "run-1", storeId: "northbound" as const, amountCents: 75_000, lines };

describe("purchase mandates", () => {
  it("verifies a mandate issued for the exact store, cart and amount", () => {
    const mandate = issueMandate(expected, SECRET, 1_000, "PXC-ABCD-EFGH");
    expect(verifyMandate(mandate, expected, SECRET, 2_000)).toEqual({ ok: true });
    expect(mandate.expiresAt).toBe(1_000 + MANDATE_TTL_MS);
  });

  it("rejects missing, forged, foreign, expired and altered mandates", () => {
    const mandate = issueMandate(expected, SECRET, 1_000, "PXC-ABCD-EFGH");
    expect(verifyMandate(null, expected, SECRET)).toEqual({ ok: false, reason: "unknown" });
    expect(verifyMandate({ ...mandate, amountCents: 1 }, { ...expected, amountCents: 1 }, SECRET, 2_000)).toEqual({ ok: false, reason: "signature" });
    expect(verifyMandate(mandate, expected, "another-secret-of-sufficient-length", 2_000)).toEqual({ ok: false, reason: "signature" });
    expect(verifyMandate(mandate, { ...expected, runId: "run-2" }, SECRET, 2_000)).toEqual({ ok: false, reason: "run" });
    expect(verifyMandate(mandate, { ...expected, storeId: "harbour" }, SECRET, 2_000)).toEqual({ ok: false, reason: "store" });
    expect(verifyMandate(mandate, expected, SECRET, mandate.expiresAt + 1)).toEqual({ ok: false, reason: "expired" });
    expect(verifyMandate(mandate, { ...expected, amountCents: 78_000 }, SECRET, 2_000)).toEqual({ ok: false, reason: "amount" });
    expect(verifyMandate(mandate, { ...expected, lines: [{ sku: "NB-HD-11", quantity: 19 }] }, SECRET, 2_000)).toEqual({ ok: false, reason: "cart" });
  });

  it("fingerprints carts independently of line order and duplicates", () => {
    const a = cartFingerprint([{ sku: "HP-TM-22", quantity: 20 }, { sku: "HP-NB-23", quantity: 20 }]);
    const b = cartFingerprint([{ sku: "HP-NB-23", quantity: 10 }, { sku: "HP-TM-22", quantity: 20 }, { sku: "HP-NB-23", quantity: 10 }]);
    expect(a).toBe(b);
    expect(a).not.toBe(cartFingerprint([{ sku: "HP-TM-22", quantity: 20 }]));
  });

  it("generates and normalizes readable codes", () => {
    let next = 0;
    expect(newMandateCode(() => next++ % 31)).toBe("PXC-ABCD-EFGH");
    for (let index = 0; index < 50; index += 1) expect(normalizeMandateCode(newMandateCode())).not.toBeNull();
    expect(normalizeMandateCode(" pxc-abcd-efgh ")).toBe("PXC-ABCD-EFGH");
    expect(normalizeMandateCode("PXC-ABCD-EFG0")).toBeNull();
    expect(normalizeMandateCode("APPROVED")).toBeNull();
    expect(normalizeMandateCode(42)).toBeNull();
    expect(maskMandateCode("PXC-ABCD-EFGH")).toBe("PXC-••••-EFGH");
  });
});
