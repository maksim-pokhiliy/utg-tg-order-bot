# Step B4 — message-width truth (executor prompt)

---

/feature Step B4 of the bot-polish initiative: make it structurally impossible for this relay to compose a message Telegram will reject, and stop characters in a rendered field from lying to the operator. Closes BDEF-4 and BDEF-5. This relay is LIVE PRODUCTION taking real volunteer orders; the defect below is not hypothetical, it is live on `master` right now, and when it fires the order is LOST — Telegram answers 400, the relay surfaces 500, and there is no queue to replay from.

**The defect, measured (planner, on `master`, 2026-08-08 — treat these as given, do not re-derive them from scratch, but DO reproduce the first row as a failing test).** Our budget counts CODE POINTS; Telegram counts UTF-16 units. The undercount is not contributed by the customer — it is contributed by **our own emoji labels**, which are surrogate pairs: roughly 3 unaccounted UTF-16 units per rendered cart line (🏷️ 🔢 🔗) plus about 10 for the header.

| v1 order (what the live shop sends today)                    | UTF-16 | vs 4096         |
| ------------------------------------------------------------ | ------ | --------------- |
| saturated cart, realistic long catalog titles                 | 4092   | 4 units under   |
| saturated cart, short titles (`Товар N`, 60 items)            | 4153   | **over**        |
| the same with one astral character per title                  | 4203   | **over**        |
| v2 free-form order (measured by the B3 review)                | 7150   | **+74%**        |

So the honest statement is NOT "an emoji-heavy order is at risk". A plain Ukrainian order with nothing exotic in any field already sits four units from the cliff at cart saturation, and which side of the limit it lands on is decided by catalog data we do not control. v2 is far past it, and stays dormant only until the shop's U5a ships — which is why this step lands first and gates that merge.

**Context (read, never edit or stage).** In THIS repo: `initiatives/bot-polish/` — `charter.md`, `state.md`, `decisions.md` (BD-1…BD-8), `deferred.md` (BDEF-4 and BDEF-5 are what you are closing; BDEF-2 lists numbered hygiene items, some of which may be cheap riders here). The code is `src/message.ts` (every length policy in the project lives here: `MAX_TELEGRAM_TEXT_LENGTH`, the per-field limits, `countCodePoints`, `clampEscaped`, `field`, `singleLineField`, `composeMessage`) and `src/messageV2.ts` (the v2 header and its own field limits, composed through the same `composeMessage`). The decoders (`src/payload.ts`, `src/payloadV2.ts`, `src/delivery.ts`) cap nothing string-shaped except the numeric `total` — width policy is entirely a message-layer concern, and that fence should hold.

**Process gate.** You run headless under a planner session. Stop after your plan & design stage and END YOUR TURN with the complete plan-gate summary. Expected proposals:

- the exact composition order of the sanitizer and where it attaches (`field` / `singleLineField` / both), including where the existing `MAX_ESCAPE_EXPANSION` pre-slice sits once NFKC can EXPAND a string — state plainly which step is the correctness gate and which is only a work bound;
- whether `clampEscaped`'s current semantics (result may be `limit + 1` because the ellipsis is added past the limit, pinned by an existing test) survive the unit change or get restated, and how you keep the slice on a code-point boundary so a surrogate pair is never split;
- whether a final exit clamp inside `composeMessage` is worth it as a belt-and-braces net, arguing BOTH ways: it makes the invariant unconditional, but a naive clamp can cut inside an HTML entity or inside a `<b>` tag and earn a 400 for a different reason ("can't parse entities"). If you propose one, it must be HTML-safe by construction. If you propose none, say what proves the invariant instead;
- how you prove the invariant for a shape nobody has written yet — a future field added to the v2 header must fail a test, not production;
- which BDEF-2 items, if any, are cheap enough to ride along.

**Scope:**

