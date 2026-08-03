import { isAuthorized } from "../src/auth.js";
import { buildOrderMessage } from "../src/message.js";
import { parseOrderPayload } from "../src/payload.js";
import { sendOrderMessage } from "../src/telegram.js";

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

const relay = async (request: Request): Promise<Response> => {
  if (!isAuthorized(request)) {
    console.warn(JSON.stringify({ event: "relay_auth_rejected" }));

    return failure(HTTP_UNAUTHORIZED);
  }

  const parsed = parseOrderPayload(await readBody(request));

  if (!parsed.ok) {
    console.warn(
      JSON.stringify({ event: "payload_rejected", reason: parsed.reason })
    );

    return failure(HTTP_BAD_REQUEST);
  }

  const sent = await sendOrderMessage(buildOrderMessage(parsed.value));

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
