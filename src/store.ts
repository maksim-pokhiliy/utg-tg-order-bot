import { randomUUID } from "node:crypto";

import { readEnv } from "./env.js";
import { hashOrder } from "./orderHash.js";
import type { OrderEnvelope } from "./payloadV2.js";
import type { SendFailure } from "./telegram.js";

export const STORE_QUERY_TIMEOUT_MS = 2_000;
export const STORE_MARK_TIMEOUT_MS = 2_500;
export const DEDUPE_WINDOW_SECONDS = 1_800;

const NEON_SQL_PATH = "/sql";
const CONNECTION_HEADER = "Neon-Connection-String";
const REQUEST_ID_HEADER = "neon-request-id";
const SCHEMA_VERSION_V1 = 1;
const SCHEMA_VERSION_V2 = 2;
const HASH_LOG_PREFIX = 12;
const KEY_LOG_PREFIX = 8;

const RECORD_STATEMENT = `with prior as (
  select id, sent_at, idempotency_key, content_hash, received_at
  from orders
  where content_hash = $1
    and idempotency_key = $2
    and sent_at is not null
    and received_at > now() - interval '30 minutes'
  order by received_at desc
  limit 1
)
insert into orders (attempt_id, content_hash, idempotency_key, schema_version, payload, dedupe_of)
values ($3, $1, $2, $4, $5, (select prior.id from prior))
returning
  id,
  (select prior.id from prior) as dupe_of,
  (select prior.sent_at from prior) as prior_sent_at,
  (select prior.idempotency_key from prior) as prior_idempotency_key,
  (select prior.content_hash from prior) as prior_content_hash,
  (select floor(extract(epoch from (now() - prior.received_at)))::int from prior) as prior_age_seconds`;

const MARK_STATEMENT = `insert into orders (attempt_id, content_hash, idempotency_key, schema_version, payload, sent_at, telegram_message_id, send_failure)
values ($1, $2, $3, $4, $5, case when $6::boolean then now() end, $7, $8)
on conflict (attempt_id) do update set
  sent_at = case when $6::boolean then now() end,
  telegram_message_id = $7,
  send_failure = $8`;

export type StoreFailure =
  | "not_configured"
  | "bad_config"
  | "upstream_rejected"
  | "response_unreadable"
  | "timeout"
  | "network_error";

export interface OrderAttempt {
  attemptId: string;
  contentHash: string;
  envelope: OrderEnvelope;
}

export interface PriorAttempt {
  id: string;
  sentAt: string | null;
  idempotencyKey: string | null;
  contentHash: string | null;
  ageSeconds: number | null;
}

export interface RecordedAttempt {
  rowId: string | null;
  prior: PriorAttempt | undefined;
}

export type RecordResult =
  { ok: true; value: RecordedAttempt } | { ok: false; reason: StoreFailure };

export type MarkResult = { ok: true } | { ok: false; reason: StoreFailure };

export type AttemptOutcome =
  | { isDelivered: true; messageId: number | undefined }
  | { isDelivered: false; failure: SendFailure };

export type DedupeVerdict =
  { isSuppressed: true; dupeOf: string } | { isSuppressed: false };

interface NeonStatement {
  query: string;
  params: readonly unknown[];
}

type NeonOutcome =
  | { ok: true; rows: readonly Record<string, unknown>[] }
  | { ok: false; reason: StoreFailure };

const logFailure = (event: string, detail: Record<string, unknown>): void => {
  console.warn(JSON.stringify({ event, ...detail }));
};

const logStored = (detail: Record<string, unknown>): void => {
  console.log(JSON.stringify({ event: "order_stored", ...detail }));
};

const isTimeout = (error: unknown): boolean =>
  error instanceof Error &&
  (error.name === "TimeoutError" || error.name === "AbortError");

const readEndpoint = (connectionString: string): string | undefined => {
  try {
    return `https://${new URL(connectionString).hostname}${NEON_SQL_PATH}`;
  } catch {
    return undefined;
  }
};

const readErrorCode = async (
  response: Response
): Promise<string | undefined> => {
  try {
    const body: unknown = await response.json();

    if (typeof body !== "object" || body === null) {
      return undefined;
    }

    const code = "code" in body ? body.code : undefined;

    return typeof code === "string" ? code : undefined;
  } catch (error) {
    if (isTimeout(error)) {
      throw error;
    }

    return undefined;
  }
};

const readRows = async (
  response: Response
): Promise<readonly Record<string, unknown>[] | undefined> => {
  try {
    const body: unknown = await response.json();

    if (typeof body !== "object" || body === null) {
      return undefined;
    }

    const rows = "rows" in body ? body.rows : undefined;

    if (!Array.isArray(rows)) {
      return undefined;
    }

    return rows.every((row) => typeof row === "object" && row !== null)
      ? (rows as Record<string, unknown>[])
      : undefined;
  } catch (error) {
    if (isTimeout(error)) {
      throw error;
    }

    return undefined;
  }
};

