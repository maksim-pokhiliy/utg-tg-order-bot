# bot-polish — state (the board)

**Updated:** 2026-08-03 (B1 CLOSED — merged, prod-verified, BD-8 smoke green in the new operators' chat; B2 next)

A scannable board, not prose. Narrative → `journal.md`; why → `decisions.md`;
carry-forwards → `deferred.md`. **Resume here** (the SessionStart hook force-loads it).

## Board

| #   | Step                                                             | Status                                        | Pointer                          |
| --- | ---------------------------------------------------------------- | --------------------------------------------- | -------------------------------- |
| B1  | Relay rewrite (currency read, injection fix, validation, floor) | ✅ shipped — merged `2a1dea3`, prod-smoked    | journal 2026-08-03               |
| B2  | Shop-side secret sender + env enablement                        | ⬜ next                                       | `deferred.md` BDEF-1             |

## Next action

B1 is CLOSED (merged `2a1dea3`, prod-verified on both routes, BD-8 smoke green in
the NEW operators' chat — the dead-chat incident and its resolution are in the
journal). Next: B2 via `/step` — the shop-side `x-relay-secret` sender
(`/feature small` in `../utg-2.0`) plus the BD-4 enablement order (merge sender →
shop env → bot env), closing BDEF-1 here and DEF-13 in the shop ledger. Owner
side-items, non-blocking: rotate the bot token (it crossed a terminal in clear
text during the incident — BotFather revoke + env update + redeploy), delete the
stale local `feat/relay-rewrite` branch. The preview-bypass question is retired
for B1 (journal) — reopen only if a future bot step wants pre-merge functional
checks.

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
- The operators' chat is a NEW private group (2026-08-03 — the old chat died); its
  chat id lives ONLY in the Vercel env, recorded nowhere, like `PLACE_ORDER_URL`.
  It is a basic group: a supergroup upgrade changes the id and reproduces
  `telegram_send_rejected 400`.
