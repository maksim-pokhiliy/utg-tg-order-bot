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

## 2026-08-02 — B1 re-review: MERGE-READY bar one blocker; a planner ruling refuted before it shipped

- Re-review (standard + security lens) of the fix-round delta: all 18 prior findings
  land (13 HOLDS / 5 PARTIAL / 0 MISSING, no regressions introduced by the fixes),
  battery and CI green, and the platform settled two questions the reviewers could
  only infer — the broken `.vercelignore` form deployed ERROR while the fixed one
  deployed READY with one lambda, and RF-1's severity stands (a real `vercel build`
  emits per-file, no bundler). 22 new findings, no caps applied.
- **BD-10 withdrawn before ratification.** The breaker measured "under-budget"
  messages at 4285–6681 UTF-16 units and inferred Telegram counts UTF-16; the planner
  ruled to switch the budget unit on dominant-strategy grounds (safe under both
  readings) — and a refuter killed the premise with verbatim source: TDLib
  `MessageContent.cpp:4757` guards the bot path with `utf8_length` (CODE POINTS);
  `utf8_utf16_length`, the one carrying the astral adjustment, serves entity offsets
  only. The two were conflated. Code points stay; the budget is airtight by
  construction (max 4092 raw against 4096). Second round running that the 4096 limit
  bred a converged-on wrong premise caught only by refutation — convergence between
  finder lenses and a breaker is not evidence.
- Blocking: **RF-19** — the RF-9 `.vercelignore` fix created a deploy-time allowlist
  narrower than the compile-time module graph, two hand-maintained sources of truth
  with nothing tying them. A new `lib/*.ts`, imported correctly, passes typecheck,
  smoke, prettier and 85/85 while `@vercel/nft` merely WARNS and emits a lambda that
  cannot resolve it — RF-1 reachable through a door this diff opened. Fix routed:
  derive the shipped top-level dirs from the smoke emit and assert each ships.
- Also routed fix-now: the handler try/catch is deleteable with 85/85 green, and the
  test that appears to cover it never reaches the boundary (RF-20); four budget tests
  assert the bound in UTF-16 while production budgets code points (RF-21); the
  constant-time pin is satisfied by the import line alone (RF-24); no distinct log
  event for "HTTP 200, verdict unreadable" — the one state where the message probably
  WAS delivered while the shop is told it failed, so a buyer retry duplicates the
  order (RF-22); newline structure-forgery in single-line fields (RF-25 — collapse
  where newlines are never legitimate; `additional` keeps its line breaks after the
  refuter proved contact inputs strip newlines browser-side and `title` has zero buyer
  influence); the `.env.*` glob (RF-23); and from the breaker's own report an
  unbounded `total` still printing `∞ ₴`, `quantity: 1e21` rendering `1e+21` as the
  single unescaped interpolation, an accepted empty `productUrl`, and the untested
  `AbortError` arm. README/PR-body truth fixes (RF-38/RF-39): the PR prose says six
  mutation proofs above an eight-row table and misreports one mutation's failure
  count — the claims-audit stage catching the change's own evidence is exactly why it
  exists.
- Deferred: BDEF-2 (module hygiene batch — dead/write-only surface, TDZ hazard,
  untyped env name, deployed tsconfig including test paths, smoke leftovers) and
  BDEF-3 (no idempotency — an ambiguous upstream outcome can duplicate an order on a
  retry; real dedup needs an idempotency key in the payload, i.e. a shop+bot contract
  change, so it gets its own step rather than riding B1).
- Breaker coverage: the breaker DID run (39 mutants, 31 killed, 4 genuine gaps, 14
  findings) and its report reached the PLANNER directly, but its reply to the
  orchestrator failed to route — it addressed the peer by agent TYPE instead of by
  address — so the re-review honestly marks its own breaker section as a gap. No
  re-run ordered: the content exists and the planner folded it into the fix round.
  Third tooling lesson of this step, one root cause: agents do not know the harness
  wakes them, so they poll, wait, or misaddress. To codify in review-flow: never spawn
  wait/poll shells, address peers by address, and report from what you have when a
  peer goes silent.

