# bot-polish — state (the board)

**Updated:** 2026-08-22 (P1 merged — the third hosted pair: the vocabulary is pinned at value
level and a miscased currency no longer costs an order. This board stays COMPLETE; what
remains here is planner ops — BDEF-8/10/11 — plus the new BDEF-13/14 pair for any next
relay round)

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

**This board is COMPLETE and has now hosted three paired steps.** B1–B5 shipped; **U6** merged
2026-08-20 (v1 deleted); **U8** merged 2026-08-21 as `da2f9d6` (PR #6) — the order message now
speaks Ukrainian to the operators, which was an owner ruling from the U7 browser gate, not an
engineering preference; **P1** (driven by the shop's `polish-tail`) merged 2026-08-22 as
`aa10f56` (PR #7) — `contract.ts` pins the channel VALUES (`call | telegram | viber`) and the
display map is pinned through the rendered message, so a rename on either side now reddens that
side; and the currency read folds case at the boundary (BD-12) so a miscased informational field
no longer costs a volunteer's order. Order identity proven unmoved (frozen `PINNED_HASH`,
17 576 fixed points, a 25M-body differential). New carry-forwards: BDEF-13 (the same class is
FATAL on `delivery.mode`), BDEF-14 (absorbed shop bugs leave no artifact), BDEF-15 (hygiene).

What U8 changed here: 21 labels plus the delivery-mode names, the address-source guidance, the
contact channel (`call → Дзвінок`, `telegram → Telegram`, `viber → Viber`, anything else printed
verbatim — fail-open by compiler, `noUncheckedIndexedAccess` makes removing the fallback a build
error), and the omitted-cart marker. **The marker must never decline**: `omittedMarkerAllowance`
measures it at n=0 and assumes only digit count varies, so a declining form under-reserves, the
message passes 4096, Telegram rejects it and the order is lost. Verified by the planner —
mutating it to a declining form reddens six budget tests.

The Ukrainian labels BUY cart room rather than costing it: the header shrank 23–32 units depending
on mode, the cart line by one, and a 60-position order now fits 41 rows where it fit 40.

**Its own review, 12 pooled → 12 reported, no tail**, found three things worth remembering: the
free-form saturation test sat 318 characters past its own edge (a regression widening that header
by ~300 units kept it green); the label-coverage assertion was one-sided, so a label added to the
code and not to the list escaped; and the omitted marker — the one bold run carrying a number the
operator acts on — was never probed for forgery. All three closed with mutation proofs. Battery
399 → 413.

### What remains here is planner ops, not steps

- **BDEF-11** — swap the relay's Neon role for a scoped one (INSERT/SELECT/UPDATE on `orders`
  only; today it authenticates as the schema owner and could `drop table orders`). Needs a Vercel
  env update plus a redeploy of the **serving** deployment resolved by id from its logs, never the
  first URL in `vercel ls --prod` — the BDEF-1 lesson, which once cost three minutes of 500s.
- **BDEF-10** — B5 created a PII datastore with no retention policy.
- **BDEF-8** — which Telegram width metric is actually enforced; a direct Bot API probe, worth
  ~980 units of cart room. U8's measurements make this cheaper than it was.
- **The one worth scheduling**, carried in the shop's ledger as **UAC-27**: the contact-channel
  vocabulary is a VALUE-level cross-repo coupling that nothing executable pins. `contract.ts`
  lists keys only; `call | telegram | viber` lives in the shop's prose. Rename `call` on either
  side and the operator quietly reads the raw code with no test reddening anywhere. It is the
  exact class U6 and U8 spent themselves hunting, and it needs `contract.ts` extended to pin
  values — which both U8 halves were deliberately fenced out of.

The shop's initiative has no steps left; it closes with `/initiative-close`. Nothing here blocks
that.

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
