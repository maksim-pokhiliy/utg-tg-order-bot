# bot-polish — state (the board)

**Updated:** 2026-08-18 (B5 in flight — contour ratified, Neon probed live, BD-10/BD-11
ratified, executor prompt committed and the executor running)

A scannable board, not prose. Narrative → `journal.md`; why → `decisions.md`;
carry-forwards → `deferred.md`. **Resume here** (the SessionStart hook force-loads it).

## Board

| #   | Step                                                             | Status                                        | Pointer                          |
| --- | ---------------------------------------------------------------- | --------------------------------------------- | -------------------------------- |
| B1  | Relay rewrite (currency read, injection fix, validation, floor) | ✅ shipped — merged `2a1dea3`, prod-smoked    | journal 2026-08-03               |
| B2  | Shop-side secret sender + env enablement                        | ✅ shipped — shop PR #20 `bb3f866`, enforcement live and verified | shop journal 2026-08-06 |
| B3  | Relay dual-accepts v1 + v2 payloads                             | ✅ shipped — PR #2 `66134ee`, both paths prod-smoked | journal 2026-08-06 |
| B4  | Message-width truth: UTF-16 budget + misleading characters      | ✅ shipped — PR #3 `7594e94`, premise falsified mid-flight, merged on the narrower claim | journal 2026-08-08 · BDEF-4 / BDEF-5 |
| B5  | Orders persisted to Postgres before the Telegram send           | 🔄 in flight — contour ratified, probes done, executor running | `step-b5-persistence-prompt.md` · `b5-neon-probe.md` · BD-10/BD-11 |

## Next action

**B5 IN FLIGHT (2026-08-18).** Contour ratified by the owner; the Neon live probe ran
FIRST (D-12 discipline) and its numbers killed the scary unknowns: cold start 863–921 ms
repeatable across a 9-minute and a 9-day suspend, warm p50 98 ms from iad1, errors
classifiable, the dedupe CTE validated end-to-end on the real database — full report in
`b5-neon-probe.md`. Transport ratified as BD-10 (plain `fetch`, zero-dependency stands),
dedupe semantics as BD-11 (suppress only confirmed-delivered twins; hash leads, key
corroborates, 30-minute window; ambiguous outcomes are not delivery; v1 never suppresses).
The executor prompt is committed (`step-b5-persistence-prompt.md`); the executor runs the
full `/feature` pipeline headless. Session rule granted by the owner for THIS run only:
no ceremony around temporary projects/tables in the production environment — re-ask next
time. Planner still owes: the pre-merge migration run against prod Neon, the post-merge
smoke (two delivered TEST messages + one suppressed duplicate — owner-sanctioned
extension of BD-8), deletion of the throwaway `neon-probe-fn` Vercel project, and the
close-out docs promotion (BDEF-3 + BDEF-9 move to CLOSED there).

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
