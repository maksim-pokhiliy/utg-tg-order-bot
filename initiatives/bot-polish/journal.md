# bot-polish — journal

Append-only. One entry per session/step.

## 2026-08-02 — initiative opened; workspace restructure; B1 launched

- The bot phase unparked (shop `production-polish` initiative COMPLETE, its DEF-13
  scheduled here). Workspace restructured per the owner: both repos now live under
  `~/projects/contrib/utg/` (`utg-2.0`, `utg-tg-order-bot`); the transitional symlink
  at the old shop path was removed same-session on the owner's call — one instance, one
  address.
- Recon: the live repo is byte-identical to the shop's recovered snapshot
  (`extracted/bot-contract-index.js`) — zero drift, one commit, express 4 + body-parser
  + axios, legacy `vercel.json`, no tests/CI/README/license/Node pin. Confirmed at
  source: the `currency` key is ignored (DEF-13 — $-figure on ₴-magnitude when rates
  are down), user fields are interpolated into `parse_mode: "Markdown"` (an unbalanced
  `_`/`*` in an address loses a valid order via Telegram 400 → relay 500), `cart.map`
  throws on malformed payloads (express HTML 500), Telegram `error.message` leaks into
  the 500 body, and the endpoint accepts unauthenticated POSTs while the public repo
  names the Vercel project.
- Contour ratified by the owner: full scope in ONE mixed-scope PR, driven through
  `/step` (not a bare `/feature`); engineering delegated to the planner → BD-1…BD-8
  ratified; smoke policy is the owner's own call (BD-8: single environment, real chat,
  TEST-labeled). The initiative system bootstrapped in this repo from the ai-shared
  canon (`initiatives/README.md` + addenda, `CLAUDE.md`, this initiative).
- Tooling fix en route: `step/SKILL.md` phase 4 still pointed the reviewer at the
  retired `/review` skill name; fixed to `/review-flow` (+ level pick) in `ai-shared`
  (`096234b`) — completes the retro rewiring.
- B1 prompt written (`step-b1-relay-rewrite-prompt.md`) and committed; executor agent
  (Opus, `/feature`, root tree) spawning next. First combat run of `/step` +
  `/review-flow` outside the shop repo.

## 2026-08-02 — B1 gate A: probes beat assumptions; seven rulings; BD-9

- The executor's research fleet produced two probe-verified corrections to the
  planner's own step prompt before any code: (1) a garbage `total` does NOT print
  `₴NaN` — `Intl` coerces, and `""`/`[]`/`null`/`false` render as `0,00 ₴`, a
  plausible FREE order the operator would pack (validation upgraded from hygiene to
  integrity); (2) the uk|en locale allow-list was never a crash guard (`Intl` throws
  only on structurally invalid tags), so the prompt's 400 bought outage risk, not
  safety. Also surfaced: axios→fetch non-2xx trap (the top regression vector — a
  straight port turns Telegram 400 into relay 200, cart cleared, order silently
  gone), Vercel deployment protection blocks preview POSTs (BD-8's post-merge smoke
  is the only smoke mechanically), `currencyDisplay: "narrowSymbol"` needed for the
  ₴ criterion, bot-token leak via logged fetch errors, `ORDER_RELAY_SECRET=""` must
  count as unset (a stray dashboard keystroke would 401 every live order),
  surrogate-safe clamping, and diagnosable Reject/Send result types (field NAMES
  loggable, values never).
- Gate rulings (planner, under the delegated envelope): 4096-budget handling IN B1 —
  clamp values generously and truncate the cart listing with an explicit "+N more"
  marker rather than ever rejecting a validated order (the charter's
  no-formatting-500 criterion covers oversized messages); `narrowSymbol` yes; empty
  `cart` → 400 and required contact fields mirror the shop's own `REQUIRED_FIELDS`
  (`additional` may be empty; cart `quantity` must be a positive integer); strict
  plain-decimal `total` stays (the probe table becomes the test table); tooling
  majors mirror the shop (typescript ^5, vitest ^3.2); locale degrades — BD-9, the
  one sanctioned deviation from the committed step prompt. The preview-bypass
  question is the owner's and non-blocking (parked on the board).
- Process note for the /feature retro: two research agents raced on one scratch
  artifact (one overwrite, recovered) — artifact ownership per agent next time.
