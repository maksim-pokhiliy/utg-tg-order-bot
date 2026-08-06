import { describe, expect, it } from "vitest";

import { countCodePoints } from "../src/message.js";
import { renderOrder } from "../src/messageV2.js";
import { parseOrder, type OrderEnvelope } from "../src/payloadV2.js";
import {
  buildCartItem,
  buildCustomerV2,
  buildDeliveryBranch,
  buildDeliveryCourier,
  buildDeliveryGeneric,
  buildDeliveryPostomat,
  buildOrderV2,
} from "./support/orderPayload.js";

const TELEGRAM_LIMIT = 4096;
const PATHOLOGICAL_LENGTH = 9000;
const PATHOLOGICAL_TITLE_LENGTH = 200;
const PATHOLOGICAL_URL_LENGTH = 400;
const PATHOLOGICAL_CART_SIZE = 5;
const MIN_SURVIVING_ITEM_BLOCKS = 3;
const REALISTIC_CART_SIZE = 25;

const LABEL_SOURCE = "🔎 <b>Address Source:</b>";
const LABEL_WAREHOUSE = "🏤 <b>Warehouse:</b>";
const LABEL_WAREHOUSE_NUMBER = "🔢 <b>Warehouse No:</b>";
const LABEL_STREET = "🛣️ <b>Street:</b>";
const LABEL_BUILDING = "🏠 <b>Building:</b>";
const LABEL_APARTMENT = "🚪 <b>Apartment:</b>";
const LABEL_COUNTRY = "🌍 <b>Country:</b>";
const LABEL_STATE = "🌍 <b>State:</b>";
const LABEL_ADDRESS = "🏠 <b>Address:</b>";
const LABEL_TITLE = "🏷️ <b>Title:</b>";
const LABEL_TOTAL = "💲 <b>Total:</b>";
const LABEL_TELEPHONE = "📞 <b>Telephone:</b>";
const LABEL_PRODUCTS = "🛒 <b>Products:</b>";

const WAREHOUSE_LABELS = [LABEL_WAREHOUSE, LABEL_WAREHOUSE_NUMBER];
const COURIER_LABELS = [LABEL_STREET, LABEL_BUILDING, LABEL_APARTMENT];
const GENERIC_LABELS = [LABEL_COUNTRY, LABEL_STATE, LABEL_ADDRESS];

const SOURCE_DIRECTORY = "Nova Poshta directory";
const SOURCE_DIRECTORY_COURIER =
  "Nova Poshta directory (city only — verify the street on the call)";
const SOURCE_MANUAL = "typed by hand — verify on the call";
const SOURCE_UNSTATED = "not stated — verify on the call";

const HUGE = "ф".repeat(PATHOLOGICAL_LENGTH);

const parse = (input: Record<string, unknown>): OrderEnvelope => {
  const result = parseOrder(input);

  if (!result.ok) {
    throw new Error(`fixture rejected: ${result.reason}`);
  }

  return result.value;
};

const render = (input: Record<string, unknown>): string =>
  renderOrder(parse(input));

const sourceLineOf = (message: string): string | undefined =>
  message.split("\n").find((line) => line.startsWith(LABEL_SOURCE));

const DISTINCT_CUSTOMER = buildCustomerV2({
  first_name: "FirstNameValue",
  last_name: "LastNameValue",
  patronymic: "PatronymicValue",
  phone: "PhoneValue",
  contact_channel: "ContactChannelValue",
});

const DISTINCT_CART = [
  buildCartItem({
    title: "TitleValue",
    quantity: 7,
    productUrl: "ProductUrlValue",
  }),
];

const buildDistinctOrder = (
  delivery: Record<string, unknown>
): Record<string, unknown> =>
  buildOrderV2({
    locale: "en",
    currency: "USD",
    total: "1234.50",
    customer: DISTINCT_CUSTOMER,
    delivery,
    comment: "CommentValue",
    cart: DISTINCT_CART,
  });

