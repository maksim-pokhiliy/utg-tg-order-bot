# Step P1 (relay half) — the channel vocabulary gets pinned at value level, and a case variant stops costing an order (executor prompt)

Driven by the shop repo's `polish-tail` initiative (P1, the contract pair); this file is
hosted here the way the U6/U8 relay prompts were. The shop half is a PAIRED PR in
`../utg-2.0` — the two merge in the same window.

---

/feature small Two contract-tail items from the U6 review ledger, both in this repo, no
wire shape change. This relay serves REAL volunteer orders and auto-deploys `master`.

## Verified by the planner on the current tree — take as given

- `tests/support/contract.ts` pins **keys only**. The shop emits
  `call | telegram | viber` from its own `CONTACT_CHANNELS` source, pinned by its own
  test. On THIS side, `src/message.ts` holds
  `CONTACT_CHANNEL_TEXTS = Map([call → Дзвінок, telegram → Telegram, viber → Viber])`
  with a verbatim `?? value` fallback. **Renaming a map key reddens NOTHING today** — the
  operator quietly reads a raw code. That silent read-through is the exact failure class
  U6 and U8 spent themselves hunting (UAC-27).
- **B3-Q1 stands (requirements §5, shop repo):** the decoder accepts ANY non-empty
  `contact_channel` and renders unknown values verbatim — an enum mismatch would 400 the
  single most common order shape. The pin you add is TEST-level; the decoder must not
  gain a closed enum.
- Currency: `src/decode.ts` has `CURRENCY_PATTERN = /^[A-Z]{3}$/`; `src/payload.ts`
  rejects any case variant as `currency_malformed`; `tests/payload.test.ts` has pinned
  `"uah"` → reject since B1 (`d8f4549`). The UAC-26 item ("the one worth doing first")
  is the HOLE, not the missing pin: an informational field can cost a real order, against
  the requirements' own rule that a shop bug must cost a hint, never a volunteer's order.
  Render already falls back safely when currency is ABSENT
  (`currency ?? LOCALE_CURRENCY.get(locale) ?? FALLBACK_CURRENCY`).

## Scope

**1. Pin the vocabulary at value level.** `tests/support/contract.ts` gains
`ORDER_CONTACT_CHANNEL_VALUES = ["call", "telegram", "viber"] as const` — byte-equal to
the shop's `CONTACT_CHANNELS`; changing it is a paired step by standing law. Tests pin
`CONTACT_CHANNEL_TEXTS` against that fixture THROUGH the rendered message (each
canonical value renders its label; an unknown value still renders verbatim) — assert via
the composed message, not by exporting the private map.

**2. Close the currency-case hole — planner ruling, contest at the plan gate only with
tree evidence:** accept the 3-letter shape case-insensitively and NORMALIZE to uppercase
at the decode read, so `"uah"` reaches store/render/logs as `"UAH"`; everything
non-3-letter still rejects `currency_malformed` — genuine garbage must not silently
mislabel a money magnitude to an operator, while a case variant provably cannot change
the denomination. Move `"uah"` from the reject fixture to an accept-as-`"UAH"`
assertion; keep `"UAHX"`, `"U1H"`, `""`, `42` rejected.

**3. Order identity must not move.** Before implementing (2), verify whether the
dedupe/order hash reads the raw body or decoded fields. Prove the hash of real traffic
(uppercase currency) is unmoved by your change — `PINNED_HASH` and the differential
machinery exist for exactly this. If normalization could move identity for ANY real
traffic shape, STOP at the plan gate with the measurement.

**Bring to the plan gate:** the exact fixture/test shape for (1); the normalization site
for (2); the identity proof plan for (3); and your proposed pre-merge proof for the
decode change — prefer the existing differential/fixture machinery; a live-credential
local smoke only if the differential cannot cover it, and only as a plan-gate-approved
plan.

## Out of scope (hard fence)

The shop repo (`../utg-2.0`) — its half is a paired PR; do not open, edit or stage
anything there. No decoder enum for `contact_channel` (B3-Q1). No message layout
changes — the labels already exist. No store schema, auth, or retention changes; the v1
path stays retired; no new dependencies. Never send Telegram messages to the operators'
real chat and never write to the production Neon store outside a plan-gate-approved
smoke plan.

## Acceptance gates

- Full battery green per this repo's own commands (read its `CLAUDE.md` first).
- **Every change mutation-proven** on a COMMITTED tree, one surgical, typecheck-valid
  mutation per claim, each reported with the single named test it reddens, each
  reverted: (a) rename the `call` key in `CONTACT_CHANNEL_TEXTS` → red; (b) change the
  «Дзвінок» text → red; (c) drop a value from `ORDER_CONTACT_CHANNEL_VALUES` → red;
  (d) restore `/^[A-Z]{3}$/` strictness over the normalized read → red; (e) the
  uppercase-traffic hash is unmoved (test or measurement quoted in the PR body).
- The PR body carries the owner's verification checklist as `- [ ]` checkboxes (CI
  green, the mutation table, the identity proof, one post-merge real-order smoke when
  next convenient) and names the paired shop PR.

## Resource budget (WSL — mandatory)

Every heavy command inside
`systemd-run --user --scope -q -p MemoryMax=4G -p MemorySwapMax=1G --`,
`NODE_OPTIONS=--max-old-space-size=3072` on builds, strictly one at a time.

## Constraints

No comments in code; no skip flags; branch from `master`, PR against `master`; English,
first person, lowercase subject, no assistant signatures; never stage anything under
`initiatives/`.
