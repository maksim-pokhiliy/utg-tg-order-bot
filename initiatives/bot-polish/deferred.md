# bot-polish — deferred

Carry-forwards: findings/obligations not yet scheduled, with disposition + status.
**Promote here at every gate** — a WARNING that lives only in scratch is not durable and
gets lost.

**Status:** `OPEN` (live) · `SCHEDULED` (assigned to a step) · `CLOSED` (done — kept for
the trail) · `DROPPED` (decided not to).

| ID     | One-liner                                                                                                          | Disposition                                                                                  | Status    |
| ------ | ------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------- | --------- |
| BDEF-1 | The relay accepts unauthenticated POSTs until the shop sends `x-relay-secret` and both Vercel envs are set (BD-4) | **CLOSED 2026-08-06** — B2 shipped as ua-checkout step U0 (shop PR #20 `bb3f866`), the secret is set on both Vercel projects (Production, Sensitive) and the relay redeployed to bind it. Verified live: 401 with no header and with a wrong header, 400 with the correct one, and an authenticated probe through the prod shop route came back 400 (validation) rather than 401 — the chain holds. `DEF-13` closed in the shop ledger the same day | CLOSED |
| BDEF-2 | Module-hygiene batch from the B1 re-review (RF-27…RF-36, RF-40), NUMBERED so later steps can cite items: **(1)** dead/write-only surface (`countCodePoints` export, `SendFailure.reason`, `createTimeoutSignal`); **(2)** untyped `readEnv` name — a typo silently disables auth; **(3)** the deployed `tsconfig` including test paths; **(4)** the TDZ hazard in the file's lone `function` declaration; **(5)** `.smoke-build` left behind on a failed compile; **(6)** both request stubs overriding `json()`, so the real parse path is untested; **(7)** same as (6) for the remaining stubs. B3 took (4) and part of (6), and retired (1) as stale — `countCodePoints` gained four test consumers, so the premise expired | None is a defect today — reviewer-verified, all cosmetic or unreachable. Batch them into the next bot window rather than growing an already-large PR | OPEN |
| BDEF-3 | No idempotency: an ambiguous upstream outcome (HTTP 200 with an unreadable verdict, or a timeout after Telegram accepted) is reported as failure, so a buyer retry can duplicate a delivered order | B1 makes the state DIAGNOSABLE (a distinct log event, RF-22) but not preventable; real dedup needs an idempotency key in the payload — a shop+bot contract change. NOT folded into B3 (2026-08-06): the key is additive to the v2 envelope with no version bump, and B3 gates the whole shop initiative, so it stays small. **Correction the same day:** the planner had justified this with "the relay has no database, that's a project constraint" — false, and retired. No document in THIS repo says it; the shop's `no database` line describes its static catalog, and `any database` is a non-goal of the shop's ua-checkout initiative, not a law over the relay. The owner has managed Postgres (Neon, paid) available. Real dedup is therefore buildable — see the separate persistence question, where the stronger motive is not dedup but that **a delivered order is durable nowhere today**: if Telegram delivery fails or a chat dies (it already did once — B1 journal), the order is gone with no replay path | OPEN |

| BDEF-4 | The 4096-character Telegram budget is computed in CODE POINTS while Telegram counts UTF-16 units, so an emoji-heavy order passes our truncation, gets a 400 from Telegram, surfaces as a 500 -- and the order is lost | PRE-EXISTING on master (the B3 review surfaced it, did not introduce it). A real order-loss path, but the fix changes v1 truncation and would break the byte-identity contract B3 exists to prove -- so it gets its own step AFTER B4. Note the useful interaction: once B4 persists orders before the send, an order rejected by Telegram is recoverable rather than gone, which is why this ranks after persistence rather than before it | SCHEDULED |
| BDEF-5 | Characters that mislead the operator survive into the message. Two families: bidi/zero-width controls, and (added by the B3 review, RF-4) Unicode math-bold, which passes HTML escaping untouched, so a line typed into the free-text comment renders visually bold and can imitate the genuine `Address Source` line rendered above it -- the "genuine bold line" is therefore NOT a forgery guard, and the docs no longer claim it is. Bidi example: a warehouse label carrying an embedded RLO renders with its digits reversed, so branch "No. 43" reads as "No. 34" and a parcel can be shipped to a branch nobody chose | PRE-EXISTING on master (same review). Same reason to defer as BDEF-4 -- stripping them changes v1 output. Ride the same step: one pass over `singleLineField` closing both the width accounting and the control-character set, with the golden corpus re-cut deliberately in that step rather than defended | SCHEDULED |

| BDEF-6 | Structural tails the v2 work left behind, all cheap and none load-bearing today (B3 review RF-8): the v1 path routes through modules named `payloadV2`/`messageV2`; `RejectReason` lives in `payload.ts` while carrying v2 members; ~16 lines of tail validation (locale -> total -> currency -> cart) are a verbatim copy between `payload.ts` and `payloadV2.ts` | The natural window is the follow-up that DROPS v1: that step deletes the v1 decoder anyway, so the naming, the union's home and the duplication all resolve as a side effect instead of as churn now. Until then the copy is documented as a copy (the PR body was corrected -- it had claimed shared code) | SCHEDULED |

## Detail on the live ones

**BDEF-1 (closed).** The BD-4 order held exactly as written. One correction learned in
execution and worth keeping: a Vercel env var binds only to the NEXT deployment, so
setting it is not enabling it — each project needs a redeploy. And redeploy the
deployment that is ACTUALLY serving production, resolved by id from its logs
(`branch=master`), never the first URL in `vercel ls --prod`: the planner redeployed by
list position, landed on a pre-B1 legacy build, and every `POST /place_order` answered
500 for ~3 minutes until `vercel promote` restored it. Runtime logs over the following
six hours showed only the planner's own ten probes and zero 200s, so no real order was
lost — but the shop was one customer away from a silent outage.

**BDEF-3.** The harm is bounded — a duplicate order the operators can reconcile by
phone, versus the alternative (reporting success on an unconfirmed send) which loses
orders silently. Fail-closed is the right default; only the diagnosis was missing.
If persistence lands, dedup comes nearly free (a unique key over the idempotency token,
or a content hash within a time window) — but the design rule is absolute: the store
must never gate the Telegram send. A database that is down must cost an audit row, never
an order.

## Closed history

(none yet)