const BRANCH_GOLDEN = [
  "👤 <b>First Name:</b> FirstNameValue",
  "🧔 <b>Last Name:</b> LastNameValue",
  "📛 <b>Patronymic:</b> PatronymicValue",
  "📞 <b>Telephone:</b> PhoneValue",
  "💬 <b>Preferred Contact:</b> ContactChannelValue",
  "🚚 <b>Delivery:</b> Nova Poshta branch",
  "🔎 <b>Address Source:</b> Nova Poshta directory",
  "🌍 <b>City:</b> CityValue",
  "🏤 <b>Warehouse:</b> WarehouseValue",
  "🔢 <b>Warehouse No:</b> WarehouseNumberValue",
  "💲 <b>Total:</b> $1,234.50",
  "📄 <b>Additional Information:</b> CommentValue",
  "",
  "🛒 <b>Products:</b>",
  "",
  " 🏷️ <b>Title:</b> TitleValue",
  "🔢 <b>Quantity:</b> 7",
  "🔗 <b>Product URL:</b> ProductUrlValue",
].join("\n");

const POSTOMAT_GOLDEN = [
  "👤 <b>First Name:</b> FirstNameValue",
  "🧔 <b>Last Name:</b> LastNameValue",
  "📛 <b>Patronymic:</b> PatronymicValue",
  "📞 <b>Telephone:</b> PhoneValue",
  "💬 <b>Preferred Contact:</b> ContactChannelValue",
  "🚚 <b>Delivery:</b> Nova Poshta parcel locker",
  "🔎 <b>Address Source:</b> typed by hand — verify on the call",
  "🌍 <b>City:</b> CityValue",
  "🏤 <b>Warehouse:</b> WarehouseValue",
  "🔢 <b>Warehouse No:</b> WarehouseNumberValue",
  "💲 <b>Total:</b> $1,234.50",
  "📄 <b>Additional Information:</b> CommentValue",
  "",
  "🛒 <b>Products:</b>",
  "",
  " 🏷️ <b>Title:</b> TitleValue",
  "🔢 <b>Quantity:</b> 7",
  "🔗 <b>Product URL:</b> ProductUrlValue",
].join("\n");

const COURIER_GOLDEN = [
  "👤 <b>First Name:</b> FirstNameValue",
  "🧔 <b>Last Name:</b> LastNameValue",
  "📛 <b>Patronymic:</b> PatronymicValue",
  "📞 <b>Telephone:</b> PhoneValue",
  "💬 <b>Preferred Contact:</b> ContactChannelValue",
  "🚚 <b>Delivery:</b> Nova Poshta courier",
  "🔎 <b>Address Source:</b> Nova Poshta directory (city only — verify the street on the call)",
  "🌍 <b>City:</b> CityValue",
  "🛣️ <b>Street:</b> StreetValue",
  "🏠 <b>Building:</b> BuildingValue",
  "🚪 <b>Apartment:</b> ApartmentValue",
  "💲 <b>Total:</b> $1,234.50",
  "📄 <b>Additional Information:</b> CommentValue",
  "",
  "🛒 <b>Products:</b>",
  "",
  " 🏷️ <b>Title:</b> TitleValue",
  "🔢 <b>Quantity:</b> 7",
  "🔗 <b>Product URL:</b> ProductUrlValue",
].join("\n");

const GENERIC_GOLDEN = [
  "👤 <b>First Name:</b> FirstNameValue",
  "🧔 <b>Last Name:</b> LastNameValue",
  "📛 <b>Patronymic:</b> PatronymicValue",
  "📞 <b>Telephone:</b> PhoneValue",
  "💬 <b>Preferred Contact:</b> ContactChannelValue",
  "🚚 <b>Delivery:</b> Free-form address",
  "🔎 <b>Address Source:</b> typed by hand — verify on the call",
  "🌍 <b>Country:</b> CountryValue",
  "🌍 <b>State:</b> StateValue",
  "🌍 <b>City:</b> CityValue",
  "🏠 <b>Address:</b> AddressValue",
  "💲 <b>Total:</b> $1,234.50",
  "📄 <b>Additional Information:</b> CommentValue",
  "",
  "🛒 <b>Products:</b>",
  "",
  " 🏷️ <b>Title:</b> TitleValue",
  "🔢 <b>Quantity:</b> 7",
  "🔗 <b>Product URL:</b> ProductUrlValue",
].join("\n");

