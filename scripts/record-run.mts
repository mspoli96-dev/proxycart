import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { parseEnv } from "node:util";
import sharp from "sharp";
import type { RecordedRun, RespondRequest, RunSnapshot, Scenario } from "../src/lib/contracts";

const root = new URL("..", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1");
const vercelEnv = parseEnv(readFileSync(`${root}/.env.vercel.local`, "utf8"));
for (const name of ["KV_REST_API_URL", "KV_REST_API_TOKEN"]) process.env[name] = vercelEnv[name];
const localEnv = parseEnv(readFileSync(`${root}/.env.local`, "utf8"));
for (const name of ["SESSION_SECRET", "PROXYCART_DEMO_PASSWORD"]) process.env[name] = localEnv[name];
process.env.PROXYCART_MODEL = "gpt-6-luna";

const { openAiAgentApi } = await import("../src/lib/server/agent");
const { createRunStore } = await import("../src/lib/server/run-store");
const { advanceRun, respondToRun } = await import("../src/lib/server/runs");
const { RUN_MAX_MS } = await import("../src/lib/server/config");

type Policy = { scenario: Scenario; title: string; description: string; firstApproval: "approve" | "reduce-budget" | "reject"; reducedBudgetCents?: number };
const POLICIES: Record<string, Policy> = {
  normal: { scenario: "standard", title: "A normal day", description: "Compares three stores, signs in for team pricing, then waits for approval before paying.", firstApproval: "approve" },
  "sold-out": { scenario: "stock-out", title: "Sold out at checkout", description: "Hoodies sell out as the agent pays. It re-plans and asks again before spending more.", firstApproval: "approve" },
  "budget-cut": { scenario: "standard", title: "The budget gets cut", description: "The buyer lowers the budget below anything possible. The agent explains instead of buying.", firstApproval: "reduce-budget", reducedBudgetCents: 110_000 },
};

const key = process.argv[2] ?? "normal";
const policy = POLICIES[key];
if (!policy) throw new Error(`Unknown policy ${key}`);

const store = createRunStore();
const agent = openAiAgentApi();
const deps = { store, agent, now: Date.now };
const id = randomUUID();
const createdAt = Date.now();
const run = { id, visitorId: "recorder", sessionId: null as string | null, model: "gpt-6-luna", scenario: policy.scenario, createdAt, deadlineAt: createdAt + RUN_MAX_MS };
await store.saveRun(run);
run.sessionId = await agent.createSession(id, run.model);
await store.saveRun(run);
console.log(JSON.stringify({ event: "started", run: id, policy: key }));

const shots = new Map<string, string>();
let approvals = 0;
let snapshot: RunSnapshot | null = null;
const log: unknown[] = [];

for (;;) {
  await new Promise(resolve => setTimeout(resolve, 2_000));
  try {
    for (const item of await agent.items(run.sessionId)) {
      if (item.id && item.type === "computer_use_call" && item.output?.image_url?.startsWith("data:image/jpeg;base64,")) shots.set(item.id, item.output.image_url);
    }
  } catch {
    // The session may already be deleted after completion.
  }
  snapshot = await advanceRun(deps, run, false);
  log.push({ at: Date.now() - createdAt, status: snapshot.status, steps: snapshot.steps.length, pending: snapshot.pending?.kind ?? null });
  if (!["starting", "running", "waiting"].includes(snapshot.status)) break;
  const pending = snapshot.pending;
  if (!pending) continue;
  let request: RespondRequest;
  if (pending.kind === "origin") request = { kind: "origin", requestId: pending.requestId, decision: "approve" };
  else if (pending.kind === "sign-in") request = { kind: "sign-in", requestId: pending.requestId, decision: "submit" };
  else {
    approvals += 1;
    const decision = approvals === 1 ? policy.firstApproval : policy.firstApproval === "reduce-budget" ? "reject" : "approve";
    request = decision === "reduce-budget" ? { kind: "approval", callId: pending.callId, decision, budgetCents: policy.reducedBudgetCents } : { kind: "approval", callId: pending.callId, decision: pending.evaluation.valid ? decision : "reject" };
  }
  console.log(JSON.stringify({ event: "decision", kind: request.kind, decision: request.decision, at: Date.now() - createdAt }));
  try {
    snapshot = await respondToRun(deps, run, request);
  } catch (error) {
    console.log(JSON.stringify({ event: "decision-error", message: error instanceof Error ? error.message : String(error) }));
  }
}

const final = snapshot!;
const directory = `${root}/public/recorded/${key}`;
mkdirSync(directory, { recursive: true });
let saved = 0;
const steps = [];
for (const step of final.steps) {
  const image = step.kind === "action" ? shots.get(step.id) : undefined;
  if (step.kind === "action" && image) {
    saved += 1;
    const file = `${String(saved).padStart(2, "0")}.jpg`;
    await sharp(Buffer.from(image.split(",")[1], "base64")).resize({ width: 1100, withoutEnlargement: true }).jpeg({ quality: 72, mozjpeg: true }).toFile(`${directory}/${file}`);
    steps.push({ ...step, screenshot: `/recorded/${key}/${file}` });
  } else {
    steps.push(step);
  }
}
const recorded: RecordedRun = { ...final, steps, source: "recorded", title: policy.title, description: policy.description, recordedAt: new Date(createdAt).toISOString() };
const dataFile = `${root}/src/data/recorded-runs.json`;
const existing = existsSync(dataFile) ? (JSON.parse(readFileSync(dataFile, "utf8")) as RecordedRun[]) : [];
const order = Object.values(POLICIES).map(entry => entry.title);
const merged = [...existing.filter(entry => entry.title !== recorded.title), recorded].sort((a, b) => order.indexOf(a.title) - order.indexOf(b.title));
writeFileSync(dataFile, `${JSON.stringify(merged, null, 1)}\n`);
mkdirSync(`${root}/recordings`, { recursive: true });
writeFileSync(`${root}/recordings/${key}-${id}.json`, JSON.stringify({ policy: key, run: id, session: run.sessionId, log, final }, null, 1));
console.log(JSON.stringify({ event: "finished", run: id, status: final.status, steps: final.steps.length, screenshots: saved, seconds: Math.round(final.elapsedMs / 1000), finalMessage: final.finalMessage }));
