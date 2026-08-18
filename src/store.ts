import { randomUUID } from "node:crypto";

import { runStatement, type StoreFailure } from "./neon.js";
import { hashOrder } from "./orderHash.js";
import type { OrderEnvelope } from "./payloadV2.js";
import type { SendFailure } from "./telegram.js";

export const STORE_QUERY_TIMEOUT_MS = 2_000;
export const STORE_MARK_TIMEOUT_MS = 2_500;
export const DEDUPE_WINDOW_SECONDS = 1_800;
export const MAX_PAYLOAD_CHARS = 262_144;

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

const logStored = (detail: Record<string, unknown>): void => {
  console.log(JSON.stringify({ event: "order_stored", ...detail }));
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

const readPrior = (
  row: Record<string, unknown>,
  context: Record<string, unknown>
): PriorAttempt | undefined => {
  if (row["dupe_of"] === null || row["dupe_of"] === undefined) {
    return undefined;
  }

  const id = readText(row, "dupe_of");
  const sentAt = readText(row, "prior_sent_at");
  const idempotencyKey = readText(row, "prior_idempotency_key");
  const contentHash = readText(row, "prior_content_hash");
  const ageSeconds = readNumber(row, "prior_age_seconds");

  if (
    id === null ||
    sentAt === null ||
    idempotencyKey === null ||
    contentHash === null ||
    ageSeconds === null
  ) {
    console.warn(
      JSON.stringify({
        event: "order_store_prior_unreadable",
        ...context,
      })
    );

    return undefined;
  }

  return { id, sentAt, idempotencyKey, contentHash, ageSeconds };
};

interface RowParams {
  contentHash: string;
  key: string | null;
  schemaVersion: number;
  payload: string;
}

const readRowParams = (attempt: OrderAttempt): RowParams => ({
  contentHash: attempt.contentHash,
  key: readAttemptKey(attempt.envelope) ?? null,
  schemaVersion: readSchemaVersion(attempt.envelope),
  payload: JSON.stringify(attempt.envelope),
});

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
    prior.ageSeconds !== null &&
    prior.ageSeconds >= 0 &&
    prior.ageSeconds < DEDUPE_WINDOW_SECONDS;

  if (!isSameContent || !isDelivered || !isKeyCorroborated || !isInsideWindow) {
    return { isSuppressed: false };
  }

  return { isSuppressed: true, dupeOf: prior.id };
};

const isTooLarge = (
  event: string,
  params: RowParams,
  context: Record<string, unknown>
): boolean => {
  if (params.payload.length <= MAX_PAYLOAD_CHARS) {
    return false;
  }

  console.warn(
    JSON.stringify({
      event,
      ...context,
      reason: "payload_too_large",
      payloadChars: params.payload.length,
    })
  );

  return true;
};

export const recordAttempt = async (
  attempt: OrderAttempt
): Promise<RecordResult> => {
  const record = readRowParams(attempt);

  if (
    isTooLarge("order_store_unavailable", record, attemptLogFields(attempt))
  ) {
    return { ok: false, reason: "payload_too_large" };
  }

  const outcome = await runStatement(
    "order_store_unavailable",
    attemptLogFields(attempt),
    {
      query: RECORD_STATEMENT,
      params: [
        record.contentHash,
        record.key,
        attempt.attemptId,
        record.schemaVersion,
        record.payload,
      ],
    },
    STORE_QUERY_TIMEOUT_MS
  );

  if (!outcome.ok) {
    return { ok: false, reason: outcome.reason };
  }

  const [row] = outcome.rows;
  const context = attemptLogFields(attempt);
  const rowId = row === undefined ? null : readText(row, "id");
  const prior = row === undefined ? undefined : readPrior(row, context);

  logStored({ rowId, dupeOf: prior?.id, ...context });

  return { ok: true, value: { rowId, prior } };
};

export const markAttempt = async (
  attempt: OrderAttempt,
  outcome: AttemptOutcome
): Promise<MarkResult> => {
  const mark = readRowParams(attempt);

  if (isTooLarge("order_store_mark_failed", mark, attemptLogFields(attempt))) {
    return { ok: false, reason: "payload_too_large" };
  }

  const result = await runStatement(
    "order_store_mark_failed",
    attemptLogFields(attempt),
    {
      query: MARK_STATEMENT,
      params: [
        attempt.attemptId,
        mark.contentHash,
        mark.key,
        mark.schemaVersion,
        mark.payload,
        outcome.isDelivered ? "true" : "false",
        outcome.isDelivered ? (outcome.messageId ?? null) : null,
        outcome.isDelivered ? null : outcome.failure,
      ],
    },
    STORE_MARK_TIMEOUT_MS
  );

  return result.ok ? { ok: true } : { ok: false, reason: result.reason };
};
