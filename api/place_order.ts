import { isAuthorized } from "../src/auth.js";
import { renderOrder } from "../src/messageV2.js";
import { parseOrder } from "../src/payloadV2.js";
import {
  attemptLogFields,
  createAttempt,
  markAttempt,
  readDedupeVerdict,
  recordAttempt,
  type AttemptOutcome,
  type OrderAttempt,
  type PriorAttempt,
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

const logStoreCrash = (event: string, error: unknown): void => {
  console.warn(
    JSON.stringify({
      event,
      reason: "internal_error",
      errorName: error instanceof Error ? error.name : "unknown",
    })
  );
};

const recordSafely = async (
  attempt: OrderAttempt
): Promise<PriorAttempt | undefined> => {
  try {
    const recorded = await recordAttempt(attempt);

    return recorded.ok ? recorded.value.prior : undefined;
  } catch (error) {
    logStoreCrash("order_store_unavailable", error);

    return undefined;
  }
};

const markSafely = async (
  attempt: OrderAttempt,
  outcome: AttemptOutcome
): Promise<void> => {
  try {
    await markAttempt(attempt, outcome);
  } catch (error) {
    logStoreCrash("order_store_mark_failed", error);
  }
};

const describeOutcome = (sent: SendResult): AttemptOutcome =>
  sent.ok
    ? { isDelivered: true, messageId: sent.messageId }
    : { isDelivered: false, failure: sent.reason };

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

  const attempt = createAttempt(parsed.value);
  const prior = await recordSafely(attempt);
  const verdict = readDedupeVerdict(attempt, prior);

  if (verdict.isSuppressed) {
    console.log(
      JSON.stringify({
        event: "order_deduplicated",
        dupeOf: verdict.dupeOf,
        ...attemptLogFields(attempt),
      })
    );

    return Response.json(SUCCESS_BODY);
  }

  const sent = await sendOrderMessage(renderOrder(parsed.value));

  await markSafely(attempt, describeOutcome(sent));

  return sent.ok ? Response.json(SUCCESS_BODY) : failure(HTTP_SERVER_ERROR);
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
