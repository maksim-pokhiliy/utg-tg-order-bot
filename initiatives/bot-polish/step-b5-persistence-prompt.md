# Step B5 — orders persisted before the send (executor prompt)

---

/feature Step B5 of the bot-polish initiative: every decoded order becomes durable in Postgres (Neon) BEFORE the Telegram send, a retry of an already-DELIVERED order is suppressed by content identity, and the store can never cost an order. Closes BDEF-3, executes BDEF-9. This relay is LIVE PRODUCTION taking real volunteer orders; today a delivered order exists nowhere but the operators' chat — when the chat died on 2026-08-03 (B1 journal), nothing was lost only because the retention window happened to contain zero real orders. That luck is what this step retires.

**Three laws. Each was bought with pain; none is negotiable:**

1. **The store never gates the send.** A dead, slow, missing or misconfigured database costs an audit row, never an order and never a changed response. No store outcome may alter the HTTP status or body the shop sees — with exactly one deliberate exception, the dedupe-200 below.
2. **Dedupe by content hash, never by `idempotency_key` alone** (BDEF-9, ratified shop-side as D-13 and verified by execution). The shop mints the key on first submit and resets it only on success, so the key deliberately SPANS an order the buyer edited between retries. Key-only dedupe would answer 200 to a corrected order that was never delivered; the shop would show the success screen and clear the cart. The hash is the identity; the key is a corroborating hint.
3. **The durable record is the DECODED envelope, not the rendered message.** B4 proved the message is lossy (truncation drops cart lines behind a "+N more" marker). What is stored is what `parseOrder` returned, verbatim.

**Context (read, never edit or stage).** In THIS repo: `initiatives/bot-polish/` — `charter.md`, `state.md`, `decisions.md` (BD-1…BD-11; BD-10 and BD-11 govern this step), `deferred.md` (BDEF-3 and BDEF-9 are what you are closing), and **`b5-neon-probe.md` — the live-probe report whose response shapes, latencies and error bodies you treat as GIVEN and copy into fixtures rather than invent**. The code: `api/place_order.ts` (the handler you extend), `src/payloadV2.ts` (`OrderEnvelope` — the value you hash and store; v2 already carries `idempotency_key: string | undefined`), `src/telegram.ts` (`SendResult`, the timeout idiom, the logging discipline), `src/env.ts` (`readEnv` — the ONLY way to read `DATABASE_URL`; blank counts as unset), `tests/support/telegram.ts` (the single global fetch stub your test router must compose with, without touching existing tests).

**Probe-verified facts (do not re-derive, do not contradict):** endpoint `POST https://<host from DATABASE_URL>/sql`, headers `Neon-Connection-String` + `Content-Type: application/json`, body `{"query","params"}`; routing is by the header (the URL host is cosmetic within the wildcard domain); success envelope `{fields, rows, command, rowCount, rowAsArray:false}` with `int8` returned as a STRING, `timestamptz` as a string, `jsonb` as a parsed object; errors are HTTP 400 with `{message, code, severity, "neon:retryable"}`; `neon-request-id` response header on every reply; cold start 863–921 ms, warm p50 98 ms from iad1; parallel requests do not serialize; 1 MB params pass.

**Design (owner-ratified contour + planner rulings — the frame is fixed, the internals are yours to propose):**

- **New module `src/store.ts`** owning canonicalization, hashing and both Neon roundtrips. Dark without config: `readEnv("DATABASE_URL")` undefined → the handler behaves byte-identically to today and performs ZERO store fetches (this is what keeps all existing tests untouched).
- **Content hash:** sha256 hex over a canonical JSON serialization (recursively sorted object keys) of the decoded `OrderEnvelope` with `idempotency_key` EXCLUDED from the v2 payload before hashing. Same content under different keys ⇒ same hash; v1 and v2 of "the same" order hash differently (accepted, documented). `node:crypto` only.
- **Handler flow:** auth → parse (unchanged) → hash → **pre-send store roundtrip** (timeout-boxed 4000 ms) → if it reports a delivered twin: log `order_deduplicated` and answer the byte-exact frozen `200 {"status":"success"}` WITHOUT calling Telegram → else render + send (unchanged) → **post-send mark roundtrip** (timeout-boxed 2500 ms) → respond exactly as today. Store failure at either point: one structured log line, flow continues as if the store did not exist.
- **Pre-send statement — the probe-validated CTE, one roundtrip, no read-then-write race** (adapt identifiers, keep the shape):

  ```sql
  with prior as (
    select id, sent_at from orders
    where content_hash = $1 and idempotency_key = $2 and sent_at is not null
      and received_at > now() - interval '30 minutes'
    order by received_at desc limit 1
  )
  insert into orders (attempt_id, content_hash, idempotency_key, schema_version, payload)
  values ($3, $1, $2, $4, $5::jsonb)
  returning id, (select id from prior) as dupe_of, (select sent_at from prior) as prior_sent_at
  ```

  With a NULL key param the `idempotency_key = $2` predicate can never hold, so v1 traffic never suppresses through the same statement — keep that property, do not add branching.
