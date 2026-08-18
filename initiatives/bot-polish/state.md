# bot-polish — state (the board)

**Updated:** 2026-08-18 (B5 CLOSED — merged `1d31e20`, prod-smoked through the live shop
chain, dedupe proven on real rows; the bot board B1–B5 is complete)

A scannable board, not prose. Narrative → `journal.md`; why → `decisions.md`;
carry-forwards → `deferred.md`. **Resume here** (the SessionStart hook force-loads it).

## Board

| #   | Step                                                             | Status                                        | Pointer                          |
| --- | ---------------------------------------------------------------- | --------------------------------------------- | -------------------------------- |
| B1  | Relay rewrite (currency read, injection fix, validation, floor) | ✅ shipped — merged `2a1dea3`, prod-smoked    | journal 2026-08-03               |
| B2  | Shop-side secret sender + env enablement                        | ✅ shipped — shop PR #20 `bb3f866`, enforcement live and verified | shop journal 2026-08-06 |
| B3  | Relay dual-accepts v1 + v2 payloads                             | ✅ shipped — PR #2 `66134ee`, both paths prod-smoked | journal 2026-08-06 |
| B4  | Message-width truth: UTF-16 budget + misleading characters      | ✅ shipped — PR #3 `7594e94`, premise falsified mid-flight, merged on the narrower claim | journal 2026-08-08 · BDEF-4 / BDEF-5 |
| B5  | Orders persisted to Postgres before the Telegram send           | ✅ shipped — PR #4 `1d31e20`, migration applied pre-merge, three-part smoke through the prod shop route, dedupe + BDEF-9 proven on real rows | journal 2026-08-18 · BD-10/BD-11 · `b5-neon-probe.md` |

## Next action

**The bot board is COMPLETE** — B1–B5 all shipped, prod-verified and smoked. B5 closed
2026-08-18: every decoded order is written to Neon before the Telegram send, confirmed
retry-duplicates are suppressed by content identity, and a dead database provably costs
an audit row, never an order (458 tests, 34 mutation gates, deep review 67 pre-cap → 19,
the BDEF-9 scenario proven live on production rows — journal 2026-08-18).

**What remains is not a bot step:**

- **U6** (the paired contract close: bot drops v1, both repos pin v2 in one step) —
  shop+bot window, carries BDEF-6/7 and the BDEF-2 hygiene batch. Owner decides when.
- **BDEF-11** — swap the relay's Neon role for a scoped one (INSERT/SELECT/UPDATE on
  `orders` only); planner ops, near-term, needs a Vercel env update + redeploy of the
  serving deployment (the BDEF-1 lesson applies).
- **BDEF-8** (the enforced Telegram width metric, ~980 units of cart room) — a direct
  Bot API probe, planner-owned, any time.
- Owner calls parked: whether to rotate the `DATABASE_URL` password (it crossed the
  owner's terminal and the planner's scratchpad during B5, same class as the B1 bot-token
  note); whether bot-polish now runs `/initiative-close` or stays open to host U6.

## Open decisions awaiting ratification

(none — BD-1…BD-11 all ratified)

## Live carry-forwards

BDEF-1 — **CLOSED** by B2 (2026-08-06). BDEF-2 (module hygiene batch from the
re-review — next bot window, a natural rider for B3). BDEF-3 (no idempotency: an
ambiguous upstream outcome can duplicate an order on a buyer retry — needs a contract
change; **B3 is the contract-change window**, so decide there whether an idempotency
key joins the v2 envelope or stays deferred — the shop would have to send it, which
means ruling before its U5a flips).

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