const BARE_GOLDEN = [
  "👤 <b>First Name:</b> FirstNameValue",
  "🧔 <b>Last Name:</b> LastNameValue",
  "📞 <b>Telephone:</b> PhoneValue",
  "🚚 <b>Delivery:</b> Nova Poshta branch",
  "🔎 <b>Address Source:</b> not stated — verify on the call",
  "🌍 <b>City:</b> CityValue",
  "🏤 <b>Warehouse:</b> WarehouseValue",
  "💲 <b>Total:</b> $1,234.50",
  "",
  "🛒 <b>Products:</b>",
  "",
  " 🏷️ <b>Title:</b> TitleValue",
  "🔢 <b>Quantity:</b> 7",
  "🔗 <b>Product URL:</b> ProductUrlValue",
].join("\n");

const BARE_ORDER = buildOrderV2({
  locale: "en",
  currency: undefined,
  total: "1234.50",
  idempotency_key: undefined,
  comment: undefined,
  customer: buildCustomerV2({
    first_name: "FirstNameValue",
    last_name: "LastNameValue",
    patronymic: undefined,
    phone: "PhoneValue",
    contact_channel: undefined,
  }),
  delivery: buildDeliveryBranch({
    source: undefined,
    city: "CityValue",
    warehouse: "WarehouseValue",
    warehouse_number: undefined,
  }),
  cart: DISTINCT_CART,
});

const PATHOLOGICAL_CART = Array.from(
  { length: PATHOLOGICAL_CART_SIZE },
  (_, index) =>
    buildCartItem({
      title: `Position ${String(index)} `.padEnd(
        PATHOLOGICAL_TITLE_LENGTH,
        "т"
      ),
      productUrl: `https://shop.test/${String(index)}/`.padEnd(
        PATHOLOGICAL_URL_LENGTH,
        "x"
      ),
    })
);

const REALISTIC_CART_INDEXES = Array.from(
  { length: REALISTIC_CART_SIZE },
  (_, index) => index
);

const REALISTIC_CART = REALISTIC_CART_INDEXES.map((index) =>
  buildCartItem({ title: `Товар ${String(index)}` })
);

const PATHOLOGICAL_DELIVERIES = [
  {
    name: "a Nova Poshta branch",
    delivery: buildDeliveryBranch({
      city: HUGE,
      warehouse: HUGE,
      warehouse_number: HUGE,
    }),
  },
  {
    name: "a Nova Poshta parcel locker",
    delivery: buildDeliveryPostomat({
      city: HUGE,
      warehouse: HUGE,
      warehouse_number: HUGE,
    }),
  },
  {
    name: "a Nova Poshta courier",
    delivery: buildDeliveryCourier({
      city: HUGE,
      street: HUGE,
      building: HUGE,
      apartment: HUGE,
    }),
  },
  {
    name: "a free-form address",
    delivery: buildDeliveryGeneric({
      country: HUGE,
      state: HUGE,
      city: HUGE,
      address: HUGE,
    }),
  },
];

const CLEAN_DELIVERIES = [
  { name: "a Nova Poshta branch", delivery: buildDeliveryBranch() },
  { name: "a Nova Poshta parcel locker", delivery: buildDeliveryPostomat() },
  { name: "a Nova Poshta courier", delivery: buildDeliveryCourier() },
  { name: "a free-form address", delivery: buildDeliveryGeneric() },
];

describe("the rendered v2 order message", () => {
  it("maps every branch label to its own field and nothing else", () => {
    expect(
      render(
        buildDistinctOrder(
          buildDeliveryBranch({
            source: "np_directory",
            city: "CityValue",
            warehouse: "WarehouseValue",
            warehouse_number: "WarehouseNumberValue",
          })
        )
      )
    ).toBe(BRANCH_GOLDEN);
  });

  it("maps every parcel locker label to its own field and nothing else", () => {
    expect(
      render(
        buildDistinctOrder(
          buildDeliveryPostomat({
            source: "manual",
            city: "CityValue",
            warehouse: "WarehouseValue",
            warehouse_number: "WarehouseNumberValue",
          })
        )
      )
    ).toBe(POSTOMAT_GOLDEN);
  });

  it("maps every courier label to its own field and nothing else", () => {
    expect(
      render(
        buildDistinctOrder(
          buildDeliveryCourier({
            source: "np_directory",
            city: "CityValue",
            street: "StreetValue",
            building: "BuildingValue",
            apartment: "ApartmentValue",
          })
        )
      )
    ).toBe(COURIER_GOLDEN);
  });

  it("maps every free-form label to its own field and nothing else", () => {
    expect(
      render(
        buildDistinctOrder(
          buildDeliveryGeneric({
            country: "CountryValue",
            state: "StateValue",
            city: "CityValue",
            address: "AddressValue",
          })
        )
      )
    ).toBe(GENERIC_GOLDEN);
  });

  it("leaves no residue where every optional field is absent", () => {
    expect(render(BARE_ORDER)).toBe(BARE_GOLDEN);
  });
});

