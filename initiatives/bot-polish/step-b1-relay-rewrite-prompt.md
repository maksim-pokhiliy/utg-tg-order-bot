# Step B1 — order relay rewrite (bot-polish)

/feature Rewrite the Telegram order relay as a typed, tested, zero-runtime-dependency Vercel function: make the payload `currency` key authoritative for the money figure (DEF-13), make the Telegram message injection-proof, validate input, add enforcement-if-configured relay auth, and establish the repo's quality floor (strict TypeScript, vitest, CI, README, LICENSE).

## Working context

- Repo: `/home/maksym/projects/contrib/utg/utg-tg-order-bot` — you work HERE. Branch
  from `master`, PR against `master`.
- This service is the LIVE order relay for https://www.ua-tactical-gear.com (Vercel
  project `telegram-bot-server`, auto-deploys `master`). Real volunteer orders flow
  through it: the Next.js shop POSTs the checkout payload to this service, which
  formats ONE Telegram message and sends it to the operators' chat via the Bot API
  (`sendMessage`, bot `@utg_orders_bot`).
- The sender (READ-ONLY reference): `/home/maksym/projects/contrib/utg/utg-2.0` —
  `src/components/checkout/CheckoutForm.tsx` builds the payload;
  `src/app/api/place_order/route.ts` proxies it here verbatim;
  `tests/app/api/place_order/route.test.ts` pins the shop side of the contract. Never
  modify anything in that repo.
- Env vars (live in Vercel; there is deliberately no local `.env`):
  `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID`, plus the new OPTIONAL
  `ORDER_RELAY_SECRET` (see auth). Never commit secrets. Never call the real Telegram
  API or the deployed relay — every test mocks `fetch`; post-merge smoke against the
  real bot is the planner/owner's job, not yours, and the PR must not claim it.

## The payload contract (SACRED)

The shop sends exactly this JSON (source of truth: `CheckoutForm.tsx`):

- `first_name`, `last_name`, `telephone`, `country`, `state`, `city`, `address`,
  `additional` — strings (trimmed; `additional` may be empty)
- `locale` — `"uk" | "en"`
- `total` — decimal STRING, e.g. `"46200.00"` (already multiplied by the display
  coefficient app-side)
- `currency` — `"UAH" | "USD"` (shop D-12: the figure the buyer was actually quoted;
  when exchange rates are down, `en` sends a UAH magnitude WITH `currency: "UAH"`)
- `cart` — array of `{ id, title, price, quantity, image, productUrl }` (the shop's
  frozen `ICartItem`; the message uses only `title`, `quantity`, `productUrl`)

Contract rules: never require a key the shop does not send; tolerate unknown extra
keys; never ask the shop side to change shape. Success response stays `200` +
`{"status":"success"}` — the shop checks `response.ok` only, so any failure status
works, but success semantics are frozen.

## What is broken today (fix all of it)

1. **DEF-13 / the money bug.** `index.js` ignores `currency` and infers it from
   `locale` (`{uk: UAH, en: USD}`). In the rates-down scenario the operator's chat
   shows `$46,200` for an order the buyer placed at ₴46 200. The payload `currency`
   is authoritative (BD-2); the locale map survives ONLY as a fallback when the key is
   absent; `locale` keeps driving number formatting style via
   `Intl.NumberFormat(locale, { style: "currency", currency })`.
