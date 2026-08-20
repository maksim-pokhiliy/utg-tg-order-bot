import { describe, expect, it } from "vitest";

import { renderOrder } from "../src/message.js";
import { parseOrder } from "../src/payload.js";
import {
  buildCartItem,
  buildDeliveryGeneric,
  buildOrder,
} from "./support/orderPayload.js";

const TELEGRAM_LIMIT = 4096;
const BOUNDARY_CART_SIZE = 40;
const BOUNDARY_NOTE = 216;
const BOUNDARY_ITEMS = 40;
const OVER_BOUNDARY_ITEMS = 39;
const CART_TITLE_LIMIT = 200;
const CART_URL_LIMIT = 400;
const LONGEST_TOTAL = "9".repeat(20);
const TITLE_LABEL = "🏷️ <b>Title:</b>";
const REPRO_CART_SIZE = 60;
const REPRO_URL = "https://s.test/";
const ASTRAL_SUFFIX = "\u{20000}";

const render = (input: Record<string, unknown>): string => {
  const result = parseOrder(input);

  if (!result.ok) {
    throw new Error(`fixture rejected: ${result.reason}`);
  }

  return renderOrder(result.value);
};

const boundaryCart = (): Record<string, unknown>[] =>
  Array.from({ length: BOUNDARY_CART_SIZE }, (_, index) =>
    buildCartItem({
      title: `T${String(index)}`,
      productUrl: "https://s.test/p",
    })
  );

const itemsIn = (message: string): number =>
  message.split(TITLE_LABEL).length - 1;

const reproCart = (suffix: string): Record<string, unknown>[] =>
  Array.from({ length: REPRO_CART_SIZE }, (_, index) =>
    buildCartItem({
      title: `Товар ${String(index)}${suffix}`,
      productUrl: REPRO_URL,
    })
  );

describe("the budget measured in the unit telegram counts (BDEF-4)", () => {
  it("keeps a plain ukrainian 60-position order under the limit", () => {
    const message = render(buildOrder({ cart: reproCart("") }));

    expect(message.length).toBeLessThanOrEqual(TELEGRAM_LIMIT);
    expect(message).toMatch(/… <b>\+\d+ more positions<\/b>$/u);
    expect(message).toContain("👤 <b>First Name:</b> Марія");
    expect(message).toContain("💲 <b>Total:</b>");
  });

  it("keeps the same order under the limit when a title carries an astral character", () => {
    const message = render(buildOrder({ cart: reproCart(ASTRAL_SUFFIX) }));

    expect(message.length).toBeLessThanOrEqual(TELEGRAM_LIMIT);
    expect(message).toContain(ASTRAL_SUFFIX);
    expect(message).toMatch(/… <b>\+\d+ more positions<\/b>$/u);
  });

  it("keeps the same cart under the limit behind a free-form address", () => {
    const message = render(
      buildOrder({
        delivery: buildDeliveryGeneric(),
        cart: reproCart(""),
      })
    );

    expect(message.length).toBeLessThanOrEqual(TELEGRAM_LIMIT);
    expect(message).toMatch(/… <b>\+\d+ more positions<\/b>$/u);
  });
});

describe("the shared telegram budget", () => {
  it("fits exactly the cart the budget has room for", () => {
    const message = render(
      buildOrder({
        comment: "x".repeat(BOUNDARY_NOTE),
        cart: boundaryCart(),
      })
    );

    expect(itemsIn(message)).toBe(BOUNDARY_ITEMS);
    expect(message.length).toBeLessThanOrEqual(TELEGRAM_LIMIT);
  });

  it("drops one position as soon as the header grows by a single character", () => {
    const message = render(
      buildOrder({
        comment: "x".repeat(BOUNDARY_NOTE + 1),
        cart: boundaryCart(),
      })
    );

    expect(itemsIn(message)).toBe(OVER_BOUNDARY_ITEMS);
    expect(message).toMatch(/… <b>\+1 more positions<\/b>$/u);
  });

  it("spends the same budget and marks the same way behind a free-form address", () => {
    const v2 = render(
      buildOrder({
        locale: "uk",
        delivery: buildDeliveryGeneric(),
        comment: "x".repeat(BOUNDARY_NOTE),
        cart: boundaryCart(),
      })
    );

    expect(v2.length).toBeLessThanOrEqual(TELEGRAM_LIMIT);
    expect(v2).toMatch(/… <b>\+\d+ more positions<\/b>$/u);
    expect(itemsIn(v2)).toBeGreaterThan(0);
  });

  it("never grows the cart when the header grows", () => {
    let previous = Number.POSITIVE_INFINITY;

    for (const note of [0, 100, 200, 300, 400, 500, 600]) {
      const message = render(
        buildOrder({ comment: "x".repeat(note), cart: boundaryCart() })
      );

      const items = itemsIn(message);

      expect(items).toBeLessThanOrEqual(previous);
      expect(message.length).toBeLessThanOrEqual(TELEGRAM_LIMIT);

      previous = items;
    }
  });
});

describe("the shared cart clamps", () => {
  it("renders a title that sits exactly on the limit whole", () => {
    const title = "т".repeat(CART_TITLE_LIMIT);
    const message = render(buildOrder({ cart: [buildCartItem({ title })] }));

    expect(message).toContain(`${TITLE_LABEL} ${title}`);
    expect(message).not.toContain(`${title}…`);
  });

  it("marks a title one character past the limit", () => {
    const title = "т".repeat(CART_TITLE_LIMIT + 1);
    const message = render(buildOrder({ cart: [buildCartItem({ title })] }));

    expect(message).toContain(
      `${TITLE_LABEL} ${"т".repeat(CART_TITLE_LIMIT)}…`
    );
  });

  it("renders a product url that sits exactly on the limit whole", () => {
    const productUrl = `https://s.test/${"p".repeat(CART_URL_LIMIT - 15)}`;
    const message = render(
      buildOrder({ cart: [buildCartItem({ productUrl })] })
    );

    expect(productUrl.length).toBe(CART_URL_LIMIT);
    expect(message).toContain(`🔗 <b>Product URL:</b> ${productUrl}`);
    expect(message).not.toContain(`${productUrl}…`);
  });

  it("marks a product url one character past the limit", () => {
    const productUrl = `https://s.test/${"p".repeat(CART_URL_LIMIT - 14)}`;
    const message = render(
      buildOrder({ cart: [buildCartItem({ productUrl })] })
    );

    expect(productUrl.length).toBe(CART_URL_LIMIT + 1);
    expect(message).toContain(
      `🔗 <b>Product URL:</b> ${productUrl.slice(0, CART_URL_LIMIT)}…`
    );
  });
});

describe("the clamps that no accepted payload can reach", () => {
  it("renders the longest total the decoder accepts without marking it", () => {
    const message = render(buildOrder({ total: LONGEST_TOTAL }));
    const line = message
      .split("\n")
      .find((entry) => entry.startsWith("💲 <b>Total:</b>"));

    expect(line).toBeDefined();
    expect(line).not.toContain("…");
    expect((line ?? "").length).toBeGreaterThan(30);
  });

  it("renders the largest quantity the decoder accepts without marking it", () => {
    const message = render(
      buildOrder({ cart: [buildCartItem({ quantity: 100000 })] })
    );

    expect(message).toContain("🔢 <b>Quantity:</b> 100000");
  });

  it("bounds the work an escape-heavy note can force", () => {
    const before = process.memoryUsage().heapUsed;

    render(buildOrder({ comment: "&".repeat(4_000_000) }));

    expect(process.memoryUsage().heapUsed - before).toBeLessThan(60_000_000);
  });
});
