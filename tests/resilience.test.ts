import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { POST } from "../api/place_order.js";
import { createTimeoutSignal } from "../src/telegram.js";
import {
  BOT_TOKEN,
  buildOrder,
  CHAT_ID,
  StubRequest,
} from "./support/orderPayload.js";
import {
  captureConsoleError,
  joinLoggedLines,
  stubTelegram,
  type FetchStub,
} from "./support/telegram.js";

const PADDED = "  s3cr3t-relay-value  ";
const TRIMMED = "s3cr3t-relay-value";

beforeEach(() => {
  vi.stubEnv("TELEGRAM_BOT_TOKEN", BOT_TOKEN);
  vi.stubEnv("TELEGRAM_CHAT_ID", CHAT_ID);
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("telegram answering 200 with ok:false", () => {
  it("is a failure, not a success, when the bot was blocked", async () => {
    stubTelegram(
      async () =>
        new Response(
          JSON.stringify({
            ok: false,
            error_code: 403,
            description: "Forbidden: bot was blocked by the user",
          }),
          { status: 200 }
        )
    );

    const response = await POST(new StubRequest(buildOrder()));

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({ status: "error" });
  });

  it("is a failure when the body carries no ok field at all", async () => {
    stubTelegram(async () => new Response("{}", { status: 200 }));

    const response = await POST(new StubRequest(buildOrder()));

    expect(response.status).toBe(500);
  });

  it("is a failure when the body is not json", async () => {
    stubTelegram(
      async () => new Response("<html>gateway</html>", { status: 200 })
    );

    const response = await POST(new StubRequest(buildOrder()));

    expect(response.status).toBe(500);
  });

  it("logs the error code without the description", async () => {
    const logs = captureConsoleError();

    stubTelegram(
      async () =>
        new Response(
          JSON.stringify({
            ok: false,
            error_code: 403,
            description: "Forbidden: bot was blocked by the user",
          }),
          { status: 200 }
        )
    );

    await POST(new StubRequest(buildOrder()));

    const logged = joinLoggedLines(logs);

    expect(logged).toContain("telegram_send_not_ok");
    expect(logged).toContain("403");
    expect(logged).not.toContain("blocked by the user");
  });
});

describe("the outgoing request timeout", () => {
  it("carries an abort signal on every call", async () => {
    const fetchStub = stubTelegram();

    await POST(new StubRequest(buildOrder()));

    const call = fetchStub.mock.calls[0];

    expect(call).toBeDefined();
    expect(call?.[1]?.signal).toBeInstanceOf(AbortSignal);
  });

  it("aborts a hung upstream rather than hanging the invocation", async () => {
    const signal = createTimeoutSignal(5);

    await new Promise((resolve) => {
      signal.addEventListener("abort", resolve, { once: true });
    });

    expect(signal.aborted).toBe(true);
    expect(signal.reason).toBeInstanceOf(Error);
    expect(String(signal.reason.name)).toBe("TimeoutError");
  });

  it("answers an opaque 500 when the upstream call times out", async () => {
    const logs = captureConsoleError();

    const hung: FetchStub = (_input, init) =>
      new Promise((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => {
          reject(new DOMException("The operation timed out.", "TimeoutError"));
        });
      });

    vi.stubGlobal(
      "fetch",
      vi.fn<FetchStub>((input, init) => {
        const signal = createTimeoutSignal(5);

        return hung(input, { ...init, signal });
      })
    );

    const response = await POST(new StubRequest(buildOrder()));

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({ status: "error" });
    expect(joinLoggedLines(logs)).toContain("telegram_timeout");
  });
});

describe("environment values carrying accidental padding", () => {
  it("matches a padded secret against the header the client actually sends", async () => {
    vi.stubEnv("ORDER_RELAY_SECRET", PADDED);
    stubTelegram();

    const response = await POST(
      new StubRequest(buildOrder(), { "x-relay-secret": TRIMMED })
    );

    expect(response.status).toBe(200);
  });

  it("builds a clean telegram url from a padded token", async () => {
    vi.stubEnv("TELEGRAM_BOT_TOKEN", `  ${BOT_TOKEN}  `);
    vi.stubEnv("TELEGRAM_CHAT_ID", `  ${CHAT_ID}\n`);

    const fetchStub = stubTelegram();

    const response = await POST(new StubRequest(buildOrder()));

    expect(response.status).toBe(200);

    const url = String(fetchStub.mock.calls[0]?.[0]);

    expect(url).toBe(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`);
    expect(url).not.toContain("%20");
    expect(url).not.toContain(" ");
  });
});

describe("the handler boundary", () => {
  it("keeps an object-key locale inside the response contract", async () => {
    stubTelegram();

    const order = buildOrder({ locale: "constructor" });

    delete order["currency"];

    const response = await POST(new StubRequest(order));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ status: "success" });
  });

  it("answers the frozen opaque 500 when a module the handler calls throws", async () => {
    const logs = captureConsoleError();

    stubTelegram();
    vi.resetModules();
    vi.doMock("../src/messageV2.js", () => ({
      renderOrder: (): string => {
        throw new RangeError("simulated invariant break");
      },
    }));

    try {
      const { POST: guarded } = await import("../api/place_order.js");

      const response = await guarded(new StubRequest(buildOrder()));

      expect(response.status).toBe(500);
      await expect(response.json()).resolves.toEqual({ status: "error" });

      const logged = joinLoggedLines(logs);

      expect(logged).toContain("relay_unhandled_error");
      expect(logged).toContain("RangeError");
      expect(logged).not.toContain("simulated invariant break");
    } finally {
      vi.doUnmock("../src/messageV2.js");
      vi.resetModules();
    }
  });
});

describe("the auth comparison", () => {
  it("still compares through timingSafeEqual, not just imports it", () => {
    const source = readFileSync(
      fileURLToPath(new URL("../src/auth.ts", import.meta.url)),
      "utf8"
    );

    expect(source).toMatch(/timingSafeEqual\(\s*digest\(/u);
    expect(source).not.toMatch(/presented\s*===\s*secret/u);
    expect(source).not.toMatch(/secret\s*===\s*presented/u);
    expect(source).not.toMatch(/presented\s*!==\s*secret/u);
    expect(source).not.toMatch(/secret\s*!==\s*presented/u);
  });

  it("tolerates a header an exotic proxy padded", async () => {
    vi.stubEnv("ORDER_RELAY_SECRET", TRIMMED);
    stubTelegram();

    const response = await POST(
      new StubRequest(buildOrder(), { "x-relay-secret": `  ${TRIMMED}  ` })
    );

    expect(response.status).toBe(200);
  });
});

describe("an acknowledgement the relay cannot read", () => {
  it("is reported as its own state, not as a plain rejection", async () => {
    const logs = captureConsoleError();

    stubTelegram(
      async () => new Response("<html>gateway</html>", { status: 200 })
    );

    const response = await POST(new StubRequest(buildOrder()));

    expect(response.status).toBe(500);

    const logged = joinLoggedLines(logs);

    expect(logged).toContain("telegram_ack_unreadable");
    expect(logged).not.toContain("telegram_send_not_ok");
  });

  it("is classified as a timeout when the body read is what timed out", async () => {
    const logs = captureConsoleError();

    stubTelegram(
      async () =>
        ({
          ok: true,
          status: 200,
          json: () =>
            Promise.reject(
              new DOMException("The operation timed out.", "TimeoutError")
            ),
        }) as unknown as Response
    );

    const response = await POST(new StubRequest(buildOrder()));

    expect(response.status).toBe(500);

    const logged = joinLoggedLines(logs);

    expect(logged).toContain("telegram_timeout");
    expect(logged).not.toContain("telegram_ack_unreadable");
  });

  it("classifies an aborted call as a timeout too", async () => {
    const logs = captureConsoleError();

    stubTelegram(async () => {
      throw new DOMException("This operation was aborted", "AbortError");
    });

    const response = await POST(new StubRequest(buildOrder()));

    expect(response.status).toBe(500);
    expect(joinLoggedLines(logs)).toContain("telegram_timeout");
  });
});