## 2026-08-03 — B1 micro-fix round planner-verified; the pipeline survived a host freeze

- The /step session died mid-pipeline: the WSL VM froze right after the executor
  pushed the micro-fix round (`0b64b48`, 20:40), before planner verification. A fresh
  planner session resumed cold from board + git + PR #1 alone and lost nothing
  load-bearing — the docs-on-master discipline is what made that possible; the only
  casualty was the dead session's scratch (review artifacts), all of it already
  promoted. The freeze itself is codified as the resource-budget section in
  `step/SKILL.md`; this session ran every heavy command under the cgroup fence.
- Micro-fix delta verified item by item against the routing: RF-19 → the
  `.vercelignore` test now derives the shipped top-level dirs from `tsc --listFiles`
  over the smoke tsconfig and asserts each ships; RF-20 → the boundary test mocks a
  module the handler calls directly, so the try/catch is no longer deleteable;
  RF-21 → all budget assertions in code points; RF-22 → `ack_unreadable` is a
  distinct state and log event, a body-read TimeoutError is classified as a timeout,
  and the AbortError arm is covered; RF-23 → `.env.*` + `!.env.example`; RF-24 → the
  pin requires the `timingSafeEqual(digest(` call shape and bans `!==` variants;
  RF-25 → newlines collapse in contact fields, titles and URLs while `additional`
  keeps its breaks; breaker items → `total` capped at 20 digits, `quantity` at
  100 000, empty `productUrl` rejected, and quantity now rendered through the same
  escape+clamp path as every other value.
- Planner verification, independent of every report: battery re-run locally under
  the fence (format:check, typecheck, load-smoke, vitest 97/97), the RF-19 guard
  adversarially spot-checked (a stray `lib/` module imported from `src` turns it
  red; probe reverted, tree clean), PR #1 file list free of planner artifacts, CI
  battery SUCCESS on HEAD `0b64b48`, preview READY.
- PR-body truth pass (the RF-38 class, second catch): "97 tests across ten files" →
  "nine files" — vitest counts 9 test files; the 13-row mutation table and its
  prose already agree. Fixed via `gh pr edit` per the skill's stale-description
  rule.
