# bot-polish — state (the board)

**Updated:** 2026-08-08 (B4 CLOSED; the shop's U5a shipped and now sends v2 with an
idempotency key — B5 is the last bot step and it inherits BDEF-9)

A scannable board, not prose. Narrative → `journal.md`; why → `decisions.md`;
carry-forwards → `deferred.md`. **Resume here** (the SessionStart hook force-loads it).

## Board

| #   | Step                                                             | Status                                        | Pointer                          |
| --- | ---------------------------------------------------------------- | --------------------------------------------- | -------------------------------- |
| B1  | Relay rewrite (currency read, injection fix, validation, floor) | ✅ shipped — merged `2a1dea3`, prod-smoked    | journal 2026-08-03               |
| B2  | Shop-side secret sender + env enablement                        | ✅ shipped — shop PR #20 `bb3f866`, enforcement live and verified | shop journal 2026-08-06 |
| B3  | Relay dual-accepts v1 + v2 payloads                             | ✅ shipped — PR #2 `66134ee`, both paths prod-smoked | journal 2026-08-06 |
| B4  | Message-width truth: UTF-16 budget + misleading characters      | ✅ shipped — PR #3 `7594e94`, premise falsified mid-flight, merged on the narrower claim | journal 2026-08-08 · BDEF-4 / BDEF-5 |
| B5  | Orders persisted to Postgres before the Telegram send           | ⬜ pending                                    | shop D-11 · `deferred.md` BDEF-3      |

## Next action

**B4 CLOSED** (PR #3 `7594e94`, squash-merged, prod deployed). The step shipped, but its
justification did not: a live probe falsified the width premise mid-flight. Full narrative
in `journal.md` 2026-08-08 and in BDEF-4 — the short version is that Telegram applies 4096
to the text AFTER entities parsing, ~980 units of our message are markup that parsing
consumes, an order at 4178 raw UTF-16 was DELIVERED, and therefore **no order was being
lost**. The fix still merges, on a narrower claim: raw UTF-16 upper-bounds all four
candidate metrics, so it is the only accounting safe under every reading, at a cost of 0–1
cart lines. The BDEF-5 half — bidi, zero-width, math-bold, fullwidth — is untouched by any
of this and fully earned: bold in an order message now means the relay wrote it.

**B5 is the last step here — orders become durable** (shop D-11, closes BDEF-3). Every
decoded order written to Postgres (Neon) BEFORE the Telegram send, keyed by
a content hash within a time window. **BDEF-9 is a hard constraint, not a preference:
the shop MINTS the key on first submit and resets it only on success, so the key
deliberately spans an order the buyer edited between retries — dedupe on the key alone
would answer 200 to a corrected order that was never delivered, and the shop would show
the success screen and clear the cart. The key is a hint, never an identity.** The
design rule is absolute and predates this board: **the store must never gate the send — a
dead database costs an audit row, never an order.** Two things sharpen it now: today's work
proved the RENDERED MESSAGE is lossy (truncation drops cart lines with only a "+N more
positions" marker), so the durable record must be the decoded PAYLOAD, not the message;
and the relay is zero-dependency by construction (B1), so reaching Neon over its
SQL-over-HTTP endpoint with plain `fetch` should be weighed against taking a driver.

**Ordering note.** B4 was put ahead of B5 on the premise the probe destroyed, so
persistence lost a round it should have had. Whether B5 now precedes the shop's U5a is a
priority call, not a gate — U5a does not make orders any less durable than they are today.
It is recorded as shop-side D-12.

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