- **Dedupe predicate (BD-11, owner-ratified):** suppress iff hash matches AND the prior row is confirmed delivered (`sent_at not null`) AND both keys are present and equal AND the prior is within 30 minutes. Ambiguous send outcomes (`ack_unreadable`, `timeout`) are NOT delivery — a retry after one sends again (a duplicate message is reconcilable; a suppressed undelivered order is silently lost). Two concurrent identical POSTs racing past each other are accepted as a bounded non-goal.
- **`attempt_id`:** a `randomUUID()` minted per request, `unique` in the schema. It makes both writes idempotent: the post-send mark is an UPSERT on `attempt_id` that UPDATEs the row the pre-send insert created, or INSERTs the full row late when the pre-send write was lost — so a database that recovers during the Telegram roundtrip still gets its audit row (and a pre-send timeout whose insert actually landed server-side does not double-write). This unique constraint dedupes only our own attempt writes; it can never refuse a distinct attempt.
- **Every attempt row records its terminal disposition:** delivered (+ `telegram_message_id`), a named send failure, or deduplicated (with a reference to the row it deduplicated against). Exact column shape is yours to propose at the plan gate; the schema sketch is `id bigint identity pk, attempt_id uuid not null unique, received_at timestamptz default now(), content_hash text not null, idempotency_key text, schema_version smallint not null, payload jsonb not null, sent_at timestamptz, telegram_message_id bigint, send_failure text` + index `(content_hash, received_at desc)`. Append-only: no updates ever rewrite `payload`.
- **`src/telegram.ts`:** extend the verdict to carry `result.message_id` (number | undefined) through `SendResult` on success. Nothing else in that module changes.
- **Migration:** `migrations/001_orders.sql` committed in the repo. You never run it anywhere — the planner applies it to production before the merge. The code must also tolerate a missing table (probe-verified `42P01` → unavailable class → fail open), so deploy order can never lose an order.
- **`vercel.json`:** `maxDuration` 15 → 30 (measured: 4 s store cap + 10 s Telegram cap + 2.5 s mark cap no longer fit 15). Update the config test that pins it.
- **Logging (the standing no-PII law extends to Neon):** new events `order_stored`, `order_deduplicated`, `order_store_unavailable`, `order_store_mark_failed` in the existing one-line JSON idiom. Loggable: Neon `code`, HTTP status, `neon-request-id`, elapsed ms, `dupe_of` id, hash PREFIX (≤ 12 hex), timeout class. Never loggable: payload values, the full key (prefix ≤ 8 ok), the full hash, the connection string or any part of it, and Neon `message`/`detail`/`hint` (they can quote SQL and parameter content — same law as Telegram `description`).
- **README:** document `DATABASE_URL` (optional; unset = exactly today's behavior), the three laws, the dedupe semantics honestly (what is and is NOT suppressed), and that replay after an incident is a `select payload from orders where sent_at is null` away.

**Process gate.** You run headless under a planner session. Stop after your plan & design stage and END YOUR TURN with the complete plan-gate summary. Expected proposals: the store module's public API and its outcome union (naming, shape — mirror `SendResult`'s style); the canonical-JSON algorithm and where it lives; the disposition column shape for deduplicated attempts; the test fetch-router design and proof that `tests/support/telegram.ts` consumers stay byte-untouched; how the 30-minute window is tested through a mocked clock or injected rows; which fixtures you cut from the probe report; the exact `vercel-config` pin move; anything in this prompt you believe is wrong — say so with evidence, that path has already changed steps three times this week.

