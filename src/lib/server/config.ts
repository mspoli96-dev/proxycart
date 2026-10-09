import type { LiveConfig } from "../contracts";

export const DEFAULT_MODEL = "gpt-6-luna";
export const VISITOR_COOKIE = "proxycart_visitor";
export const VISITOR_DAILY_LIMIT = 2;
export const GLOBAL_DAILY_LIMIT = 4;
export const CONCURRENT_LIMIT = 1;
export const RUN_MAX_MS = 10 * 60_000;
export const RUN_TTL_SECONDS = 3 * 60 * 60;
export const RUN_RESERVE_MICRO_USD = 400_000;
export const MAX_MONTHLY_MICRO_USD = 6_000_000;
export const DEMO_ACCOUNT_EMAIL = "buyer@proxycart.example";

export function demoAccountPassword(): string {
  return process.env.PROXYCART_DEMO_PASSWORD?.trim() || "harbour-team-2026";
}

export function agentModel(): string {
  const value = process.env.PROXYCART_MODEL?.trim();
  return value && /^gpt-[a-z0-9.-]{1,40}$/.test(value) ? value : DEFAULT_MODEL;
}

export function hostedEnvironment(): boolean {
  return process.env.VERCEL === "1" || Boolean(process.env.VERCEL_ENV);
}

export function redisConfiguration(): { url: string; token: string } {
  return {
    url: process.env.UPSTASH_REDIS_REST_URL?.trim() || process.env.KV_REST_API_URL?.trim() || "",
    token: process.env.UPSTASH_REDIS_REST_TOKEN?.trim() || process.env.KV_REST_API_TOKEN?.trim() || "",
  };
}

export function signingSecret(): string | null {
  const secret = process.env.SESSION_SECRET ?? "";
  return secret.length >= 32 ? secret : null;
}

export function monthlyBudgetMicroUsd(): number {
  const value = process.env.PROXYCART_MONTHLY_BUDGET_USD;
  if (value === undefined) return MAX_MONTHLY_MICRO_USD;
  if (!/^\d+(\.\d{1,6})?$/.test(value)) return 0;
  const result = Math.round(Number(value) * 1_000_000);
  return Number.isSafeInteger(result) && result > 0 && result <= MAX_MONTHLY_MICRO_USD ? result : 0;
}

function originReady(): boolean {
  try {
    const origin = new URL(process.env.APP_ORIGIN ?? "");
    return origin.origin === process.env.APP_ORIGIN && (origin.protocol === "https:" || (!hostedEnvironment() && origin.protocol === "http:" && ["localhost", "127.0.0.1"].includes(origin.hostname)));
  } catch {
    return false;
  }
}

export function storesReady(): boolean {
  const redis = redisConfiguration();
  return Boolean(redis.url && redis.token && signingSecret());
}

export function publicConfig(): LiveConfig {
  const liveEnabled = process.env.PROXYCART_LIVE_ENABLED === "true"
    && Boolean(process.env.OPENAI_API_KEY?.trim())
    && storesReady()
    && originReady()
    && process.env.OPENAI_PROJECT_HARD_LIMIT_CONFIRMED === "true"
    && process.env.PROXYCART_COST_RESERVATION_CONFIRMED === "true"
    && monthlyBudgetMicroUsd() >= RUN_RESERVE_MICRO_USD
    && (!hostedEnvironment() || (process.env.VERCEL_BOTID_ENABLED === "true" && process.env.VERCEL_RATE_LIMIT_CONFIRMED === "true"));
  return { liveEnabled, model: agentModel(), unavailableReason: liveEnabled ? null : "Live runs are paused right now. The recorded runs below are real sessions with the same agent." };
}
