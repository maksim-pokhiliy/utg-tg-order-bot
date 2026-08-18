import { isAuthorized } from "../src/auth.js";
import { renderOrder } from "../src/messageV2.js";
import { parseOrder, type OrderEnvelope } from "../src/payloadV2.js";
import {
  attemptLogFields,
  createAttempt,
  markAttempt,
  readDedupeVerdict,
  recordAttempt,
  type AttemptOutcome,
  type DedupeVerdict,
  type OrderAttempt,
} from "../src/store.js";
import { sendOrderMessage, type SendResult } from "../src/telegram.js";

const SUCCESS_BODY = { status: "success" };
const ERROR_BODY = { status: "error" };

const HTTP_BAD_REQUEST = 400;
const HTTP_UNAUTHORIZED = 401;
const HTTP_SERVER_ERROR = 500;

const failure = (status: number): Response =>
  Response.json(ERROR_BODY, { status });

const readBody = async (request: Request): Promise<unknown> => {
  try {
    return await request.json();
  } catch {
    return undefined;
  }
};

const describeVersion = (body: unknown): number | string => {
  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    return "no_body";
  }

  const version: unknown = Reflect.get(body, "version");

  if (version === undefined) {
    return "absent";
  }

  return typeof version === "number" ? version : typeof version;
};

const logStoreCrash = (
  event: string,
  error: unknown,
  attempt: OrderAttempt | undefined
): void => {
  console.warn(
    JSON.stringify({
      event,
      reason: "internal_error",
      errorName: error instanceof Error ? error.name : "unknown",
      ...(attempt === undefined ? {} : attemptLogFields(attempt)),
    })
  );
};

const createSafely = (envelope: OrderEnvelope): OrderAttempt | undefined => {
  try {
    return createAttempt(envelope);
  } catch (error) {
    logStoreCrash("order_store_unavailable", error, undefined);

    return undefined;
  }
};

const consultSafely = async (attempt: OrderAttempt): Promise<DedupeVerdict> => {
  try {
    const recorded = await recordAttempt(attempt);
    const verdict = readDedupeVerdict(
      attempt,
      recorded.ok ? recorded.value.prior : undefined
    );

    if (verdict.isSuppressed) {
      console.log(
        JSON.stringify({
          event: "order_deduplicated",
          dupeOf: verdict.dupeOf,
          ...attemptLogFields(attempt),
        })
      );
    }

    return verdict;
  } catch (error) {
    logStoreCrash("order_store_unavailable", error, attempt);

    return { isSuppressed: false };
  }
};

const markSafely = async (
  attempt: OrderAttempt,
  outcome: AttemptOutcome
): Promise<void> => {
  try {
    await markAttempt(attempt, outcome);
  } catch (error) {
    logStoreCrash("order_store_mark_failed", error, attempt);
  }
};

const describeOutcome = (sent: SendResult): AttemptOutcome =>
  sent.ok
    ? { isDelivered: true, messageId: sent.messageId }
    : { isDelivered: false, failure: sent.reason };

const deliver = async (
  envelope: OrderEnvelope,
  attempt: OrderAttempt | undefined
): Promise<Response> => {
  const sent = await sendOrderMessage(renderOrder(envelope));

  if (attempt !== undefined) {
    await markSafely(attempt, describeOutcome(sent));
  }

  return sent.ok ? Response.json(SUCCESS_BODY) : failure(HTTP_SERVER_ERROR);
};

const relay = async (request: Request): Promise<Response> => {
  if (!isAuthorized(request)) {
    console.warn(JSON.stringify({ event: "relay_auth_rejected" }));

    return failure(HTTP_UNAUTHORIZED);
  }

  const body = await readBody(request);
  const parsed = parseOrder(body);

  if (!parsed.ok) {
    console.warn(
      JSON.stringify({
        event: "payload_rejected",
        reason: parsed.reason,
        version: describeVersion(body),
      })
    );

    return failure(HTTP_BAD_REQUEST);
  }

  const attempt = createSafely(parsed.value);

  if (attempt === undefined) {
    return deliver(parsed.value, undefined);
  }

  const verdict = await consultSafely(attempt);

  if (verdict.isSuppressed) {
    return Response.json(SUCCESS_BODY);
  }

  return deliver(parsed.value, attempt);
};

export async function POST(request: Request): Promise<Response> {
  try {
    return await relay(request);
  } catch (error) {
    console.error(
      JSON.stringify({
        event: "relay_unhandled_error",
        errorName: error instanceof Error ? error.name : "unknown",
      })
    );

    return failure(HTTP_SERVER_ERROR);
  }
}
