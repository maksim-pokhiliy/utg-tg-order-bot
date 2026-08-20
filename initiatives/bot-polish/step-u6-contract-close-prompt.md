# Step U6 — the relay drops v1, and v2 becomes the only contract (executor prompt)

---

/feature Step U6 of the paired ua-checkout / bot-polish work: **delete the v1 order path from
the relay entirely** so that v2 is the only shape this service knows, and let the structural
tails that were waiting on exactly this moment resolve with it. This relay takes REAL volunteer
orders and auto-deploys `master`.

**This is a deletion step. Deletion is less reversible than an edit — the value of the step is
that nothing v1-shaped is left, not that something new is added.**

## Why this is safe, established before this prompt was written (D-12)

Do not re-derive these and do not add safety valves — the owner has ruled explicitly against a
staged rollout, a compatibility shim, a deprecation window or a "v1 answers an error for a
while" phase. Delete outright.

1. **Auth precedes the body.** `api/place_order.ts` calls `isAuthorized` (line ~130) BEFORE
   `readBody` (line ~135), and `src/auth.ts` requires a matching `x-relay-secret` whenever
   `ORDER_RELAY_SECRET` is set. That variable IS set in production (verified on the Vercel
   project `telegram-bot-server`: Sensitive, Production). So a caller without the secret is
   rejected before the payload version is ever parsed.
2. **Only one holder of that secret sends orders, and it sends v2 only.** The shop has had
   `ORDER_PAYLOAD_VERSION = 2` since U5a and carries no v1 composer; its own contract test pins
   `version: 2`.
3. **The `orders` table cannot testify and must not be quoted as if it could.** It holds zero
   rows: B5's smoke rows were deleted deliberately (journal 2026-08-18), and forensic counters
   confirm it — identity high-water mark 9, lifetime 6 inserts / 6 deletes / 0 live. The
   instrument exists but has no data. **An empty table is not evidence of absence.**

## Scope

**Delete, root and branch:**

- `src/payload.ts` and `src/message.ts` (the v1 decoder and renderer) and every module that
  exists only to serve them.
- `tests/fixtures/v1-golden-corpus.json` and `tests/v1-golden-corpus.test.ts`. That corpus
  exists solely to prove v1 output stayed byte-identical to a legacy commit; with v1 gone it
  pins nothing, and a fixture that pins nothing is worse than no fixture — it reads as
  coverage. Same judgement for any other v1-only test file.
- Every v1 branch, type, helper and fixture shape left in the shared test support
  (`tests/support/envelope.ts`, `tests/support/saturation.ts`) and in the suites that currently
  exercise both versions.

**Resolve, because deleting v1 is what unblocks them:**

- **BDEF-6** — the surviving path is named `payloadV2`/`messageV2` for a v2 that is now the only
  v2 there is: rename to `payload`/`message`; give `RejectReason` its proper home instead of
  leaving it in a module whose name no longer describes it; and collapse the ~16 lines of tail
  validation (locale → total → currency → cart) that were copied between the two decoders rather
  than shared. The copy existed because the two paths had to stay independent; that reason dies
  here.
- **BDEF-7** — the B4 review's tail: the three dead exports in `tests/support/saturation.ts`,
  the two corpus test names that overclaim their bodies (moot if those files go — say so rather
  than pretending you fixed them), the self-referential set-size assertion, the untested
  `rendered.length === 0` branch, and the alias duplication.
- **BDEF-2** — the module-hygiene batch, items (1) and (3)–(7): dead/write-only surface, the
  deployed `tsconfig` including test paths, `.smoke-build` left behind on a failed compile, and
  the request stubs that override `json()` so the real parse path is never exercised. Item (2)
  is already closed.

**Explicitly KEEP — deleting these would be over-reach:**

- **The `schema_version` column and everything that writes it.** It is B5's instrument and the
  only way a future version change can be observed in production data. It will always read `2`
  now; that is correct, not redundant.
- The `/place_order` path, the `200` + `{"status":"success"}` success semantics, the auth
  posture, the Neon store and its dedupe laws, and the Telegram sender's behaviour beyond the
  removal of v1 rendering. All sacred per the charter.
- **Zero runtime dependencies.** This service has none and gains none.

**Out of scope (hard fence):** the shop repo (`../utg-2.0`) — do not open it, edit it or stage
anything from it; BDEF-8 (the Telegram width metric); BDEF-10 and BDEF-11 (retention and the
Neon role — planner-owned ops); any change to the message layout the operator sees.

## The contract, which is the point of the step

`tests/support/contract.ts` is this repo's half of a paired contract with the shop's
`tests/components/checkout/payload.test.ts`. After this step it must pin the v2 envelope as the
ONLY accepted shape, and its assertions must be about v2 being required — not about v1 being
absent by accident. Read the shop's file (read-only, do not edit it) so the two halves describe
the same shape in the same terms.

## Acceptance gates — verify and report each

- The full battery green: `npm run format:check`, `npm run typecheck`, `npm test`.
- **`grep -rin "v1\|legacy\|payloadV2\|messageV2" src/ api/ tests/ scripts/ README.md` returns
  nothing that still refers to a live v1 path or a stale V2 alias.** Report the exact command
  and its output in the PR body. Anything that legitimately survives (a journal quote, a
  historical note) is named and justified.
- A rejected v1-shaped body is a plain `400` through the ordinary validation path, with no
  special-casing and no bespoke v1 error — it is simply an unrecognised payload now.
- Test count before and after, with the drop attributed: say how many tests were deleted
  because their subject was deleted, and confirm no v2 assertion was lost in the sweep.
- **Every behavioural change mutation-proven**: one surgical, typecheck-valid mutation per
  claim, on a COMMITTED tree, each reported with the single named test it reddens and each
  reverted. A mutation reddening dozens proves the mutation was wrong, not that the gate is
  strong. If a mutation SURVIVES, first ask whether the environment can even produce the input
  that separates the two versions before blaming the tests.
- README updated: it documents the contract, and the contract just changed.

## Resource budget (WSL — mandatory)

Every heavy command runs inside
`systemd-run --user --scope -q -p MemoryMax=4G -p MemorySwapMax=1G -- <cmd>`, with
`NODE_OPTIONS=--max-old-space-size=3072` on builds. Heavy commands strictly one at a time.

## Constraints

- No comments in code; remove existing comments in any region you edit.
- No skip flags (`--no-verify`, …) — root-cause failures instead.
- Branch from `master`, PR against `master`. Commits and PR text in English, first person,
  lowercase subject, no assistant signatures anywhere.
- Never stage `CLAUDE.md` or anything under `initiatives/`.
- **Never POST to the deployed relay, the shop, any Vercel URL, the Telegram API or the Neon
  database.** The planner owns every live probe.
- The PR body carries the owner's verification checklist as `- [ ]` checkboxes.
