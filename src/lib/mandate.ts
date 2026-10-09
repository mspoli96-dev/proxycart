import { createHash, createHmac, randomInt, timingSafeEqual } from "node:crypto";
import type { StoreId } from "./catalog";
import { mergeLines, type CartLine } from "./pricing";

export interface MandateRecord {
  version: 1;
  code: string;
  runId: string;
  storeId: StoreId;
  amountCents: number;
  fingerprint: string;
  issuedAt: number;
  expiresAt: number;
  signature: string;
}

export type MandateFailure = "unknown" | "signature" | "run" | "store" | "expired" | "amount" | "cart" | "used";
export type MandateCheck = { ok: true } | { ok: false; reason: MandateFailure };

export const MANDATE_TTL_MS = 15 * 60_000;
const ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
const CODE_PATTERN = new RegExp(`^PXC-[${ALPHABET}]{4}-[${ALPHABET}]{4}$`);

export const MANDATE_FAILURE_MESSAGES: Record<MandateFailure, string> = {
  unknown: "Payment blocked: this mandate code was not issued for this buyer.",
  signature: "Payment blocked: the mandate signature is not valid.",
  run: "Payment blocked: this mandate belongs to a different buyer session.",
  store: "Payment blocked: this mandate was issued for a different store.",
  expired: "Payment blocked: this mandate has expired. The buyer must approve again.",
  amount: "Payment blocked: the cart total does not match the amount the buyer approved.",
  cart: "Payment blocked: the cart changed after the buyer approved it.",
  used: "Payment blocked: this mandate has already been used.",
};

export function newMandateCode(random: (max: number) => number = randomInt): string {
  const part = () => Array.from({ length: 4 }, () => ALPHABET[random(ALPHABET.length)]).join("");
  return `PXC-${part()}-${part()}`;
}

export function normalizeMandateCode(input: unknown): string | null {
  if (typeof input !== "string" || input.length > 40) return null;
  const compact = input.trim().toUpperCase().replace(/\s+/g, "");
  return CODE_PATTERN.test(compact) ? compact : null;
}

export function cartFingerprint(lines: readonly CartLine[]): string {
  const canonical = mergeLines(lines).map(line => `${line.sku}:${line.quantity}`).join(",");
  return createHash("sha256").update(canonical).digest("hex");
}

type UnsignedMandate = Omit<MandateRecord, "signature">;

function canonical(record: UnsignedMandate): string {
  return ["v1", record.code, record.runId, record.storeId, record.amountCents, record.fingerprint, record.issuedAt, record.expiresAt].join("|");
}

function sign(record: UnsignedMandate, secret: string): string {
  return createHmac("sha256", secret).update(canonical(record)).digest("hex");
}

export function issueMandate(fields: { runId: string; storeId: StoreId; amountCents: number; lines: readonly CartLine[] }, secret: string, now = Date.now(), code = newMandateCode()): MandateRecord {
  const unsigned: UnsignedMandate = { version: 1, code, runId: fields.runId, storeId: fields.storeId, amountCents: fields.amountCents, fingerprint: cartFingerprint(fields.lines), issuedAt: now, expiresAt: now + MANDATE_TTL_MS };
  return { ...unsigned, signature: sign(unsigned, secret) };
}

export function verifyMandate(record: MandateRecord | null, expected: { runId: string; storeId: StoreId; amountCents: number; lines: readonly CartLine[] }, secret: string, now = Date.now()): MandateCheck {
  if (!record) return { ok: false, reason: "unknown" };
  const { signature, ...unsigned } = record;
  const computed = sign(unsigned, secret);
  if (!/^[a-f0-9]{64}$/.test(signature) || !timingSafeEqual(Buffer.from(signature, "hex"), Buffer.from(computed, "hex"))) return { ok: false, reason: "signature" };
  if (record.runId !== expected.runId) return { ok: false, reason: "run" };
  if (record.storeId !== expected.storeId) return { ok: false, reason: "store" };
  if (now > record.expiresAt) return { ok: false, reason: "expired" };
  if (record.amountCents !== expected.amountCents) return { ok: false, reason: "amount" };
  if (record.fingerprint !== cartFingerprint(expected.lines)) return { ok: false, reason: "cart" };
  return { ok: true };
}

export function maskMandateCode(code: string): string {
  return `${code.slice(0, 4)}••••-${code.slice(-4)}`;
}
