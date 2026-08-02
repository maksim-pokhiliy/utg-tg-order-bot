# bot-polish — state (the board)

**Updated:** 2026-08-02 (B1 re-review: MERGE-READY bar RF-19; micro-fix round dispatched, then the owner's merge gate)

A scannable board, not prose. Narrative → `journal.md`; why → `decisions.md`;
carry-forwards → `deferred.md`. **Resume here** (the SessionStart hook force-loads it).

## Board

| #   | Step                                                             | Status                                        | Pointer                          |
| --- | ---------------------------------------------------------------- | --------------------------------------------- | -------------------------------- |
| B1  | Relay rewrite (currency read, injection fix, validation, floor) | 🔵 active — executor round open via `/step`   | `step-b1-relay-rewrite-prompt.md` |
| B2  | Shop-side secret sender + env enablement                        | ⬜ pending (after B1)                         | `deferred.md` BDEF-1             |

## Next action

The B1 micro-fix round is with the original executor (RF-19 blocker + nine routed
items; the rest deferred as BDEF-2/BDEF-3 — routing in the journal). Planner
verification of the previous round already ran and passed (battery, invariants, PR
file list clean). Then: the OWNER's merge gate, prod deploy verify + TEST-labeled
smoke in the real operators' chat (BD-8), docs promotion here AND in the shop ledger,
then B2.

PARKED FOR THE OWNER (non-blocking, decide at merge time): the Vercel "Protection
Bypass for Automation" toggle on project `telegram-bot-server` — it would allow a
functional preview check (error-path POSTs only, nothing reaches the chat) before
merging; the alternative is merging on build-green + CI load-smoke + immediate smoke
with a revert ready (`dpl_5z6byFckuZ7gRF1ENFRWYMJctCxk` is the rollback candidate).

## Open decisions awaiting ratification

(none — BD-1…BD-8 all ratified)

## Live carry-forwards

BDEF-1 (unauthenticated relay until B2 enablement — SCHEDULED to B2); BDEF-2 (module
hygiene batch from the re-review — next bot window); BDEF-3 (no idempotency: an
ambiguous upstream outcome can duplicate an order on a buyer retry — needs a contract
change, its own step).

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
