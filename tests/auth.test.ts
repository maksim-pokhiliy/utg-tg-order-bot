import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { POST } from "../api/place_order.js";
import {
  BOT_TOKEN,
  buildOrder,
  CHAT_ID,
  StubRequest,
} from "./support/orderPayload.js";
import { stubTelegram } from "./support/telegram.js";

const SECRET = "s3cr3t-relay-value";

class CountingBodyRequest extends Request {
  readonly #payload: unknown;

  reads = 0;

  constructor(payload: unknown, headers: Record<string, string> = {}) {
    super("https://relay.test/api/place_order", { method: "POST", headers });
    this.#payload = payload;
  }

  override json = (): Promise<unknown> => {
    this.reads += 1;

    return Promise.resolve(this.#payload);
  };
}

const post = async (headers: Record<string, string> = {}): Promise<Response> =>
  POST(new StubRequest(buildOrder(), headers));

beforeEach(() => {
  vi.stubEnv("TELEGRAM_BOT_TOKEN", BOT_TOKEN);
  vi.stubEnv("TELEGRAM_CHAT_ID", CHAT_ID);
  stubTelegram();
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("relay auth", () => {
  it("accepts a header-less request when the secret is unset", async () => {
    const response = await post();

    expect(response.status).toBe(200);
  });

  it("accepts a header-less request when the secret is an empty string", async () => {
    vi.stubEnv("ORDER_RELAY_SECRET", "");

    const response = await post();

    expect(response.status).toBe(200);
  });

  it("accepts a header-less request when the secret is only whitespace", async () => {
    vi.stubEnv("ORDER_RELAY_SECRET", "   ");

    const response = await post();

    expect(response.status).toBe(200);
  });

  it("rejects a missing header with 401 when the secret is set", async () => {
    vi.stubEnv("ORDER_RELAY_SECRET", SECRET);

    const response = await post();

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({ status: "error" });
  });

  it("rejects a wrong header with 401", async () => {
    vi.stubEnv("ORDER_RELAY_SECRET", SECRET);

    const response = await post({ "x-relay-secret": "wrong" });

    expect(response.status).toBe(401);
  });

  it("rejects a header that merely shares a prefix", async () => {
    vi.stubEnv("ORDER_RELAY_SECRET", SECRET);

    const response = await post({ "x-relay-secret": SECRET.slice(0, -1) });

    expect(response.status).toBe(401);
  });

  it("accepts the matching header", async () => {
    vi.stubEnv("ORDER_RELAY_SECRET", SECRET);

    const response = await post({ "x-relay-secret": SECRET });

    expect(response.status).toBe(200);
  });

  it("never calls telegram for an unauthorized request", async () => {
    vi.stubEnv("ORDER_RELAY_SECRET", SECRET);

    const fetchStub = stubTelegram();

    await post();

    expect(fetchStub).not.toHaveBeenCalled();
  });

  it("never reads the body of a caller it is about to reject", async () => {
    vi.stubEnv("ORDER_RELAY_SECRET", SECRET);

    const request = new CountingBodyRequest(buildOrder());
    const response = await POST(request);

    expect(response.status).toBe(401);
    expect(request.reads).toBe(0);
  });

  it("reads the body only once the caller is authorized", async () => {
    vi.stubEnv("ORDER_RELAY_SECRET", SECRET);

    const request = new CountingBodyRequest(buildOrder(), {
      "x-relay-secret": SECRET,
    });
    const response = await POST(request);

    expect(response.status).toBe(200);
    expect(request.reads).toBe(1);
  });
});
