import { describe, expect, it } from "vitest";

import { renderOrder } from "../src/message.js";
import { type RejectReason } from "../src/decode.js";
import {
  parseOrder,
  decodeEnvelopeBody,
  type OrderParseResult,
  type OrderPayload,
} from "../src/payload.js";
import {
  buildCartItem,
  buildCustomer,
  buildDeliveryBranch,
  buildDeliveryCourier,
  buildDeliveryGeneric,
  buildDeliveryPostomat,
  buildOrder,
} from "./support/orderPayload.js";

const CONTRACT_IDEMPOTENCY_KEY = "3f2b8c1e-9a44-4d7e-8b2f-16c0a9e5d731";

const GARBAGE_TOTALS: readonly unknown[] = [
  "",
  [],
  null,
  false,
  true,
  [5],
  "1e3",
  "0x10",
  " 12 ",
  "Infinity",
  "-1",
  "abc",
  {},
  46200,
  undefined,
];

const BLANK_TEXTS: readonly string[] = ["", "   "];

const NON_STRING_VALUES: readonly unknown[] = [42, {}, []];

const HOSTILE_IDEMPOTENCY_KEYS: readonly unknown[] = [
  undefined,
  null,
  "",
  "   ",
  0,
  42,
  true,
  false,
  {},
  [],
  [CONTRACT_IDEMPOTENCY_KEY],
  { value: CONTRACT_IDEMPOTENCY_KEY },
];

const payloadOf = (result: OrderParseResult): OrderPayload | undefined => {
  expect(result.ok).toBe(true);

  return result.ok && result.value.kind === "v2"
    ? result.value.payload
    : undefined;
};

const decode = (
  overrides: Record<string, unknown> = {}
): OrderPayload | undefined => payloadOf(parseOrder(buildOrder(overrides)));

const expectRejectedBody = (body: unknown, reason: RejectReason): void => {
  const result = parseOrder(body);

  expect(result.ok).toBe(false);

  if (!result.ok) {
    expect(result.reason).toBe(reason);
  }
};

const expectReject = (
  overrides: Record<string, unknown>,
  reason: RejectReason
): void => {
  expectRejectedBody(buildOrder(overrides), reason);
};

describe("parseOrder version gate", () => {
  it("rejects a body carrying no version at all", () => {
    const order = buildOrder();

    delete order["version"];

    expectRejectedBody(order, "version_unsupported");
  });

  it("rejects the retired version 1 like any other version it does not speak", () => {
    expectRejectedBody(buildOrder({ version: 1 }), "version_unsupported");
  });

  it("rejects a v1-shaped body through the ordinary path, with no bespoke reason", () => {
    const legacyBody = {
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
    };

    expectRejectedBody(legacyBody, "version_unsupported");
  });

  it("accepts the version the shop sends", () => {
    const result = parseOrder(buildOrder());

    expect(result.ok).toBe(true);

    if (result.ok) {
      expect(result.value.kind).toBe("v2");
    }
  });

  it("accepts version 2.0 because 2.0 is the number 2", () => {
    expect(2.0).toBe(2);

    const result = parseOrder(buildOrder({ version: 2.0 }));

    expect(result.ok).toBe(true);

    if (result.ok) {
      expect(result.value.kind).toBe("v2");
    }
  });

  it("rejects a version that is a string even when it spells a supported one", () => {
    for (const version of ["2", "1"]) {
      expectRejectedBody(buildOrder({ version }), "version_unsupported");
    }
  });

  it("rejects a version the relay does not speak", () => {
    for (const version of [99, null, true]) {
      expectRejectedBody(buildOrder({ version }), "version_unsupported");
    }
  });

  it("judges the version before the decoder runs", () => {
    const order = buildOrder({ version: 99 });

    delete order["customer"];

    const result = parseOrder(order);

    expect(result.ok).toBe(false);

    if (!result.ok) {
      expect(result.reason).toBe("version_unsupported");
      expect(result.reason).not.toBe("customer_not_object");
    }
  });

  it("never reads a single payload field when the version is wrong", () => {
    let customerReads = 0;
    const order = buildOrder({ version: 99 });

    Object.defineProperty(order, "customer", {
      configurable: true,
      enumerable: true,
      get: (): Record<string, unknown> => {
        customerReads += 1;

        return buildCustomer();
      },
    });

    expectRejectedBody(order, "version_unsupported");
    expect(customerReads).toBe(0);
  });
});

