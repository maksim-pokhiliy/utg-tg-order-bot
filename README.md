# utg-tg-order-bot

The order relay for the [Ukrainian Tactical Gear](https://www.ua-tactical-gear.com) shop — a volunteer merch store whose proceeds go to the front. The storefront POSTs its checkout payload here; this service validates it, formats one Telegram message, and delivers it to the operators' chat through the Bot API (`sendMessage`, bot `@utg_orders_bot`). It is a single zero-dependency TypeScript function on Vercel: no database, no queue, no state.

## The payload contract

The shop owns this shape. The relay never requires a key the shop does not send, and tolerates unknown extra keys.

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

Telegram caps a message at 4096 characters, and exceeding it means the message is rejected and the order is lost. Rather than reject the order or let that happen, the relay bounds the message: every field is clamped to a generous limit and marked with `…` where it was cut, and if the message would still be too long the **cart listing** is truncated with a trailing `… <b>+N more positions</b>` marker. Contact details and the total are never dropped — an operator who sees that marker still has everything needed to phone the buyer and confirm the remaining positions.

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