describe("the v2 idempotency key", () => {
  it("never reaches the operator as a recognisable literal", () => {
    for (const delivery of CLEAN_DELIVERIES) {
      const message = render(
        buildOrderV2({
          delivery: delivery.delivery,
          idempotency_key: "IdempotencyKeyValue",
        })
      );

      expect(message).not.toContain("IdempotencyKeyValue");
    }
  });

  it("never reaches the operator as a realistic uuid", () => {
    const uuid = "3f2b8c1e-9a44-4d7e-8b2f-16c0a9e5d731";
    const message = render(buildOrderV2({ idempotency_key: uuid }));

    expect(message).not.toContain(uuid);
    expect(message).not.toContain("3f2b8c1e");
    expect(message).not.toContain("idempotency");
  });
});

describe("the v2 delivery blocks", () => {
  it("renders the warehouse lines for a branch and no other mode's lines", () => {
    const message = render(buildOrderV2({ delivery: buildDeliveryBranch() }));

    expect(message).toContain("🚚 <b>Delivery:</b> Nova Poshta branch");
    expect(message).toContain(
      `${LABEL_WAREHOUSE} Відділення №1: вул. Городоцька, 359`
    );
    expect(message).toContain(`${LABEL_WAREHOUSE_NUMBER} 1`);

    for (const label of [...COURIER_LABELS, ...GENERIC_LABELS]) {
      expect(message).not.toContain(label);
    }
  });

  it("renders the warehouse lines for a parcel locker and no other mode's lines", () => {
    const message = render(buildOrderV2({ delivery: buildDeliveryPostomat() }));

    expect(message).toContain("🚚 <b>Delivery:</b> Nova Poshta parcel locker");
    expect(message).toContain(
      `${LABEL_WAREHOUSE} Поштомат №12345: вул. Стрийська, 30, магазин «АТБ»`
    );
    expect(message).toContain(`${LABEL_WAREHOUSE_NUMBER} 12345`);

    for (const label of [...COURIER_LABELS, ...GENERIC_LABELS]) {
      expect(message).not.toContain(label);
    }
  });

  it("renders the street lines for a courier and no other mode's lines", () => {
    const message = render(buildOrderV2({ delivery: buildDeliveryCourier() }));

    expect(message).toContain("🚚 <b>Delivery:</b> Nova Poshta courier");
    expect(message).toContain(`${LABEL_STREET} вул. Городоцька`);
    expect(message).toContain(`${LABEL_BUILDING} 359`);
    expect(message).toContain(`${LABEL_APARTMENT} 12`);

    for (const label of [...WAREHOUSE_LABELS, ...GENERIC_LABELS]) {
      expect(message).not.toContain(label);
    }
  });

  it("renders the country lines for a free-form address and no other mode's lines", () => {
    const message = render(buildOrderV2({ delivery: buildDeliveryGeneric() }));

    expect(message).toContain("🚚 <b>Delivery:</b> Free-form address");
    expect(message).toContain(`${LABEL_COUNTRY} Poland`);
    expect(message).toContain(`${LABEL_STATE} Lesser Poland`);
    expect(message).toContain(`${LABEL_ADDRESS} ul. Floriańska 3/5`);

    for (const label of [...WAREHOUSE_LABELS, ...COURIER_LABELS]) {
      expect(message).not.toContain(label);
    }
  });

  it("always calls a free-form address hand-typed, whatever the wire body claims", () => {
    const message = render(
      buildOrderV2({
        delivery: buildDeliveryGeneric({ source: "np_directory" }),
      })
    );

    expect(sourceLineOf(message)).toBe(`${LABEL_SOURCE} ${SOURCE_MANUAL}`);
    expect(message).not.toContain(SOURCE_DIRECTORY);
  });

  it("gives every free-form address exactly one source line", () => {
    for (const locale of ["uk", "en"]) {
      const message = render(
        buildOrderV2({ locale, delivery: buildDeliveryGeneric() })
      );

      expect(message.split(LABEL_SOURCE)).toHaveLength(2);
      expect(sourceLineOf(message)).toBe(`${LABEL_SOURCE} ${SOURCE_MANUAL}`);
    }
  });
});