describe("parseOrder happy paths", () => {
  it("decodes a Nova Poshta branch order", () => {
    const payload = decode();

    expect(payload).toBeDefined();

    if (payload) {
      expect(payload.customer.first_name).toBe("Марія");
      expect(payload.customer.patronymic).toBe("Іванівна");
      expect(payload.customer.phone).toBe("+380671234567");
      expect(payload.customer.contact_channel).toBe("telegram");
      expect(payload.comment).toBe("після 18:00");
      expect(payload.locale).toBe("uk");
      expect(payload.total).toBe("250.00");
      expect(payload.currency).toBe("UAH");
      expect(payload.cart).toHaveLength(1);
      expect(payload.cart[0]?.quantity).toBe(2);
      expect(payload.delivery.mode).toBe("np_branch");

      if (payload.delivery.mode === "np_branch") {
        expect(payload.delivery.source).toBe("np_directory");
        expect(payload.delivery.city).toBe("м. Львів, Львівська обл.");
        expect(payload.delivery.warehouse).toBe(
          "Відділення №1: вул. Городоцька, 359"
        );
        expect(payload.delivery.warehouse_number).toBe("1");
      }
    }
  });

  it("decodes a postomat order", () => {
    const payload = decode({ delivery: buildDeliveryPostomat() });

    expect(payload).toBeDefined();

    if (payload) {
      expect(payload.delivery.mode).toBe("np_postomat");

      if (payload.delivery.mode === "np_postomat") {
        expect(payload.delivery.warehouse_number).toBe("12345");
        expect(payload.delivery.city).toBe("м. Львів, Львівська обл.");
      }
    }
  });

  it("gives a postomat the same field set as a branch with a different mode", () => {
    const branch = decode();
    const postomat = decode({ delivery: buildDeliveryPostomat() });

    expect(branch).toBeDefined();
    expect(postomat).toBeDefined();

    if (branch && postomat) {
      expect(Object.keys(postomat.delivery).sort()).toEqual(
        Object.keys(branch.delivery).sort()
      );
      expect(postomat.delivery.mode).not.toBe(branch.delivery.mode);
    }
  });

  it("decodes a courier order", () => {
    const payload = decode({ delivery: buildDeliveryCourier() });

    expect(payload).toBeDefined();

    if (payload) {
      expect(payload.delivery.mode).toBe("np_courier");

      if (payload.delivery.mode === "np_courier") {
        expect(payload.delivery.source).toBe("manual");
        expect(payload.delivery.city).toBe("м. Львів, Львівська обл.");
        expect(payload.delivery.street).toBe("вул. Городоцька");
        expect(payload.delivery.building).toBe("359");
        expect(payload.delivery.apartment).toBe("12");
      }
    }
  });

  it("decodes a generic international order", () => {
    const payload = decode({ delivery: buildDeliveryGeneric() });

    expect(payload).toBeDefined();

    if (payload) {
      expect(payload.delivery.mode).toBe("generic");

      if (payload.delivery.mode === "generic") {
        expect(payload.delivery.country).toBe("Poland");
        expect(payload.delivery.state).toBe("Lesser Poland");
        expect(payload.delivery.city).toBe("Kraków");
        expect(payload.delivery.address).toBe("ul. Floriańska 3/5");
      }
    }
  });
});

