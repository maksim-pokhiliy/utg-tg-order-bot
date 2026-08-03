import { describe, expect, it } from "vitest";

import { buildOrderMessage } from "../src/message.js";
import { parseOrderPayload, type OrderPayload } from "../src/payload.js";

const DISTINCT_ORDER = {
  first_name: "FirstNameValue",
  last_name: "LastNameValue",
  telephone: "TelephoneValue",
  country: "CountryValue",
  state: "StateValue",
  city: "CityValue",
  address: "AddressValue",
  additional: "AdditionalValue",
  locale: "en",
  total: "1234.50",
  currency: "USD",
  cart: [
    {
      id: "ignored-id",
      price: 999,
      image: "ignored-image",
      title: "TitleValue",
      quantity: 7,
      productUrl: "ProductUrlValue",
    },
  ],
};

const GOLDEN_MESSAGE = [
  "👤 <b>First Name:</b> FirstNameValue",
  "🧔 <b>Last Name:</b> LastNameValue",
  "📞 <b>Telephone:</b> TelephoneValue",
  "🌍 <b>Country:</b> CountryValue",
  "🌍 <b>State:</b> StateValue",
  "🌍 <b>City:</b> CityValue",
  "🏠 <b>Address:</b> AddressValue",
  "💲 <b>Total:</b> $1,234.50",
  "📄 <b>Additional Information:</b> AdditionalValue",
  "",
  "🛒 <b>Products:</b>",
  "",
  " 🏷️ <b>Title:</b> TitleValue",
  "🔢 <b>Quantity:</b> 7",
  "🔗 <b>Product URL:</b> ProductUrlValue",
].join("\n");

const parse = (input: Record<string, unknown>): OrderPayload => {
  const result = parseOrderPayload(input);

  if (!result.ok) {
    throw new Error(`fixture rejected: ${result.reason}`);
  }

  return result.value;
};

describe("the rendered order message", () => {
  it("maps every label to its own field and nothing else", () => {
    expect(buildOrderMessage(parse(DISTINCT_ORDER))).toBe(GOLDEN_MESSAGE);
  });

  it("renders each contact value exactly once", () => {
    const message = buildOrderMessage(parse(DISTINCT_ORDER));

    for (const value of [
      "FirstNameValue",
      "LastNameValue",
      "TelephoneValue",
      "CountryValue",
      "StateValue",
      "CityValue",
      "AddressValue",
      "AdditionalValue",
      "TitleValue",
      "ProductUrlValue",
    ]) {
      expect(message.split(value)).toHaveLength(2);
    }
  });

  it("never leaks the cart keys it is contracted to ignore", () => {
    const message = buildOrderMessage(parse(DISTINCT_ORDER));

    expect(message).not.toContain("ignored-id");
    expect(message).not.toContain("ignored-image");
    expect(message).not.toContain("999");
  });
});
