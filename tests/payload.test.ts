import { describe, expect, it } from "vitest";

import { parseOrderPayload, type RejectReason } from "../src/payload";
import { buildCartItem, buildOrder } from "./support/orderPayload";

const expectReject = (
  overrides: Record<string, unknown>,
  reason: RejectReason
): void => {
  const result = parseOrderPayload(buildOrder(overrides));

  expect(result.ok).toBe(false);

  if (!result.ok) {
    expect(result.reason).toBe(reason);
  }
};

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

describe("parseOrderPayload", () => {
  it("accepts the canonical shop payload", () => {
    const result = parseOrderPayload(buildOrder());

    expect(result.ok).toBe(true);

    if (result.ok) {
      expect(result.value.currency).toBe("UAH");
      expect(result.value.cart).toHaveLength(1);
      expect(result.value.cart[0]?.quantity).toBe(2);
    }
  });

  it("tolerates unknown extra keys", () => {
    const result = parseOrderPayload(
      buildOrder({ utm_source: "telegram", nested: { a: 1 } })
    );

    expect(result.ok).toBe(true);
  });

  it("accepts an empty additional note", () => {
    expect(parseOrderPayload(buildOrder({ additional: "" })).ok).toBe(true);
  });

  it("accepts an absent additional note and defaults it to an empty string", () => {
    const order = buildOrder();

    delete order["additional"];

    const result = parseOrderPayload(order);

    expect(result.ok).toBe(true);

    if (result.ok) {
      expect(result.value.additional).toBe("");
    }
  });

  it("accepts an absent currency so the locale map can take over", () => {
    const order = buildOrder();

    delete order["currency"];

    const result = parseOrderPayload(order);

    expect(result.ok).toBe(true);

    if (result.ok) {
      expect(result.value.currency).toBeUndefined();
    }
  });

  it("accepts an unknown but valid locale", () => {
    expect(parseOrderPayload(buildOrder({ locale: "pl" })).ok).toBe(true);
  });

  it("rejects a body that is not an object", () => {
    for (const body of ["string", 42, null, undefined, ["a"]]) {
      const result = parseOrderPayload(body);

      expect(result.ok).toBe(false);

      if (!result.ok) {
        expect(result.reason).toBe("body_not_object");
      }
    }
  });

  it("rejects a missing required contact field", () => {
    expectReject({ telephone: undefined }, "required_field_missing");
  });

  it("rejects an empty required contact field", () => {
    expectReject({ city: "   " }, "required_field_missing");
  });

  it("rejects a non-string required contact field", () => {
    expectReject({ first_name: 42 }, "required_field_missing");
  });

  it("rejects a non-string additional note", () => {
    expectReject({ additional: 42 }, "additional_not_string");
  });

  it("rejects a non-string locale", () => {
    expectReject({ locale: 42 }, "locale_not_string");
  });

  it("rejects every coercible total that would render a plausible figure", () => {
    for (const total of GARBAGE_TOTALS) {
      expectReject({ total }, "total_not_plain_decimal");
    }
  });

  it("rejects a malformed currency code", () => {
    for (const currency of ["UAHX", "ua", "U1H", "", 42]) {
      expectReject({ currency }, "currency_malformed");
    }
  });

  it("rejects a cart that is not an array", () => {
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

  it("rejects a cart item with a non-string productUrl", () => {
    const item = buildCartItem();

    item["productUrl"] = null;

    expectReject({ cart: [item] }, "cart_item_malformed");
  });
});