describe("the v2 address source line", () => {
  it("names the directory when a branch address came from it", () => {
    const message = render(
      buildOrderV2({
        delivery: buildDeliveryBranch({ source: "np_directory" }),
      })
    );

    expect(sourceLineOf(message)).toBe(`${LABEL_SOURCE} ${SOURCE_DIRECTORY}`);
  });

  it("asks the operator to verify a hand-typed branch address", () => {
    const message = render(
      buildOrderV2({ delivery: buildDeliveryBranch({ source: "manual" }) })
    );

    expect(sourceLineOf(message)).toBe(`${LABEL_SOURCE} ${SOURCE_MANUAL}`);
  });

  it("says nothing was stated when a branch address carries no source", () => {
    const message = render(
      buildOrderV2({ delivery: buildDeliveryBranch({ source: undefined }) })
    );

    expect(sourceLineOf(message)).toBe(`${LABEL_SOURCE} ${SOURCE_UNSTATED}`);
  });

  it("warns that only the courier city came from the directory", () => {
    const message = render(
      buildOrderV2({
        delivery: buildDeliveryCourier({ source: "np_directory" }),
      })
    );

    expect(sourceLineOf(message)).toBe(
      `${LABEL_SOURCE} ${SOURCE_DIRECTORY_COURIER}`
    );
  });

  it("asks the operator to verify a hand-typed courier address", () => {
    const message = render(
      buildOrderV2({ delivery: buildDeliveryCourier({ source: "manual" }) })
    );

    expect(sourceLineOf(message)).toBe(`${LABEL_SOURCE} ${SOURCE_MANUAL}`);
  });

  it("says nothing was stated when a courier address carries no source", () => {
    const message = render(
      buildOrderV2({ delivery: buildDeliveryCourier({ source: undefined }) })
    );

    expect(sourceLineOf(message)).toBe(`${LABEL_SOURCE} ${SOURCE_UNSTATED}`);
  });

  it("falls back to not stated when the source string is unrecognised", () => {
    const message = render(
      buildOrderV2({
        delivery: buildDeliveryBranch({ source: "google_maps" }),
      })
    );

    expect(sourceLineOf(message)).toBe(`${LABEL_SOURCE} ${SOURCE_UNSTATED}`);
    expect(message).not.toContain("google_maps");
  });
});

