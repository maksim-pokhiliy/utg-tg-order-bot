# bot-polish — deferred

Carry-forwards: findings/obligations not yet scheduled, with disposition + status.
**Promote here at every gate** — a WARNING that lives only in scratch is not durable and
gets lost.

**Status:** `OPEN` (live) · `SCHEDULED` (assigned to a step) · `CLOSED` (done — kept for
the trail) · `DROPPED` (decided not to).

| ID     | One-liner                                                                                                          | Disposition                                                                                  | Status    |
| ------ | ------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------- | --------- |
| BDEF-1 | The relay accepts unauthenticated POSTs until the shop sends `x-relay-secret` and both Vercel envs are set (BD-4) | Step B2: shop-side sender (`/feature small` in `../utg-2.0`) + env enablement on both projects | SCHEDULED |

## Detail on the live ones

**BDEF-1.** B1 ships enforcement-if-configured, which is inert until rollout. Enablement
order (BD-4): merge the shop sender (no-op while its env is absent) → set the env in the
shop's Vercel project (app starts sending the header; the bot ignores extra headers) →
set the env in the bot's project (enforcement live). Closing B2 also closes the shop
ledger's `DEF-13` (the `currency` read will already be live from B1 — verified by the B1
smoke) — promote the closure in `../utg-2.0/initiatives/production-polish/deferred.md`.

## Closed history

(none yet)
