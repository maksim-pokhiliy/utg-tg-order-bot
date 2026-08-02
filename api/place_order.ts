import { isAuthorized } from "../src/auth";
import { buildOrderMessage } from "../src/message";
import { parseOrderPayload } from "../src/payload";
import { sendOrderMessage } from "../src/telegram";

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

export async function POST(request: Request): Promise<Response> {
  if (!isAuthorized(request)) {
    console.error(JSON.stringify({ event: "relay_auth_rejected" }));

    return failure(HTTP_UNAUTHORIZED);
  }

  const parsed = parseOrderPayload(await readBody(request));

  if (!parsed.ok) {
    console.error(
      JSON.stringify({ event: "payload_rejected", reason: parsed.reason })
    );

    return failure(HTTP_BAD_REQUEST);
  }

  const sent = await sendOrderMessage(buildOrderMessage(parsed.value));

  if (!sent.ok) {
    return failure(HTTP_SERVER_ERROR);
  }

  return Response.json(SUCCESS_BODY);
}
