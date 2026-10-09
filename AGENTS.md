# ProxyCart

ProxyCart is a Webytex for Startups demo of agent-safe checkout. All code, comments, UI, articles and public documentation are English. Converse with Martin in Spanish. Only this repository and its private review materials are in scope; preserve earlier demos and client projects.

Martin approved development, public GitHub source and the Vercel demo, followed by a native LinkedIn draft for his review. Never publish the article until his later explicit instruction. Reuse the authorized encrypted shared OpenAI credential without displaying it. The shared provider allowance is not a new allowance per demo: ProxyCart has its own USD 6 per month ceiling inside it, and development testing is limited to USD 3. Do not create paid resources without specific cost approval.

Use Node.js 24, npm with a committed lockfile, Next.js, React, TypeScript, the OpenAI Agents API, Zod, Upstash Redis and Vitest. Read the installed Next.js documentation before framework changes; this version uses `proxy.ts` instead of middleware. Commit with one English subject without body, trailers or automated-assistance credits. Keep credentials, provider IDs, account limits, publication ledgers, `recordings/` and `docs/ARTICLE.md` out of Git.

Startups is blue #5A9AE8 with dark navy text. Primary type and controls are at least 18px; helper text at least 16px; interactive controls at least 48px high. Provide good contrast, keyboard focus, responsive layouts and reduced-motion support.

The agent runs computer use in an OpenAI-hosted browser with gpt-6-luna. Its network is restricted to the three store hosts, and every new origin and every sign-in goes through an approval request. The demo account is submitted with browser authentication and must never appear in model input, logs or the UI. Store pages must stay self-contained: no external fonts, scripts or images, no BotID and no Vercel challenges on store hosts.

Payment is enforced by the stores, not by the prompt. A purchase needs one HMAC-signed, single-use mandate per store, bound to the run, store, cart fingerprint and total, valid for 15 minutes. Store servers re-price every cart from the catalogue and refuse anything that does not match. Never trust prices, totals or SKUs reported by the model; recompute them in code and show both when they differ.

Recorded runs are real sessions with the same agent and stores, labelled as recordings whose buyer decisions were scripted in advance for each scenario. Never invent agent actions, timings, costs or outcomes. Live runs must remain visibly distinct.

Protect paid endpoints with bounded inputs, exact origin, a signed visitor cookie, BotID, atomic Redis admission under the proxycart namespace, a conservative per-run spend reservation, a single concurrent live run, a ten-minute limit and session deletion on completion. Fail closed when live configuration is missing while recorded runs stay usable.

Verify pricing, mandates, orchestration, admission and store checks with tests, plus typecheck, build, hosted probes and browser checks. Record actual live outcomes, costs and remaining limits honestly.

<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
