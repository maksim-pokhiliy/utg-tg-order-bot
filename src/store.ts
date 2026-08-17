import { randomUUID } from "node:crypto";

import { hashOrder } from "./orderHash.js";
import type { OrderEnvelope } from "./payloadV2.js";
import type { SendFailure } from "./telegram.js";

export const STORE_QUERY_TIMEOUT_MS = 2_000;
export const STORE_MARK_TIMEOUT_MS = 2_500;
export const DEDUPE_WINDOW_SECONDS = 1_800;

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

export const createAttempt = (envelope: OrderEnvelope): OrderAttempt => ({
  attemptId: randomUUID(),
  contentHash: hashOrder(envelope),
  envelope,
});

export const readDedupeVerdict = (
  attempt: OrderAttempt,
  prior: PriorAttempt | undefined
): DedupeVerdict => ({ isSuppressed: false });

export const recordAttempt = async (
  attempt: OrderAttempt
): Promise<RecordResult> => ({ ok: false, reason: "not_configured" });

export const markAttempt = async (
  attempt: OrderAttempt,
  outcome: AttemptOutcome
): Promise<MarkResult> => ({ ok: false, reason: "not_configured" });
