import { readFileSync } from "node:fs";
import { parseEnv } from "node:util";

const root = new URL("..", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1");
const vercelEnv = parseEnv(readFileSync(`${root}/.env.vercel.local`, "utf8"));
for (const name of ["KV_REST_API_URL", "KV_REST_API_TOKEN"]) process.env[name] = vercelEnv[name];
const localEnv = parseEnv(readFileSync(`${root}/.env.local`, "utf8"));
for (const name of ["SESSION_SECRET", "PROXYCART_DEMO_PASSWORD"]) process.env[name] = localEnv[name];

const { openAiAgentApi } = await import("../src/lib/server/agent");
const { createRunStore } = await import("../src/lib/server/run-store");
const { cancelRun } = await import("../src/lib/server/runs");

const store = createRunStore();
const run = await store.getRun(process.argv[2] ?? "");
if (!run) throw new Error("Run not found.");
const snapshot = await cancelRun({ store, agent: openAiAgentApi(), now: Date.now }, run);
console.log(JSON.stringify({ run: run.id, status: snapshot.status, steps: snapshot.steps.length }));
