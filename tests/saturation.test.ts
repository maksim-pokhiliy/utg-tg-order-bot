import { describe, expect, it } from "vitest";

import { buildOmittedMarker, omittedMarkerAllowance } from "../src/message.js";
import { renderOrder } from "../src/messageV2.js";
import {
  SATURATED_DELIVERIES,
  saturatedPayloadV1,
  saturatedPayloadV2,
} from "./support/saturation.js";

const TELEGRAM_LIMIT = 4096;
const TITLE_LABEL = "🏷️ <b>Title:</b>";
const TOTAL_LABEL = "💲 <b>Total:</b>";
const MIN_SURVIVING_BLOCKS = 2;
const ITEM_SEPARATOR_WIDTH = 2;

const blocksIn = (message: string): number =>
  message.split(TITLE_LABEL).length - 1;

describe("the composed message can never exceed the telegram limit", () => {
  it("holds for a v1 order with every field saturated with astral text", () => {
    const message = renderOrder({ kind: "v1", payload: saturatedPayloadV1 });

    expect(message.length).toBeLessThanOrEqual(TELEGRAM_LIMIT);
    expect(message).toMatch(/… <b>\+\d+ more positions<\/b>$/u);
    expect(message).toContain(TOTAL_LABEL);
    expect(blocksIn(message)).toBeGreaterThanOrEqual(MIN_SURVIVING_BLOCKS);
  });

  for (const [mode, delivery] of Object.entries(SATURATED_DELIVERIES)) {
    it(`holds for a v2 ${mode} order with every field saturated`, () => {
      const message = renderOrder({
        kind: "v2",
        payload: saturatedPayloadV2(delivery),
      });

      expect(message.length).toBeLessThanOrEqual(TELEGRAM_LIMIT);
      expect(message).toMatch(/… <b>\+\d+ more positions<\/b>$/u);
      expect(message).toContain(TOTAL_LABEL);
      expect(blocksIn(message)).toBeGreaterThanOrEqual(MIN_SURVIVING_BLOCKS);
    });
  }

  it("never splits a surrogate pair while clamping astral fields", () => {
    for (const delivery of Object.values(SATURATED_DELIVERIES)) {
      const message = renderOrder({
        kind: "v2",
        payload: saturatedPayloadV2(delivery),
      });

      expect(message.toWellFormed()).toBe(message);
      expect(Buffer.from(message, "utf8").toString("utf8")).toBe(message);
    }
  });

  it("leaves the cart a budget that still fits the omitted marker", () => {
    for (const delivery of Object.values(SATURATED_DELIVERIES)) {
      const payload = saturatedPayloadV2(delivery);
      const header = renderOrder({
        kind: "v2",
        payload: { ...payload, cart: [] },
      });

      expect(
        header.length + omittedMarkerAllowance(payload.cart.length)
      ).toBeLessThanOrEqual(TELEGRAM_LIMIT);
    }
  });

  it("reserves enough for the widest marker a cart of any size can produce", () => {
    for (const size of [1, 60, 999_999, 1_000_000, 10_000_000, 123_456_789]) {
      expect(omittedMarkerAllowance(size)).toBeGreaterThanOrEqual(
        buildOmittedMarker(size).length + ITEM_SEPARATOR_WIDTH
      );
    }
  });
});
