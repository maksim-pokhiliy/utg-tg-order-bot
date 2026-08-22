# bot-polish — decisions

D-numbered ratified decisions. Step-level calls that don't merit a full ADR live here;
cross-initiative architecture calls go to the project's ADR home (e.g. `docs/adr/`).
**Promote here at every gate** — a decision that lives only in scratch or an external
chat is not durable. This file is the SSOT for "why."

**Status legend:** `RATIFIED` (decided + acted) · `OPEN` (awaiting ratification — do not
execute past it) · `SUPERSEDED` (replaced — kept for the trail).

IDs are `BD-*` so cross-repo references never collide with the shop initiative's `D-*`.
All of BD-1…BD-8 were ratified 2026-08-02 under the owner's explicit delegation of the
engineering scope («сделай на своё усмотрение»); BD-8 (smoke in the real bot) and the
single-run mixed-scope PR shape are the owner's own calls from the same exchange.

## Index

| ID   | Topic                                        | Status   |
| ---- | -------------------------------------------- | -------- |
| BD-1 | Zero-dependency TypeScript Vercel function   | RATIFIED |
| BD-2 | Payload `currency` is authoritative (DEF-13) | RATIFIED |
| BD-3 | Telegram message: HTML parse mode + escaping | RATIFIED |
| BD-4 | Shared-secret auth, enforced only when set   | RATIFIED |
| BD-5 | Both `/place_order` and `/api/place_order`   | RATIFIED |
| BD-6 | Node pinned via `engines` 24.x; npm stays    | RATIFIED |
| BD-7 | Quality floor: tsc + vitest + prettier + CI  | RATIFIED |
| BD-8 | Single env; smoke in the REAL operators chat | RATIFIED |
| BD-9 | Unknown `locale` degrades to uk style, not 400 | RATIFIED |
| BD-10 | B5 talks to Neon over SQL-over-HTTP via plain `fetch` | RATIFIED |
| BD-11 | Dedupe suppresses only confirmed-delivered twins | RATIFIED |
| BD-12 | Case is not information: currency folds case at the read, garbage still fails closed | RATIFIED |

---

### BD-1 — rewrite as one zero-dependency strict-TypeScript Vercel function

- **Status:** RATIFIED.
- **Decision.** Replace `index.js` + express/body-parser/axios with a single
  strict-TS function at `api/place_order.ts` using native `fetch`; `package.json` ends
  with no runtime `dependencies` (tooling is devDependencies only).
- **Rationale.** Three runtime deps and a server framework for one endpoint is attack
  and maintenance surface without value; Vercel compiles TS functions natively and the
  platform already owns routing/listening.

### BD-2 — the payload `currency` key is authoritative for the money figure

- **Status:** RATIFIED.
- **Decision.** Format the total with the payload's `currency`; the old
  `{uk: UAH, en: USD}` locale map survives only as a fallback when the key is absent.
  `locale` keeps driving number STYLE (separators), never the currency.
- **Rationale.** DEF-13: when exchange rates are down the shop quotes ₴ to both locales
  and sends `currency: "UAH"` under `locale: "en"`; inferring currency from locale
  shows the operator $46,200 on a ₴46 200 order. The sender has carried the key since
  shop PR #11 (D-12); the fallback covers nothing real but costs nothing.

### BD-3 — Telegram message via `parse_mode: "HTML"` with escaped interpolations

- **Status:** RATIFIED.
- **Decision.** Switch the message to HTML parse mode; escape `&`, `<`, `>` in every
  interpolated payload value; keep visual parity with today (same emoji, same field
  order, labels bold).
- **Rationale.** Legacy Markdown 400s on any unbalanced `_`/`*` in user text
  («вул._Шевченка») — Telegram rejects the message, the relay 500s, and a VALID order
  is lost. HTML with escaping is unbreakable by user input and keeps the bold labels;
  plain text would too, but loses the formatting for zero extra safety.

### BD-4 — shared-secret relay auth, enforcement only when configured

- **Status:** RATIFIED.
- **Decision.** When `ORDER_RELAY_SECRET` is set, require the `x-relay-secret` header
  to match exactly, else `401`; when unset, accept as today. The shop-side sender is
  step B2; enablement order: shop sender live first (no-op without env), then set the
  env on both Vercel projects.
