import { checkBotId } from "botid/server";
import { isStoreId, type StoreId } from "../catalog";
import { respondRequest, RUN_ID_PATTERN, startRunRequest } from "../contracts";
import type { CartLine } from "../pricing";
import { openAiAgentApi, type AgentApi } from "./agent";
import { hostedEnvironment, publicConfig, storesReady } from "./config";
import { createRunStore, type RunRecord, type RunStore } from "./run-store";
import { advanceRun, cancelRun, respondToRun, startRun, triggerStockOut, type RunDeps } from "./runs";
import { assertOrigin, errorResponse, newVisitor, PublicError, readBoundedJson, readCookie, visitorFromRequest } from "./security";
import { checkout, quote, RUN_COOKIE, signIn } from "./storefront";

const noStore = { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" };

export interface HandlerDependencies {
  store: () => RunStore;
  agent: () => AgentApi;
  verifyBrowser: () => Promise<boolean>;
  now: () => number;
}

const defaults: HandlerDependencies = {
  store: () => createRunStore(),
  agent: () => openAiAgentApi(),
  async verifyBrowser() {
    const result = await checkBotId({ advancedOptions: { checkLevel: "basic" }, developmentOptions: { isDevelopment: false } });
    return result?.isBot === false && result.bypassed === false;
  },
  now: Date.now,
};

function deps(services: HandlerDependencies): RunDeps {
  return { store: services.store(), agent: services.agent(), now: services.now };
}

export function configResponse(request: Request): Response {
  try {
    const config = publicConfig();
    const cookie = config.liveEnabled && !visitorFromRequest(request) ? newVisitor(request).cookie : undefined;
    return Response.json(config, { headers: { ...noStore, ...(cookie ? { "Set-Cookie": cookie } : {}) } });
  } catch (error) {
    return errorResponse(error);
  }
}

async function ownedRun(request: Request, runId: string, store: RunStore): Promise<RunRecord> {
  if (!RUN_ID_PATTERN.test(runId)) throw new PublicError("Run not found.", 404);
  const visitor = visitorFromRequest(request);
  const run = visitor ? await store.getRun(runId) : null;
  if (!run || run.visitorId !== visitor) throw new PublicError("Run not found.", 404);
  return run;
}

export async function startResponse(request: Request, services: HandlerDependencies = defaults): Promise<Response> {
  try {
    assertOrigin(request);
    const parsed = startRunRequest.safeParse(await readBoundedJson(request));
    if (!parsed.success) throw new PublicError("Choose a scenario and confirm that an AI agent will browse the demo stores.", 400);
    if (!publicConfig().liveEnabled) throw new PublicError("Live runs are paused right now. The recorded runs are real sessions with the same agent.", 503);
    const visitor = visitorFromRequest(request);
    if (!visitor) throw new PublicError("Refresh ProxyCart before starting a live run.", 403);
    if (hostedEnvironment()) {
      let verified = false;
      try { verified = await services.verifyBrowser(); } catch { throw new PublicError("Browser verification is temporarily unavailable.", 503); }
      if (!verified) throw new PublicError("Browser verification failed. Refresh the page and try again.", 403);
    }
    const snapshot = await startRun(deps(services), visitor, parsed.data.scenario);
    return Response.json(snapshot, { headers: noStore });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function snapshotResponse(request: Request, runId: string, services: HandlerDependencies = defaults): Promise<Response> {
  try {
    const context = deps(services);
    const run = await ownedRun(request, runId, context.store);
    return Response.json(await advanceRun(context, run), { headers: noStore });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function respondResponse(request: Request, runId: string, services: HandlerDependencies = defaults): Promise<Response> {
  try {
    assertOrigin(request);
    const parsed = respondRequest.safeParse(await readBoundedJson(request));
    if (!parsed.success) throw new PublicError("That decision could not be read.", 400);
    const context = deps(services);
    const run = await ownedRun(request, runId, context.store);
    return Response.json(await respondToRun(context, run, parsed.data), { headers: noStore });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function stockOutResponse(request: Request, runId: string, services: HandlerDependencies = defaults): Promise<Response> {
  try {
    assertOrigin(request);
    const context = deps(services);
    const run = await ownedRun(request, runId, context.store);
    return Response.json(await triggerStockOut(context, run), { headers: noStore });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function cancelResponse(request: Request, runId: string, services: HandlerDependencies = defaults): Promise<Response> {
  try {
    assertOrigin(request);
    const context = deps(services);
    const run = await ownedRun(request, runId, context.store);
    return Response.json(await cancelRun(context, run), { headers: noStore });
  } catch (error) {
    return errorResponse(error);
  }
}

function storeIdFrom(value: string): StoreId {
  if (!isStoreId(value)) throw new PublicError("Store not found.", 404);
  return value;
}

function linesFrom(value: unknown): CartLine[] {
  if (!Array.isArray(value) || value.length === 0 || value.length > 12) throw new PublicError("The cart could not be read.", 400);
  return value.map(entry => {
    const sku = typeof entry?.sku === "string" ? entry.sku.trim().toUpperCase().slice(0, 24) : "";
    const quantity = Number(entry?.quantity);
    if (!sku || !Number.isInteger(quantity) || quantity < 1 || quantity > 500) throw new PublicError("The cart could not be read.", 400);
    return { sku, quantity };
  });
}

export async function storeQuoteResponse(request: Request, storeParam: string, services: HandlerDependencies = defaults): Promise<Response> {
  try {
    const storeId = storeIdFrom(storeParam);
    if (!storesReady()) throw new PublicError("This demo store is temporarily closed.", 503);
    const body = await readBoundedJson(request) as { lines?: unknown };
    const cart = await quote(services.store(), storeId, readCookie(request, RUN_COOKIE), linesFrom(body?.lines));
    return Response.json({ cart }, { headers: noStore });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function storeCheckoutResponse(request: Request, storeParam: string, services: HandlerDependencies = defaults): Promise<Response> {
  try {
    const storeId = storeIdFrom(storeParam);
    if (!storesReady()) throw new PublicError("This demo store is temporarily closed.", 503);
    const body = await readBoundedJson(request) as { lines?: unknown; mandate?: unknown };
    const result = await checkout(services.store(), storeId, readCookie(request, RUN_COOKIE), linesFrom(body?.lines), body?.mandate, services.now());
    return Response.json(result, { status: result.ok ? 200 : 402, headers: noStore });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function storeSignInResponse(request: Request, services: HandlerDependencies = defaults): Promise<Response> {
  let base = "";
  const back = (path: string) => new Response(null, { status: 303, headers: { ...noStore, Location: `${base}${path}` } });
  try {
    const form = await request.formData();
    base = form.get("base") === "/stores/harbour" ? "/stores/harbour" : "";
    if (!storesReady()) return back("/sign-in?error=closed");
    const accepted = await signIn(services.store(), readCookie(request, RUN_COOKIE) ?? "", form.get("email"), form.get("password"), services.now());
    return back(accepted ? "/?signed-in=1" : "/sign-in?error=1");
  } catch {
    return back("/sign-in?error=1");
  }
}
