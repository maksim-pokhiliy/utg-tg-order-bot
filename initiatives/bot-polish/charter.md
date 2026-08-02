# bot-polish — charter

**Goal.** The order relay reports the money the shop actually charges, cannot lose a
valid order to message formatting, rejects garbage and uninvited callers, and carries
the same quality floor as the shop repo (strict TypeScript, tests, CI, honest README) —
while the live checkout flow never notices the transition.

**Driving decision(s).** Shop-side `D-12` (the payload carries `currency` — the figure
the buyer was actually quoted) and `DEF-13` (the bot-side read is the missing half:
today the bot infers currency from `locale` and shows the operator a $-figure on a
₴-magnitude whenever exchange rates are down). Contour ratified by the owner
2026-08-02: full scope, one `/feature` run driven through `/step`, smoke in the real
bot, engineering decisions delegated to the planner (BD-1…BD-8 in `decisions.md`).

**Acceptance criteria.**

- A payload with `currency: "UAH"` + `locale: "en"` (the rates-down scenario) produces
  a ₴-formatted total in the operators' chat — proven by unit test and by the
  post-merge smoke.
- Hostile field content (unbalanced `_`/`*`, HTML tags) arrives in Telegram as literal
  text; no payload content can 500 the relay via message formatting.
- Malformed payloads get `400` without echoing input; Telegram failures get an opaque
  `500`; no response body carries upstream error text.
- With `ORDER_RELAY_SECRET` set, header-less POSTs get `401`; with it unset, behavior
  is byte-equal to today's (staged rollout, proven by tests).
- Zero runtime dependencies; Node pinned `24.x`; CI (format / typecheck / tests) green
  on the PR; README documents the contract and envs; MIT license.
- After the merge, one TEST-labeled smoke order relayed through prod lands in the real
  operators' chat (owner-sanctioned, BD-8).

**Scope.** The bot repo end-to-end (step B1); the small shop-side secret sender + the
two-project env enablement (step B2, in `../utg-2.0`).

**Non-goals.** Message redesign beyond escaping and bold-label parity; retries, queues,
idempotency, bot-side rate limiting; renaming envs or the Vercel project; any shop-side
change beyond the B2 sender.

**Sacred (do not touch).** The payload contract (shop-owned: never require unsent keys,
tolerate extras); success semantics `200` + `{"status":"success"}`; the `/place_order`
path keeps serving (the live `PLACE_ORDER_URL` value is recorded nowhere in git);
`TELEGRAM_BOT_TOKEN`/`TELEGRAM_CHAT_ID` names; no real Telegram or deployed-relay calls
from tests or executors; no secrets in git.
