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
| suppressed as a duplicate of a delivered order                     | `200`  | `{"status":"success"}` |
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

## Persistence

Set `DATABASE_URL` and the relay writes every decoded order to Postgres **before** it calls Telegram, over Neon's SQL-over-HTTP endpoint with the platform's own `fetch` — no driver, no dependency. Leave it unset and none of this happens.

Three rules govern the store, and the code is built so that breaking any of them turns a named test red.

**The store never gates the send.** A database that is dead, slow, missing its table or misconfigured costs an audit row — never an order, and never a different answer to the shop. Every failure is one structured log line and the flow continues as though the store did not exist. That includes the case where the migration has not been applied yet: the missing table comes back as SQLSTATE `42P01`, the relay fails open, and the log names the cause. Either deploy order is therefore safe.

**Duplicates are recognised by content, never by the idempotency key alone.** The shop mints that key on first submit and clears it only after a success, so it deliberately spans an order the buyer _edited_ between attempts. Suppressing on the key would answer `200` to a corrected order that was never delivered, and the shop would show the success screen and empty the cart. So identity is a sha256 over a canonical serialization of the decoded order with the key removed, and the key is only corroborating evidence.

**What is stored is the decoded order, not the message.** The Telegram message is a lossy view — it truncates, and truncation hides cart lines behind a marker. The record is what the decoder returned.

### What is and is not suppressed

A retry is suppressed only when _all four_ of these hold: the content hash matches, the earlier attempt is confirmed delivered, both idempotency keys are present and equal, and the earlier attempt is less than 30 minutes old. Everything else is delivered again. Concretely:

- **Suppressed:** the same order re-POSTed under the same key within half an hour of a confirmed delivery. The relay answers the byte-identical `200` and never calls Telegram.
- **Not suppressed:** an order whose cart or total changed, even under the same key — this is the whole reason identity is the hash.
- **Not suppressed:** a retry after an _ambiguous_ outcome (Telegram accepted but the acknowledgement was unreadable, or the call timed out). An unconfirmed send is not a delivery. A duplicate message is something the operators reconcile in a phone call; an order silently swallowed is not.
- **Not suppressed:** anything older than the window, anything without a key on both sides, and every v1 order — v1 carries no key at all, so v1 traffic is recorded but never deduplicated.
- **Not suppressed:** two identical requests racing each other. Both may find no prior and both may send. This is a bounded, accepted non-goal — locking would trade a duplicate message for a possibly lost order, which is the wrong direction.

Every condition errs toward sending, because the two mistakes are not equally expensive.

### Replay after an incident

Two queries, because the rows they return want opposite defaults. **The split is not "did we record a failure" — it is "do we know Telegram never saw it".** Three of the six failure reasons are ambiguous rather than confirmed: `ack_unreadable` means Telegram answered `200` with a body we could not parse (it almost certainly posted), and `timeout` and `network_error` both leave open whether the request was written before the connection died.

```sql
select payload from orders
where sent_at is null
  and not (dedupe_of is not null and send_failure is null)
  and send_failure in ('config_missing', 'upstream_rejected', 'upstream_not_ok');
```

These are the confirmed non-deliveries: the bot was unconfigured, or Telegram actively refused the message. Replaying them is safe.

```sql
select payload from orders
where sent_at is null
  and not (dedupe_of is not null and send_failure is null)
  and (send_failure is null
       or send_failure in ('ack_unreadable', 'timeout', 'network_error'));
```

These are ambiguous — either the outcome was never recorded, or it was recorded as one of the three reasons that do not prove non-delivery. The message may or may not have arrived. A human reconciles these against the chat before replaying anything.

Note what the conditions exclude, and why the exclusion is written the awkward way. A suppressed attempt keeps `sent_at` null on purpose (it was never itself delivered, and letting it count as one would roll the window forward under a retry storm), so something has to keep replays from re-sending orders that _were_ delivered — filtering on `sent_at is null` alone would do exactly that. But `dedupe_of is null` is the wrong instrument, because `dedupe_of` records what the SQL predicate matched while suppression is decided in TypeScript. A suppressed attempt is precisely one with a back-reference **and** no send recorded against it, which is what `not (dedupe_of is not null and send_failure is null)` says. Using `dedupe_of is null` alone would hide a genuinely lost order in the case where the two ever disagree.