describe("parseOrder optional fields that are absent", () => {
  it("accepts a customer with no patronymic", () => {
    const customer = buildCustomer();

    delete customer["patronymic"];

    const payload = decode({ customer });

    expect(payload).toBeDefined();

    if (payload) {
      expect(payload.customer.patronymic).toBeUndefined();
    }
  });

  it("accepts a customer with no contact channel", () => {
    const customer = buildCustomer();

    delete customer["contact_channel"];

    const payload = decode({ customer });

    expect(payload).toBeDefined();

    if (payload) {
      expect(payload.customer.contact_channel).toBeUndefined();
    }
  });

  it("accepts a branch with no warehouse number", () => {
    const delivery = buildDeliveryBranch();

    delete delivery["warehouse_number"];

    const payload = decode({ delivery });

    expect(payload).toBeDefined();

    if (payload?.delivery.mode === "np_branch") {
      expect(payload.delivery.warehouse_number).toBeUndefined();
    }
  });

  it("accepts a courier address with no apartment", () => {
    const delivery = buildDeliveryCourier();

    delete delivery["apartment"];

    const payload = decode({ delivery });

    expect(payload).toBeDefined();

    if (payload?.delivery.mode === "np_courier") {
      expect(payload.delivery.apartment).toBeUndefined();
    }
  });

  it("accepts a generic address with no state", () => {
    const delivery = buildDeliveryGeneric();

    delete delivery["state"];

    const payload = decode({ delivery });

    expect(payload).toBeDefined();

    if (payload?.delivery.mode === "generic") {
      expect(payload.delivery.state).toBeUndefined();
    }
  });

  it("accepts an order with no comment", () => {
    const order = buildOrder();

    delete order["comment"];

    const payload = payloadOf(parseOrder(order));

    expect(payload).toBeDefined();

    if (payload) {
      expect(payload.comment).toBeUndefined();
    }
  });
});

describe("parseOrder optional fields that are null", () => {
  it("reads a null patronymic as absent", () => {
    const payload = decode({
      customer: buildCustomer({ patronymic: null }),
    });

    expect(payload).toBeDefined();

    if (payload) {
      expect(payload.customer.patronymic).toBeUndefined();
    }
  });

  it("reads a null contact channel as absent", () => {
    const payload = decode({
      customer: buildCustomer({ contact_channel: null }),
    });

    expect(payload).toBeDefined();

    if (payload) {
      expect(payload.customer.contact_channel).toBeUndefined();
    }
  });

  it("reads a null warehouse number as absent", () => {
    const payload = decode({
      delivery: buildDeliveryBranch({ warehouse_number: null }),
    });

    expect(payload).toBeDefined();

    if (payload?.delivery.mode === "np_branch") {
      expect(payload.delivery.warehouse_number).toBeUndefined();
    }
  });

  it("reads a null apartment as absent", () => {
    const payload = decode({
      delivery: buildDeliveryCourier({ apartment: null }),
    });

    expect(payload).toBeDefined();

    if (payload?.delivery.mode === "np_courier") {
      expect(payload.delivery.apartment).toBeUndefined();
    }
  });

  it("reads a null state as absent", () => {
    const payload = decode({
      delivery: buildDeliveryGeneric({ state: null }),
    });

    expect(payload).toBeDefined();

    if (payload?.delivery.mode === "generic") {
      expect(payload.delivery.state).toBeUndefined();
    }
  });

  it("reads a null comment as absent", () => {
    const payload = decode({ comment: null });

    expect(payload).toBeDefined();

    if (payload) {
      expect(payload.comment).toBeUndefined();
    }
  });
});

describe("parseOrder optional fields that are blank", () => {
  it("reads a blank patronymic as absent", () => {
    for (const patronymic of BLANK_TEXTS) {
      const payload = decode({ customer: buildCustomer({ patronymic }) });

      expect(payload).toBeDefined();

      if (payload) {
        expect(payload.customer.patronymic).toBeUndefined();
      }
    }
  });

  it("reads a blank contact channel as absent", () => {
    for (const contact_channel of BLANK_TEXTS) {
      const payload = decode({
        customer: buildCustomer({ contact_channel }),
      });

      expect(payload).toBeDefined();

      if (payload) {
        expect(payload.customer.contact_channel).toBeUndefined();
      }
    }
  });

  it("reads a blank warehouse number as absent", () => {
    for (const warehouse_number of BLANK_TEXTS) {
      const payload = decode({
        delivery: buildDeliveryBranch({ warehouse_number }),
      });

      expect(payload).toBeDefined();

      if (payload?.delivery.mode === "np_branch") {
        expect(payload.delivery.warehouse_number).toBeUndefined();
      }
    }
  });

  it("reads a blank apartment as absent", () => {
    for (const apartment of BLANK_TEXTS) {
      const payload = decode({
        delivery: buildDeliveryCourier({ apartment }),
      });

      expect(payload).toBeDefined();

      if (payload?.delivery.mode === "np_courier") {
        expect(payload.delivery.apartment).toBeUndefined();
      }
    }
  });

  it("reads a blank state as absent", () => {
    for (const state of BLANK_TEXTS) {
      const payload = decode({ delivery: buildDeliveryGeneric({ state }) });

      expect(payload).toBeDefined();

      if (payload?.delivery.mode === "generic") {
        expect(payload.delivery.state).toBeUndefined();
      }
    }
  });

  it("reads a blank comment as absent", () => {
    for (const comment of BLANK_TEXTS) {
      const payload = decode({ comment });

      expect(payload).toBeDefined();

      if (payload) {
        expect(payload.comment).toBeUndefined();
      }
    }
  });
});