1. **One unit of measure — UTF-16.** Every budget and limit comparison in the message layer moves from code points to UTF-16 units: `composeMessage`'s budget, the omitted-marker allowance, the per-item cost, the separator cost, and the per-field clamps. Slicing still respects code-point boundaries; only the counting changes. `countCodePoints` has four test consumers today, so decide deliberately whether it survives as a helper or goes.
2. **The exit invariant is proven, not assumed.** A saturation test for BOTH versions — every field at its limit, astral content, a cart large enough to trigger truncation — asserting the composed message is `<= 4096` UTF-16 units. Plus a structural test that the sum of the v2 header's field limits, its labels and the marker allowance still leaves the cart loop a positive budget, so adding a field later trips a test.
3. **Sanitize input, never output.** One sanitizer applied to payload-derived strings ONLY: well-formedness (`toWellFormed`), NFKC normalization (this is what folds Unicode math-bold `𝐓` → `T` and fullwidth lookalikes, closing the forgery half of BDEF-5), stripping of format/invisible controls (`\p{Cf}` — bidi overrides and isolates, zero-width joins and spaces, soft hyphen, BOM), then the existing newline collapse, HTML escape and clamp. **Our own generated text does not pass through it**: labels, the `Intl` currency output in `totalLine`, quantity digits. That boundary is load-bearing — NFKC over the `Intl` output would collapse the non-breaking space inside "46 200,00 ₴" and move every golden fixture for no reason.
4. **The golden corpus keeps its pin.** `tests/fixtures/v1-golden-corpus.json` is captured from the legacy pre-rewrite commit `40ca4c5d` and means "we still behave like the code that was in production before the rewrite". Re-capturing it from your own output would destroy that meaning — **do not run `npm run capture:v1-corpus`, and do not touch `capturedFrom`/`capturedFromCommit`.** Instead, B4 adds a SECOND named, justified divergence beside the existing line-separator one. Exactly two of the twelve entries may move, and the planner has already identified them: `lone-surrogate-and-astral` (its `𝕏` folds to `X`) and `truncated-60-item-cart` (the UTF-16 budget cuts one item earlier and bumps the "+N more positions" count). **If any of the other ten entries changes, that is a defect in your sanitizer, not a re-cut — stop and fix the cause.** Each divergence gets its own explicit test naming what changed and why it is intended.
5. **State the earned property.** After this step, bold text in an order message means the relay wrote it: math-bold can no longer forge the `Address Source` line that tells an operator whether an address came from the carrier's directory or was typed by hand. Correct the docs that currently disclaim that guarantee (the B3 work explicitly recorded that the genuine bold line was NOT a forgery guard — after B4 it is, and only bidi/math-bold removal is what makes it true).

**Out of scope (hard fence):** the decoders (`payload.ts`, `payloadV2.ts`, `delivery.ts`) — no new validation, no new reject reasons, no length caps migrating into them; `src/auth.ts`; `src/telegram.ts` beyond receiving a shorter string; the v2 contract shape (adding, renaming or removing a payload field); dropping v1; persistence and idempotency (that is the next step, B5); new dependencies. Two deliberate NON-goals, so nobody invents them as findings: grapheme-cluster-aware truncation (cutting inside a ZWJ emoji sequence is cosmetic, not an order-loss path), and any limit on combining-mark stacking ("Zalgo") — that is a rendering nuisance, not a forgery. Never stage `CLAUDE.md` or anything under `initiatives/`.

**Acceptance gates (verify and report in the PR test plan):**

- The full battery green (typecheck, tests, format check) plus whatever CI runs.
- A repro test that FAILS on `master` and passes on your branch, reproducing row one of the table above: a plain-Ukrainian v1 order whose composed message exceeds 4096 UTF-16 units today.
- The saturation tests from scope 2, for v1 and v2.
- Bidi, zero-width and math-bold characters, fed through every user-controlled field of both versions, do not survive into the message — pinned by tests, including the warehouse-label bidi case from BDEF-5 (an embedded RLO making branch "No. 43" read as "No. 34").
- Ten of the twelve golden entries byte-identical; the two divergences named, justified and pinned.
- No secret, no env value and no raw request data reaches a response body or a log line.

**Resource budget (WSL — mandatory).** Every heavy command runs inside `systemd-run --user --scope -q -p MemoryMax=4G -p MemorySwapMax=1G -- <cmd>`. Heavy commands strictly one at a time. If `systemd-run --user` is unavailable, say so in your report and apply the diet plus sequencing alone.

**Constraints:**

- No comments in code; remove existing comments in any region you edit.
- No skip flags (`--no-verify`, …) — root-cause failures instead.
- Match the existing style exactly: plain TS, explicit types, no classes, the established validation and escaping idioms.
- Branch from `master`, PR against `master`. Commits and PR text in English, first person, no assistant signatures anywhere.
- **Never POST to the deployed relay, the shop, or any Vercel URL.** Tests run locally against stubs; the planner owns every live probe.
