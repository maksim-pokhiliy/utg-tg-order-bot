import { describe, expect, it } from "vitest";

import { canonicalize, hashOrder } from "../src/orderHash.js";
import { parseOrder } from "../src/payload.js";
import {
  buildCartLine,
  buildEnvelope,
  buildPinnedBody,
  PINNED_ENVELOPE,
  PINNED_HASH,
} from "./support/envelope.js";

const hashBody = (body: Record<string, unknown>): string => {
  const result = parseOrder(body);

  if (!result.ok) {
    throw new Error(`pinned body rejected: ${result.reason}`);
  }

  return hashOrder(result.value);
};

describe("the canonical serialization", () => {
  it("orders object keys the same way whatever order they were written in", () => {
    expect(canonicalize({ b: 1, a: 2 })).toBe(canonicalize({ a: 2, b: 1 }));
    expect(canonicalize({ b: 1, a: 2 })).toBe('{"a":2,"b":1}');
  });

  it("sorts keys by utf-16 code unit, never by locale", () => {
    expect(canonicalize({ é: 1, a: 2, B: 3, Z: 4, _: 5 })).toBe(
      '{"B":3,"Z":4,"_":5,"a":2,"é":1}'
    );
  });

  it("omits keys whose value is undefined, exactly like JSON.stringify", () => {
    expect(canonicalize({ a: 1, b: undefined })).toBe('{"a":1}');
    expect(canonicalize({ a: 1, b: undefined })).toBe(canonicalize({ a: 1 }));
  });

  it("keeps array order, because a reordered cart is a different order", () => {
    expect(canonicalize([1, 2])).not.toBe(canonicalize([2, 1]));
  });

  it("serializes null, strings, numbers and nesting without throwing", () => {
    expect(canonicalize(null)).toBe("null");
    expect(canonicalize("ы")).toBe('"ы"');
    expect(canonicalize(2)).toBe("2");
    expect(canonicalize({ a: [{ b: null }] })).toBe('{"a":[{"b":null}]}');
  });
});

describe("the content hash", () => {
  it("hashes two envelopes that differ only by their idempotency key identically", () => {
    const first = hashOrder(PINNED_ENVELOPE);
    const second = hashOrder(buildEnvelope({ idempotency_key: "other-key" }));
    const third = hashOrder(buildEnvelope({ idempotency_key: undefined }));

    expect(first).toBe(second);
    expect(first).toBe(third);
    expect(first).toBe(PINNED_HASH);
  });

  it("stays pinned to the canon that produced every stored row", () => {
    expect(hashOrder(PINNED_ENVELOPE)).toBe(PINNED_HASH);
    expect(hashOrder(PINNED_ENVELOPE)).toMatch(/^[0-9a-f]{64}$/);
  });

  it("changes when the money figure changes", () => {
    expect(hashOrder(buildEnvelope({ total: "300.00" }))).not.toBe(PINNED_HASH);
  });

  it("changes when the cart gains a line", () => {
    expect(
      hashOrder(
        buildEnvelope({
          cart: [buildCartLine(), buildCartLine({ title: "Другий" })],
        })
      )
    ).not.toBe(PINNED_HASH);
  });

  it("changes when a cart line is removed", () => {
    const twoLines = hashOrder(
      buildEnvelope({
        cart: [buildCartLine(), buildCartLine({ title: "Другий" })],
      })
    );
    const oneLine = hashOrder(buildEnvelope({ cart: [buildCartLine()] }));

    expect(oneLine).not.toBe(twoLines);
    expect(oneLine).toBe(PINNED_HASH);
  });

  it("changes when the quantity of a line changes", () => {
    expect(
      hashOrder(buildEnvelope({ cart: [buildCartLine({ quantity: 3 })] }))
    ).not.toBe(PINNED_HASH);
  });

  it("changes when two cart lines swap places", () => {
    const forward = hashOrder(
      buildEnvelope({
        cart: [buildCartLine(), buildCartLine({ title: "Другий" })],
      })
    );
    const reversed = hashOrder(
      buildEnvelope({
        cart: [buildCartLine({ title: "Другий" }), buildCartLine()],
      })
    );

    expect(forward).not.toBe(reversed);
  });

  it("treats an absent optional field and an explicitly undefined one as the same order", () => {
    expect(hashOrder(buildEnvelope({ comment: undefined }))).toBe(PINNED_HASH);
  });
});

describe("order identity through the decoder", () => {
  it("decodes the pinned body onto the hash that produced every stored row", () => {
    expect(hashBody(buildPinnedBody())).toBe(PINNED_HASH);
  });
});