describe("parseOrder idempotency key", () => {
  it("carries the contract example key through the decode", () => {
    const payload = decode();

    expect(payload).toBeDefined();

    if (payload) {
      expect(payload.idempotency_key).toBe(CONTRACT_IDEMPOTENCY_KEY);
    }
  });

  it("accepts an order that carries no idempotency key", () => {
    const order = buildOrder();

    delete order["idempotency_key"];

    const payload = payloadOf(parseOrder(order));

    expect(payload).toBeDefined();

    if (payload) {
      expect(payload.idempotency_key).toBeUndefined();
    }
  });

  it("reads a null idempotency key as absent", () => {
    const payload = decode({ idempotency_key: null });

    expect(payload).toBeDefined();

    if (payload) {
      expect(payload.idempotency_key).toBeUndefined();
    }
  });

  it("reads a blank idempotency key as absent", () => {
    for (const idempotency_key of BLANK_TEXTS) {
      const payload = decode({ idempotency_key });

      expect(payload).toBeDefined();

      if (payload) {
        expect(payload.idempotency_key).toBeUndefined();
      }
    }
  });

  it("drops a non-string idempotency key instead of rejecting the order", () => {
    for (const idempotency_key of NON_STRING_VALUES) {
      const payload = decode({ idempotency_key });

      expect(payload).toBeDefined();

      if (payload) {
        expect(payload.idempotency_key).toBeUndefined();
      }
    }
  });

  it("never turns an idempotency key into a rejection, whatever it holds", () => {
    for (const idempotency_key of HOSTILE_IDEMPOTENCY_KEYS) {
      expect(parseOrder(buildOrder({ idempotency_key })).ok).toBe(true);
    }
  });
});

describe("parseOrder rejections", () => {
  it("rejects an order with no customer", () => {
    const order = buildOrder();

    delete order["customer"];

    expectRejectedBody(order, "customer_not_object");
  });

  it("rejects a customer that is not an object", () => {
    for (const customer of ["Марія Шевченко", ["Марія"]]) {
      expectReject({ customer }, "customer_not_object");
    }
  });

  it("rejects a customer whose first name is blank", () => {
    expectReject(
      { customer: buildCustomer({ first_name: "   " }) },
      "customer_field_missing"
    );
  });

  it("rejects a customer with no phone", () => {
    const customer = buildCustomer();

    delete customer["phone"];

    expectReject({ customer }, "customer_field_missing");
  });

  it("rejects a customer whose last name is not a string", () => {
    expectReject(
      { customer: buildCustomer({ last_name: 42 }) },
      "customer_field_missing"
    );
  });

  it("rejects an order with no delivery", () => {
    const order = buildOrder();

    delete order["delivery"];

    expectRejectedBody(order, "delivery_not_object");
  });

  it("rejects a delivery that is not an object", () => {
    for (const delivery of [["np_branch"], "np_branch"]) {
      expectReject({ delivery }, "delivery_not_object");
    }
  });

  it("rejects a delivery with no mode", () => {
    const delivery = buildDeliveryBranch();

    delete delivery["mode"];

    expectReject({ delivery }, "delivery_mode_missing");
  });

  it("rejects a delivery mode the relay cannot render", () => {
    for (const mode of ["np_dropship", 42]) {
      expectReject(
        { delivery: buildDeliveryBranch({ mode }) },
        "delivery_mode_unknown"
      );
    }
  });

  it("rejects a branch with a blank warehouse", () => {
    expectReject(
      { delivery: buildDeliveryBranch({ warehouse: "   " }) },
      "delivery_warehouse_missing"
    );
  });

  it("names the branch field that is missing", () => {
    const withoutCity = buildDeliveryBranch();

    delete withoutCity["city"];

    expectReject({ delivery: withoutCity }, "delivery_city_missing");

    const withoutWarehouse = buildDeliveryBranch();

    delete withoutWarehouse["warehouse"];

    expectReject({ delivery: withoutWarehouse }, "delivery_warehouse_missing");
  });

  it("names the courier field that is missing", () => {
    const withoutStreet = buildDeliveryCourier();

    delete withoutStreet["street"];

    expectReject({ delivery: withoutStreet }, "delivery_street_missing");

    const withoutBuilding = buildDeliveryCourier();

    delete withoutBuilding["building"];

    expectReject({ delivery: withoutBuilding }, "delivery_building_missing");
  });

  it("names the free-form field that is missing", () => {
    const withoutCity = buildDeliveryGeneric();

    delete withoutCity["city"];

    expectReject({ delivery: withoutCity }, "delivery_city_missing");

    const withoutAddress = buildDeliveryGeneric();

    delete withoutAddress["address"];

    expectReject({ delivery: withoutAddress }, "delivery_address_missing");
  });

  it("separates an absent delivery mode from an unrecognised one", () => {
    const withoutMode = buildDeliveryBranch();

    delete withoutMode["mode"];

    expectReject({ delivery: withoutMode }, "delivery_mode_missing");
    expectReject(
      { delivery: buildDeliveryBranch({ mode: null }) },
      "delivery_mode_missing"
    );
    expectReject(
      { delivery: buildDeliveryBranch({ mode: "np_dropship" }) },
      "delivery_mode_unknown"
    );
    expectReject(
      { delivery: buildDeliveryBranch({ mode: 42 }) },
      "delivery_mode_unknown"
    );
  });
});

