import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { POST } from "../api/place_order.js";
import {
  BOT_TOKEN,
  buildOrderV2,
  CHAT_ID,
  StubRequest,
} from "./support/orderPayload.js";
import {
  captureConsole,
  joinAllLogged,
  neonFresh,
  neonMarkOk,
  NEON_PASSWORD,
  readNeonCalls,
  readTelegramCall,
  readTelegramCalls,
  stubRelayFetch,
  TEST_DATABASE_URL,
  type ConsoleCaptures,
} from "./support/relayFetch.js";

const FROZEN_SUCCESS = '{"status":"success"}';

let logs: ConsoleCaptures;

beforeEach(() => {
  vi.stubEnv("TELEGRAM_BOT_TOKEN", BOT_TOKEN);
  vi.stubEnv("TELEGRAM_CHAT_ID", CHAT_ID);
  vi.stubEnv("DATABASE_URL", TEST_DATABASE_URL);
  logs = captureConsole();
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("the store can never gate the send", () => {
  it("still relays the order and answers 200 when the store module throws", async () => {
    const stub = stubRelayFetch();

    vi.resetModules();
    vi.doMock("../src/store.js", async () => {
      const actual =
        await vi.importActual<typeof import("../src/store.js")>(
          "../src/store.js"
        );

      return {
        ...actual,
        recordAttempt: (): Promise<never> => {
          throw new Error("simulated store defect");
        },
      };
    });

    try {
      const { POST: guarded } = await import("../api/place_order.js");

      const response = await guarded(new StubRequest(buildOrderV2()));

      expect(response.status).toBe(200);
      expect(response.headers.get("content-type")).toBe("application/json");
      await expect(response.text()).resolves.toBe(FROZEN_SUCCESS);
      expect(readTelegramCall(stub).text).toContain("Марія");

      const logged = joinAllLogged(logs);

      expect(logged).toContain("order_store_unavailable");
      expect(logged).not.toContain("simulated store defect");
    } finally {
      vi.doUnmock("../src/store.js");
      vi.resetModules();
    }
  });

  it("still answers 200 when the post-send mark module throws after delivery", async () => {
    const stub = stubRelayFetch();

    vi.resetModules();
    vi.doMock("../src/store.js", async () => {
      const actual =
        await vi.importActual<typeof import("../src/store.js")>(
          "../src/store.js"
        );

      return {
        ...actual,
        markAttempt: (): Promise<never> => {
          throw new Error("simulated mark defect");
        },
      };
    });

    try {
      const { POST: guarded } = await import("../api/place_order.js");

      const response = await guarded(new StubRequest(buildOrderV2()));

      expect(response.status).toBe(200);
      await expect(response.text()).resolves.toBe(FROZEN_SUCCESS);
      expect(readTelegramCalls(stub)).toHaveLength(1);
      expect(joinAllLogged(logs)).toContain("order_store_mark_failed");
    } finally {
      vi.doUnmock("../src/store.js");
      vi.resetModules();
    }
  });
});

describe("a dead database costs an audit row, never an order", () => {
  it("relays the order and answers the frozen 200 when the pre-send store call times out", async () => {
    const stub = stubRelayFetch({
      neon: async (call) => {
        if (call === 1) {
          throw new DOMException("The operation timed out.", "TimeoutError");
        }

        return neonMarkOk();
      },
    });

    const response = await POST(new StubRequest(buildOrderV2()));

    expect(response.status).toBe(200);
    await expect(response.text()).resolves.toBe(FROZEN_SUCCESS);
    expect(readTelegramCalls(stub)).toHaveLength(1);
    expect(readNeonCalls(stub)).toHaveLength(2);

    const logged = joinAllLogged(logs);

    expect(logged).toContain("order_store_unavailable");
    expect(logged).toContain("timeout");
    expect(logged).not.toContain(NEON_PASSWORD);
  });

  it("relays the order and answers the frozen 200 when the pre-send store call rejects with a network error", async () => {
    const stub = stubRelayFetch({
      neon: async (call) => {
        if (call === 1) {
          throw new TypeError("fetch failed");
        }

        return neonMarkOk();
      },
    });

    const response = await POST(new StubRequest(buildOrderV2()));

    expect(response.status).toBe(200);
    await expect(response.text()).resolves.toBe(FROZEN_SUCCESS);
    expect(readTelegramCalls(stub)).toHaveLength(1);
    expect(joinAllLogged(logs)).toContain("network_error");
  });

  it("answers the frozen 200 when the post-send mark fails after a delivered message", async () => {
    const stub = stubRelayFetch({
      neon: async (call) => {
        if (call === 1) {
          return neonFresh();
        }

        throw new TypeError("fetch failed");
      },
    });

    const response = await POST(new StubRequest(buildOrderV2()));

    expect(response.status).toBe(200);
    await expect(response.text()).resolves.toBe(FROZEN_SUCCESS);
    expect(readTelegramCalls(stub)).toHaveLength(1);
    expect(joinAllLogged(logs)).toContain("order_store_mark_failed");
  });

  it("keeps the 500 the shop already expected when telegram fails and the store is dead too", async () => {
    stubRelayFetch({
      neon: async () => {
        throw new TypeError("fetch failed");
      },
      telegram: async () => {
        throw new TypeError("fetch failed");
      },
    });

    const response = await POST(new StubRequest(buildOrderV2()));

    expect(response.status).toBe(500);
    await expect(response.text()).resolves.toBe('{"status":"error"}');
  });
});
