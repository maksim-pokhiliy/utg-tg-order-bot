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

Bodies are constant: they never echo the request or upstream error text. Failures are logged server-side as one structured JSON line carrying the event, the upstream status and Telegram's description — never a payload field, because names, phones and addresses are personal data, and never the bot token.

Both `/place_order` and `/api/place_order` serve the function.

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
npm test              # vitest, fetch is always mocked
npm run format        # prettier --write .
npm run format:check  # what CI runs
```

Node is pinned to `24.x` through `engines.node` — the one pin Vercel, npm and CI all read. Tests never reach the network: the Telegram API is stubbed in every case, and nothing in this repository may POST to the deployed relay.

CI runs one battery on every pull request and every push to `master`: install → format check → typecheck → tests. It needs no secrets.

## Deployment

Vercel project `telegram-bot-server`, auto-deploying `master`. `vercel.json` carries only the `/place_order` → `/api/place_order` rewrite; everything else is zero-config. This relay is live production for real volunteer orders — a broken deploy silently breaks checkout on the storefront.

## License

MIT — see [LICENSE](./LICENSE).