**Scope:** `src/store.ts` (new), `api/place_order.ts` (wiring), `src/telegram.ts` (message_id only), `migrations/001_orders.sql` (new), `vercel.json` + its pin test, `tests/` (new suites + support router + fixtures from the probe report), `README.md`.

**Out of scope (hard fence):** the decoders (`payload.ts`, `payloadV2.ts`, `delivery.ts`) — the contract does not move and no new reject reason appears; the message layer (`message.ts`, `messageV2.ts`); `src/auth.ts`; dropping v1; replay tooling; retention/cleanup jobs; BDEF-2 hygiene items (deferred to the v1-drop window); **new dependencies of any kind — BD-1/BD-10 stand, the transport is native `fetch`**; running migrations or any SQL against any live database; `waitUntil`/`@vercel/functions`. Never stage `CLAUDE.md` or anything under `initiatives/`.

**Acceptance gates (verify and report in the PR test plan; each mutation gate = one surgical, type-valid edit on the committed tree that reddens the NAMED test):**

- Full battery green (format check, typecheck, ESM load smoke, tests) plus CI.
- All existing tests pass BYTE-UNTOUCHED — the diff contains no edit under `tests/` to a pre-existing file except additive support (state plainly in the PR if even that proves unnecessary).
- **Mutation gate "the store never gates":** make the pre-send store call throw synchronously → a named test proving 200 + message still sent goes red.
- **Mutation gate "dead DB costs an audit row, never an order":** store fetch rejects/times out → order still relayed, response unchanged — named test red when broken.
- **Mutation gate BDEF-9:** change the dedupe predicate to key-only (drop the hash condition) → a named test in which the same key carries EDITED content (total 1300.00 → 300.00, two cart lines → one — the exact shop-verified scenario) and the edited order MUST be delivered, goes red.
- **Mutation gate "hash excludes the key":** include `idempotency_key` in the hashed canon → a named test asserting equal hashes across different keys goes red.
- **Mutation gate "ambiguous is not delivered":** treat a prior `ack_unreadable`/timeout attempt as a dedupe source → a named test in which the retry after an ambiguous outcome DOES send, goes red.
- **Mutation gate "dark without config":** with `DATABASE_URL` unset, exactly one fetch (Telegram) happens per order — named test red if a store call leaks.
- The dedupe-200 body is byte-equal to the frozen success body; the suppressed path performs no Telegram fetch.
- v1 orders: stored, never suppressed — pinned.
- No payload value, secret, connection-string fragment, full key/hash, or Neon `message` text reaches a response or a log line — extend the existing log-hygiene suites to the new events.
- Fixtures mirror the probe report's captured shapes (success envelope, `42P01`, auth-failure, `int8`-as-string) — not invented ones.

**Resource budget (WSL — mandatory).** Every heavy command runs inside `systemd-run --user --scope -q -p MemoryMax=4G -p MemorySwapMax=1G -- <cmd>`. Heavy commands strictly one at a time. If `systemd-run --user` is unavailable, say so in your report and apply the diet plus sequencing alone.

**Constraints:**

- No comments in code; remove existing comments in any region you edit.
- No skip flags (`--no-verify`, …) — root-cause failures instead.
- Match the existing style exactly: plain TS, explicit types, no classes, result unions over exceptions, the established `readEnv`/timeout/logging idioms.
- Branch from `master`, PR against `master`. Commits and PR text in English, first person, no assistant signatures anywhere. The PR body carries the owner's smoke checklist AS CHECKBOXES (`- [ ]`): TEST order lands in the chat with relay 200; the same payload re-POSTed inside the window answers 200 with NO second message; the edited-cart payload under the SAME key IS delivered; planner SQL verification of the three rows' dispositions.
- **Never POST to the deployed relay, the shop, any Vercel URL, Telegram, or Neon.** You have no database credentials and must not ask for them; tests run against stubs and the probe report's captured shapes. The planner owns every live probe, the migration run, and the post-merge smoke.
