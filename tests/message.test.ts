import { describe, expect, it } from "vitest";

import {
  buildOrderMessage,
  clampEscaped,
  escapeHtml,
  formatTotal,
} from "../src/message";
import { parseOrderPayload, type OrderPayload } from "../src/payload";
import { buildCartItem, buildOrder } from "./support/orderPayload";

const NBSP = " ";

const parse = (overrides: Record<string, unknown> = {}): OrderPayload => {
  const result = parseOrderPayload(buildOrder(overrides));

  if (!result.ok) {
    throw new Error(`fixture rejected: ${result.reason}`);
  }

  return result.value;
};

describe("formatTotal", () => {
  it("renders a uk UAH total with the hryvnia sign and nbsp separators", () => {
    expect(formatTotal("46200.00", "uk", "UAH")).toBe(
      `46${NBSP}200,00${NBSP}₴`
    );
  });

  it("renders an en USD total with the dollar sign", () => {
    expect(formatTotal("46200.00", "en", "USD")).toBe("$46,200.00");
  });

  it("renders the rates-down en UAH total in hryvnia, never dollars", () => {
    const formatted = formatTotal("46200.00", "en", "UAH");

    expect(formatted).toBe("₴46,200.00");
    expect(formatted).not.toContain("$");
  });

  it("falls back to the locale map when currency is absent", () => {
    expect(formatTotal("100.00", "uk", undefined)).toContain("₴");
    expect(formatTotal("100.00", "en", undefined)).toContain("$");
  });

  it("formats an unknown but valid locale with the uk number style", () => {
    expect(formatTotal("46200.00", "pl", "UAH")).toBe(
      `46${NBSP}200,00${NBSP}₴`
    );
  });
});

describe("escapeHtml", () => {
  it("escapes ampersands before angle brackets", () => {
    expect(escapeHtml("<b>Tom & Jerry</b>")).toBe(
      "&lt;b&gt;Tom &amp; Jerry&lt;/b&gt;"
    );
  });

  it("leaves markdown control characters untouched", () => {
    expect(escapeHtml("вул._Шевченка_*12*")).toBe("вул._Шевченка_*12*");
  });
});

describe("clampEscaped", () => {
  it("returns the value unchanged when it fits", () => {
    expect(clampEscaped("abc", 10)).toBe("abc");
  });

  it("never leaves a truncated html entity at the boundary", () => {
    expect(clampEscaped("aa&amp;bb", 4)).toBe("aa…");
  });

  it("clamps emoji without splitting a surrogate pair", () => {
    const clamped = clampEscaped("🎯🎯🎯🎯", 2);

    expect(clamped).toBe("🎯🎯…");
    expect(Buffer.from(clamped, "utf8").toString("utf8")).toBe(clamped);
    expect(clamped).not.toMatch(/[\uD800-\uDFFF]/u);
  });
});

describe("buildOrderMessage", () => {
  it("keeps the legacy field order, emoji and bold labels", () => {
    const message = buildOrderMessage(parse());

    expect(message).toContain("👤 <b>First Name:</b> Олександр");
    expect(message).toContain("🧔 <b>Last Name:</b> Петренко");
    expect(message).toContain("📞 <b>Telephone:</b> +380671234567");
    expect(message).toContain("🏠 <b>Address:</b> вул. Шевченка, 12, кв. 5");
    expect(message).toContain("🛒 <b>Products:</b>");
    expect(message).toContain("🏷️ <b>Title:</b> Шеврон «Очікування»");
    expect(message).toContain("🔢 <b>Quantity:</b> 2");
    expect(message.indexOf("👤")).toBeLessThan(message.indexOf("🛒"));
  });

  it("escapes hostile field content instead of relaying markup", () => {
    const message = buildOrderMessage(
      parse({ first_name: "<b>Bobby</b> & co" })
    );

    expect(message).toContain("&lt;b&gt;Bobby&lt;/b&gt; &amp; co");
    expect(message).not.toContain("<b>Bobby</b>");
  });

  it("keeps an underscore-laden address literal", () => {
    const message = buildOrderMessage(parse({ address: "вул._Шевченка" }));

    expect(message).toContain("🏠 <b>Address:</b> вул._Шевченка");
  });

  it("clamps an over-long additional note and marks it", () => {
    const message = buildOrderMessage(parse({ additional: "x".repeat(5000) }));

    expect(message).toContain("…");
    expect(message.length).toBeLessThanOrEqual(4096);
  });

  it("truncates the cart listing and reports how many positions were dropped", () => {
    const cart = Array.from({ length: 60 }, (_, index) =>
      buildCartItem({ title: `Товар ${String(index)}` })
    );

    const message = buildOrderMessage(parse({ cart }));

    expect(message.length).toBeLessThanOrEqual(4096);
    expect(message).toMatch(/… <b>\+\d+ more positions<\/b>$/);
    expect(message).toContain("👤 <b>First Name:</b> Олександр");
    expect(message).toContain("💲 <b>Total:</b>");
  });

  it("keeps the header bounded even when every field is pathological", () => {
    const message = buildOrderMessage(
      parse({
        first_name: "ф".repeat(9000),
        last_name: "ф".repeat(9000),
        telephone: "9".repeat(9000),
        country: "ф".repeat(9000),
        state: "ф".repeat(9000),
        city: "ф".repeat(9000),
        address: "ф".repeat(9000),
        additional: "ф".repeat(9000),
        total: "9".repeat(300),
      })
    );

    expect(message.length).toBeLessThanOrEqual(4096);
    expect(message).toContain("🛒 <b>Products:</b>");
    expect(message).toContain("🏷️ <b>Title:</b>");
  });

  it("keeps a legitimate 25-position order intact", () => {
    const cart = Array.from({ length: 25 }, (_, index) =>
      buildCartItem({ title: `Товар ${String(index)}` })
    );

    const message = buildOrderMessage(parse({ cart }));

    expect(message.length).toBeLessThanOrEqual(4096);
    expect(message).toContain("Товар 24");
  });
});