describe("parseOrder style-only fields fail open", () => {
  it("drops a wrongly typed patronymic instead of losing the order", () => {
    for (const patronymic of [42, {}, [], true]) {
      const payload = decode({
        customer: buildCustomer({ patronymic }),
      });

      expect(payload?.customer.patronymic).toBeUndefined();
    }
  });

  it("drops a contact channel that arrives as an option object", () => {
    const payload = decode({
      customer: buildCustomer({
        contact_channel: { label: "Telegram", value: "telegram" },
      }),
    });

    expect(payload).toBeDefined();
    expect(payload?.customer.contact_channel).toBeUndefined();
    expect(payload?.customer.phone).toBe("+380671234567");
  });

  it("drops a wrongly typed comment instead of losing the order", () => {
    for (const comment of [false, 42, {}, []]) {
      expect(decode({ comment })?.comment).toBeUndefined();
    }
  });

  it("drops a wrongly typed delivery source instead of losing the order", () => {
    for (const source of [1, {}, [], true]) {
      const payload = decode({
        delivery: buildDeliveryBranch({ source }),
      });

      expect(payload).toBeDefined();

      if (payload?.delivery.mode === "np_branch") {
        expect(payload.delivery.source).toBeUndefined();
      }
    }
  });

  it("drops a wrongly typed warehouse number instead of losing the order", () => {
    for (const warehouse_number of [true, [], {}, 1.5, -1, Number.NaN]) {
      const payload = decode({
        delivery: buildDeliveryBranch({ warehouse_number }),
      });

      expect(payload).toBeDefined();

      if (payload?.delivery.mode === "np_branch") {
        expect(payload.delivery.warehouse_number).toBeUndefined();
        expect(payload.delivery.warehouse).toBe(
          "Відділення №1: вул. Городоцька, 359"
        );
      }
    }
  });

  it("drops a wrongly typed country and state instead of losing the order", () => {
    const payload = decode({
      delivery: buildDeliveryGeneric({ country: 1, state: 0 }),
    });

    expect(payload).toBeDefined();

    if (payload?.delivery.mode === "generic") {
      expect(payload.delivery.country).toBeUndefined();
      expect(payload.delivery.state).toBeUndefined();
      expect(payload.delivery.city).toBe("Kraków");
    }
  });

  it("drops a wrongly typed apartment but keeps a whole number", () => {
    const dropped = decode({
      delivery: buildDeliveryCourier({ apartment: 1.5 }),
    });

    if (dropped?.delivery.mode === "np_courier") {
      expect(dropped.delivery.apartment).toBeUndefined();
    }

    const kept = decode({
      delivery: buildDeliveryCourier({ apartment: 12 }),
    });

    if (kept?.delivery.mode === "np_courier") {
      expect(kept.delivery.apartment).toBe("12");
    }
  });

  it("still fails closed on the integrity set", () => {
    expectReject({ total: 42 }, "total_not_plain_decimal");
    expectReject({ currency: 42 }, "currency_malformed");
    expectReject({ locale: 42 }, "locale_not_string");
    expectReject({ cart: 42 }, "cart_not_array");
    expectReject(
      { delivery: buildDeliveryBranch({ mode: 42 }) },
      "delivery_mode_unknown"
    );
    expectReject(
      { customer: buildCustomer({ first_name: 42 }) },
      "customer_field_missing"
    );
  });
});