- B1 now waits at the OWNER's merge gate with a morning checklist: the parked
  preview-bypass decision (non-blocking), squash-merge, prod deploy verify, BD-8
  TEST-labeled smoke, docs promotion here and in the shop ledger. Note for the gate:
  the merge also moves the function runtime to Node 24 (`engines` overrides the
  dashboard's 20.x) and migrates the project off legacy `builds`/`routes` config —
  both called out in the PR body.

## 2026-08-03 — B1 CLOSED: merged, prod-verified, smoked; the dead-chat incident

- The owner merged PR #1 (`2a1dea3`, merge commit, CI green on the merge SHA) and
  pruned the remote branch. Planner prod verification on the canonical domain
  (`telegram-bot-server-sage.vercel.app`): deploy READY with one lambda; GET → 405
  and empty-POST → 400 with the frozen body on BOTH routes. The new code is
  demonstrably live — the old express app answered that same probe with an HTML 500
  out of `cart.map`.
- BD-8 smoke first FAILED: 500 with `telegram_send_rejected {status:400,
  errorCode:400}`. Not a regression — the operators' chat had died, and the old
  relay would have failed identically (while leaking `error.message` to the caller).
  Runtime logs across the whole retention window show ZERO real orders, so nobody
  was hit and nobody had noticed; the structured-reason logging shipped hours
  earlier turned the diagnosis into a three-minute log read. HTTP 400 (not 401/403)
  cleared the token and the bot's standing up front; a locally rebuilt byte-exact
  message cleared `can't parse entities`; the owner's `getChat` probe confirmed the
  chat itself was gone.
- Resolution: a new private operators' group, bot re-added, `TELEGRAM_CHAT_ID`
  updated in the production env, redeploy, smoke → 200 and the owner saw the
  message land with the expected formatting (uk+UAH path; the rates-down en+UAH
  path stays pinned by the golden/endpoint tests — no second live message needed).
  The new chat id lives ONLY in the Vercel env — the same recorded-nowhere policy
  as `PLACE_ORDER_URL`.
- Operational note: the new group is a basic group; a future supergroup upgrade
  CHANGES the id and reproduces exactly this failure. The log event names the fix.
- The bot token crossed the owner's terminal in clear text during diagnosis;
  rotation via BotFather recommended (owner's call, nothing committed anywhere).
- The parked preview-bypass question retires for B1: the merge took the
  build-green + immediate-smoke road and the smoke did its job — reopen only if a
  future bot step wants pre-merge functional checks.
- Closed out: board B1 ✅ / B2 next, `CLAUDE.md` de-staled (express-era "current
  state", `ORDER_RELAY_SECRET` "lands in B1"), DEF-13 progress note promoted to the
  shop ledger (closure itself stays on B2), and the shop's stranded `dfca818` docs
  commit — left unpushed by the freeze — pushed along with it.

## 2026-08-06 — B2 closed: the relay authenticates; B3 opened as the initiative's critical path

- B2's code half shipped in the shop repo as ua-checkout step U0 (PR #20 `bb3f866`,
  three review rounds, 611 units). The relay side needed no code — B1's
  enforcement-if-configured was already waiting.
- Rollout executed end to end: `ORDER_RELAY_SECRET` generated server-side and set on
  BOTH Vercel projects as Sensitive/Production, shop first (bound by the merge deploy),
  relay second. **BD-4's order held**, with one correction learned the hard way: setting
  an env var does not enable it — Vercel binds env only to the NEXT deployment, so each
  project needs a redeploy.
- Verified live **without sending anything to the operators' chat**: the relay answers
  401 with no header and with a wrong header, and 400 with the correct one (validation
  reached ⇒ auth passed); then an invalid probe payload POSTed to the PROD shop route
  came back 400, not 401 — proving the shop's own header is accepted, while the payload
  died at validation before Telegram was ever touched.
- **Incident (planner error, ~3 min, no customer impact).** Activating the relay env, the
  planner ran `vercel redeploy` against the first URL in `vercel ls --prod`, assuming
  newest-first. It was a pre-B1 legacy build: the alias moved to the old Express
  implementation and every `POST /place_order` answered 500 (`Legacy server listening…`,
  `Cannot read properties of undefined (reading 'map')`). Restored with `vercel promote`
  to `dpl_FhXuNF…`; the correct redeploy then activated enforcement. Runtime logs
  grouped by status over six hours show exactly the planner's ten probes and **zero
  200s** — no real order entered the window. Lesson recorded in `deferred.md` and the
  board: resolve the production deployment by id from its logs (`branch=master`), never
  by list position.
- **BD-5's premise retired**: `PLACE_ORDER_URL` is no longer unknown — it is the bare
  deployment URL (no custom domain, no trailing slash, 405 with zero redirects), and
  `vercel.json` rewrites `/place_order` to the `api/` function, so this was always one
  guarded function reached two ways. The decision stands as insurance.
- Shop-side hardening that protects this relay too, from the same PR: the shop refuses
  redirects on the relay fetch (a followed cross-origin 307 hands hop two both the
  secret and the customer's whole order), guards the secret as a legal header value
  (otherwise `fetch` throws the secret into the logs and every order 500s), and strips
  trailing slashes off the relay origin (Vercel 308-normalizes `//path` before app code
  runs — under the redirect refusal that would be a total outage).
- **BDEF-1 CLOSED** here; **DEF-13 CLOSED** in the shop ledger (its condition was the B1
  smoke plus this promotion).
- Next: **B3** — dual-accept v1 + v2 (shop `requirements.md` §5, shop D-3/D-9). It is
  the critical path: the shop cannot change a checkout field until it lands. Decide
  BDEF-3 (idempotency key) there — B3 is the contract window, and the shop must send
  the key if it exists.

## 2026-08-06 — B3 closed: the relay dual-accepts v2; B4 inserted ahead of persistence

- PR #2 (`66134ee`) merged. The relay accepts the shop's v2 envelope alongside v1:
  `version` 2 selects v2, absent or 1 selects v1, anything else answers an honest
  `version_unsupported` rather than falling into the v1 decoder and blaming seven
  flat fields it never had. Unknown KEYS are ignored at every level, so future
  additive contract fields can never be breaking — that rule is now the load-bearing
  one for the whole shop-side roadmap. 97 tests → 285.
- **How v1 byte-identity was proven**, and it is worth reusing: a golden corpus of 12
  messages was rendered by MASTER-COMPILED code in a separate worktree and committed
  as the FIRST commit of the branch, before a single source file changed — so the
  baseline could not be fitted to the new code. Two independent confirmations
  followed: a re-render of all 12 fixtures with master's code (12/12), and a
  differential fuzz of 80,000 generated v1 orders master vs branch with **zero
  unexplained divergences**.
- Plan-gate rulings (planner): §3 governs which fields the relay may REQUIRE while §5
  governs shape — the relay must not reject on a missing `source`,
  `warehouse_number` or `contact_channel`; `contact_channel` takes any non-empty
  string, verbatim; `warehouse_number` accepts a string or an integer; no
  cross-validation of `locale` against `delivery.mode` (that rule would reject every
  real order during the shop's U5a window, where `generic` ships under `uk` by
  design). The gate also caught a genuine contradiction between §3 and §5 in the
  shop's own spec, which was fixed at the source rather than answered here.
- **The independent deep review (72 pre-cap candidates → 10 findings) hit the step's
  own argument three times**, and all three were fixed:
  1. The byte-identity gate was blind in a ~120 code-point band — the message budget
     could be cut from 4096 to 3990 with the whole battery green, silently dropping
     order lines. Eight limit mutations survived. Boundary fixtures now sit exactly
     on each shared clamp; a ±1 mutation reddens, verified by the planner personally.
  2. Style-only v2 fields failed CLOSED on a wrong TYPE, contradicting this repo's own
     ratified BD-9 — `contact_channel: {label, value}` (a routine single-select bug,
     and exactly what the shop is about to write) killed the whole order. They now
     degrade to absent, matching how `idempotency_key` already behaved: two fields of
     identical contract status had opposite handling in one file.
  3. The corpus provenance assertion was vacuous — it compared a hardcoded string, so
     regenerating from REGRESSED code passed 270/270. The capture commit is now a
     literal in the test: a re-baseline requires editing a checked-in constant.
- Deferred with reasons, not silently: BDEF-6 (structural tails — the v1 path routing
  through `*V2` modules and ~16 duplicated validation lines; they dissolve as a side
  effect when v1 is dropped), and the BDEF-5 scope widened to include Unicode
  math-bold after the review proved the "genuine bold line" is not a forgery guard.
  The docs that claimed otherwise were corrected in the same round.
- **Sequencing changed on evidence.** The review quantified BDEF-4 against the new
  code: a v2 free-form order reaches 7150 UTF-16 units at 3830 code points, +74% over
  Telegram's real limit and a wider radius than v1 ever had. So **B4 is now the
  width/character-truth step and gates the shop's U5a merge**, and persistence moves
  to B5. Not losing an order beats recovering it.
- Prod-smoked after the merge by the planner: 401 without the relay secret, both
  decoders answering, and **both a v1 and a v2 order delivered live** to the
  operators' chat (TEST-labeled, 200/200). v1 is what the live shop sends today, so
  proving it still delivers end to end was the point — byte-identical rendering does
  not prove a deployed function works.

## 2026-08-08 — B4: the fix shipped, the reason for it did not

- **B4 CLOSED** (PR #3 `7594e94`, squash-merged, prod deployed, sanitizer smoke sent).
  One sanitizer over payload-derived strings only — well-formedness, NFKC, `\p{Cf}`
  strip — plus the whole message layer unified on UTF-16. `src/messageV2.ts` needed
  ZERO changes: every v2 string already flowed through the v1 field doors, which is the
  best evidence the B3 boundaries were drawn in the right place. 350 tests, up from 285.
- **The premise died mid-flight, and that is the entry's point.** The step was justified
  by a table the planner measured personally: a saturated v1 order at 4092–4203 raw
  UTF-16 against Telegram's 4096, and 7150 for v2. The independent review went to source
  instead of to the ledger: the Bot API applies 4096 to the text AFTER entities parsing,
  and TDLib counts code points there — while roughly 980 units of our message are
  `<b>`/`</b>` markup that parsing consumes. A live probe settled it: an order measuring
  **4178 raw UTF-16 / 3419 parsed code points was DELIVERED** (relay 200). No order was
  being lost. The 68%-over-limit sweep measured a quantity Telegram does not check.
- **Process lesson, named plainly.** The planner measured OUR side of the inequality to
  the unit and took the OTHER side — the external ceiling — from a ledger sentence
  written during an earlier review. Measuring one side precisely while assuming the
  other is worthless. The decisive test was one POST and cost two minutes; it was run
  LAST, after an executor round, an xhigh review round and a fix round, and after the
  false framing had been written into two ledgers and the board. **Reconnaissance that
  gates a step belongs before the step prompt, not after the PR.** The same shape is
  already queued on Нова Пошта: U4 was built against substitute fixtures because the
  portal 403s, and the live-key check is scheduled only at U7 — after U5b builds UI on
  the assumed response shape. Pulling that forward is the concrete consequence.
- **Why it merged anyway, on a narrower claim.** Parsed ≤ raw and code points ≤ UTF-16,
  so raw UTF-16 upper-bounds all four candidate metrics: it is the only accounting safe
  under every reading, while the old raw-code-point budget is unsafe if the ceiling is
  parsed UTF-16. Cost: 0–1 cart lines. What remains unknown — raw code points vs parsed
  length — is BDEF-8, and settling it would reclaim ~980 units of cart room.
- **BDEF-5 is untouched by any of this and fully earned.** Bidi, zero-width, math-bold
  and fullwidth no longer survive a field. Bold in an order message now means the relay
  wrote it, so the `Address Source` line is a real forgery guard rather than a disclaimed
  one. Verified live: an order carrying an RLO, math-bold imitating that very line,
  zero-width padding, a ZWJ family emoji and a fullwidth `＜b＞` rendered clean.
- **The review earned its keep twice over.** 28 candidates pooled before the cap, 12
  reported plus a named 16-item tail. It killed the premise, and it proved by mutation
  that four properties the PR itself called load-bearing were pinned by nothing —
  including the ONE test covering a ruling made two turns earlier, which could not fail
  because it asserted against a label the relay renders itself.
- Planner verification: battery re-run by hand, corpus fixture blob compared across four
  refs (identical), and a mutation planted at the sanitize/escape boundary — 4 tests red,
  restored byte-identical.

## 2026-08-18 — B5 closed: orders are durable; the bot board is complete

- **B5 CLOSED** (PR #4 `1d31e20`, squash-merged, prod deployed). Every decoded order is
  written to Neon BEFORE the Telegram send; a confirmed-delivered twin inside the window
  suppresses the retry; a dead store provably costs an audit row, never an order. 350 →
  458 tests; a 34-row mutation table; closes BDEF-3 and executes BDEF-9.
- **Probes came FIRST this time** (the B4 lesson, applied): before any design was frozen,
  the planner measured Neon SQL-over-HTTP from two vantage points on the LIVE database —
  cold resume sub-second and repeatable (863/921/925/1131 ms across nine-minute,
  nine-day and one-hour idles), warm p50 98 ms from iad1, error shapes captured verbatim,
  1 MB params passing, and the dedupe CTE validated end-to-end on the production table
  before the executor prompt existed (`b5-neon-probe.md`). BD-10 (plain `fetch`,
  zero-dependency stands) and BD-11 (suppress only confirmed-delivered twins; hash
  leads, key corroborates, 30-minute window; ambiguous outcomes are NOT delivery; v1
  never suppresses) were ratified on those numbers, and the pre-send budget was amended
  4000 → 2000 ms at the plan gate on the observation that a retry never meets a cold
  database — the first attempt is what wakes it.
- **The plan gate falsified two prompt claims at source** — no `maxDuration` pin ever
  existed (the stronger three-budget inequality was written instead), and `jsonb` would
  have silently rejected exactly the hostile payloads the audit exists for (U+0000, lone
  surrogates — both accepted by the decoders), so the durable column is TEXT. The
  executor's "SQL narrows, TypeScript decides" ruling made the dedupe laws mutation-
  provable in a repo whose CI cannot execute SQL; the planner live-validated the
  VALUES-subquery and the `attempt_id` mark-upsert at the gate rather than trusting
  either.
- **The independent review was the only independence this branch got, and it earned it.**
  The executor's internal refute/break phases never ran (its finder panel stalled the
  session's one watchdog kill); the fresh-context deep review pooled 67 candidates →
  19 findings, three blocking: the connection string decided WHICH HOST received the
  database password (now pinned to `.neon.tech` — the probe had proven the host is
  cosmetic for routing, so the pin costs nothing); the store's timeout was structurally
  unobservable by any test (deleting the `signal:` line shipped 441/441 green while a
  hung Neon killed the invocation at `maxDuration` — a Law-1 violation the whole battery
  blessed); and the mark statement's VALUES ordering was unpinned. It also falsified the
  size-cap deferral premise in the shop's own source: the forwarding route is public and
  attaches the relay secret for any caller. The delta pass then caught a regression the
  fix round itself introduced (the new size cap ran ahead of the config gate, breaking
  dark-when-unset) — the third consecutive step where reviewing the fixes paid.
- **Planner verification stayed independent of every report**: battery re-runs at each
  round, the PR file list clean of planner artifacts, byte-identity of untouched test
  support confirmed by blob SHA, and the three decisive mutations re-proven by hand
  (gate reorder, `timeoutMs * 100`, cap raise — each red on exactly one named test,
  each restored to a clean tree).
- **Rollout order held**: migration applied to production Neon BEFORE the merge, with
  both shipped statements executed verbatim against the real table (including the raw
  JSON number bound to `$7`); `DATABASE_URL` was already bound, so the merge was the
  enablement. BD-8 smoke ran THROUGH THE PRODUCTION SHOP ROUTE (the planner holds no
  relay secret — the shop attaches it, which exercised the full live chain): secretless
  direct POST → 401; order A delivered (message 12, 2.96 s — the full cold chain);
  byte-identical retry → 200 in 0.66 s with NO message and `dedupe_of` set; the
  edited cart under the SAME key → DELIVERED (message 13) — BDEF-9's exact scenario,
  proven on production rows. All three dispositions verified in SQL; the smoke rows were
  then deleted and the table left at zero for real orders.
- **Tooling lessons for the retro, both real incidents**: an executor must never block a
  turn waiting on its subagents (the B1 lesson recurred one level up — the stream
  watchdog killed a healthy run whose panel was still grinding); and scratch tooling
  needs session-unique names plus mutations that PROVE they landed — the reviewer's
  harness overwrote the executor's mutation script mid-session, and every "gate" it ran
  afterwards silently mutated nothing until a before/after grep exposed it.
- Carried forward: BDEF-10 (the payload column is a PII datastore with no retention),
  BDEF-11 (the relay authenticates as schema owner — a scoped role is pending planner
  ops), the shop-side exposure flag for the U6 window, and the BDEF-2 hygiene batch
  grown by the review's duplication list. BDEF-2 item (2) closed en route — the env-name
  union makes a `DATABSE_URL` typo a compile error instead of a permanently dark store.
