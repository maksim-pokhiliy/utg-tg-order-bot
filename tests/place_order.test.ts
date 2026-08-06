import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { POST } from "../api/place_order.js";
import {
  BOT_TOKEN,
  BrokenBodyRequest,
  buildDeliveryCourier,
  buildDeliveryGeneric,
  buildOrder,
  buildOrderV2,
  CHAT_ID,
  JsonBodyRequest,
  StubRequest,
  TELEGRAM_URL,
} from "./support/orderPayload.js";
import {
  captureConsoleError,
  captureConsoleWarn,
  joinLoggedLines,
  readSentMessage,
  stubTelegram,
} from "./support/telegram.js";

const readJson = async (response: Response): Promise<unknown> =>
  response.json();

beforeEach(() => {
  vi.stubEnv("TELEGRAM_BOT_TOKEN", BOT_TOKEN);
  vi.stubEnv("TELEGRAM_CHAT_ID", CHAT_ID);
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("POST /api/place_order", () => {
  it("relays a valid order and answers 200 with the frozen success body", async () => {
    const fetchStub = stubTelegram();

    const response = await POST(new StubRequest(buildOrder()));

    expect(response.status).toBe(200);
    await expect(readJson(response)).resolves.toEqual({ status: "success" });

    const sent = readSentMessage(fetchStub);

    expect(sent.url).toBe(TELEGRAM_URL);
    expect(sent.chatId).toBe(CHAT_ID);
    expect(sent.parseMode).toBe("HTML");
    expect(sent.text).toContain("👤 <b>First Name:</b> Олександр");
  });

  it("sends the rates-down order with a hryvnia total and no dollar sign", async () => {
    const fetchStub = stubTelegram();

    await POST(new StubRequest(buildOrder({ locale: "en", currency: "UAH" })));

    const sent = readSentMessage(fetchStub);

    expect(sent.text).toContain("💲 <b>Total:</b> ₴46,200.00");
    expect(sent.text).not.toContain("$");
  });

  it("answers 400 with the frozen error body and never echoes the input", async () => {
    const fetchStub = stubTelegram();
    const order = buildOrder({ cart: [], first_name: "Олександр" });

    const response = await POST(new StubRequest(order));

    expect(response.status).toBe(400);

    const body = await response.text();

    expect(body).toBe(JSON.stringify({ status: "error" }));
    expect(body).not.toContain("Олександр");
    expect(fetchStub).not.toHaveBeenCalled();
  });

  it("answers 400 when the body is not valid json", async () => {
    const fetchStub = stubTelegram();

    const response = await POST(new BrokenBodyRequest());

    expect(response.status).toBe(400);
    expect(fetchStub).not.toHaveBeenCalled();
  });

  it("answers an opaque 500 when telegram rejects the message", async () => {
    stubTelegram(
      async () =>
        new Response(
          JSON.stringify({
            ok: false,
            description: "Bad Request: can't parse entities",
          }),
          { status: 400 }
        )
    );

    const response = await POST(new StubRequest(buildOrder()));

    expect(response.status).toBe(500);

    const body = await response.text();

    expect(body).toBe(JSON.stringify({ status: "error" }));
    expect(body).not.toContain("parse entities");
  });

  it("answers 500 without calling telegram when the bot config is missing", async () => {
    vi.stubEnv("TELEGRAM_BOT_TOKEN", "");
    const fetchStub = stubTelegram();

    const response = await POST(new StubRequest(buildOrder()));

    expect(response.status).toBe(500);
    expect(fetchStub).not.toHaveBeenCalled();
  });

  it("logs the upstream status and error code, never the description", async () => {
    const logs = captureConsoleError();

    stubTelegram(
      async () =>
        new Response(
          JSON.stringify({
            ok: false,
            error_code: 400,
            description:
              "Bad Request: can't parse entities: unexpected end near вул. Шевченка",
          }),
          { status: 400 }
        )
    );

    await POST(new StubRequest(buildOrder()));

    const logged = joinLoggedLines(logs);

    expect(logged).toContain("telegram_send_rejected");
    expect(logged).toContain("errorCode");
    expect(logged).not.toContain("description");
    expect(logged).not.toContain("parse entities");
    expect(logged).not.toContain("Олександр");
    expect(logged).not.toContain("+380671234567");
    expect(logged).not.toContain("вул. Шевченка");
  });

  it("never writes the bot token or the telegram origin to the log", async () => {
    const logs = captureConsoleError();

    stubTelegram(async () => {
      throw new TypeError("fetch failed");
    });

    const response = await POST(new StubRequest(buildOrder()));

    expect(response.status).toBe(500);

    const logged = joinLoggedLines(logs);

    expect(logged).toContain("telegram_network_error");
    expect(logged).not.toContain(BOT_TOKEN);
    expect(logged).not.toContain("api.telegram.org");
  });

  it("logs a machine reason for a rejected payload and no field value", async () => {
    const logs = captureConsoleWarn();

    stubTelegram();

    await POST(new StubRequest(buildOrder({ total: "1e3" })));

    const logged = joinLoggedLines(logs);

    expect(logged).toContain("total_not_plain_decimal");
    expect(logged).not.toContain("1e3");
    expect(logged).not.toContain("Олександр");
  });
});

describe("POST /api/place_order with a v2 envelope", () => {
  it("relays a v2 order and answers 200 with the frozen success body", async () => {
    const fetchStub = stubTelegram();

    const response = await POST(new StubRequest(buildOrderV2()));

    expect(response.status).toBe(200);
    await expect(readJson(response)).resolves.toEqual({ status: "success" });

    const sent = readSentMessage(fetchStub);

    expect(sent.url).toBe(TELEGRAM_URL);
    expect(sent.parseMode).toBe("HTML");
    expect(sent.text).toContain("👤 <b>First Name:</b> Марія");
    expect(sent.text).toContain("🚚 <b>Delivery:</b> Nova Poshta branch");
    expect(sent.text).toContain("🏤 <b>Warehouse:</b>");
  });

  it("parses a genuinely serialised v2 body off the wire", async () => {
    const fetchStub = stubTelegram();

    const response = await POST(new JsonBodyRequest(buildOrderV2()));

    expect(response.status).toBe(200);
    expect(readSentMessage(fetchStub).text).toContain(
      "🔎 <b>Address Source:</b> Nova Poshta directory"
    );
  });

  it("keeps serving v1 bodies unchanged while v2 is accepted", async () => {
    const fetchStub = stubTelegram();

    const response = await POST(new StubRequest(buildOrder()));

    expect(response.status).toBe(200);
    expect(readSentMessage(fetchStub).text).toContain(
      "👤 <b>First Name:</b> Олександр"
    );
  });

  it("sends a rates-down v2 order in hryvnia and never in dollars", async () => {
    const fetchStub = stubTelegram();

    await POST(
      new StubRequest(
        buildOrderV2({
          locale: "en",
          currency: "UAH",
          delivery: buildDeliveryGeneric(),
        })
      )
    );

    const sent = readSentMessage(fetchStub);

    expect(sent.text).toContain("💲 <b>Total:</b> ₴250.00");
    expect(sent.text).not.toContain("$");
  });

  it("rejects a malformed v2 body as v2 and names the real problem", async () => {
    const logs = captureConsoleWarn();
    const fetchStub = stubTelegram();

    const response = await POST(
      new StubRequest(
        buildOrderV2({ delivery: buildDeliveryCourier({ building: "  " }) })
      )
    );

    expect(response.status).toBe(400);
    expect(fetchStub).not.toHaveBeenCalled();

    const logged = joinLoggedLines(logs);

    expect(logged).toContain("delivery_building_missing");
    expect(logged).not.toContain("required_field_missing");
  });

  it("rejects an unsupported version before either decoder runs", async () => {
    const logs = captureConsoleWarn();

    const response = await POST(
      new StubRequest(buildOrderV2({ version: "2" }))
    );

    expect(response.status).toBe(400);

    const logged = joinLoggedLines(logs);

    expect(logged).toContain("version_unsupported");
    expect(logged).not.toContain("required_field_missing");
  });

  it("never echoes a v2 field value into the response or the log", async () => {
    const logs = captureConsoleWarn();
    stubTelegram();

    const response = await POST(
      new StubRequest(buildOrderV2({ total: "1e3" }))
    );

    const body = await response.text();

    expect(body).toBe(JSON.stringify({ status: "error" }));

    const logged = joinLoggedLines(logs);

    expect(logged).toContain("total_not_plain_decimal");

    for (const secret of [
      "Марія",
      "Шевченко",
      "+380671234567",
      "Городоцька",
      "3f2b8c1e-9a44-4d7e-8b2f-16c0a9e5d731",
      "1e3",
    ]) {
      expect(body).not.toContain(secret);
      expect(logged).not.toContain(secret);
    }
  });

  it("never puts the idempotency key in front of an operator", async () => {
    const fetchStub = stubTelegram();

    await POST(new StubRequest(buildOrderV2()));

    expect(readSentMessage(fetchStub).text).not.toContain(
      "3f2b8c1e-9a44-4d7e-8b2f-16c0a9e5d731"
    );
  });
});

describe("diagnosing a rejected order in production", () => {
  it("records the version it observed on every rejection", async () => {
    const logs = captureConsoleWarn();

    stubTelegram();

    await POST(new StubRequest(buildOrderV2({ total: "1e3" })));

    expect(joinLoggedLines(logs)).toContain('"version":2');
  });

  it("tells a versionless v2 body apart from a broken v1 one", async () => {
    const logs = captureConsoleWarn();

    stubTelegram();

    const versionless = buildOrderV2();

    delete versionless["version"];

    const response = await POST(new StubRequest(versionless));

    expect(response.status).toBe(400);

    const logged = joinLoggedLines(logs);

    expect(logged).toContain("required_field_missing");
    expect(logged).toContain('"version":"absent"');
  });

  it("names the type of an unusable version rather than its value", async () => {
    const logs = captureConsoleWarn();

    stubTelegram();

    await POST(new StubRequest(buildOrderV2({ version: "2" })));

    const logged = joinLoggedLines(logs);

    expect(logged).toContain("version_unsupported");
    expect(logged).toContain('"version":"string"');
    expect(logged).not.toContain('"version":"2"');
  });

  it("keeps every payload value out of the rejection log", async () => {
    const logs = captureConsoleWarn();

    stubTelegram();

    await POST(
      new StubRequest(
        buildOrderV2({ delivery: buildDeliveryCourier({ building: "  " }) })
      )
    );

    const logged = joinLoggedLines(logs);

    expect(logged).toContain("delivery_building_missing");

    for (const secret of [
      "Марія",
      "Шевченко",
      "+380671234567",
      "Городоцька",
      "3f2b8c1e-9a44-4d7e-8b2f-16c0a9e5d731",
    ]) {
      expect(logged).not.toContain(secret);
    }
  });
});
