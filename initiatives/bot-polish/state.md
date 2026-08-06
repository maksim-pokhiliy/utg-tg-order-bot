# bot-polish — state (the board)

**Updated:** 2026-08-06 (B2 CLOSED — the relay now authenticates; B3 next: dual-accept v2)

A scannable board, not prose. Narrative → `journal.md`; why → `decisions.md`;
carry-forwards → `deferred.md`. **Resume here** (the SessionStart hook force-loads it).

## Board

| #   | Step                                                             | Status                                        | Pointer                          |
| --- | ---------------------------------------------------------------- | --------------------------------------------- | -------------------------------- |
| B1  | Relay rewrite (currency read, injection fix, validation, floor) | ✅ shipped — merged `2a1dea3`, prod-smoked    | journal 2026-08-03               |
| B2  | Shop-side secret sender + env enablement                        | ✅ shipped — shop PR #20 `bb3f866`, enforcement live and verified | shop journal 2026-08-06 |
| B3  | Relay dual-accepts v1 + v2 payloads (gates the shop's U5a)      | 🔄 executor round open                        | `step-b3-dual-accept-prompt.md` · shop §5 |
| B4  | Orders persisted to Postgres before the Telegram send           | ⬜ pending                                    | shop D-11 · `deferred.md` BDEF-3      |

## Next action

**B3 executor round is OPEN.** After it: **B4 — orders become durable** (owner
ratified 2026-08-06 as shop-side D-11). Today a delivered order is durable NOWHERE:
its only trace is a Telegram message, and one operators' chat has already died taking
its history with it; a failed send evaporates the order with no replay path. B4 writes
each decoded order to Postgres (Neon, the owner's paid plan) BEFORE the send, keyed by
the new optional `idempotency_key` the shop mints — which also closes BDEF-3 nearly for
free. **Absolute design rule: the store must never gate the Telegram send.** A database
that is down costs an audit row, never an order.

The B3 step itself — the relay learns to accept the v2 order envelope
alongside v1 and render each delivery mode. The shape is shop-side canon:
`../utg-2.0/initiatives/ua-checkout/requirements.md` §5 (ratified as D-3 there), and
the rollout order is D-9: bot dual-accepts first, THEN the shop flips its payload
(its step U5a), then a later follow-up drops v1 here. **Until B3 ships, the shop
cannot change a single checkout field** — so this step is the critical path for the
whole ua-checkout initiative, not a side quest.

B2 is CLOSED (2026-08-06): the shop sends `x-relay-secret` (PR #20 `bb3f866`),
`ORDER_RELAY_SECRET` is set on both Vercel projects as Sensitive/Production, and the
relay was redeployed to bind it. Verified live without sending anything to the
operators' chat: 401 with no header and with a wrong header, 400 with the correct one,
and an authenticated probe routed through the prod shop came back 400 rather than 401.
BDEF-1 closed here, DEF-13 closed in the shop ledger.

**Operational lesson from the B2 rollout, worth more than the step itself:** a Vercel
env var binds only to the NEXT deployment, and `vercel redeploy` must target the
deployment ACTUALLY serving production, resolved by id from its logs (`branch=master`).
Redeploying the first URL in `vercel ls --prod` landed on a pre-B1 legacy build and
500'd every order for ~3 minutes until `vercel promote` restored it (no real order was
lost — six hours of runtime logs show only the planner's own probes and zero 200s).

Owner side-items, non-blocking: rotate the bot token (it crossed a terminal in clear
text during the B1 incident — BotFather revoke + env update + redeploy), delete the
stale local `feat/relay-rewrite` branch.

## Open decisions awaiting ratification

(none — BD-1…BD-8 all ratified)

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
