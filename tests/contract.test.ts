import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { POST } from "../api/place_order.js";
import {
  CART_ITEM_KEYS,
  ORDER_V2_CUSTOMER_KEYS,
  ORDER_V2_DELIVERY_BRANCH_KEYS,
  ORDER_V2_DELIVERY_COURIER_KEYS,
  ORDER_V2_DELIVERY_GENERIC_KEYS,
  ORDER_V2_KEYS,
} from "./support/contract.js";
import {
  BOT_TOKEN,
  buildCartItem,
  buildDeliveryCourier,
  buildDeliveryGeneric,
  buildOrder,
  CHAT_ID,
  RELAY_URL,
} from "./support/orderPayload.js";
import { stubTelegram } from "./support/telegram.js";

const IGNORED_KEYS = new Set(["then", "length", "constructor"]);

const isRecorded = (key: string | symbol): key is string =>
  typeof key === "string" && !IGNORED_KEYS.has(key) && !/^\d+$/.test(key);

type SinkName = "top" | "customer" | "delivery" | "item";

type Sinks = Readonly<Record<SinkName, Set<string>>>;

const NESTED_SINKS: ReadonlyMap<string, SinkName> = new Map([
  ["customer", "customer"],
  ["delivery", "delivery"],
  ["cart", "item"],
]);

const descend = (sink: SinkName, key: string | symbol): SinkName => {
  if (sink !== "top" || typeof key !== "string") {
    return sink;
  }

  return NESTED_SINKS.get(key) ?? sink;
};

const record = (value: unknown, sinks: Sinks, sink: SinkName): unknown => {
  if (typeof value !== "object" || value === null) {
    return value;
  }

  const bucket = sinks[sink];

  return new Proxy(value, {
    get(target, key, receiver): unknown {
      if (!Array.isArray(target) && isRecorded(key)) {
        bucket.add(key);
      }

      const nested: unknown = Reflect.get(target, key, receiver);

      return record(nested, sinks, descend(sink, key));
    },
    has(target, key): boolean {
      if (!Array.isArray(target) && isRecorded(key)) {
        bucket.add(key);
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

const runAndRecord = async (
  payload: Record<string, unknown>
): Promise<Sinks> => {
  const sinks: Sinks = {
    top: new Set(),
    customer: new Set(),
    delivery: new Set(),
    item: new Set(),
  };

  const response = await POST(
    new RecordingRequest(record(payload, sinks, "top"))
  );

  expect(response.status).toBe(200);

  return sinks;
};

const sorted = (keys: readonly string[]): readonly string[] => [...keys].sort();

beforeEach(() => {
  vi.stubEnv("TELEGRAM_BOT_TOKEN", BOT_TOKEN);
  vi.stubEnv("TELEGRAM_CHAT_ID", CHAT_ID);
  stubTelegram();
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("the payload contract", () => {
  it("reads exactly the pinned top-level keys and nothing else", async () => {
    const { top } = await runAndRecord(buildOrder());

    expect(sorted([...top])).toEqual(sorted(ORDER_V2_KEYS));
  });

  it("reads exactly the pinned customer keys and nothing else", async () => {
    const { customer } = await runAndRecord(buildOrder());

    expect(sorted([...customer])).toEqual(sorted(ORDER_V2_CUSTOMER_KEYS));
  });

  it("reads exactly the pinned warehouse delivery keys and nothing else", async () => {
    const { delivery } = await runAndRecord(buildOrder());

    expect(sorted([...delivery])).toEqual(
      sorted(ORDER_V2_DELIVERY_BRANCH_KEYS)
    );
  });

  it("reads exactly the pinned courier delivery keys and nothing else", async () => {
    const { delivery } = await runAndRecord(
      buildOrder({ delivery: buildDeliveryCourier() })
    );

    expect(sorted([...delivery])).toEqual(
      sorted(ORDER_V2_DELIVERY_COURIER_KEYS)
    );
  });

  it("never reads a source on a generic delivery", async () => {
    const { delivery } = await runAndRecord(
      buildOrder({
        locale: "en",
        delivery: buildDeliveryGeneric({ source: "np_directory" }),
      })
    );

    expect(sorted([...delivery])).toEqual(
      sorted(ORDER_V2_DELIVERY_GENERIC_KEYS)
    );
    expect(delivery.has("source")).toBe(false);
  });

  it("reads exactly the pinned cart item keys and nothing else", async () => {
    const { item } = await runAndRecord(buildOrder());

    expect(sorted([...item])).toEqual(sorted(CART_ITEM_KEYS));
  });
});

describe("version 2 is the only shape the relay accepts", () => {
  const expectRejected = async (
    payload: Record<string, unknown>
  ): Promise<void> => {
    const response = await POST(new RecordingRequest(payload));

    expect(response.status).toBe(400);
    expect(await response.text()).toBe('{"status":"error"}');
  };

  it("accepts a version 2 envelope", async () => {
    const response = await POST(new RecordingRequest(buildOrder()));

    expect(response.status).toBe(200);
    expect(await response.text()).toBe('{"status":"success"}');
  });

  it("refuses a body that states no version", async () => {
    const order = buildOrder();

    delete order["version"];

    await expectRejected(order);
  });

  it("refuses the retired version 1", async () => {
    await expectRejected(buildOrder({ version: 1 }));
  });

  it("refuses a v1-shaped body, as an unrecognised payload and nothing more", async () => {
    await expectRejected({
      first_name: "Олександр",
      last_name: "Петренко",
      telephone: "+380671234567",
      country: "Україна",
      state: "Київська область",
      city: "Київ",
      address: "вул. Шевченка, 12, кв. 5",
      additional: "",
      locale: "uk",
      total: "46200.00",
      currency: "UAH",
      cart: [buildCartItem()],
    });
  });
});

describe("the pinned key sets", () => {
  it("pins the key sets against accidental growth", () => {
    expect(ORDER_V2_KEYS).toHaveLength(9);
    expect(ORDER_V2_CUSTOMER_KEYS).toHaveLength(5);
    expect(ORDER_V2_DELIVERY_BRANCH_KEYS).toHaveLength(5);
    expect(ORDER_V2_DELIVERY_COURIER_KEYS).toHaveLength(6);
    expect(ORDER_V2_DELIVERY_GENERIC_KEYS).toHaveLength(5);
    expect(CART_ITEM_KEYS).toHaveLength(3);
  });
});