describe("parseOrder shared payload rules", () => {
  it("rejects every coercible total that would render a plausible figure", () => {
    for (const total of GARBAGE_TOTALS) {
      expectReject({ total }, "total_not_plain_decimal");
    }
  });

  it("rejects a total with more digits than money can have", () => {
    expectReject({ total: "9".repeat(400) }, "total_not_plain_decimal");
    expectReject({ total: "9".repeat(21) }, "total_not_plain_decimal");
  });

  it("accepts a total right at the digit bound", () => {
    const payload = decode({ total: "9".repeat(20) });

    expect(payload).toBeDefined();

    if (payload) {
      expect(payload.total).toBe("9".repeat(20));
    }
  });

  it("rejects a malformed currency code", () => {
    for (const currency of ["UAHX", "ua", "uah", "U1H", "", 42]) {
      expectReject({ currency }, "currency_malformed");
    }
  });

  it("accepts an absent currency so the locale map can take over", () => {
    const order = buildOrder();

    delete order["currency"];

    const payload = payloadOf(parseOrder(order));

    expect(payload).toBeDefined();

    if (payload) {
      expect(payload.currency).toBeUndefined();
    }
  });

  it("rejects a non-string locale", () => {
    expectReject({ locale: 42 }, "locale_not_string");
  });

  it("accepts an unknown but valid locale", () => {
    expect(decode({ locale: "pl" })).toBeDefined();
  });

  it("rejects a cart that is not an array", () => {
    expectReject({ cart: {} }, "cart_not_array");
    expectReject({ cart: { title: "x" } }, "cart_not_array");
  });

  it("rejects an empty cart", () => {
    expectReject({ cart: [] }, "cart_empty");
  });

  it("rejects a cart item that is not an object", () => {
    expectReject({ cart: ["patch"] }, "cart_item_malformed");
  });

  it("rejects a cart item with an empty title", () => {
    expectReject(
      { cart: [buildCartItem({ title: "  " })] },
      "cart_item_malformed"
    );
  });

  it("rejects an empty product url", () => {
    for (const productUrl of ["", "   "]) {
      expectReject(
        { cart: [buildCartItem({ productUrl })] },
        "cart_item_malformed"
      );
    }
  });

  it("rejects a cart item with a non-string productUrl", () => {
    const item = buildCartItem();

    item["productUrl"] = null;

    expectReject({ cart: [item] }, "cart_item_malformed");
  });

  it("rejects a quantity beyond any sane order", () => {
    for (const quantity of [1e21, 100_001, Number.MAX_SAFE_INTEGER]) {
      expectReject(
        { cart: [buildCartItem({ quantity })] },
        "cart_item_malformed"
      );
    }
  });

  it("rejects a non-integer or non-positive quantity", () => {
    for (const quantity of [0, -1, 1.5]) {
      expectReject(
        { cart: [buildCartItem({ quantity })] },
        "cart_item_malformed"
      );
    }
  });

  it("rejects a cart item whose quantity is a numeric string", () => {
    const item = buildCartItem();

    item["quantity"] = "2";

    expectReject({ cart: [item] }, "cart_item_malformed");
  });

  it("rejects a body that is not an object", () => {
    for (const body of ["string", 42, null, undefined, ["a"]]) {
      expectRejectedBody(body, "body_not_object");
    }
  });
});

