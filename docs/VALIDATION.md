# Validation

This document separates deterministic checks, real agent sessions and hosted verification. Passing mocked tests does not establish how the agent behaves; the recorded sessions show what it did in specific runs, not how it will always behave.

## Deterministic checks

`npm test` runs 43 tests in four files without calling any paid API:

- **Pricing and plans:** catalogue pricing, team pricing only after sign-in, shipping thresholds, merged duplicate lines, unknown SKUs, stock limits, sold-out conditions, fractional and oversized quantities, deadline and budget checks, and the cheapest compliant plan in each condition (CAD 1,265 without sign-in, CAD 1,155 with it, CAD 1,185 when Northbound has no hoodies).
- **Mandates:** a valid mandate passes; missing, forged, foreign-run, other-store, expired, wrong-amount and changed-cart mandates are refused; fingerprints ignore line order and duplicates; codes normalize safely.
- **Orchestration:** mission URLs bound to the run, sign-in field mapping, pending decisions, timeline ordering, session creation and failure, forced denial of foreign origins, one answer per request, mandates accepted by the store only for the exact cart and refused when changed, forged, reused or expired, refusal to approve failing plans, automatic return of invalid plans, budget options, the stock-out scenario, one armed stock-out per run, run completion, expiry and cancellation.
- **Redis and admission:** raw Upstash hash responses, first-seen times, single-use claims, and the real admission Lua script run through an embedded Lua interpreter: one concurrent live run, automatic release of an abandoned slot, two runs per visitor and four per day, and the monthly reservation limit.

```powershell
npm run typecheck
npm test
npm run build
```

## Real agent sessions

All sessions used the OpenAI Agents API with computer use, `gpt-6-luna`, a small OpenAI-hosted container and a network restricted to the three store hosts. The buyer's decisions were scripted in advance for each scenario and applied through the same code paths the public demo uses.

| Recording | Length | What happened |
| --- | --- | --- |
| A normal day | 2 min 35 s, 40 steps | The agent opened all three stores, signed in at Harbour and proposed CAD 1,185 from Harbour alone, describing it as the only complete option within budget. ProxyCart's check showed the cheapest compliant plan at CAD 1,155. The plan was approved as proposed and Harbour accepted the mandate (test order HP-654710). |
| Sold out at checkout | 4 min 3 s, 56 steps | The agent proposed CAD 1,185 from Harbour, which was approved. Harbour's hoodies sold out at checkout and the order was refused. The agent returned to the other stores, moved the hoodies to Northbound, requested approval again for CAD 1,155 and paid each store with its own mandate (NB-827641 and HP-344651). |
| The budget gets cut | 3 min 4 s, 33 steps | The agent proposed the cheapest compliant plan, CAD 1,155. The buyer lowered the budget to CAD 1,100. The agent bought nothing, did not ask for approval again, and explained that the cheapest plan meeting the deadline was CAD 55 over. |

A connectivity probe before development confirmed Agents API access, an origin request and a correct page reading with `gpt-6-luna` in 30 seconds.

Across these sessions the cloud browser raised an origin request for every store and a browser-authentication request at Harbour's sign-in form. The submitted demo account was accepted by the store and never appeared in the session items. Computer-use items returned action titles but no screenshots, although screenshots were requested, so the interface relies on those titles, the decisions and the stores' own log.

One development session exposed a defect in this application, not in the agent: the Redis client returned hashes as flat arrays, so the stores never saw that the buyer had signed in and kept showing list prices. The agent correctly reported that no plan fit the budget under those prices. That session was stopped, the parser was fixed and covered by tests, and it is not used as a recording.

## Hosted checks

Run against production after deployment:

| Check | Result |
| --- | --- |
| Configuration issues a signed visitor cookie and reports live runs | 200 |
| Invalid start request | 400 |
| Valid start request without BotID proof | 403 |
| Start request from another origin | 403 |
| Repeated start requests from one IP | 429 after four extra requests |
| Demo API on a store host | 404 |
| Store catalogue | 200, no external hosts referenced |
| Checkout without a run, or with an unknown run | 402 with a refusal message |

## Costs

Live runs reserve USD 0.40 each against a USD 6 monthly application allowance. These are conservative counters, not measured bills. On the day of the recordings, OpenAI usage for the organization showed 109 Responses requests and about 3.1 million input tokens across all sessions, including development runs. At the published gpt-6-luna input price that is roughly USD 0.30 before container time; the billed amount had not been reported when this was written.

## Remaining limits

- Agents are not deterministic. The recordings show particular runs; a live run can take a different path, make a different choice or fail.
- The checks catch arithmetic, catalogue and rule errors. They do not make a valid but more expensive plan wrong, and they do not judge which store a buyer should prefer.
- The stores, prices and accounts are fictional. Payments are test orders and no money moves.
- Desktop checks in Chrome found no horizontal overflow, no text below 16 px and no controls below 44 px in the demo. Mobile layouts could not be verified visually: the available browser did not apply a narrow viewport. The CSS has breakpoints at 1,100 px and 700 px, and real-device testing is still pending.
