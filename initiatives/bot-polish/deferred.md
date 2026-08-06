# bot-polish — deferred

Carry-forwards: findings/obligations not yet scheduled, with disposition + status.
**Promote here at every gate** — a WARNING that lives only in scratch is not durable and
gets lost.

**Status:** `OPEN` (live) · `SCHEDULED` (assigned to a step) · `CLOSED` (done — kept for
the trail) · `DROPPED` (decided not to).

| ID     | One-liner                                                                                                          | Disposition                                                                                  | Status    |
| ------ | ------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------- | --------- |
| BDEF-1 | The relay accepts unauthenticated POSTs until the shop sends `x-relay-secret` and both Vercel envs are set (BD-4) | **CLOSED 2026-08-06** — B2 shipped as ua-checkout step U0 (shop PR #20 `bb3f866`), the secret is set on both Vercel projects (Production, Sensitive) and the relay redeployed to bind it. Verified live: 401 with no header and with a wrong header, 400 with the correct one, and an authenticated probe through the prod shop route came back 400 (validation) rather than 401 — the chain holds. `DEF-13` closed in the shop ledger the same day | CLOSED |
| BDEF-2 | Module-hygiene batch from the B1 re-review (RF-27…RF-36, RF-40): dead/write-only surface (`countCodePoints` export, `SendFailure.reason`, `createTimeoutSignal`), the TDZ hazard in the file's lone `function` declaration, untyped `readEnv` name (a typo silently disables auth), the deployed `tsconfig` including test paths, both request stubs overriding `json()` so the real parse path is untested, and the smoke leaving `.smoke-build` behind on a failed compile | None is a defect today — reviewer-verified, all cosmetic or unreachable. Batch them into the next bot window rather than growing an already-large PR | OPEN |
| BDEF-3 | No idempotency: an ambiguous upstream outcome (HTTP 200 with an unreadable verdict, or a timeout after Telegram accepted) is reported as failure, so a buyer retry can duplicate a delivered order | B1 makes the state DIAGNOSABLE (a distinct log event, RF-22) but not preventable; real dedup needs an idempotency key in the payload — a shop+bot contract change, hence its own step, not a B1 rider | OPEN |

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

## Closed history

(none yet)
