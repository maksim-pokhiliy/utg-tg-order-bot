import { describe, expect, it } from "vitest";

import { readCurrency, type OrderCartItem } from "../src/decode.js";
import {
  clampEscaped,
  composeMessage,
  escapeHtml,
  formatTotal,
} from "../src/render.js";

const NBSP = " ";

const PROBE_FIRST_CODE_UNIT = 0x40;
const PROBE_LAST_CODE_UNIT = 0x7d;
const CANONICAL_CURRENCY_CODES = 26 ** 3;

const PROBE_ALPHABET: readonly string[] = Array.from(
  { length: PROBE_LAST_CODE_UNIT - PROBE_FIRST_CODE_UNIT + 1 },
  (_unused, index) => String.fromCharCode(PROBE_FIRST_CODE_UNIT + index)
);

const collectAccepted = (accepted: Set<string>, prefix: string): void => {
  for (const last of PROBE_ALPHABET) {
    const read = readCurrency({ currency: `${prefix}${last}` }, "currency");

    if (read.isValid && read.code !== undefined) {
      accepted.add(read.code);
    }
  }
};

const acceptedCurrencyCodes = (): ReadonlySet<string> => {
  const accepted = new Set<string>();

  for (const first of PROBE_ALPHABET) {
    for (const second of PROBE_ALPHABET) {
      collectAccepted(accepted, `${first}${second}`);
    }
  }

  return accepted;
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

describe("the codes the decoder can hand to the money line", () => {
  it("accepts nothing the three-letter alphabet does not spell", () => {
    const accepted = acceptedCurrencyCodes();
    const stray = [...accepted].filter((code) => !/^[A-Z]{3}$/.test(code));

    expect(stray).toEqual([]);
    expect(accepted.size).toBe(CANONICAL_CURRENCY_CODES);
  });

  it("formats every code it accepts, so the money line cannot throw", () => {
    const throwing: string[] = [];

    for (const code of acceptedCurrencyCodes()) {
      try {
        formatTotal("250.00", "uk", code);
      } catch {
        throwing.push(code);
      }
    }

    expect(throwing).toEqual([]);
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

describe("composeMessage when the header leaves no room for the cart", () => {
  const cartLine = (title: string): OrderCartItem => ({
    title,
    quantity: 1,
    productUrl: "https://s.test/p",
  });

  it("emits the header and the omitted marker with no dangling separator", () => {
    const message = composeMessage(
      ["👤 <b>Ім’я:</b> " + "ф".repeat(4000)],
      [cartLine("A"), cartLine("B")]
    );

    expect(message).toMatch(/… <b>ще позицій: \+2<\/b>$/u);
    expect(message).not.toContain("🏷️ <b>Назва:</b>");
    expect(message).not.toMatch(/\n\n… <b>ще/u);
  });

  it("still renders the cart when the header does leave room", () => {
    const message = composeMessage(
      ["👤 <b>Ім’я:</b> Марія"],
      [cartLine("A"), cartLine("B")]
    );

    expect(message).toContain("🏷️ <b>Назва:</b> A");
    expect(message).toContain("🏷️ <b>Назва:</b> B");
    expect(message).not.toMatch(/ще позицій/u);
  });
});