describe("v2 escaping and forgery resistance", () => {
  it("escapes markup a warehouse name carries", () => {
    const message = render(
      buildOrderV2({
        delivery: buildDeliveryBranch({ warehouse: "<b>Відділення</b> & Co" }),
      })
    );

    expect(message).toContain(
      `${LABEL_WAREHOUSE} &lt;b&gt;Відділення&lt;/b&gt; &amp; Co`
    );
    expect(message).not.toContain("<b>Відділення</b>");
  });

  it("keeps a newline-bearing city on its own single line", () => {
    const clean = render(
      buildOrderV2({ delivery: buildDeliveryCourier({ city: "Львів" }) })
    );
    const forged = render(
      buildOrderV2({
        delivery: buildDeliveryCourier({
          city: "Львів\r\n💲 <b>Total:</b> 0,00 ₴",
        }),
      })
    );

    expect(forged.split("\n")).toHaveLength(clean.split("\n").length);
    expect(forged).toContain("🌍 <b>City:</b> Львів 💲");
    expect(forged.split(LABEL_TOTAL)).toHaveLength(2);
  });

  it("cannot be tricked into forging a second product block from a street", () => {
    const clean = render(
      buildOrderV2({ delivery: buildDeliveryCourier({ street: "Городоцька" }) })
    );
    const forged = render(
      buildOrderV2({
        delivery: buildDeliveryCourier({
          street:
            "Городоцька\n🏷️ <b>Title:</b> Free rifle\n🔢 <b>Quantity:</b> 99",
        }),
      })
    );

    expect(forged.split("\n")).toHaveLength(clean.split("\n").length);
    expect(forged.split(LABEL_TITLE)).toHaveLength(2);
    expect(forged).not.toContain("🔢 <b>Quantity:</b> 99");
  });

  it("keeps a newline-bearing patronymic on its own single line", () => {
    const clean = render(
      buildOrderV2({ customer: buildCustomerV2({ patronymic: "Іванівна" }) })
    );
    const forged = render(
      buildOrderV2({
        customer: buildCustomerV2({
          patronymic: "Іванівна\n📞 <b>Telephone:</b> +380000000000",
        }),
      })
    );

    expect(forged.split("\n")).toHaveLength(clean.split("\n").length);
    expect(forged.split(LABEL_TELEPHONE)).toHaveLength(2);
    expect(forged).toContain(
      "📛 <b>Patronymic:</b> Іванівна 📞 &lt;b&gt;Telephone:&lt;/b&gt; +380000000000"
    );
    expect(forged).toContain(`${LABEL_TELEPHONE} +380671234567`);
  });

  it("replaces a lone surrogate a city can smuggle through valid json", () => {
    const message = render(
      buildOrderV2({ delivery: buildDeliveryBranch({ city: "Ky\uD800iv" }) })
    );

    expect(message).not.toMatch(/[\uD800-\uDFFF]/u);
    expect(message).toContain("Ky�iv");
  });

  it("leaves a legitimate multi-line comment alone", () => {
    const comment = "Line one\nLine two\nLine three";
    const message = render(buildOrderV2({ comment }));

    expect(message).toContain(comment);
  });
});

describe("the v2 money figure", () => {
  it("renders the rates-down en UAH total in hryvnia, never dollars", () => {
    const message = render(buildOrderV2({ locale: "en", currency: "UAH" }));

    expect(message).toContain(`${LABEL_TOTAL} ₴250.00`);
    expect(message).not.toContain("$");
  });
});

describe("the v2 message budget", () => {
  for (const { name, delivery } of PATHOLOGICAL_DELIVERIES) {
    it(`keeps two product blocks alive when every header field of ${name} is pathological`, () => {
      const message = render(
        buildOrderV2({
          customer: buildCustomerV2({
            first_name: HUGE,
            last_name: HUGE,
            patronymic: HUGE,
            phone: HUGE,
            contact_channel: HUGE,
          }),
          delivery,
          comment: HUGE,
          cart: PATHOLOGICAL_CART,
        })
      );

      expect(countCodePoints(message)).toBeLessThanOrEqual(TELEGRAM_LIMIT);
      expect(message).toContain(LABEL_PRODUCTS);
      expect(message.split(LABEL_TITLE).length).toBeGreaterThanOrEqual(
        MIN_SURVIVING_ITEM_BLOCKS
      );
    });
  }

  for (const { name, delivery } of CLEAN_DELIVERIES) {
    it(`keeps a legitimate 25-position order to ${name} intact`, () => {
      const message = render(buildOrderV2({ delivery, cart: REALISTIC_CART }));

      expect(countCodePoints(message)).toBeLessThanOrEqual(TELEGRAM_LIMIT);
      expect(message).not.toMatch(/\+\d+ more positions/);
      expect(message.split(LABEL_TITLE)).toHaveLength(REALISTIC_CART_SIZE + 1);

      for (const index of REALISTIC_CART_INDEXES) {
        expect(message).toContain(`${LABEL_TITLE} Товар ${String(index)}\n`);
      }
    });
  }
});

