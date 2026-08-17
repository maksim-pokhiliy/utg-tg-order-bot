# B5 — Neon SQL-over-HTTP live probe (planner, 2026-08-18)

Measured against the production Neon database (the one `DATABASE_URL` points at)
from two vantage points: the planner's WSL host and a throwaway Vercel function in
**iad1** — the relay's own region. The endpoint hostname is redacted here because
this repo is public; the full unredacted transcripts live in the planner's session
scratchpad only. Everything below is measurement, not assumption (D-12 discipline:
the external half of every inequality gets measured before a step is designed).

## Endpoint and protocol

- `POST https://<endpoint-host>/sql` with headers `Neon-Connection-String: <conn>`
  and `Content-Type: application/json`; body `{"query": "...", "params": [...]}`.
- **Routing is by the header, not the URL host.** A nonexistent hostname under the
  same wildcard domain still answered 200 — the proxy terminates TLS on a wildcard
  cert and routes on the connection string. The URL host is effectively cosmetic
  within the domain; both the pooled and the direct hostname serve `/sql`
  identically.
- Server: PostgreSQL 17.10 (aarch64). Response header `neon-request-id: <uuid>` on
  every reply — safe to log for correlation.

## Latency (the numbers the budgets are derived from)

| measurement                          | iad1 (prod reality) | WSL (eu) |
| ------------------------------------ | ------------------- | -------- |
| cold first query after suspend       | **863 ms** (~9 min idle) | 921 ms (9 DAYS idle) |
| warm `select 1`, p50                 | **98 ms** (97–101)  | 44 ms    |
| warm first call on a new connection  | ~290 ms (TLS)       | ~200 ms  |
| insert ~3 KB jsonb                   | 99–102 ms           | 43–58 ms |
| the dedupe CTE statement             | 99–118 ms           | 44–62 ms |
| mark-delivered update                | 101 ms              | 47 ms    |
| 10 parallel `select 1`               | all complete, ≤310 ms each | ≤204 ms |
| 10 parallel `pg_sleep(0.2)`          | —                   | 398 ms wall → server executes in parallel, no pooler ceiling hit |
| 256 KB / 1 MB string param           | —                   | 200 OK, 210/329 ms |

Two cold samples, 863 and 921 ms, after idles of nine minutes and nine days — the
resume cost is repeatable, sub-second, and independent of how long the compute
slept. Autosuspend is real and fires within ≤9 minutes of quiet (consistent with
the free-plan 5-minute default), so **the cold path is the COMMON path for this
shop's traffic** — roughly one second of added latency on the first query of an
order, invisible next to the Telegram roundtrip and capped by the timeout box.

## Response shapes (fixture source of truth)

Success envelope (`rows` are objects; `rowAsArray: false`):

```json
{
  "fields": [{ "name": "id", "dataTypeID": 20, "format": "text", "...": "..." }],
  "rows": [{ "id": "6", "dupe_of": null, "prior_sent_at": null }],
  "command": "INSERT",
  "rowCount": 1,
  "rowAsArray": false
}
```

Type mapping observed: `int8` → **string** (`"6"`), `int4` → number, `bool` →
bool, `timestamptz` → `"2026-08-17 22:20:13.854062+00"` (string), `jsonb` →
parsed object (Cyrillic survives round-trip), SQL `null` → `null`.

Errors are **HTTP 400** with a JSON body; three captured verbatim (trimmed to the
load-bearing fields):

```json
{ "message": "syntax error at or near \"selec\"", "code": "42601", "severity": "ERROR", "neon:retryable": false }
{ "message": "relation \"b5_no_such_table_probe\" does not exist", "code": "42P01", "severity": "ERROR", "neon:retryable": false }
{ "message": "password authentication failed for user 'neondb_owner'", "code": "", "severity": "", "neon:retryable": true }
```

`message` can carry SQL fragments and (for malformed jsonb input) parameter
content — the store must log **`code`, HTTP status, `neon-request-id` and timing
only**, never `message`/`detail`/`hint`, mirroring the Telegram `description` law.

## The dedupe CTE, validated live end-to-end (both vantage points)

The exact production statement was run against a scratch table: first attempt →
`dupe_of: null`; retry BEFORE the delivered mark → `dupe_of: null` (an undelivered
prior never suppresses); mark delivered; retry after → `dupe_of: "6"`,
`prior_sent_at` set. One roundtrip both writes the attempt row and answers the
dedupe question. With a NULL `idempotency_key` param the `idempotency_key = $2`
predicate is never true, so **v1 (keyless) traffic can never suppress through the
same statement** — no branching needed.

## DDL and hygiene

The role owns the schema: `create table` (135/175 ms), `create index`, `drop`
all succeeded from both vantage points. Probe tables (`b5_probe_scratch`,
`b5_probe_scratch_region`) were dropped; the database is back to empty.

## Derived design constants

- Pre-send store timeout: **4000 ms** (> 4× the worst measured cold start).
- Post-send mark timeout: **2500 ms**.
- `maxDuration`: 15 → **30** (4 s store + 10 s Telegram + 2.5 s mark + headroom).
- Transport: plain `fetch` — ratified as BD-10 on these numbers.
