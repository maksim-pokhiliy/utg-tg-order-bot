# bot-polish — state (the board)

**Updated:** 2026-08-03 (B1 micro-fix round planner-verified after a host freeze — PR #1 waits at the owner's merge gate)

A scannable board, not prose. Narrative → `journal.md`; why → `decisions.md`;
carry-forwards → `deferred.md`. **Resume here** (the SessionStart hook force-loads it).

## Board

| #   | Step                                                             | Status                                        | Pointer                          |
| --- | ---------------------------------------------------------------- | --------------------------------------------- | -------------------------------- |
| B1  | Relay rewrite (currency read, injection fix, validation, floor) | 🔵 active — executor round open via `/step`   | `step-b1-relay-rewrite-prompt.md` |
| B2  | Shop-side secret sender + env enablement                        | ⬜ pending (after B1)                         | `deferred.md` BDEF-1             |

## Next action

B1 is MERGE-READY from the planner's side: the micro-fix round (RF-19 blocker + the
routed batch) is verified in code, the RF-19 guard adversarially spot-checked, the
battery green locally under the WSL fence and in CI on HEAD `0b64b48`, the PR body
truth-fixed. Waiting on the OWNER's morning gate: decide the parked preview-bypass
question (non-blocking) → squash-merge PR #1 → verify the prod deploy → BD-8
TEST-labeled smoke in the real operators' chat → docs promotion here AND in the shop
ledger → tee up B2. Merge-gate notes: the merge moves the runtime to Node 24 and off
legacy config (PR body, "Rollout and risk"); rollback is revert-merge,
`dpl_5z6byFckuZ7gRF1ENFRWYMJctCxk` is the candidate.

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