describe("parseOrder tolerance", () => {
  it("tolerates unknown extra keys at the top level", () => {
    expect(decode({ utm_source: "telegram", nested: { a: 1 } })).toBeDefined();
  });

  it("tolerates unknown extra keys inside the customer", () => {
    const payload = decode({
      customer: buildCustomer({ middle_name: "Іван", loyalty: { tier: 3 } }),
    });

    expect(payload).toBeDefined();

    if (payload) {
      expect(payload.customer.first_name).toBe("Марія");
    }
  });

  it("tolerates unknown extra keys inside the delivery", () => {
    const payload = decode({
      delivery: buildDeliveryBranch({ warehouse_ref: "uuid", geo: [49, 24] }),
    });

    expect(payload).toBeDefined();

    if (payload?.delivery.mode === "np_branch") {
      expect(payload.delivery.warehouse_number).toBe("1");
    }
  });

  it("tolerates unknown extra keys inside a cart item", () => {
    const item = buildCartItem();

    item["sku"] = "UTG-001";

    const payload = decode({ cart: [item] });

    expect(payload).toBeDefined();

    if (payload) {
      expect(payload.cart).toHaveLength(1);
      expect(payload.cart[0]?.quantity).toBe(2);
    }
  });

  it("accepts a stray source on a generic delivery and does not store it", () => {
    const payload = decode({
      delivery: buildDeliveryGeneric({ source: "np_directory" }),
    });

    expect(payload).toBeDefined();

    if (payload?.delivery.mode === "generic") {
      expect("source" in payload.delivery).toBe(false);
      expect(payload.delivery.country).toBe("Poland");
    }
  });

  it("normalises a numeric warehouse number to a string", () => {
    const payload = decode({
      delivery: buildDeliveryBranch({ warehouse_number: 1 }),
    });

    expect(payload).toBeDefined();

    if (payload?.delivery.mode === "np_branch") {
      expect(payload.delivery.warehouse_number).toBe("1");
    }
  });

  it("accepts a contact channel nobody pinned", () => {
    const payload = decode({
      customer: buildCustomer({ contact_channel: "дзвінок" }),
    });

    expect(payload).toBeDefined();

    if (payload) {
      expect(payload.customer.contact_channel).toBe("дзвінок");
    }
  });

  it("accepts an unknown future source and degrades it to absent", () => {
    const payload = decode({
      delivery: buildDeliveryBranch({ source: "np_directory_street" }),
    });

    expect(payload).toBeDefined();

    if (payload?.delivery.mode === "np_branch") {
      expect(payload.delivery.source).toBeUndefined();
    }
  });
});

describe("parseOrder delivery mode and locale independence", () => {
  it("decodes a generic delivery under the uk locale", () => {
    const payload = decode({
      locale: "uk",
      delivery: buildDeliveryGeneric(),
    });

    expect(payload).toBeDefined();

    if (payload) {
      expect(payload.locale).toBe("uk");
      expect(payload.delivery.mode).toBe("generic");
    }
  });

  it("decodes a branch delivery under the en locale", () => {
    const payload = decode({ locale: "en", delivery: buildDeliveryBranch() });

    expect(payload).toBeDefined();

    if (payload) {
      expect(payload.locale).toBe("en");
      expect(payload.delivery.mode).toBe("np_branch");
    }
  });
});

describe("decodeEnvelopeBody", () => {
  it("decodes a body handed straight to it", () => {
    const payload = payloadOf(decodeEnvelopeBody(buildOrder()));

    expect(payload).toBeDefined();

    if (payload) {
      expect(payload.customer.last_name).toBe("Шевченко");
      expect(payload.delivery.mode).toBe("np_branch");
    }
  });

  it("ignores the version key because the gate already ruled on it", () => {
    const order = buildOrder({ version: 99 });

    delete order["locale"];

    const rejected = decodeEnvelopeBody(order);

    expect(rejected.ok).toBe(false);

    if (!rejected.ok) {
      expect(rejected.reason).toBe("locale_not_string");
    }

    const payload = payloadOf(decodeEnvelopeBody(buildOrder({ version: 99 })));

    expect(payload).toBeDefined();
  });

  it("names the reason without any dispatch help", () => {
    const order = buildOrder();

    delete order["customer"];

    const result = decodeEnvelopeBody(order);

    expect(result.ok).toBe(false);

    if (!result.ok) {
      expect(result.reason).toBe("customer_not_object");
    }
  });
});

