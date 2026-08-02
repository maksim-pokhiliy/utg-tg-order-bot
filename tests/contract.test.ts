import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { POST } from "../api/place_order";
import { CART_ITEM_KEYS, ORDER_PAYLOAD_KEYS } from "../src/payload";
import {
  BOT_TOKEN,
  buildOrder,
  CHAT_ID,
  RELAY_URL,
} from "./support/orderPayload";
import { stubTelegram } from "./support/telegram";

const IGNORED_KEYS = new Set(["then", "length", "constructor"]);

const isRecorded = (key: string | symbol): key is string =>
  typeof key === "string" && !IGNORED_KEYS.has(key) && !/^\d+$/.test(key);

interface Sinks {
  top: Set<string>;
  item: Set<string>;
}

const record = (
  value: unknown,
  sinks: Sinks,
  isInsideCart: boolean
): unknown => {
  if (typeof value !== "object" || value === null) {
    return value;
  }

  const sink = isInsideCart ? sinks.item : sinks.top;

  return new Proxy(value, {
    get(target, key, receiver): unknown {
      if (!Array.isArray(target) && isRecorded(key)) {
        sink.add(key);
      }

      const nested: unknown = Reflect.get(target, key, receiver);

      return record(nested, sinks, isInsideCart || key === "cart");
    },
    has(target, key): boolean {
      if (!Array.isArray(target) && isRecorded(key)) {
        sink.add(key);
      }

      return Reflect.has(target, key);
    },
  });
};

class RecordingRequest extends Request {
  readonly #payload: unknown;

  constructor(payload: unknown) {
    super(RELAY_URL, { method: "POST" });
    this.#payload = payload;
  }

  override json = (): Promise<unknown> => Promise.resolve(this.#payload);
}

const runAndRecord = async (): Promise<Sinks> => {
  const sinks: Sinks = { top: new Set(), item: new Set() };

  const response = await POST(
    new RecordingRequest(record(buildOrder(), sinks, false))
  );

  expect(response.status).toBe(200);

  return sinks;
};

beforeEach(() => {
  vi.stubEnv("TELEGRAM_BOT_TOKEN", BOT_TOKEN);
  vi.stubEnv("TELEGRAM_CHAT_ID", CHAT_ID);
  stubTelegram();
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("payload contract", () => {
  it("reads exactly the pinned top-level keys and nothing else", async () => {
    const { top } = await runAndRecord();

    expect([...top].sort()).toEqual([...ORDER_PAYLOAD_KEYS].sort());
  });

  it("reads exactly the pinned cart item keys and nothing else", async () => {
    const { item } = await runAndRecord();

    expect([...item].sort()).toEqual([...CART_ITEM_KEYS].sort());
  });

  it("pins the key sets against accidental growth", () => {
    expect(ORDER_PAYLOAD_KEYS).toHaveLength(12);
    expect(CART_ITEM_KEYS).toHaveLength(3);
  });
});
