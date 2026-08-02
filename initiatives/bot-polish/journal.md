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