describe("the reject reason set", () => {
  const DECLARED_REASONS: Readonly<Record<RejectReason, true>> = {
    body_not_object: true,
    locale_not_string: true,
    total_not_plain_decimal: true,
    currency_malformed: true,
    cart_not_array: true,
    cart_empty: true,
    cart_item_malformed: true,
    version_unsupported: true,
    customer_not_object: true,
    customer_field_missing: true,
    delivery_not_object: true,
    delivery_mode_missing: true,
    delivery_mode_unknown: true,
    delivery_city_missing: true,
    delivery_warehouse_missing: true,
    delivery_street_missing: true,
    delivery_building_missing: true,
    delivery_address_missing: true,
  };

  const HOSTILE_VALUES: readonly unknown[] = [
    undefined,
    null,
    "",
    "   ",
    0,
    -1,
    1.5,
    42,
    true,
    false,
    {},
    [],
    ["x"],
    { nested: 1 },
    "\u0000",
    "x".repeat(500),
  ];

  const TOP_KEYS: readonly string[] = [
    "version",
    "idempotency_key",
    "locale",
    "customer",
    "delivery",
    "comment",
    "cart",
    "total",
    "currency",
    "additional",
    "unknown_future_key",
  ];

  const CUSTOMER_KEYS: readonly string[] = [
    "first_name",
    "last_name",
    "patronymic",
    "phone",
    "contact_channel",
    "unknown_future_key",
  ];

  const DELIVERY_BUILDERS: readonly ((
    overrides: Record<string, unknown>
  ) => Record<string, unknown>)[] = [
    buildDeliveryBranch,
    buildDeliveryPostomat,
    buildDeliveryCourier,
    buildDeliveryGeneric,
  ];

  const DELIVERY_KEYS: readonly string[] = [
    "address",
    "mode",
    "source",
    "city",
    "warehouse",
    "warehouse_number",
    "street",
    "building",
    "apartment",
    "country",
    "state",
    "unknown_future_key",
  ];

  const bodies = (): readonly unknown[] => {
    const out: unknown[] = ["string", 42, null, undefined, ["a"], {}];

    for (const key of TOP_KEYS) {
      for (const value of HOSTILE_VALUES) {
        out.push(buildOrder({ [key]: value }));
      }
    }

    for (const key of CUSTOMER_KEYS) {
      for (const value of HOSTILE_VALUES) {
        out.push(buildOrder({ customer: buildCustomer({ [key]: value }) }));
      }
    }

    for (const build of DELIVERY_BUILDERS) {
      for (const key of DELIVERY_KEYS) {
        for (const value of HOSTILE_VALUES) {
          out.push(buildOrder({ delivery: build({ [key]: value }) }));
        }
      }
    }

    for (const value of HOSTILE_VALUES) {
      out.push(buildOrder({ cart: [{ ...buildCartItem(), quantity: value }] }));
      out.push(buildOrder({ cart: [value] }));
    }

    return out;
  };

  it("never produces a reason outside the declared union", () => {
    const seen = new Set<string>();
    let rejected = 0;

    for (const body of bodies()) {
      const result = parseOrder(body);

      if (!result.ok) {
        rejected += 1;
        seen.add(result.reason);
        expect(DECLARED_REASONS[result.reason]).toBe(true);
      }
    }

    expect(rejected).toBeGreaterThan(100);
    expect(seen.size).toBeGreaterThan(10);
  });

  it("renders every body it accepts, within the telegram budget", () => {
    let rendered = 0;

    for (const body of bodies()) {
      const result = parseOrder(body);

      if (!result.ok) {
        continue;
      }

      const message = renderOrder(result.value);

      rendered += 1;
      expect(message.length).toBeLessThanOrEqual(4096);
      expect(message).toContain("\u{1F6D2} <b>Товари:</b>");
    }

    expect(rendered).toBeGreaterThan(100);
  });

  it("never throws, whatever the body carries", () => {
    for (const body of bodies()) {
      expect(() => parseOrder(body)).not.toThrow();
    }
  });
});
