import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { POST } from "../api/place_order.js";
import { hashOrder } from "../src/orderHash.js";
import { parseOrder } from "../src/payloadV2.js";
import {
  BOT_TOKEN,
  buildCartItem,
  buildOrder,
  buildOrderV2,
  CHAT_ID,
  StubRequest,
  TELEGRAM_URL,
} from "./support/orderPayload.js";
import { PINNED_KEY } from "./support/envelope.js";
import {
  captureConsole,
  joinAllLogged,
  neonDuplicate,
  neonError,
  neonFresh,
  neonMarkOk,
  NEON_HOST,
  NEON_PASSWORD,
  NEON_REQUEST_ID,
  PROBE_SENT_AT,
  readNeonCalls,
  readTelegramCall,
  readTelegramCalls,
  stubRelayFetch,
  telegramOk,
  TEST_DATABASE_URL,
  type ConsoleCaptures,
} from "./support/relayFetch.js";

const FROZEN_SUCCESS = '{"status":"success"}';

const hashOf = (body: Record<string, unknown>): string => {
  const parsed = parseOrder(body);

  if (!parsed.ok) {
    throw new Error(`the fixture does not decode: ${parsed.reason}`);
  }

  return hashOrder(parsed.value);
};

const deliveredPrior = (
  body: Record<string, unknown>,
  overrides: Record<string, unknown> = {}
): Response =>
  neonDuplicate({
    rowId: "7",
    dupeOf: "6",
    sentAt: PROBE_SENT_AT,
    idempotencyKey: PINNED_KEY,
    contentHash: hashOf(body),
    ageSeconds: 60,
    ...overrides,
  });

let logs: ConsoleCaptures;