const runStatement = async (
  event: string,
  context: Record<string, unknown>,
  statement: NeonStatement,
  timeoutMs: number
): Promise<NeonOutcome> => {
  const connectionString = readEnv("DATABASE_URL");

  if (connectionString === undefined) {
    return { ok: false, reason: "not_configured" };
  }

  const endpoint = readEndpoint(connectionString);

  if (endpoint === undefined) {
    logFailure(event, { ...context, reason: "bad_config" });

    return { ok: false, reason: "bad_config" };
  }

  const startedAt = Date.now();

  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        [CONNECTION_HEADER]: connectionString,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(statement),
      signal: AbortSignal.timeout(timeoutMs),
    });

    const requestId = response.headers.get(REQUEST_ID_HEADER);

    if (!response.ok) {
      logFailure(event, {
        ...context,
        reason: "upstream_rejected",
        status: response.status,
        code: await readErrorCode(response),
        requestId,
        elapsedMs: Date.now() - startedAt,
      });

      return { ok: false, reason: "upstream_rejected" };
    }

    const rows = await readRows(response);

    if (rows === undefined) {
      logFailure(event, {
        ...context,
        reason: "response_unreadable",
        status: response.status,
        requestId,
        elapsedMs: Date.now() - startedAt,
      });

      return { ok: false, reason: "response_unreadable" };
    }

    return { ok: true, rows };
  } catch (error) {
    if (isTimeout(error)) {
      logFailure(event, {
        ...context,
        reason: "timeout",
        timeoutMs,
        elapsedMs: Date.now() - startedAt,
      });

      return { ok: false, reason: "timeout" };
    }

    logFailure(event, {
      ...context,
      reason: "network_error",
      errorName: error instanceof Error ? error.name : "unknown",
      elapsedMs: Date.now() - startedAt,
    });

    return { ok: false, reason: "network_error" };
  }
};

const readAttemptKey = (envelope: OrderEnvelope): string | undefined =>
  envelope.kind === "v2" ? envelope.payload.idempotency_key : undefined;

const readSchemaVersion = (envelope: OrderEnvelope): number =>
  envelope.kind === "v2" ? SCHEMA_VERSION_V2 : SCHEMA_VERSION_V1;

const readText = (row: Record<string, unknown>, key: string): string | null => {
  const value = row[key];

  return typeof value === "string" ? value : null;
};

const readNumber = (
  row: Record<string, unknown>,
  key: string
): number | null => {
  const value = row[key];

  return typeof value === "number" ? value : null;
};

const readPrior = (row: Record<string, unknown>): PriorAttempt | undefined => {
  const id = readText(row, "dupe_of");

  if (id === null) {
    return undefined;
  }

  return {
    id,
    sentAt: readText(row, "prior_sent_at"),
    idempotencyKey: readText(row, "prior_idempotency_key"),
    contentHash: readText(row, "prior_content_hash"),
    ageSeconds: readNumber(row, "prior_age_seconds"),
  };
};

export const attemptLogFields = (
  attempt: OrderAttempt
): Record<string, string | undefined> => ({
  hashPrefix: attempt.contentHash.slice(0, HASH_LOG_PREFIX),
  keyPrefix: readAttemptKey(attempt.envelope)?.slice(0, KEY_LOG_PREFIX),
});

export const createAttempt = (envelope: OrderEnvelope): OrderAttempt => ({
  attemptId: randomUUID(),
  contentHash: hashOrder(envelope),
  envelope,
});

export const readDedupeVerdict = (
  attempt: OrderAttempt,
  prior: PriorAttempt | undefined
): DedupeVerdict => {
  if (prior === undefined) {
    return { isSuppressed: false };
  }

  const attemptKey = readAttemptKey(attempt.envelope);
  const isSameContent = prior.contentHash === attempt.contentHash;
  const isDelivered = prior.sentAt !== null;
  const isKeyCorroborated =
    attemptKey !== undefined &&
    prior.idempotencyKey !== null &&
    prior.idempotencyKey === attemptKey;
  const isInsideWindow =
    prior.ageSeconds !== null && prior.ageSeconds < DEDUPE_WINDOW_SECONDS;

  if (!isSameContent || !isDelivered || !isKeyCorroborated || !isInsideWindow) {
    return { isSuppressed: false };
  }

  return { isSuppressed: true, dupeOf: prior.id };
};

export const recordAttempt = async (
  attempt: OrderAttempt
): Promise<RecordResult> => {
  const outcome = await runStatement(
    "order_store_unavailable",
    attemptLogFields(attempt),
    {
      query: RECORD_STATEMENT,
      params: [
        attempt.contentHash,
        readAttemptKey(attempt.envelope) ?? null,
        attempt.attemptId,
        readSchemaVersion(attempt.envelope),
        JSON.stringify(attempt.envelope),
      ],
    },
    STORE_QUERY_TIMEOUT_MS
  );

  if (!outcome.ok) {
    return { ok: false, reason: outcome.reason };
  }

  const [row] = outcome.rows;

  if (row === undefined) {
    return { ok: true, value: { rowId: null, prior: undefined } };
  }

  const rowId = readText(row, "id");
  const prior = readPrior(row);

  logStored({ rowId, dupeOf: prior?.id, ...attemptLogFields(attempt) });

  return { ok: true, value: { rowId, prior } };
};

export const markAttempt = async (
  attempt: OrderAttempt,
  outcome: AttemptOutcome
): Promise<MarkResult> => {
  const result = await runStatement(
    "order_store_mark_failed",
    attemptLogFields(attempt),
    {
      query: MARK_STATEMENT,
      params: [
        attempt.attemptId,
        attempt.contentHash,
        readAttemptKey(attempt.envelope) ?? null,
        readSchemaVersion(attempt.envelope),
        JSON.stringify(attempt.envelope),
        outcome.isDelivered ? "true" : "false",
        outcome.isDelivered ? (outcome.messageId ?? null) : null,
        outcome.isDelivered ? null : outcome.failure,
      ],
    },
    STORE_MARK_TIMEOUT_MS
  );

  return result.ok ? { ok: true } : { ok: false, reason: result.reason };
};