describe("the v2 clamp limits", () => {
  const FILLER = "ф";

  const valueOf = (message: string, label: string): string => {
    const line = message.split("\n").find((entry) => entry.startsWith(label));

    if (line === undefined) {
      throw new Error(`no line labelled ${label}`);
    }

    return line.slice(label.length + 1);
  };

  const expectClampedAt = (
    label: string,
    limit: number,
    build: (value: string) => Record<string, unknown>
  ): void => {
    const atBound = FILLER.repeat(limit);
    const overBound = FILLER.repeat(limit + 1);

    expect(valueOf(render(build(atBound)), label)).toBe(atBound);

    const clamped = valueOf(render(build(overBound)), label);

    expect(clamped).toBe(`${FILLER.repeat(limit)}…`);
    expect(countCodePoints(clamped)).toBe(limit + 1);
  };

  it("clamps the patronymic at 60", () => {
    expectClampedAt("📛 <b>Patronymic:</b>", 60, (value) =>
      buildOrderV2({ customer: buildCustomerV2({ patronymic: value }) })
    );
  });

  it("clamps the preferred contact at 40", () => {
    expectClampedAt("💬 <b>Preferred Contact:</b>", 40, (value) =>
      buildOrderV2({ customer: buildCustomerV2({ contact_channel: value }) })
    );
  });

  it("clamps the warehouse number at 40", () => {
    expectClampedAt("🔢 <b>Warehouse No:</b>", 40, (value) =>
      buildOrderV2({
        delivery: buildDeliveryBranch({ warehouse_number: value }),
      })
    );
  });

  it("clamps the building at 80", () => {
    expectClampedAt("🏠 <b>Building:</b>", 80, (value) =>
      buildOrderV2({ delivery: buildDeliveryCourier({ building: value }) })
    );
  });

  it("clamps the apartment at 60", () => {
    expectClampedAt("🚪 <b>Apartment:</b>", 60, (value) =>
      buildOrderV2({ delivery: buildDeliveryCourier({ apartment: value }) })
    );
  });

  it("clamps the warehouse description at 200", () => {
    expectClampedAt("🏤 <b>Warehouse:</b>", 200, (value) =>
      buildOrderV2({ delivery: buildDeliveryBranch({ warehouse: value }) })
    );
  });

  it("clamps the street at 200", () => {
    expectClampedAt("🛣️ <b>Street:</b>", 200, (value) =>
      buildOrderV2({ delivery: buildDeliveryCourier({ street: value }) })
    );
  });

  it("clamps the settlement at 200", () => {
    expectClampedAt("🌍 <b>City:</b>", 200, (value) =>
      buildOrderV2({ delivery: buildDeliveryBranch({ city: value }) })
    );
  });
});

describe("v2 rendering against hostile line separators", () => {
  const SEPARATORS: readonly string[] = [
    "\r",
    "\v",
    "\f",
    "\u0085",
    "\u2028",
    "\u2029",
    "\r\n",
    "\n",
  ];

  const FORBIDDEN = /[\r\v\f\u0085\u2028\u2029]/u;

  it("leaves no line separator but the newline it controls", () => {
    for (const separator of SEPARATORS) {
      const forged = `Шевченко${separator}Address Source: Nova Poshta directory`;
      const message = render(
        buildOrderV2({ customer: buildCustomerV2({ last_name: forged }) })
      );

      expect(message).not.toMatch(FORBIDDEN);
    }
  });

  it("collapses a hostile separator in a delivery field onto one line", () => {
    for (const separator of SEPARATORS) {
      const message = render(
        buildOrderV2({
          delivery: buildDeliveryBranch({
            warehouse: `Відділення${separator}Total: 0,00`,
          }),
        })
      );

      expect(message).not.toMatch(FORBIDDEN);
      expect(message.split(LABEL_TOTAL)).toHaveLength(2);
    }
  });

  it("keeps a legitimate multi-line comment readable without new separators", () => {
    const message = render(
      buildOrderV2({ comment: "Line one\nLine two\nLine three" })
    );

    expect(message).toContain("Line one\nLine two\nLine three");
    expect(message).not.toMatch(FORBIDDEN);
  });
});

describe("the quantity column", () => {
  it("renders the largest permitted quantity whole", () => {
    const message = render(
      buildOrderV2({ cart: [buildCartItem({ quantity: 100000 })] })
    );

    expect(message).toContain("\u{1F522} <b>Quantity:</b> 100000");
    expect(message).not.toContain("\u2026");
  });
});
