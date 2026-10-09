# Architecture

ProxyCart is one Next.js application deployed to one Vercel project. It serves four hosts: the demo itself and three fictional stores. The agent never talks to the demo; it only browses the stores.

```
Buyer's browser ──► webytex-proxycart.vercel.app ──► OpenAI Agents API (session)
                          │  ▲                              │
                          │  │ approvals, plan, mandates    ▼
                          ▼  │                     OpenAI-hosted cloud browser
                     Upstash Redis ◄────────────── proxycart-maple-supply.vercel.app
                     (runs, store log,             proxycart-northbound-goods.vercel.app
                      mandates)                    proxycart-harbour-print.vercel.app
```

## Hosts and routing

`src/proxy.ts` (the Next.js 16 replacement for middleware) maps each store host to `/stores/<id>` and only serves the catalogue, checkout and sign-in pages plus the store APIs there. The demo's own pages and APIs return 404 on store hosts. When a store page is opened with `?run=<id>`, the proxy sets a host-scoped `pxc_run` cookie so later pages and checkouts belong to that run.

Store pages are self-contained: fonts are self-hosted by `next/font`, there are no external scripts or images, and BotID is not initialized on store hosts. The cloud browser runs with a restricted network that only reaches the three store hosts, so any external resource would fail to load.

## The agent session

`src/lib/server/agent.ts` creates one Agents API session per run:

- `environment`: `openai_hosted`, small container, desktop enabled, `network.access: restricted` with the three store hosts as `allowed_domains`.
- `agent`: `gpt-6-luna`, medium reasoning, instructions that treat page content as untrusted, and two tools: `computer_use` with screenshots requested, and the `request_purchase_approval` function. In our runs the computer-use items came back without screenshots, so the timeline relies on the action titles the API returns and on the stores' own log.
- `input`: the mission, with each store URL carrying the run ID.

The server polls the session when the buyer's page polls it. Session status and `required_actions` become a timeline and at most one pending decision:

| Required action | Pending decision | Response event |
| --- | --- | --- |
| `browser_origin_access` | Allow or block a store | `computer_use_approval_request_result` with `approve` or `deny` |
| `browser_authentication` | Sign in with the demo account | `computer_use_approval_request_result` with `submit` and field values, or `cancel` |
| `function_call` `request_purchase_approval` | Approve, ask for a cheaper plan or decline | `tool_result` with mandates, a new budget or a rejection |

Origins outside the store hosts are denied automatically. Plans that fail the code checks, or arrive after five approval requests, are returned to the agent without asking the buyer. Each request ID and call ID can be answered once, enforced with Redis `SET NX`.

Sign-in values are mapped from the form fields the browser reports (email and password) and sent only in the authentication response. They are not part of the model input, the run record, the timeline or the logs.

## Plan checks

`src/lib/pricing.ts` prices every cart from the catalogue under the run's conditions (team pricing after sign-in, Northbound's stock-out), applies shipping rules, checks quantities against the mission and delivery estimates against the deadline, and finds the cheapest compliant plan by trying every assignment of products to stores. The agent's own prices and totals are only displayed, never used.

Without team pricing the cheapest compliant plan costs CAD 1,265, over the CAD 1,250 budget. With team pricing it costs CAD 1,155 (hoodies from Northbound, the rest from Harbour), and buying everything from Harbour costs CAD 1,185. If Harbour sells out of hoodies, the CAD 1,155 split is the only plan within budget; if Northbound does, everything from Harbour is. No plan meets a CAD 1,100 budget.

## Mandates

`src/lib/mandate.ts` issues a code such as `PXC-7K2Q-M4HV` per store on approval. The record contains the run ID, store, amount in cents, a SHA-256 fingerprint of the sorted cart lines, issue and expiry times, and an HMAC-SHA256 signature over all of them. Records live in Redis for 20 minutes; mandates expire after 15.

`src/lib/server/storefront.ts` checks out in this order: the run exists and is active; the cart is re-priced and must have no issues; the code is well formed; the record exists; the signature, run, store, expiry, exact amount and cart fingerprint match; and the code has not been used (`SET NX`). Any failure returns a specific refusal that the agent can read on the page, and is logged as a store event.

In the "sold out at checkout" scenario, and after a buyer arms a stock-out during a live run, the first checkout that includes hoodies marks them as sold out at that store. The agent meets the change at the worst possible moment, after approval, and has to re-plan and ask again because its mandates no longer match.

## Live admission and privacy

Starting a live run requires the exact origin, a signed visitor cookie, BotID (hosted) and an atomic Redis admission script. The script enforces one concurrent live run, two runs per visitor and four overall per day, and a monthly reservation budget (USD 0.40 per run, USD 6 per month). Vercel firewall rules rate-limit run creation, run polling and the store APIs per IP.

Runs end when the agent finishes, fails, is stopped by the buyer or reaches ten minutes. The server then caches a final snapshot without screenshots, deletes the agent session and releases the concurrency slot. Run data in Redis expires after three hours. Screenshots are only sent to the buyer who owns the run and are not stored by the server.

## Recorded runs

`scripts/record-run.mts` drives a real session against the deployed stores using the same orchestration code, applies the buyer decisions scripted for each scenario, and saves the resulting timeline. Recordings are labelled in the UI, which says the decisions were scripted.