beforeEach(() => {
  vi.stubEnv("TELEGRAM_BOT_TOKEN", BOT_TOKEN);
  vi.stubEnv("TELEGRAM_CHAT_ID", CHAT_ID);
  logs = captureConsole();
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("the relay with no store configured", () => {
  it("performs exactly one fetch per order when DATABASE_URL is unset", async () => {
    vi.stubEnv("DATABASE_URL", "");
    const stub = stubRelayFetch();

    const response = await POST(new StubRequest(buildOrderV2()));

    expect(stub).toHaveBeenCalledTimes(1);
    expect(readTelegramCall(stub).url).toBe(TELEGRAM_URL);
    expect(response.status).toBe(200);
    await expect(response.text()).resolves.toBe(FROZEN_SUCCESS);
    expect(joinAllLogged(logs)).not.toContain("order_");
  });

  it("stays dark when the connection string is whitespace only", async () => {
    vi.stubEnv("DATABASE_URL", "  \n ");
    const stub = stubRelayFetch();

    await POST(new StubRequest(buildOrderV2()));

    expect(stub).toHaveBeenCalledTimes(1);
  });
});

describe("the relay with a store", () => {
  beforeEach(() => {
    vi.stubEnv("DATABASE_URL", TEST_DATABASE_URL);
  });

  it("records the order before the send and marks it delivered after", async () => {
    const stub = stubRelayFetch({
      neon: async (call) => (call === 1 ? neonFresh("12") : neonMarkOk()),
      telegram: async () => telegramOk(4242),
    });

    const response = await POST(new StubRequest(buildOrderV2()));

    expect(response.status).toBe(200);
    await expect(response.text()).resolves.toBe(FROZEN_SUCCESS);

    const calls = readNeonCalls(stub);

    expect(calls).toHaveLength(2);
    expect(calls[0]?.query).toContain("insert into orders");
    expect(calls[1]?.query).toContain("on conflict (attempt_id) do update");
    expect(calls[1]?.params[5]).toBe("true");
    expect(calls[1]?.params[6]).toBe(4242);
    expect(calls[0]?.params[2]).toBe(calls[1]?.params[0]);
    expect(readTelegramCalls(stub)).toHaveLength(1);
    expect(joinAllLogged(logs)).toContain("order_stored");
  });

  it("refuses a telegram message id that postgres could never store", async () => {
    const stub = stubRelayFetch({
      neon: async (call) => (call === 1 ? neonFresh() : neonMarkOk()),
      telegram: async () =>
        new Response(
          JSON.stringify({ ok: true, result: { message_id: 1.5 } }),
          { status: 200 }
        ),
    });

    const response = await POST(new StubRequest(buildOrderV2()));

    expect(response.status).toBe(200);
    expect(readNeonCalls(stub)[1]?.params[6]).toBeNull();
  });

  it("refuses to follow a redirect on the telegram call either", async () => {
    const stub = stubRelayFetch({
      neon: async (call) => (call === 1 ? neonFresh() : neonMarkOk()),
    });

    await POST(new StubRequest(buildOrderV2()));

    const telegramCall = stub.mock.calls.find(([input]) =>
      String(input).includes("api.telegram.org")
    );

    expect(telegramCall?.[1]?.redirect).toBe("error");
  });

  it("marks the named failure when telegram refuses the message", async () => {
    const stub = stubRelayFetch({
      neon: async (call) => (call === 1 ? neonFresh() : neonMarkOk()),
      telegram: async () =>
        new Response(JSON.stringify({ ok: false, error_code: 400 }), {
          status: 400,
        }),
    });

    const response = await POST(new StubRequest(buildOrderV2()));

    expect(response.status).toBe(500);

    const calls = readNeonCalls(stub);

    expect(calls[1]?.params[5]).toBe("false");
    expect(calls[1]?.params[7]).toBe("upstream_rejected");
  });

  it("answers the byte-identical frozen success body on the suppressed path", async () => {
    const body = buildOrderV2();
    const stub = stubRelayFetch({ neon: async () => deliveredPrior(body) });

    const response = await POST(new StubRequest(body));

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("application/json");
    await expect(response.text()).resolves.toBe(FROZEN_SUCCESS);
    expect(readNeonCalls(stub)).toHaveLength(1);
    expect(readTelegramCalls(stub)).toHaveLength(0);
    expect(joinAllLogged(logs)).toContain("order_deduplicated");
  });

  it("suppresses a byte-identical retry of a delivered order", async () => {
    const body = buildOrderV2();
    const stub = stubRelayFetch({ neon: async () => deliveredPrior(body) });

    await POST(new StubRequest(body));

    expect(readTelegramCalls(stub)).toHaveLength(0);
  });

  it("delivers an edited order that reuses the idempotency key of a delivered one", async () => {
    const original = buildOrderV2({
      total: "1300.00",
      cart: [buildCartItem(), buildCartItem({ title: "Другий шеврон" })],
    });
    const edited = buildOrderV2({
      total: "300.00",
      cart: [buildCartItem()],
    });
    const stub = stubRelayFetch({
      neon: async (call) =>
        call === 1
          ? deliveredPrior(original, { contentHash: hashOf(original) })
          : neonMarkOk(),
    });

    const response = await POST(new StubRequest(edited));

    expect(response.status).toBe(200);
    expect(readTelegramCalls(stub)).toHaveLength(1);
    expect(readTelegramCall(stub).text).toContain("300,00");
    expect(readTelegramCall(stub).text).not.toContain("1300");
    expect(readTelegramCall(stub).text).not.toContain("Другий шеврон");
    expect(joinAllLogged(logs)).not.toContain("order_deduplicated");
  });

  it("sends again after an ambiguous outcome left the prior unconfirmed", async () => {
    const body = buildOrderV2();
    const stub = stubRelayFetch({
      neon: async (call) =>
        call === 1 ? deliveredPrior(body, { sentAt: null }) : neonMarkOk(),
    });

    await POST(new StubRequest(body));

    expect(readTelegramCalls(stub)).toHaveLength(1);
  });

  it("sends when the statement reports no prior at all", async () => {
    const stub = stubRelayFetch({
      neon: async (call) => (call === 1 ? neonFresh() : neonMarkOk()),
    });

    await POST(new StubRequest(buildOrderV2()));

    expect(readTelegramCalls(stub)).toHaveLength(1);
  });

  it("sends a retry whose prior is older than the dedupe window", async () => {
    const body = buildOrderV2();
    const stub = stubRelayFetch({
      neon: async (call) =>
        call === 1 ? deliveredPrior(body, { ageSeconds: 1801 }) : neonMarkOk(),
    });

    await POST(new StubRequest(body));

    expect(readTelegramCalls(stub)).toHaveLength(1);
  });

  it("stores a v1 order and never suppresses it, even when the statement offers a prior", async () => {
    const body = buildOrder();
    const stub = stubRelayFetch({
      neon: async (call) =>
        call % 2 === 1
          ? neonDuplicate({
              dupeOf: "6",
              sentAt: PROBE_SENT_AT,
              idempotencyKey: PINNED_KEY,
              contentHash: hashOf(body),
              ageSeconds: 60,
            })
          : neonMarkOk(),
    });

    const first = await POST(new StubRequest(body));
    const second = await POST(new StubRequest(body));

    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    expect(readTelegramCalls(stub)).toHaveLength(2);
    expect(readNeonCalls(stub)[0]?.params[1]).toBeNull();
    expect(readNeonCalls(stub)[0]?.params[3]).toBe(1);
    expect(joinAllLogged(logs)).not.toContain("order_deduplicated");
  });
});

describe("what the relay logs about the store", () => {
  beforeEach(() => {
    vi.stubEnv("DATABASE_URL", TEST_DATABASE_URL);
  });

  it("never writes a payload value, the connection string, the full key or the neon message to a log", async () => {
    const body = buildOrderV2();
    const stub = stubRelayFetch({
      neon: async (call) =>
        call === 1 ? neonError("auth") : neonError("missing-table"),
    });

    await POST(new StubRequest(body));

    const logged = joinAllLogged(logs);

    expect(logged).toContain("order_store_unavailable");
    expect(logged).toContain("order_store_mark_failed");
    expect(logged).toContain(NEON_REQUEST_ID);
    expect(logged).toContain("42P01");
    expect(logged).toContain("elapsedMs");
    expect(readTelegramCalls(stub)).toHaveLength(1);

    for (const secret of [
      "Марія",
      "Шевченко",
      "+380671234567",
      "Городоцька",
      "після 18:00",
      PINNED_KEY,
      hashOf(body),
      TEST_DATABASE_URL,
      NEON_PASSWORD,
      NEON_HOST,
      "password authentication failed",
      "does not exist",
    ]) {
      expect(logged).not.toContain(secret);
    }
  });

  it("logs only a short prefix of the hash and of the key", async () => {
    const body = buildOrderV2();

    stubRelayFetch({
      neon: async (call) => (call === 1 ? deliveredPrior(body) : neonMarkOk()),
    });

    await POST(new StubRequest(body));

    const logged = joinAllLogged(logs);

    expect(logged).toContain(hashOf(body).slice(0, 12));
    expect(logged).not.toContain(hashOf(body).slice(0, 13));
    expect(logged).toContain(PINNED_KEY.slice(0, 8));
    expect(logged).not.toContain(PINNED_KEY.slice(0, 9));
  });
});
