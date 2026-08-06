# Step B3 — the relay dual-accepts the v2 order envelope (executor prompt)

---

/feature Step B3 of the bot-polish initiative: teach the relay to accept the shop's **v2 order payload** alongside today's v1, and render each delivery mode into the operators' Telegram message. v1 must keep working byte-identically — the live shop still sends it, and it will keep sending it until its own follow-up step flips. This relay is LIVE PRODUCTION taking real volunteer orders: a regression here silently loses orders, and there is no queue to replay them from.

**Context (read, never edit or stage).** In THIS repo: `initiatives/bot-polish/` — `charter.md`, `state.md`, `decisions.md` (BD-1…BD-8), `deferred.md` (BDEF-2 is a natural rider here; BDEF-3 is ruled below). The code you are extending is `src/payload.ts` (the v1 decoder and its `RejectReason` union), `src/message.ts` (the operator message builder — note the voice: English labels, HTML-escaped, hard length budgets against Telegram's 4096), `api/place_order.ts` (the handler), `src/auth.ts` (do not touch — the secret enforcement went live 2026-08-06).

**The v2 contract is shop-side canon, not yours to design.** Read it verbatim at `../utg-2.0/initiatives/ua-checkout/requirements.md` §5 (the envelope, every `delivery.mode` variant, which fields are omitted when empty) and §2 (what each field means operationally). Its ratification is shop-side D-3; the rollout order — this relay dual-accepts FIRST, then the shop flips, then a later follow-up here drops v1 — is shop-side D-9. Do not invent, rename, or "improve" a field: the shop's contract test will pin the same shape from the other side. If something in §5 looks wrong or underspecified, say so at the plan gate instead of deciding it.

**Process gate.** You run headless under a planner session. Stop after your plan & design stage and END YOUR TURN with the complete plan-gate summary. Expected proposals: how the version is discriminated and where (a v2 body that fails validation must NOT silently fall through to the v1 decoder and be rejected with a misleading reason); the decoder's type shape for a discriminated union in this codebase's plain-TS style; the new `RejectReason` members; **the exact English label set for the new fields** (patronymic, contact channel, delivery mode, settlement, warehouse + number, street/building/apartment, and the `source` flag that tells the operator whether the address came from the carrier's directory or was typed by hand — that one changes whether they verify it on the confirmation call); how the delivery block slots into the existing message layout and how its length budget interacts with the existing per-field limits; and which of BDEF-2's hygiene items are cheap enough to ride along.

**Scope:**

1. **Dual-accept decode.** `version: 2` selects the v2 decoder; anything else (absent, `1`, garbage) takes today's v1 path with byte-identical behavior and byte-identical `RejectReason`s. Every v2 field is validated with the same strictness discipline as v1 — kills garbage, never breaks a benign real order. Required by mode per requirements §2/§5; optional fields (`patronymic`, `comment`, `apartment`, `state`) are genuinely optional, and absent ≠ empty-string-rejected.
2. **Render every delivery mode** in `src/message.ts`: `np_branch` / `np_postomat` (settlement, warehouse, warehouse number), `np_courier` (settlement, street, building, optional apartment), `generic` (country, optional state, city, address — this is what the `en` locale keeps sending). Plus the customer block (last/first name, optional patronymic, phone, contact channel) and the `source` flag. Existing escaping, truncation and the 4096 budget apply to every new field — a long carrier warehouse description must not push the cart out of the message.
3. **Contract test** pinning the v2 shape against requirements §5, sitting alongside the existing v1 tests. Both shapes must be pinned simultaneously — that pair IS the dual-accept guarantee.
4. **Do not drop v1.** No deprecation warnings, no logging that treats v1 as legacy: it is the live path today.

**Out of scope (hard fence):** `src/auth.ts` and anything about the relay secret (shipped and live); the Telegram transport (`src/telegram.ts`) beyond passing it a longer string; new dependencies; `vercel.json`; dropping v1; and **idempotency — BDEF-3 stays deferred by planner ruling**, on these grounds: an idempotency key can join the v2 envelope additively later without a version bump, and B3 is the gate for the entire shop-side initiative, so it stays small and fast. (An earlier draft of this prompt justified the deferral with "this relay has no database and that is a project constraint" — that was WRONG and is retired: no document in this repo says it, the owner has managed Postgres available, and persistence is being weighed on its own merits in a separate decision. Nothing about that decision changes B3's scope.) Never stage `CLAUDE.md` or anything under `initiatives/`.

**Acceptance gates (verify and report in the PR test plan):**

- The project's full battery green (`yarn`/`npm` per this repo's scripts: typecheck, tests, format check) plus whatever CI runs.
- A v1 payload byte-for-byte from the live shop still produces a byte-identical message to master's — state how you proved it (a golden-message comparison against master is the strongest form).
- Every v2 mode renders, including the optional-field-absent variants, pinned by tests.
- A malformed v2 body is rejected AS v2, with a reason that names the real problem.
- No secret, no env value, and no raw request data reaches a response body or a log line.

**Resource budget (WSL — mandatory).** Every heavy command runs inside `systemd-run --user --scope -q -p MemoryMax=4G -p MemorySwapMax=1G -- <cmd>`. Heavy commands strictly one at a time. If `systemd-run --user` is unavailable, say so in your report and apply the diet + sequencing alone.

**Constraints:**

- No comments in code; remove existing comments in any region you edit.
- No skip flags (`--no-verify`, …) — root-cause failures instead.
- Match the existing style exactly: plain TS, explicit types, no classes, the established validation and escaping idioms.
- Branch from `master`, PR against `master`. Commits and PR text in English, first person, no assistant signatures anywhere.
- **Never POST to the deployed relay, the shop, or any Vercel URL.** Tests run locally against stubs; the planner owns every live probe.
