# bot-polish — state (the board)

**Updated:** 2026-08-02 (initiative opened; B1 prompt committed, executor round opening)

A scannable board, not prose. Narrative → `journal.md`; why → `decisions.md`;
carry-forwards → `deferred.md`. **Resume here** (the SessionStart hook force-loads it).

## Board

| #   | Step                                                             | Status                                        | Pointer                          |
| --- | ---------------------------------------------------------------- | --------------------------------------------- | -------------------------------- |
| B1  | Relay rewrite (currency read, injection fix, validation, floor) | 🔵 active — executor round open via `/step`   | `step-b1-relay-rewrite-prompt.md` |
| B2  | Shop-side secret sender + env enablement                        | ⬜ pending (after B1)                         | `deferred.md` BDEF-1             |

## Next action

Continue the `/step` loop for B1: triage the executor's plan-gate report (phase 3), then
independent review on the PR (phase 4, `/review-flow` deep), fix rounds to the original
executor, planner verification, owner merge, prod deploy verify + TEST-labeled smoke in
the real operators' chat (BD-8), docs promotion here AND in the shop ledger.

## Open decisions awaiting ratification

(none — BD-1…BD-8 all ratified)

## Live carry-forwards

BDEF-1 (unauthenticated relay until B2 enablement — SCHEDULED to B2).

## Gotchas a resuming session must know

- **The relay is LIVE prod** — Vercel project `telegram-bot-server` auto-deploys
  `master`; real volunteer orders flow through it. A broken merge silently kills
  checkout on ua-tactical-gear.com.
- The payload contract is shop-owned and sacred; the sender truth is
  `../utg-2.0/src/components/checkout/CheckoutForm.tsx`. Never require unsent keys.
- The live `PLACE_ORDER_URL` value is recorded nowhere — that's WHY both
  `/place_order` and `/api/place_order` must serve (BD-5).
- No local `.env` exists; tests mock `fetch`; nobody but the planner/owner ever POSTs
  to the deployed relay (BD-8 smoke) and executors never do.
- Executor PRs never stage `CLAUDE.md` or `initiatives/` (planner-owned).