### The shape of the record

`migrations/001_orders.sql` holds the schema; it is applied out of band and is never executed by the code or by CI. Rows are append-only — the only columns any later write touches are `sent_at`, `telegram_message_id` and `send_failure`.

`payload` is `text`, not `jsonb`, deliberately. Postgres `jsonb` rejects two things the decoders accept and the shop can send: a NUL character and an unpaired surrogate. Under `jsonb` those orders would relay fine and then be silently dropped by the store — precisely the hostile inputs worth having a record of. `text` always accepts them.

One consequence to know before you reach for it: a `payload::jsonb` cast is **not** a safe ad-hoc tool here. Postgres aborts the whole statement on the first value it cannot convert, so a single row a buyer planted weeks ago takes down the entire result set, not just its own row. The replay queries above return `payload` as text and are unaffected. If you do need to look inside, filter to the rows you want first and expect the cast to fail on some of them.

### This is a store of personal data

Once `DATABASE_URL` is set, buyer names, phone numbers and delivery addresses live in Postgres, where previously they existed only in the operators' chat. **There is no retention or erasure policy yet, and rows accumulate indefinitely** — that work is deliberately out of scope here and is tracked as a carry-forward. Logs remain clean: the store logs SQLSTATE codes (validated against the five-character SQLSTATE shape, so an upstream that puts prose in that field cannot smuggle it into a log line), HTTP status, Neon's request id, timings, row ids, JavaScript error class names, and short prefixes of the content hash and idempotency key for correlation — never a payload value, never the connection string or any fragment of it, never a full hash or key, and never Neon's own `message`/`detail`/`hint`, which can quote both SQL and parameter content.

Two access facts worth stating plainly, since the migration does nothing about either: the relay authenticates with whatever role `DATABASE_URL` names, and that role currently owns the schema rather than holding the three grants the relay actually needs; and the rows carry no encryption, pseudonymisation or row-level policy.

## Environment

| Variable             | Required | Purpose                                                                                                                                                                                                                                                             |
| -------------------- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `TELEGRAM_BOT_TOKEN` | yes      | Bot API token; without it every request answers `500`                                                                                                                                                                                                               |
| `TELEGRAM_CHAT_ID`   | yes      | destination chat for order messages                                                                                                                                                                                                                                 |
| `ORDER_RELAY_SECRET` | no       | when set, callers must send a matching `x-relay-secret` header. Unset, empty, or whitespace-only means enforcement is off and the relay behaves exactly as before                                                                                                   |
| `DATABASE_URL`       | no       | Postgres connection string. When set, every decoded order is recorded before the send and duplicates are suppressed; unset, empty or whitespace-only means the relay behaves exactly as it did before persistence existed — zero database calls, zero new log lines |

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

Vercel project `telegram-bot-server`, auto-deploying `master`. `vercel.json` carries two things: the `/place_order` → `/api/place_order` rewrite, and a `maxDuration` set above everything the invocation can spend upstream, so the relay's own timeouts are the ones that fire. There are three of those now — 2 s for the pre-send record, 10 s for Telegram, 2.5 s for the post-send mark — and a test asserts `maxDuration` clears their sum with room left over for the work outside the boxes. Everything else is zero-config.

`.vercelignore` decides what reaches the deployment, and it is an **allowlist**: everything at the root is excluded, and only `api/`, `src/` and the build manifests are added back. **If you add a source directory the function imports from, add it there too** — a missing entry still typechecks, still passes the load smoke and still builds, and then the deployed lambda dies on its first request. `tests/vercelignore.test.ts` derives the directories the compiled module graph actually reaches and fails CI when one of them is not shipped, so that is caught before production rather than by it.

This relay is live production for real volunteer orders — a broken deploy silently breaks checkout on the storefront.

## License

MIT — see [LICENSE](./LICENSE).