2. **Order-losing Markdown injection.** User fields are interpolated into
   `parse_mode: "Markdown"`; one unbalanced `_`/`*` in an address (e.g.
   `вул._Шевченка`) makes Telegram reject the message (400, can't parse entities) →
   the relay 500s → a VALID order is lost. Move to `parse_mode: "HTML"`, escape `&`,
   `<`, `>` in EVERY interpolated payload value, keep visual parity with today's
   message (same emoji, same field order, labels bold) (BD-3).
3. **Zero validation.** A missing/non-array `cart` throws synchronously → an express
   HTML 500. Validate the payload shape; malformed input gets `400` +
   `{"status":"error"}`; response bodies never echo input.
4. **Error leak.** Telegram's `error.message` is forwarded in the 500 body. Stop:
   failures return an opaque `500` + `{"status":"error"}`; log server-side (Telegram
   HTTP status + its error description) and NEVER log payload fields — names and
   phones are PII.
5. **No auth.** The public repo names the Vercel project, so the relay URL is
   guessable, and anyone can spam fake "orders" into the operators' chat. When
   `ORDER_RELAY_SECRET` is set, require the `x-relay-secret` header to match exactly,
   else `401`; when unset, accept exactly as today (BD-4 — the shop-side sender is a
   later step, so this PR MUST be a behavioral no-op for the live flow until envs are
   set).

## Scope (IN)

- Replace `index.js` + express/body-parser/axios with ONE strict-TypeScript Vercel
  function at `api/place_order.ts` using native `fetch`; zero runtime dependencies —
  `package.json` ends with no `dependencies` entry; TypeScript/vitest/prettier/types
  live in `devDependencies` (BD-1).
- `vercel.json`: modern minimal config; legacy `builds`/`routes` gone; `/place_order`
  rewrites to the function so BOTH `/place_order` and `/api/place_order` serve (BD-5 —
  the live `PLACE_ORDER_URL` value is recorded nowhere, so both forms must answer).
- Handler shape (classic `(req, res)` via `@vercel/node` types vs web-standard
  `Request → Response`): propose at the plan gate with a one-line rationale.
- Validation intent: strict enough to kill garbage (wrong types, malformed cart,
  unknown `locale`, non-numeric `total`, `currency` present but not a 3-uppercase-letter
  code), open enough to never fail a benign real order (unknown EXTRA keys pass;
  absent `currency` falls back). Propose the exact per-field rules at the plan gate.
- `package.json` truing: `engines.node: "24.x"` (BD-6), real `description`,
  `"license": "MIT"`, scripts `test`, `typecheck`, `format`, `format:check`. npm stays
  the package manager; regenerate the lockfile to match the new dependency reality.
- Tests (vitest, node environment, `fetch` mocked — no network ever):
  - happy path UAH and USD (message content asserted, including the formatted total);
  - `currency` absent → locale-map fallback; the rates-down case (`locale: "en"` +
    `currency: "UAH"`) renders a ₴-side figure, NOT `$`;
  - escaping: `вул._Шевченка` arrives literally; an injected `<b>`/`&` is escaped;
    `parse_mode` is `HTML`;
  - each malformed-payload class → `400`, body `{"status":"error"}`, no input echo;
  - Telegram non-200 → opaque `500` (no upstream text in the body);
  - auth matrix: secret set → missing/wrong header `401`, correct header `200`;
    secret unset → header-less request `200`;
  - a contract test pinning the exact set of payload keys the handler READS — the
    drift guard that fails if the relay starts requiring a new key.
- CI: `.github/workflows/ci.yml` — one battery job on every PR and master push:
  `npm ci` → format check → typecheck → tests; Node derived from the same pin as
  `engines` (the shop repo uses `node-version-file` — mirror the approach).
  Secretless by construction.
- `README.md`: what the service is (one paragraph), the payload contract table, the
  response semantics, env vars incl. the optional `ORDER_RELAY_SECRET`, deploy note
  (Vercel `telegram-bot-server`, master auto-deploy), dev commands. `LICENSE`: MIT,
  copyright Maksim Pokhiliy — mirror the shop repo's file.
- `.gitignore` may be extended if tooling needs it (coverage output etc.).

## Non-goals (OUT)

- Any change in the shop repo (the auth sender is step B2).
- Message redesign beyond escaping and bold-label parity.
- Retries, queues, idempotency, bot-side rate limiting, logging infrastructure.
- Renaming env vars or the Vercel project.

## Acceptance gates (verify each before opening the PR)

1. `npm run typecheck`, `npm run format:check`, `npm test` all green locally.
2. `package.json` has zero runtime `dependencies`; no import of express/body-parser/
   axios anywhere; the lockfile agrees.
3. Mutation-proof the two key guards: (a) disable escaping → the escaping test fails;
   (b) make the handler read a key outside the pinned set → the contract test fails.
   Restore both, note the proof in the PR.
4. The rates-down test proves the ₴-figure (would fail against the old locale-map
   behavior).
5. `vercel.json` serves both paths (assert the rewrite in a test or show the config in
   the PR body with the reasoning).
6. Auth default-off proven by test: with no `ORDER_RELAY_SECRET`, a header-less
   request succeeds — the live flow cannot notice this PR.
7. CI workflow YAML mirrors the local battery and names Node from the single pin.

## Process

- Full `/feature` pipeline with its plan & design gate. At the gate report: file
  layout, handler-shape choice, per-field validation rules, the test list, and any
  contract question — then STOP for the planner's answers.
- Standing laws that override defaults: no comments in code anywhere (tests and
  configs included); never stage `CLAUDE.md` or anything under `initiatives/`
  (read-only source material); no skip flags (`--no-verify`, `--ignore-engines`, …);
  commits and PR text in English, first person, no AI signatures; run prettier before
  committing.
- PR description: why (the money bug + the order-losing injection), what changed, the
  contract table, the live-relay risk note and why the deploy is a no-op for the live
  flow, test evidence. Do not claim any live smoke — that happens post-merge and is
  not yours.
