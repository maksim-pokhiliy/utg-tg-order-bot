# utg-tg-order-bot

The order relay for the [Ukrainian Tactical Gear](https://www.ua-tactical-gear.com) shop — a volunteer merch store whose proceeds go to the front. The storefront POSTs its checkout payload here; this service validates it, formats one Telegram message, and delivers it to the operators' chat through the Bot API (`sendMessage`, bot `@utg_orders_bot`). It is a single zero-dependency TypeScript function on Vercel: it validates, formats and forwards, holding no state of its own.

## The payload contract

The shop owns both shapes below. The relay never requires a key the shop does not send, and unknown keys are ignored at every level — that is what lets the shop add a field without a version bump.

A top-level `version` selects the decoder: `2` reads the v2 envelope, an absent `version` or `1` reads the v1 shape, and any other value is rejected as `version_unsupported` rather than being pushed through a decoder that cannot describe it. Both shapes are live at once during the shop's rollout; a later step retires v1.

### v1 — the flat shape (live today)

| Key                                                                           | Type     | Required | Notes                                                                                                  |
| ----------------------------------------------------------------------------- | -------- | -------- | ------------------------------------------------------------------------------------------------------ |
| `first_name`, `last_name`, `telephone`, `country`, `state`, `city`, `address` | `string` | yes      | must be non-empty; mirrors the shop's own required-field list                                          |
| `additional`                                                                  | `string` | no       | free-form note; routinely `""`, treated as `""` when absent                                            |
| `locale`                                                                      | `string` | yes      | `uk`/`en` are honoured; any other tag formats with the `uk` number style                               |
| `total`                                                                       | `string` | yes      | plain decimal already at display magnitude, e.g. `"46200.00"` — no sign, no exponent, no whitespace    |
| `currency`                                                                    | `string` | no       | ISO-4217-shaped (`UAH`, `USD`). **Authoritative for the money figure.** Absent → derived from `locale` |
| `cart`                                                                        | `array`  | yes      | at least one item                                                                                      |
| `cart[].title`                                                                | `string` | yes      | non-empty; carries the size suffix when the product has one                                            |
| `cart[].quantity`                                                             | `number` | yes      | positive integer                                                                                       |
| `cart[].productUrl`                                                           | `string` | yes      |                                                                                                        |

Other `cart[]` keys the shop sends (`id`, `price`, `image`) are accepted and ignored. A test pins the exact set of keys the relay reads, so adding a dependency on a new key fails the build.

`currency` is authoritative on purpose: when the exchange-rate feed is down the shop quotes hryvnia to both locales and sends `currency: "UAH"` under `locale: "en"`. Deriving the currency from the locale would show the operator a dollar figure on a hryvnia amount.

### v2 — the discriminated envelope

Ukrainian delivery does not fit a flat address string, so v2 nests the recipient under `customer` and makes delivery a discriminated choice.

```json
{
  "version": 2,
  "idempotency_key": "3f2b8c1e-9a44-4d7e-8b2f-16c0a9e5d731",
  "locale": "uk",
  "customer": {
    "first_name": "Марія",
    "last_name": "Шевченко",
    "patronymic": "Іванівна",
    "phone": "+380671234567",
    "contact_channel": "telegram"
  },
  "delivery": {
    "mode": "np_branch",
    "source": "np_directory",
    "city": "м. Львів, Львівська обл.",
    "warehouse": "Відділення №1: вул. Городоцька, 359",
    "warehouse_number": "1"
  },
  "comment": "після 18:00",
  "cart": [{ "title": "…", "quantity": 1, "productUrl": "…" }],
  "total": "250.00",
  "currency": "UAH"
}
```

`cart`, `total`, `currency` and `locale` behave exactly as in v1. `comment` replaces `additional`. `idempotency_key` is carried but never rendered and never required — a later step consumes it.

| `delivery.mode` | Fields                                                |
| --------------- | ----------------------------------------------------- |
| `np_branch`     | `city`, `warehouse`, `warehouse_number?`, `source?`   |
| `np_postomat`   | same as `np_branch`                                   |
| `np_courier`    | `city`, `street`, `building`, `apartment?`, `source?` |
| `generic`       | `country?`, `state?`, `city`, `address` — no `source` |

The relay requires only what it cannot render an order without: `delivery.mode`, `city` plus (`warehouse` \| `street` + `building` \| `address`) for the resolved mode, and `customer.first_name` / `last_name` / `phone` — plus the shape rules `locale`, `total` and a non-empty `cart` inherit from v1. Everything else is optional, and optional here means the relay never trades an order for a diagnostic: `source`, `warehouse_number`, `contact_channel`, `country`, `state`, `patronymic`, `comment` and `idempotency_key` are dropped when they arrive absent, blank, `null` **or wrongly typed**, and the order goes through without them. A single-select that hands back its option object instead of the value is an ordinary front-end bug; it should cost the operator a hint, not cost a volunteer their order. `contact_channel` is rendered verbatim — the shop pins its own value set, the relay does not second-guess it.

`source` tells the operator where the address came from: `np_directory` means it was picked out of the carrier's directory, `manual` means it was typed by hand and renders as _verify on the call_. An absent or unrecognised value renders the same warning rather than silence, because assuming an address was verified is the expensive mistake. On a courier order `np_directory` covers the city only — the street is always typed by hand — and the rendered line says so.

**Every order carries that line, including `generic`**, which has no `source` field at all: a free-form address is hand-typed by definition, so it renders _typed by hand — verify on the call_. Rendering it unconditionally is mostly about being true — that is what free-form means — and it also means the operator always has a real source line to read rather than inferring from its absence. It is now also a forgery guard, which it was not before: **bold in an order message means the relay wrote it.** Markup is escaped, and the sanitizer folds Unicode math-bold and fullwidth lookalikes to plain ASCII before that escaping happens, so there is no longer any way for buyer-supplied text to render bold. One weaker caveat survives and is worth knowing: a comment legitimately keeps its newlines, so buyer text can still be laid out to _resemble_ a labelled line — it just cannot carry the bold label that the eye actually reads.

`generic` is not a synonym for the English locale: it ships under `locale: "uk"` too while the shop's Ukrainian delivery is still free-text, so neither field may be inferred from the other.

## Responses

| Situation                                                          | Status | Body                   |
| ------------------------------------------------------------------ | ------ | ---------------------- |
| relayed to Telegram                                                | `200`  | `{"status":"success"}` |
| malformed payload                                                  | `400`  | `{"status":"error"}`   |
| `ORDER_RELAY_SECRET` configured and the header is missing or wrong | `401`  | `{"status":"error"}`   |
| bot not configured, or Telegram refused / was unreachable          | `500`  | `{"status":"error"}`   |

A `200` from Telegram is not automatically a success: the Bot API answers `200` with `{"ok": false}` when the bot is blocked or the chat is gone, and the relay treats that as a failure rather than telling the shop the order arrived. The outgoing call also carries a 10-second timeout, so a hung upstream cannot pin the invocation and leave the buyer on a spinner.

Bodies are constant: they never echo the request or upstream error text. Failures are logged server-side as one structured JSON line carrying the event, the upstream HTTP status and Telegram's numeric `error_code` — **never the `description`**, because Bot API parse errors quote fragments of the outgoing message, which is buyer data. No payload field and no bot token is ever logged.

Both `/place_order` and `/api/place_order` serve the function.

## Message shape and limits

The message keeps the field order, emoji and bold labels the operators already know, rendered in HTML parse mode with every interpolated value escaped.

Telegram caps a message at 4096, and exceeding it means the message is rejected and the order is lost. **What that 4096 counts is not something we can establish from outside.** The Bot API documents `sendMessage.text` as "1-4096 characters after entities parsing". The open-source Bot API server gates the raw string at 32768 bytes, and TDLib applies the 4096 to the _parsed_ text using `utf8_length()`, which is code points. The unit the production server actually applies is not in open source, and "after entities parsing" means the `<b>` tags we write may not count at all.

So the relay does not guess. It measures the **raw string in UTF-16 code units**, which is the largest of every candidate metric: parsed length is never greater than raw length, and code points are never more numerous than UTF-16 units. Measuring the raw string therefore cannot under-count under any reading of the limit. That is deliberately conservative — on a relay with no persistence and no replay path, spending a little cart room to be certain is the right trade. Against the previous code-point accounting it costs zero to one cart lines on a realistic order.

The unit has to be applied consistently, and that is the part that was wrong before: every emoji label the relay writes is a surrogate pair worth two UTF-16 units, so a budget counted in code points undercounted a rendered cart line by three and the header by ten. Now every budget and every field limit is compared in the same unit. Fields are clamped to a generous limit and marked with `…` where they were cut, and if the message would still be too long the **cart listing** is truncated with a trailing `… <b>+N more positions</b>` marker. Contact details and the total are never dropped — an operator who sees that marker still has everything needed to phone the buyer and confirm the remaining positions. Clamping cuts on a code-point boundary, so a surrogate pair is never split in half.

Text that came from the buyer is sanitized before it is escaped: it is made well-formed, normalized to NFKC, and stripped of Unicode format characters (`\p{Cf}` — bidi overrides and isolates, zero-width joins and spaces, soft hyphen, BOM, tag characters). Order matters in both directions. It runs **before** escaping, because fullwidth `＜` normalizes to a real `<` and escaping first would hand Telegram live markup. It runs **after** a coarse pre-slice, because NFKC can expand a string up to eighteenfold and the slice is what bounds the work a hostile field can force. Text the relay generates itself — labels, the money figure, quantity digits — deliberately does not pass through it, which is why the Ukrainian total keeps the non-breaking spaces `Intl` puts in `46 200,00 ₴`.

Normalization is visible in a few places, by design. The numero sign folds, so a carrier warehouse label reading `Відділення №1` renders as `Відділення No1` — accepted because it stays legible, and because the fold is display-only: the decoded value keeps `№`. Fullwidth and Unicode math alphabets fold to plain ASCII, a typed `…` becomes three dots, and a non-breaking space becomes an ordinary one.

Stripping format characters costs some emoji their composition, and that is a real consequence rather than a theoretical one. The zero-width joiner is a format character, so `👨‍👩‍👧` arrives as three separate glyphs and `🏳️‍🌈` as two; a tag-sequence flag degrades to its base `🏴`. Variation selectors are marks rather than format characters, so an ordinary emoji keeps its presentation. Every one of these is pinned by a test — they are accepted costs of removing the bidi overrides and zero-width padding that were misleading operators, not oversights.

## Environment

| Variable             | Required | Purpose                                                                                                                                                           |
| -------------------- | -------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `TELEGRAM_BOT_TOKEN` | yes      | Bot API token; without it every request answers `500`                                                                                                             |
| `TELEGRAM_CHAT_ID`   | yes      | destination chat for order messages                                                                                                                               |
| `ORDER_RELAY_SECRET` | no       | when set, callers must send a matching `x-relay-secret` header. Unset, empty, or whitespace-only means enforcement is off and the relay behaves exactly as before |

There is deliberately no local `.env` and no `.env.example` holding real values — the variables live in the Vercel project. Never commit secrets.

## Development

```bash
npm install
npm run typecheck     # tsc --noEmit
npm test              # vitest; the Telegram API is stubbed wherever it is called
npm run smoke         # compile per-file and load the entrypoint under real ESM rules
npm run format        # prettier --write .
npm run format:check  # what CI runs
```

Node is pinned to `24.x` through `engines.node`: Vercel reads it for the runtime and CI reads it via `node-version-file`, so there is one pin rather than three (npm only warns about it unless `engine-strict` is set). Tests never reach the network — the Telegram API is stubbed wherever it is called, and nothing in this repository may POST to the deployed relay.

`npm run smoke` compiles the function the way the platform does — per file, no bundler — and imports the result under real Node ESM rules. It exists because a missing file extension in a relative import passes `tsc`, passes vitest, passes the Vercel _build_, and then fails at load time on the first real request.

CI runs one battery on every pull request and every push to `master`: install → format check → typecheck → load smoke → tests. It needs no secrets.

## Deployment

Vercel project `telegram-bot-server`, auto-deploying `master`. `vercel.json` carries two things: the `/place_order` → `/api/place_order` rewrite, and a `maxDuration` set above the outgoing request timeout so the relay's own timeout is the one that fires. Everything else is zero-config.

`.vercelignore` decides what reaches the deployment, and it is an **allowlist**: everything at the root is excluded, and only `api/`, `src/` and the build manifests are added back. **If you add a source directory the function imports from, add it there too** — a missing entry still typechecks, still passes the load smoke and still builds, and then the deployed lambda dies on its first request. `tests/vercelignore.test.ts` derives the directories the compiled module graph actually reaches and fails CI when one of them is not shipped, so that is caught before production rather than by it.

This relay is live production for real volunteer orders — a broken deploy silently breaks checkout on the storefront.

## License

MIT — see [LICENSE](./LICENSE).