- **Rationale.** The repo is public and names the Vercel project — the relay URL is
  guessable, and an unauthenticated relay lets anyone spam fake "orders" into the
  operators' chat. Enforcement-if-configured makes the B1 deploy a byte-for-byte no-op
  for the live flow and turns rollout into two env clicks with no simultaneity dance.

### BD-5 — the function serves on both `/place_order` and `/api/place_order`

- **Status:** RATIFIED.
- **Decision.** `vercel.json` keeps `/place_order` rewriting to the `api/` function, so
  both paths answer.
- **Rationale.** The live `PLACE_ORDER_URL` value is env-secret and recorded in neither
  repo; serving both paths makes the rewrite deploy-safe with zero coordination and
  keeps the sacred path alive no matter which form the env carries.
- **Premise retired 2026-08-06 (ua-checkout U0).** The value is no longer unknown: it is
  `https://telegram-bot-server-maksim-pokhiliys-projects.vercel.app` — the bare
  deployment URL, no custom domain, no trailing slash, answering 405 with zero redirects
  on the exact path. The shop appends `/place_order`, so that is the path in use; and
  `vercel.json` REWRITES it to the `api/` function, meaning this was always one guarded
  function reached two ways rather than two routes. The decision stands (the redundancy
  costs nothing), but it is now insurance, not a hedge against ignorance. Recorded in
  the shop's `ua-checkout/decisions.md` D-10 as well; the URL is public, not a secret.

### BD-6 — Node pinned to one major via `engines.node: "24.x"`; npm stays

- **Status:** RATIFIED.
- **Decision.** Pin `engines.node` to `24.x` (the one pin Vercel reads — imported
  lesson from shop D-13); CI derives its Node from the same pin. npm remains the
  package manager.
- **Rationale.** The shop's Node-24 crisis proved unpinned majors drift until they
  break an install in prod; the lockfile here is already npm and a yarn migration is
  churn without payoff.

### BD-7 — quality floor: strict tsc + vitest + prettier + GitHub Actions; no eslint

- **Status:** RATIFIED.
- **Decision.** `typecheck` (strict TS), vitest units with mocked `fetch`, prettier,
  and a secretless CI battery (install → format check → typecheck → tests) on every PR
  and master push. MIT license, mirroring the shop repo. No eslint.
- **Rationale.** This is the same floor the shop repo earned, minus lint: a lint config
  for a ~150-line single-function repo is ceremony without signal — revisit if the repo
  grows real surface.

### BD-8 — single environment; post-merge smoke goes to the REAL operators' chat

