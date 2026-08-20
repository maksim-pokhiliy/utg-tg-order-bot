# Step U8 (relay half) — the operators' message speaks Ukrainian (executor prompt)

---

/feature The owner's ruling from the U7 browser gate: **the order message's field labels are in
English and must be Ukrainian.** Not localised per order locale — always Ukrainian. The shop is
Ukrainian, the channel is internal, and there is nobody in it who needs an English gloss. This
relay delivers REAL volunteer orders and auto-deploys `master`.

> «названия полей должны быть на укр. языке, магазин ведь украинский, и канал для внутреннего
> использования, поэтому локализация не нужна»

## The width question is already answered — it BUYS room, it does not cost it

The planner raised the obvious objection (labels are `generatedField`s and count against
Telegram's 4096) and then measured it in the raw UTF-16 units B4 unified on:

```
order header (one per order):   194 → 164   (-30)
per cart line:                   24 →  23   ( -1)
net at 60 cart lines:                        -90
```

The single biggest contributor is `Additional Information` → `Коментар` (−14). So Ukrainian
labels free ~30 units of header and ~1 per line. **Do not treat this as licence to stop
measuring** — report your own before/after numbers for the saturation cases, because the labels
are not the only thing that moved if you touch `DELIVERY_MODE_LABELS` or the source text.

## Scope

Every operator-facing string the message renders becomes Ukrainian:

- The field labels in `src/render.ts` and `src/message.ts` — `First Name`, `Last Name`,
  `Patronymic`, `Telephone`, `Preferred Contact`, `Delivery`, `Address Source`, `Country`,
  `State`, `City`, `Address`, `Street`, `Building`, `Apartment`, `Warehouse No`, `Total`,
  `Additional Information`, `Products`, `Title`, `Quantity`, `Product URL`.
- `DELIVERY_MODE_LABELS` — «Nova Poshta courier» and its siblings.
- `resolveSourceText` — including the operator guidance the owner asked about by name:
  `Nova Poshta directory (city only — verify the street on the call)`. That sentence is
  instruction TO the operator and is exactly the kind of thing that must be in their language.
- The contact-channel values if they render as English words.

**The planner's proposed wording, which the OWNER may still veto** — put every one of them in the
PR body as a table for veto, and do not invent a single string beyond this set:

| now | proposed |
| --- | --- |
| First Name | Ім'я |
| Last Name | Прізвище |
| Patronymic | По батькові |
| Telephone | Телефон |
| Preferred Contact | Спосіб зв'язку |
| Delivery | Доставка |
| Address Source | Джерело адреси |
| Country / State / City / Address | Країна / Область / Місто / Адреса |
| Street / Building / Apartment | Вулиця / Будинок / Квартира |
| Warehouse No | Відділення № |
| Total | Сума |
| Additional Information | Коментар |
| Products | Товари |
| Title / Quantity / Product URL | Назва / Кількість / Посилання |

## What this necessarily disturbs, and how to handle it honestly

The golden-message tests pin the rendered output line by line — that is their job, and this change
moves every line. **Re-cut them deliberately and say so**: the goldens are not being loosened to
fit new code, they are being re-cut because the owner changed what the message says. Name the
count of re-cut goldens in the PR body. Any test whose NAME claims something about English text
gets a new name, not a quiet edit.

Nothing about the payload contract changes. `tests/support/contract.ts`, the envelope, the store,
the dedupe laws and the auth posture are all untouched — this is a rendering change only, and your
diff should show that.

## Out of scope (hard fence)

The shop repo (`../utg-2.0`) — a paired PR there widens the carrier's pickup-point categories; do
not open, edit or stage anything in it. Also out: the message's structure, emoji, ordering or
truncation policy; the width accounting itself; BDEF-8, BDEF-10 and BDEF-11.

## Acceptance gates

- Full battery green: `npm run format:check`, `npm run typecheck` (both programs), `npm test`,
  `npm run smoke`.
- Report saturation numbers before and after: the header cost and the per-line cost, in raw UTF-16,
  and the resulting change in how many cart lines survive truncation. The planner measured −30 and
  −1; confirm or correct that with your own run.
- **Every claim mutation-proven** on a COMMITTED tree, one surgical typecheck-valid mutation each,
  reported with the single named test it reddens, each reverted.
- `grep -rn "First Name\|Last Name\|Preferred Contact\|Additional Information\|Product URL" src/`
  returns nothing. Report the command and its output.

## Resource budget (WSL — mandatory)

Heavy commands inside `systemd-run --user --scope -q -p MemoryMax=4G -p MemorySwapMax=1G --`,
strictly one at a time.

## Constraints

No comments in code; no skip flags; zero runtime dependencies is law here (`package.json` has no
`dependencies` block); package manager is **npm**; branch from `master`, PR against `master`;
English commit and PR text with lowercase subject, no assistant signatures — the Ukrainian belongs
in the product, not in the git history; never stage `CLAUDE.md` or anything under `initiatives/`;
**never POST to the deployed relay, the Telegram API or the Neon database.**
