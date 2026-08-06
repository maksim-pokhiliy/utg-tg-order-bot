# bot-polish — state (the board)

**Updated:** 2026-08-06 (B2 CLOSED — the relay now authenticates; B3 next: dual-accept v2)

A scannable board, not prose. Narrative → `journal.md`; why → `decisions.md`;
carry-forwards → `deferred.md`. **Resume here** (the SessionStart hook force-loads it).

## Board

| #   | Step                                                             | Status                                        | Pointer                          |
| --- | ---------------------------------------------------------------- | --------------------------------------------- | -------------------------------- |
| B1  | Relay rewrite (currency read, injection fix, validation, floor) | ✅ shipped — merged `2a1dea3`, prod-smoked    | journal 2026-08-03               |
| B2  | Shop-side secret sender + env enablement                        | ✅ shipped — shop PR #20 `bb3f866`, enforcement live and verified | shop journal 2026-08-06 |
| B3  | Relay dual-accepts v1 + v2 payloads                             | ✅ shipped — PR #2 `66134ee`, both paths prod-smoked | journal 2026-08-06 |
| B4  | Message-width truth: UTF-16 budget + misleading characters      | ⬜ NEXT — gates the shop's U5a merge          | `deferred.md` BDEF-4 / BDEF-5         |
| B5  | Orders persisted to Postgres before the Telegram send           | ⬜ pending                                    | shop D-11 · `deferred.md` BDEF-3      |

## Next action

**B4 — message-width truth, and it now GATES the shop's U5a merge.** The B3 review
quantified the pre-existing BDEF-4 defect against the NEW code: a v2 free-form order
reaches **7150 UTF-16 units at 3830 code points — +74% over Telegram's real 4096 limit**,
a materially wider radius than v1 ever had. Our truncation counts code points; Telegram
counts UTF-16. So an emoji-heavy comment passes our budget, Telegram answers 400, the
relay surfaces 500, and the order is LOST. v2 stays dormant until the shop's U5a ships
it — which is exactly why this lands first. B4 also closes BDEF-5 (bidi, zero-width and
math-bold characters that mislead an operator: a warehouse label can render its digits
reversed, and a comment line can imitate the genuine Address Source line above it).
Both fixes change v1 truncation, so B4 re-cuts the golden corpus DELIBERATELY — that is
the step's job, not a regression to defend against.

Then **B5** — persistence (shop D-11): every decoded order written to Postgres before
the send, keyed by `idempotency_key`, closing BDEF-3. Reordered behind B4 deliberately:
persistence makes a lost order recoverable, but not losing it is better.

B3 is CLOSED (2026-08-06, PR #2 `66134ee`). `version` 2 selects v2, absent or 1 selects
v1, anything else is an honest `version_unsupported`; unknown KEYS are ignored at every
level, so future additive contract fields can never be breaking. Prod-smoked after the
merge: auth still 401s header-less callers, both decoders answer, and **both a v1 and a
v2 order were delivered live to the operators' chat** (TEST-labeled, 200/200) — v1 is
what the live shop sends today, so proving it still delivers was the whole point.

Owner side-items, non-blocking: rotate the bot token (it crossed a terminal in clear
text during the B1 incident), delete stale local branches.

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
