import { describe, expect, it } from "vitest";

import { clampEscaped, escapeHtml, formatTotal } from "../src/message.js";

const NBSP = " ";

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
    expect(formatTotal("46200.00", "de", "UAH")).toBe(
      `46${NBSP}200,00${NBSP}₴`
    );
    expect(new Intl.NumberFormat("de").format(46200)).toBe("46.200");
  });

  it("defaults to hryvnia when the locale is unknown and currency is absent", () => {
    expect(formatTotal("46200.00", "de", undefined)).toContain("₴");
  });

  it("does not walk the prototype chain for an object-key locale", () => {
    for (const locale of ["constructor", "toString", "__proto__", "valueOf"]) {
      expect(() => formatTotal("46200.00", locale, undefined)).not.toThrow();
      expect(formatTotal("46200.00", locale, undefined)).toContain("₴");
    }
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

  it("spends the limit in utf-16 units, so one emoji costs two", () => {
    const clamped = clampEscaped("🎯🎯🎯🎯", 2);

    expect(clamped).toBe("🎯…");
    expect(Buffer.from(clamped, "utf8").toString("utf8")).toBe(clamped);
    expect(clamped).not.toMatch(/[\uD800-\uDFFF]/u);
  });

  it("stops short rather than splitting a pair across the boundary", () => {
    const clamped = clampEscaped("🎯🎯🎯🎯", 3);

    expect(clamped).toBe("🎯…");
    expect(clamped).not.toMatch(/[\uD800-\uDFFF]/u);
  });
});
