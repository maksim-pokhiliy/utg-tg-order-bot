# bot-polish — state (the board)

**Updated:** 2026-08-20 (U6 merged — the relay knows only v2. This board is COMPLETE and the
initiative can close; what is left here is planner ops, not steps)

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

**This board is COMPLETE.** B1–B5 shipped and prod-verified, and **U6 merged 2026-08-20**
(PR #5 `a81fa1e`) — the paired step the initiative was deliberately held open to host.

The relay now accepts exactly ONE payload shape. The v1 decoder, renderer and golden corpus are
deleted, so a versionless or `version: 1` body is an ordinary 400 through the normal validation
path. BDEF-6, BDEF-7 and the BDEF-2 batch closed with it, as predicted — they were waiting for
precisely this step. `schema_version` stays in the schema and always reads `2`: deliberate, it is
the only way a future version change becomes observable in production data.

**Verified by real requests before it merged**, not only by the 399-test battery: the compiled
deploy entrypoint was hosted locally with real credentials and the real database, and curled —
401 without a secret, 401 with a wrong one, **400 on `version: 1` and on a genuine versionless
legacy body**, 200 on v2 with `order_stored`, a Neon row at `schema_version = 2` and a delivered
Telegram message. Preview deployments could not serve this: they are behind Deployment
Protection, which 302s to SSO before the route is reached.

**One thing the deletion taught, worth carrying to any future removal:** three guards had their
only end-to-end pin riding on something v1 carried (cart-line HTML escaping, the 600-char comment
clamp, `payloadField`'s normalise-then-escape ordering), and a fourth — "auth precedes the body" —
was never pinned at all, despite being the invariant that authorised the deletion. All four are
pinned now. When a deletion removes a version it also removes whichever guards were observable
only through it, and those are invisible by construction.

### What remains here is planner ops, not steps

- **BDEF-11** — swap the relay's Neon role for a scoped one (INSERT/SELECT/UPDATE on `orders`
  only; today it authenticates as the schema owner and could `drop table orders`). Needs a Vercel
  env update plus a redeploy of the **serving** deployment resolved by id from its logs, never the
  first URL in `vercel ls --prod` (the BDEF-1 lesson, which once cost three minutes of 500s). It
  also retires the exposed credential from the relay, which partly answers the owner's unscheduled
  password rotation.
- **BDEF-10** — B5 created a PII datastore with no retention policy.
- **BDEF-8** — which Telegram width metric is actually enforced; a direct Bot API probe, worth
  ~980 units of cart room.
- **BDEF-12** — CLOSED: promoted to the shop's ledger as UAC-25 and narrowed there to its policy
  half by U6.
- **UAC-26** in the shop ledger carries this repo's U6 review tail (six items, none a defect
  today). The currency case-sensitivity hole is the one worth doing first — it was ported from
  master knowingly.

The shop's initiative has one step left, **U7**, which is the owner's browser gate plus
`/initiative-close`. Nothing in this repo blocks it.

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