- **Status:** RATIFIED (owner's call, 2026-08-02).
- **Decision.** No second bot/chat/env. Post-merge verification is one deliberate,
  clearly TEST-labeled payload POSTed to the deployed relay by the planner/owner,
  landing in the real operators' chat.
- **Rationale.** «Окружение бота только одно, тестим и верифицируем смоук в реальном
  боте» — one obvious test message per round beats maintaining a parallel environment
  for a volunteer project. Executors and tests still never touch the real API (BD-7
  mocks; the sacred list) — the smoke is a manual planner/owner act.

### BD-9 — unknown `locale` degrades to uk formatting style instead of 400

- **Status:** RATIFIED (planner ruling at the B1 plan gate, 2026-08-02 — a sanctioned
  deviation from the B1 step prompt's "unknown locale → 400"; post-hoc owner veto open).
- **Decision.** `locale` must be a string (the actual crash guard); `uk`/`en` are
  honored; any other value formats with `uk` number style. Money is untouched —
  `currency` stays authoritative per BD-2. The posture line: integrity-risk fields
  (`total`, `currency`, cart shape) fail CLOSED with 400; style-only fields fail OPEN.
- **Rationale.** Executor probe (Node 24, full ICU): `Intl.NumberFormat` throws only on
  structurally invalid tags (`"not a tag!"`), not on unknown well-formed ones (`"de"`
  formats fine) — the uk|en allow-list was never a crash guard, so rejecting bought no
  safety. A third shop locale is an additive change that cannot fail the shop's own
  typecheck (exactly how `currency` arrived in shop PR #11 while this repo stood
  still); a 400 would silently lose 100% of that locale's orders, while degrading costs
  thousands-separator cosmetics in a scenario that does not yet exist.

### BD-10 — B5 reaches Neon over SQL-over-HTTP with native `fetch`; zero-dependency stands

- **Status:** RATIFIED (owner, 2026-08-18 — contour approval; probe falsifiers cleared
  the same day).
- **Decision.** `src/store.ts` talks to Neon's `/sql` endpoint with native `fetch` and
  the `Neon-Connection-String` header; no driver joins `package.json`; BD-1 remains
  law. Timeout budgets derived from measurement: 2000 ms pre-send (amended from 4000
  at the B5 plan gate: a retry never meets a cold database — the first attempt wakes
  it — so a cold-timeout skips a dedupe check that protects nothing real, while the
  `attempt_id` late-write self-heals the audit row; the shorter box keeps the relay's
  worst chain at 14.5 s under the shop route's unverified function ceiling), 2500 ms
  post-send, `maxDuration` 15 → 30.
- **Rationale.** Measured on the live database (`b5-neon-probe.md`): cold start
  863–921 ms (repeatable across a 9-minute and a 9-DAY suspend), warm p50 98 ms from
  iad1, errors are classifiable HTTP 400 JSON with SQLSTATE codes, 1 MB params pass,
  concurrency does not serialize. The drivers' value — pg API, transactions, type
  parsing for 100+ types — is unused by two fixed statements reading three fields:
  `@neondatabase/serverless` is 432 KB for a wrapper around the same POST; `pg` adds
  six transitive packages and a TCP model that pays a connection per invocation.
  Named risk: `/sql` is Neon's driver-internal protocol with no independent SLA.
  Mitigation: one module behind fail-open — a protocol break costs audit rows, never
  orders — and fixtures pin the captured shapes so a drift is a red test, not a
  mystery. Falsifiers checked and cleared: endpoint availability on this project,
  cold latency, error classifiability.

### BD-11 — dedupe suppresses only confirmed-delivered twins; hash leads, key corroborates

- **Status:** RATIFIED (owner, 2026-08-18 — contour approval).
- **Decision.** A retry is suppressed iff the content hash matches AND the prior row
  is confirmed delivered (`sent_at not null`) AND both idempotency keys are present
  and equal AND the prior lies within a 30-minute window. The hash canon EXCLUDES the
  key. v1 (keyless) traffic is stored but never suppressed. Ambiguous send outcomes
  (`ack_unreadable`, `timeout`) are not delivery — a retry after one sends again.
  Suppression answers the byte-exact frozen 200 without touching Telegram.
- **Rationale.** The cost asymmetry rules: a false suppression silently loses a real
  order (the exact class this initiative exists to kill — and BDEF-9's edited-order
  scenario is a false suppression by construction), while a false send costs one
  duplicate message the operators reconcile by phone (BDEF-3's own bounded-harm
  analysis). Hence every condition errs toward sending: short window, key must
  corroborate, unconfirmed delivery never suppresses, and the store being down makes
  the relay behave as if dedupe did not exist.

### BD-12 — Case is not information: the currency read folds case at the boundary and still fails closed on garbage

- **Status:** RATIFIED (planner ruling, 2026-08-22, polish-tail P1 / PR #7 `aa10f56`).
- **Decision.** `parseOrder` accepts a `currency` whose RAW value is three ASCII letters
  in any case and normalizes it to uppercase at the read (`readCurrency`: shape test on
  the raw value FIRST, then `toUpperCase` — the order is load-bearing, because
  `toUpperCase` does not preserve length: `"ßa"` → `"SSA"`, `"ﬁx"` → `"FIX"`). Every
  other shape still rejects `currency_malformed` (400). Only `toUpperCase`, never
  `toLocaleUpperCase` — and the property test pins the dangerous explicit-tag form.
- **Rationale.** Refines BD-9's fail-closed line for integrity-risk fields. A wrong
  DENOMINATION mislabels money to the operator and must fail closed; a wrong CASE
  provably cannot change the denomination, and rejecting it makes an informational
  field cost a volunteer's order — the exact failure §5's philosophy forbids. Order
  identity proven unmoved three ways: the decoded pinned body still hashes to the
  frozen store canon (`PINNED_HASH`), all 17 576 previously-accepted codes are
  `toUpperCase` fixed points, and a 25M-body differential (independent reviewer)
  showed zero hash/message/verdict drift beyond the intended case-only accepts.
  Consequence, deliberately accepted and owner-visible in the PR body: a case-variant
  body and its canonical twin are now ONE order for dedupe — only bodies that
  previously answered 400 and were never stored can merge.
- **Links.** PR #7; shop `initiatives/polish-tail/` (P1); the canonical ledger's
  UAC-26 row; BDEF-13 (the same class left OPEN on `delivery.mode`, where it is fatal).
