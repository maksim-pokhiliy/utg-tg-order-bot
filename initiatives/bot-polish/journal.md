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

## 2026-08-02 — B1 review: the adversarial layer pays for itself on its first PR

- `/review-flow` deep on PR #1 returned REQUEST CHANGES with a genuine
  deploy-blocker no green signal had caught: **RF-1** — four extensionless relative
  imports + `"type": "module"` + `moduleResolution: "bundler"` typecheck clean, pass
  60/60 tests, build a READY preview… and the deployed function cannot LOAD:
  `@vercel/node` transpiles per-file (no bundling) and native ESM demands explicit
  specifiers — every live order would 500 the moment master deployed. Reviewer
  reproduced three independent ways (real `vercel build` + launcher import, tsconfig
  transpile + `import()`, and plain `node api/place_order.ts` on Node 24); planner
  spot-verified the premise at source. The class is invisible to the whole battery
  by construction — the ruling makes it compile-time forever (`nodenext`) plus a CI
  load-smoke of the real module.
- The refute stage earned its keep in BOTH directions: 12/15 findings CONFIRMED, and
  the scariest claim — "a valid order can be REJECTED for length" — was killed by a
  refuter reading TDLib sources (the 4096 limit counts code points; max reachable is
  ~3515). All three finder lenses AND the breaker had converged on that same wrong
  premise — convergence was shared error, not confirmation. Also refuted: the 4729×
  CPU-amplification framing (linear, ~1.3×/byte; the real issue is ~103× MEMORY),
  prototype pollution, CSRF.
- Confirmed and routed fix-now: prototype-chain crash via `locale: "constructor"`
  (naked platform 500 breaks the frozen error contract; needs null-proto map + a
  try/catch boundary the handler never had), padded-secret lockout (`" s3cr3t "`
  can never match any client header — the exact typo class the blank-check was built
  against, detonating at B2; fix is `trim()` at a single env-read boundary, same for
  the bot token), Telegram `200 {ok:false}` swallowed as silent success (buyer sees
  success, operators get nothing, zero log lines), unpinned cart-field escaping and
  contact-line mapping (mutations stay green — golden-message + escaping tests
  mandated), no fetch timeout, escape-before-clamp memory amplification (4 MB field
  → +455 MB RSS; regression vs bodyParser's 100 KB cap — pre-slice before escaping),
  UTF-16/code-point budget mismatch (premature zero-item degradation), lone
  surrogates (`.toWellFormed()`), and the relay domain statically serving the whole
  repo including `initiatives/` (`.vercelignore`). Logging ruling tightened while
  routing RF-4+RF-12: Telegram `error_code` only, never `description` — it can quote
  buyer data, and the standing no-PII-in-logs law wins; README aligned.
- Dropped/converted with reason: the length-rejection claim (refuted, nothing to
  fix), timing-oracle testability of `timingSafeEqual` (behaviorally untestable —
  converted to a source-presence pin per the repo's drift-guard idiom). Candidate
  counts honest: 70 pre-dedup across lenses → 40 reported → 18 after dedup, no caps
  applied; 33 breaker mutants, 32 killed pre-fix-round.
- Tooling notes for the retro (with the two from gate A): the reviewer's orchestrator
  spawned ~24 self-expiring `until $SECONDS` sleep-shells to poll its panel — agents
  don't know harness notifications wake them; codify "never poll subagents" in
  review-flow. And the breaker's first mutant run reported 33/33 SURVIVED due to its
  own ANSI-grep harness bug — it caught and fixed itself, but "mutant harness must
  assert APPLIED/NO-OP" belongs in the skill text.
