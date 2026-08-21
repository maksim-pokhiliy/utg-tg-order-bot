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
const BOUNDARY_NOTE = 282;
const BOUNDARY_ITEMS = 40;
const OVER_BOUNDARY_ITEMS = 39;
const WIDEST_NOTE = 600;
const CART_TITLE_LIMIT = 200;
const CART_URL_LIMIT = 400;
const LONGEST_TOTAL = "9".repeat(20);
const TITLE_LABEL = "🏷️ <b>Назва:</b>";
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

const renderAtNote = (note: number): string =>
  render(buildOrder({ comment: "x".repeat(note), cart: boundaryCart() }));

const itemsAtNote = (note: number): number => itemsIn(renderAtNote(note));

const widestNoteFittingWholeCart = (): number => {
  let fits = 0;
  let drops = WIDEST_NOTE;

  while (fits + 1 < drops) {
    const middle = Math.floor((fits + drops) / 2);

    if (itemsAtNote(middle) === BOUNDARY_ITEMS) {
      fits = middle;
    } else {
      drops = middle;
    }
  }

  return fits;
};

const reproCart = (suffix: string): Record<string, unknown>[] =>
  Array.from({ length: REPRO_CART_SIZE }, (_, index) =>
    buildCartItem({
      title: `Товар ${String(index)}${suffix}`,
      productUrl: REPRO_URL,
    })
  );

describe("the budget measured in the unit telegram counts (BDEF-4)", () => {
  it("keeps a 60-position order of ukrainian titles under the limit", () => {
    const message = render(buildOrder({ cart: reproCart("") }));

    expect(message.length).toBeLessThanOrEqual(TELEGRAM_LIMIT);
    expect(message).toMatch(/… <b>ще позицій: \+\d+<\/b>$/u);
    expect(message).toContain("👤 <b>Ім’я:</b> Марія");
    expect(message).toContain("💲 <b>Сума:</b>");
  });

  it("keeps the same order under the limit when a title carries an astral character", () => {
    const message = render(buildOrder({ cart: reproCart(ASTRAL_SUFFIX) }));

    expect(message.length).toBeLessThanOrEqual(TELEGRAM_LIMIT);
    expect(message).toContain(ASTRAL_SUFFIX);
    expect(message).toMatch(/… <b>ще позицій: \+\d+<\/b>$/u);
  });

  it("keeps the same cart under the limit behind a free-form address", () => {
    const message = render(
      buildOrder({
        delivery: buildDeliveryGeneric(),
        cart: reproCart(""),
      })
    );

    expect(message.length).toBeLessThanOrEqual(TELEGRAM_LIMIT);
    expect(message).toMatch(/… <b>ще позицій: \+\d+<\/b>$/u);
  });
});

describe("the shared telegram budget", () => {
  it("puts the truncation edge exactly where the boundary note pins it", () => {
    const atEdge = renderAtNote(BOUNDARY_NOTE);
    const pastEdge = renderAtNote(BOUNDARY_NOTE + 1);

    expect(widestNoteFittingWholeCart()).toBe(BOUNDARY_NOTE);
    expect(itemsIn(atEdge)).toBe(BOUNDARY_ITEMS);
    expect(atEdge.length).toBeLessThanOrEqual(TELEGRAM_LIMIT);
    expect(itemsIn(pastEdge)).toBe(OVER_BOUNDARY_ITEMS);
    expect(pastEdge).toMatch(/… <b>ще позицій: \+1<\/b>$/u);
  });

  it("truncates a free-form address order and marks it the same way", () => {
    const message = render(
      buildOrder({
        locale: "uk",
        delivery: buildDeliveryGeneric(),
        comment: "x".repeat(WIDEST_NOTE),
        cart: boundaryCart(),
      })
    );

    expect(message.length).toBeLessThanOrEqual(TELEGRAM_LIMIT);
    expect(message).toMatch(/… <b>ще позицій: \+\d+<\/b>$/u);
    expect(itemsIn(message)).toBeGreaterThan(0);
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
    expect(message).toContain(`🔗 <b>Посилання:</b> ${productUrl}`);
    expect(message).not.toContain(`${productUrl}…`);
  });

  it("marks a product url one character past the limit", () => {
    const productUrl = `https://s.test/${"p".repeat(CART_URL_LIMIT - 14)}`;
    const message = render(
      buildOrder({ cart: [buildCartItem({ productUrl })] })
    );

    expect(productUrl.length).toBe(CART_URL_LIMIT + 1);
    expect(message).toContain(
      `🔗 <b>Посилання:</b> ${productUrl.slice(0, CART_URL_LIMIT)}…`
    );
  });
});

describe("the clamps that no accepted payload can reach", () => {
  it("renders the longest total the decoder accepts without marking it", () => {
    const message = render(buildOrder({ total: LONGEST_TOTAL }));
    const line = message
      .split("\n")
      .find((entry) => entry.startsWith("💲 <b>Сума:</b>"));

    expect(line).toBeDefined();
    expect(line).not.toContain("…");
    expect((line ?? "").length).toBeGreaterThan(30);
  });

  it("renders the largest quantity the decoder accepts without marking it", () => {
    const message = render(
      buildOrder({ cart: [buildCartItem({ quantity: 100000 })] })
    );

    expect(message).toContain("🔢 <b>Кількість:</b> 100000");
  });

  it("bounds the work an escape-heavy note can force", () => {
    const before = process.memoryUsage().heapUsed;

    render(buildOrder({ comment: "&".repeat(4_000_000) }));

    expect(process.memoryUsage().heapUsed - before).toBeLessThan(60_000_000);
  });
});

describe("no order the decoder accepts can exceed the telegram limit", () => {
  const CART_SIZES = [1, 5, 9, 13, 17, 21, 25, 31, 40];
  const TITLE_LENGTHS = [1, 40, 96, 144, 200];
  const COMMENT_LENGTHS = [0, 51, 101, 200, 600];

  it("holds across the cart, title and comment ranges the composer must budget", () => {
    let widest = 0;

    for (const size of CART_SIZES) {
      for (const titleLength of TITLE_LENGTHS) {
        for (const commentLength of COMMENT_LENGTHS) {
          const message = render(
            buildOrder({
              comment: "к".repeat(commentLength),
              cart: Array.from({ length: size }, (_, index) =>
                buildCartItem({
                  title: `${String(index)}${"т".repeat(titleLength)}`,
                  productUrl: REPRO_URL,
                })
              ),
            })
          );

          widest = Math.max(widest, message.length);

          expect(message.length).toBeLessThanOrEqual(TELEGRAM_LIMIT);
        }
      }
    }

    expect(widest).toBeGreaterThan(TELEGRAM_LIMIT - 100);
  });
});
