# bot-polish — deferred

Carry-forwards: findings/obligations not yet scheduled, with disposition + status.
**Promote here at every gate** — a WARNING that lives only in scratch is not durable and
gets lost.

**Status:** `OPEN` (live) · `SCHEDULED` (assigned to a step) · `CLOSED` (done — kept for
the trail) · `DROPPED` (decided not to).

| ID     | One-liner                                                                                                          | Disposition                                                                                  | Status    |
| ------ | ------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------- | --------- |
| BDEF-1 | The relay accepts unauthenticated POSTs until the shop sends `x-relay-secret` and both Vercel envs are set (BD-4) | Step B2: shop-side sender (`/feature small` in `../utg-2.0`) + env enablement on both projects | SCHEDULED |
| BDEF-2 | Module-hygiene batch from the B1 re-review (RF-27…RF-36, RF-40): dead/write-only surface (`countCodePoints` export, `SendFailure.reason`, `createTimeoutSignal`), the TDZ hazard in the file's lone `function` declaration, untyped `readEnv` name (a typo silently disables auth), the deployed `tsconfig` including test paths, both request stubs overriding `json()` so the real parse path is untested, and the smoke leaving `.smoke-build` behind on a failed compile | None is a defect today — reviewer-verified, all cosmetic or unreachable. Batch them into the next bot window rather than growing an already-large PR | OPEN |
| BDEF-3 | No idempotency: an ambiguous upstream outcome (HTTP 200 with an unreadable verdict, or a timeout after Telegram accepted) is reported as failure, so a buyer retry can duplicate a delivered order | B1 makes the state DIAGNOSABLE (a distinct log event, RF-22) but not preventable; real dedup needs an idempotency key in the payload — a shop+bot contract change, hence its own step, not a B1 rider | OPEN |

## Detail on the live ones

**BDEF-1.** B1 ships enforcement-if-configured, which is inert until rollout. Enablement
order (BD-4): merge the shop sender (no-op while its env is absent) → set the env in the
shop's Vercel project (app starts sending the header; the bot ignores extra headers) →
set the env in the bot's project (enforcement live). Closing B2 also closes the shop
ledger's `DEF-13` (the `currency` read will already be live from B1 — verified by the B1
smoke) — promote the closure in `../utg-2.0/initiatives/production-polish/deferred.md`.

**BDEF-3.** The harm is bounded — a duplicate order the operators can reconcile by
phone, versus the alternative (reporting success on an unconfirmed send) which loses
orders silently. Fail-closed is the right default; only the diagnosis was missing.

## Closed history

(none yet)
