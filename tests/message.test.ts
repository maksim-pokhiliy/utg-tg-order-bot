import { describe, expect, it } from "vitest";

import { renderOrder } from "../src/message.js";
import { parseOrder, type OrderEnvelope } from "../src/payload.js";
import { ORDER_CONTACT_CHANNEL_VALUES } from "./support/contract.js";
import {
  buildCartItem,
  buildCustomer,
  buildDeliveryBranch,
  buildDeliveryCourier,
  buildDeliveryGeneric,
  buildDeliveryPostomat,
  buildOrder,
} from "./support/orderPayload.js";

const TELEGRAM_LIMIT = 4096;
const PATHOLOGICAL_LENGTH = 9000;
const PATHOLOGICAL_TITLE_LENGTH = 200;
const PATHOLOGICAL_URL_LENGTH = 400;
const PATHOLOGICAL_CART_SIZE = 5;
const MIN_SURVIVING_ITEM_BLOCKS = 3;
const REALISTIC_CART_SIZE = 25;

const LABEL_SOURCE = "🔎 <b>Джерело адреси:</b>";
const LABEL_WAREHOUSE = "🏤 <b>Відділення:</b>";
const LABEL_WAREHOUSE_NUMBER = "🔢 <b>Відділення №:</b>";
const LABEL_STREET = "🛣️ <b>Вулиця:</b>";
const LABEL_BUILDING = "🏠 <b>Будинок:</b>";
const LABEL_APARTMENT = "🚪 <b>Квартира:</b>";
const LABEL_COUNTRY = "🌍 <b>Країна:</b>";
const LABEL_STATE = "🌍 <b>Область:</b>";
const LABEL_ADDRESS = "🏠 <b>Адреса:</b>";
const LABEL_TITLE = "🏷️ <b>Назва:</b>";
const LABEL_TOTAL = "💲 <b>Сума:</b>";
const LABEL_TELEPHONE = "📞 <b>Телефон:</b>";
const LABEL_PRODUCTS = "🛒 <b>Товари:</b>";

const WAREHOUSE_LABELS = [LABEL_WAREHOUSE, LABEL_WAREHOUSE_NUMBER];
const COURIER_LABELS = [LABEL_STREET, LABEL_BUILDING, LABEL_APARTMENT];
const GENERIC_LABELS = [LABEL_COUNTRY, LABEL_STATE, LABEL_ADDRESS];

const SOURCE_DIRECTORY = "Довідник Нової Пошти";
const SOURCE_DIRECTORY_COURIER =
  "Довідник Нової Пошти (лише місто — вулицю уточніть у дзвінку)";
const SOURCE_MANUAL = "введено вручну — уточніть у дзвінку";
const SOURCE_UNSTATED = "не вказано — уточніть у дзвінку";

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

const DISTINCT_CUSTOMER = buildCustomer({
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
  buildOrder({
    locale: "en",
    currency: "USD",
    total: "1234.50",
    customer: DISTINCT_CUSTOMER,
    delivery,
    comment: "CommentValue",
    cart: DISTINCT_CART,
  });

const BRANCH_GOLDEN = [
  "👤 <b>Ім’я:</b> FirstNameValue",
  "🧔 <b>Прізвище:</b> LastNameValue",
  "📛 <b>По батькові:</b> PatronymicValue",
  "📞 <b>Телефон:</b> PhoneValue",
  "💬 <b>Спосіб зв’язку:</b> ContactChannelValue",
  "🚚 <b>Доставка:</b> Відділення Нової Пошти",
  "🔎 <b>Джерело адреси:</b> Довідник Нової Пошти",
  "🌍 <b>Місто:</b> CityValue",
  "🏤 <b>Відділення:</b> WarehouseValue",
  "🔢 <b>Відділення №:</b> WarehouseNumberValue",
  "💲 <b>Сума:</b> $1,234.50",
  "📄 <b>Коментар:</b> CommentValue",
  "",
  "🛒 <b>Товари:</b>",
  "",
  " 🏷️ <b>Назва:</b> TitleValue",
  "🔢 <b>Кількість:</b> 7",
  "🔗 <b>Посилання:</b> ProductUrlValue",
].join("\n");

const POSTOMAT_GOLDEN = [
  "👤 <b>Ім’я:</b> FirstNameValue",
  "🧔 <b>Прізвище:</b> LastNameValue",
  "📛 <b>По батькові:</b> PatronymicValue",
  "📞 <b>Телефон:</b> PhoneValue",
  "💬 <b>Спосіб зв’язку:</b> ContactChannelValue",
  "🚚 <b>Доставка:</b> Поштомат Нової Пошти",
  "🔎 <b>Джерело адреси:</b> введено вручну — уточніть у дзвінку",
  "🌍 <b>Місто:</b> CityValue",
  "🏤 <b>Відділення:</b> WarehouseValue",
  "🔢 <b>Відділення №:</b> WarehouseNumberValue",
  "💲 <b>Сума:</b> $1,234.50",
  "📄 <b>Коментар:</b> CommentValue",
  "",
  "🛒 <b>Товари:</b>",
  "",
  " 🏷️ <b>Назва:</b> TitleValue",
  "🔢 <b>Кількість:</b> 7",
  "🔗 <b>Посилання:</b> ProductUrlValue",
].join("\n");

const COURIER_GOLDEN = [
  "👤 <b>Ім’я:</b> FirstNameValue",
  "🧔 <b>Прізвище:</b> LastNameValue",
  "📛 <b>По батькові:</b> PatronymicValue",
  "📞 <b>Телефон:</b> PhoneValue",
  "💬 <b>Спосіб зв’язку:</b> ContactChannelValue",
  "🚚 <b>Доставка:</b> Кур’єр Нової Пошти",
  "🔎 <b>Джерело адреси:</b> Довідник Нової Пошти (лише місто — вулицю уточніть у дзвінку)",
  "🌍 <b>Місто:</b> CityValue",
  "🛣️ <b>Вулиця:</b> StreetValue",
  "🏠 <b>Будинок:</b> BuildingValue",
  "🚪 <b>Квартира:</b> ApartmentValue",
  "💲 <b>Сума:</b> $1,234.50",
  "📄 <b>Коментар:</b> CommentValue",
  "",
  "🛒 <b>Товари:</b>",
  "",
  " 🏷️ <b>Назва:</b> TitleValue",
  "🔢 <b>Кількість:</b> 7",
  "🔗 <b>Посилання:</b> ProductUrlValue",
].join("\n");

const GENERIC_GOLDEN = [
  "👤 <b>Ім’я:</b> FirstNameValue",
  "🧔 <b>Прізвище:</b> LastNameValue",
  "📛 <b>По батькові:</b> PatronymicValue",
  "📞 <b>Телефон:</b> PhoneValue",
  "💬 <b>Спосіб зв’язку:</b> ContactChannelValue",
  "🚚 <b>Доставка:</b> Довільна адреса",
  "🔎 <b>Джерело адреси:</b> введено вручну — уточніть у дзвінку",
  "🌍 <b>Країна:</b> CountryValue",
  "🌍 <b>Область:</b> StateValue",
  "🌍 <b>Місто:</b> CityValue",
  "🏠 <b>Адреса:</b> AddressValue",
  "💲 <b>Сума:</b> $1,234.50",
  "📄 <b>Коментар:</b> CommentValue",
  "",
  "🛒 <b>Товари:</b>",
  "",
  " 🏷️ <b>Назва:</b> TitleValue",
  "🔢 <b>Кількість:</b> 7",
  "🔗 <b>Посилання:</b> ProductUrlValue",
].join("\n");

const BARE_GOLDEN = [
  "👤 <b>Ім’я:</b> FirstNameValue",
  "🧔 <b>Прізвище:</b> LastNameValue",
  "📞 <b>Телефон:</b> PhoneValue",
  "🚚 <b>Доставка:</b> Відділення Нової Пошти",
  "🔎 <b>Джерело адреси:</b> не вказано — уточніть у дзвінку",
  "🌍 <b>Місто:</b> CityValue",
  "🏤 <b>Відділення:</b> WarehouseValue",
  "💲 <b>Сума:</b> $1,234.50",
  "",
  "🛒 <b>Товари:</b>",
  "",
  " 🏷️ <b>Назва:</b> TitleValue",
  "🔢 <b>Кількість:</b> 7",
  "🔗 <b>Посилання:</b> ProductUrlValue",
].join("\n");

const BARE_ORDER = buildOrder({
  locale: "en",
  currency: undefined,
  total: "1234.50",
  idempotency_key: undefined,
  comment: undefined,
  customer: buildCustomer({
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

describe("the rendered order message", () => {
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

const BOLD_RUN = /<b>([^<]*)<\/b>/gu;

const labelsOf = (message: string): readonly string[] =>
  [...message.matchAll(BOLD_RUN)].map((match) => match[1] ?? "");

const BRANCH_LABEL_SEQUENCE: readonly string[] = [
  "Ім’я:",
  "Прізвище:",
  "По батькові:",
  "Телефон:",
  "Спосіб зв’язку:",
  "Доставка:",
  "Джерело адреси:",
  "Місто:",
  "Відділення:",
  "Відділення №:",
  "Сума:",
  "Коментар:",
  "Товари:",
  "Назва:",
  "Кількість:",
  "Посилання:",
];

const COURIER_LABEL_SEQUENCE: readonly string[] = [
  "Ім’я:",
  "Прізвище:",
  "По батькові:",
  "Телефон:",
  "Спосіб зв’язку:",
  "Доставка:",
  "Джерело адреси:",
  "Місто:",
  "Вулиця:",
  "Будинок:",
  "Квартира:",
  "Сума:",
  "Коментар:",
  "Товари:",
  "Назва:",
  "Кількість:",
  "Посилання:",
];

const GENERIC_LABEL_SEQUENCE: readonly string[] = [
  "Ім’я:",
  "Прізвище:",
  "По батькові:",
  "Телефон:",
  "Спосіб зв’язку:",
  "Доставка:",
  "Джерело адреси:",
  "Країна:",
  "Область:",
  "Місто:",
  "Адреса:",
  "Сума:",
  "Коментар:",
  "Товари:",
  "Назва:",
  "Кількість:",
  "Посилання:",
];

describe("the label sequence the operator reads", () => {
  it("renders the branch labels in order, with nothing extra", () => {
    expect(
      labelsOf(render(buildOrder({ delivery: buildDeliveryBranch() })))
    ).toEqual(BRANCH_LABEL_SEQUENCE);
  });

  it("renders the parcel locker labels in order, with nothing extra", () => {
    expect(
      labelsOf(render(buildOrder({ delivery: buildDeliveryPostomat() })))
    ).toEqual(BRANCH_LABEL_SEQUENCE);
  });

  it("renders the courier labels in order, with nothing extra", () => {
    expect(
      labelsOf(render(buildOrder({ delivery: buildDeliveryCourier() })))
    ).toEqual(COURIER_LABEL_SEQUENCE);
  });

  it("renders the free-form labels in order, with nothing extra", () => {
    expect(
      labelsOf(render(buildOrder({ delivery: buildDeliveryGeneric() })))
    ).toEqual(GENERIC_LABEL_SEQUENCE);
  });
});

const LATIN = /\p{Script=Latin}/u;
const MIN_RENDERED_LABELS = 12;
const DELIVERY_MODE_COUNT = 4;
const SOURCE_TEXT_COUNT = 4;
const LABEL_DELIVERY = "🚚 <b>Доставка:</b>";
const LABEL_CONTACT = "💬 <b>Спосіб зв’язку:</b>";

const CONTACT_CHANNEL_LABELS: ReadonlyMap<string, string> = new Map([
  ["call", "Дзвінок"],
  ["telegram", "Telegram"],
  ["viber", "Viber"],
]);

const SOURCE_SPREAD = [
  buildDeliveryBranch({ source: "np_directory" }),
  buildDeliveryBranch({ source: "manual" }),
  buildDeliveryBranch({ source: undefined }),
  buildDeliveryPostomat({ source: "np_directory" }),
  buildDeliveryCourier({ source: "np_directory" }),
  buildDeliveryGeneric(),
];

const lineValue = (message: string, label: string): string => {
  const line = message.split("\n").find((entry) => entry.startsWith(label));

  if (line === undefined) {
    throw new Error(`no line labelled ${label}`);
  }

  return line.slice(label.length + 1);
};

const expectNoLatinInLabels = (message: string): void => {
  const labels = labelsOf(message);

  expect(labels.length).toBeGreaterThanOrEqual(MIN_RENDERED_LABELS);

  for (const label of labels) {
    expect(label).not.toMatch(LATIN);
  }
};

describe("the script the labels are written in", () => {
  for (const { name, delivery } of CLEAN_DELIVERIES) {
    it(`writes no label in latin script for ${name}`, () => {
      expectNoLatinInLabels(render(buildOrder({ delivery })));
    });
  }

  it("writes no latin script in the omitted marker either", () => {
    const message = render(
      buildOrder({ comment: HUGE, cart: PATHOLOGICAL_CART })
    );

    expect(message).toContain("ще позицій:");
    expectNoLatinInLabels(message);
  });

  it("writes no latin script in the delivery mode or the address source", () => {
    const modes = new Set<string>();
    const sources = new Set<string>();

    for (const delivery of SOURCE_SPREAD) {
      const message = render(buildOrder({ delivery }));
      const mode = lineValue(message, LABEL_DELIVERY);
      const source = lineValue(message, LABEL_SOURCE);

      expect(mode).not.toMatch(LATIN);
      expect(source).not.toMatch(LATIN);

      modes.add(mode);
      sources.add(source);
    }

    expect(modes.size).toBe(DELIVERY_MODE_COUNT);
    expect(sources.size).toBe(SOURCE_TEXT_COUNT);
  });
});

describe("the contact channel the operator reads", () => {
  it("fails when the vocabulary and the pinned labels drift apart", () => {
    expect([...CONTACT_CHANNEL_LABELS.keys()].sort()).toEqual(
      [...ORDER_CONTACT_CHANNEL_VALUES].sort()
    );
  });

  it("names every channel the shop can send", () => {
    for (const value of ORDER_CONTACT_CHANNEL_VALUES) {
      const message = render(
        buildOrder({ customer: buildCustomer({ contact_channel: value }) })
      );

      expect(lineValue(message, LABEL_CONTACT)).toBe(
        CONTACT_CHANNEL_LABELS.get(value)
      );
    }
  });

  it("prints a channel nobody pinned exactly as it arrived", () => {
    const message = render(
      buildOrder({ customer: buildCustomer({ contact_channel: "signal" }) })
    );

    expect(lineValue(message, LABEL_CONTACT)).toBe("signal");
  });
});

describe("the idempotency key", () => {
  it("never reaches the operator as a recognisable literal", () => {
    for (const delivery of CLEAN_DELIVERIES) {
      const message = render(
        buildOrder({
          delivery: delivery.delivery,
          idempotency_key: "IdempotencyKeyValue",
        })
      );

      expect(message).not.toContain("IdempotencyKeyValue");
    }
  });

  it("never reaches the operator as a realistic uuid", () => {
    const uuid = "3f2b8c1e-9a44-4d7e-8b2f-16c0a9e5d731";
    const message = render(buildOrder({ idempotency_key: uuid }));

    expect(message).not.toContain(uuid);
    expect(message).not.toContain("3f2b8c1e");
    expect(message).not.toContain("idempotency");
  });
});

describe("the delivery blocks", () => {
  it("renders the warehouse lines for a branch and no other mode's lines", () => {
    const message = render(buildOrder({ delivery: buildDeliveryBranch() }));

    expect(message).toContain("🚚 <b>Доставка:</b> Відділення Нової Пошти");
    expect(message).toContain(
      `${LABEL_WAREHOUSE} Відділення No1: вул. Городоцька, 359`
    );
    expect(message).toContain(`${LABEL_WAREHOUSE_NUMBER} 1`);

    for (const label of [...COURIER_LABELS, ...GENERIC_LABELS]) {
      expect(message).not.toContain(label);
    }
  });

  it("renders the warehouse lines for a parcel locker and no other mode's lines", () => {
    const message = render(buildOrder({ delivery: buildDeliveryPostomat() }));

    expect(message).toContain("🚚 <b>Доставка:</b> Поштомат Нової Пошти");
    expect(message).toContain(
      `${LABEL_WAREHOUSE} Поштомат No12345: вул. Стрийська, 30, магазин «АТБ»`
    );
    expect(message).toContain(`${LABEL_WAREHOUSE_NUMBER} 12345`);

    for (const label of [...COURIER_LABELS, ...GENERIC_LABELS]) {
      expect(message).not.toContain(label);
    }
  });

  it("renders the street lines for a courier and no other mode's lines", () => {
    const message = render(buildOrder({ delivery: buildDeliveryCourier() }));

    expect(message).toContain("🚚 <b>Доставка:</b> Кур’єр Нової Пошти");
    expect(message).toContain(`${LABEL_STREET} вул. Городоцька`);
    expect(message).toContain(`${LABEL_BUILDING} 359`);
    expect(message).toContain(`${LABEL_APARTMENT} 12`);

    for (const label of [...WAREHOUSE_LABELS, ...GENERIC_LABELS]) {
      expect(message).not.toContain(label);
    }
  });

  it("renders the country lines for a free-form address and no other mode's lines", () => {
    const message = render(buildOrder({ delivery: buildDeliveryGeneric() }));

    expect(message).toContain("🚚 <b>Доставка:</b> Довільна адреса");
    expect(message).toContain(`${LABEL_COUNTRY} Poland`);
    expect(message).toContain(`${LABEL_STATE} Lesser Poland`);
    expect(message).toContain(`${LABEL_ADDRESS} ul. Floriańska 3/5`);

    for (const label of [...WAREHOUSE_LABELS, ...COURIER_LABELS]) {
      expect(message).not.toContain(label);
    }
  });

  it("always calls a free-form address hand-typed, whatever the wire body claims", () => {
    const message = render(
      buildOrder({
        delivery: buildDeliveryGeneric({ source: "np_directory" }),
      })
    );

    expect(sourceLineOf(message)).toBe(`${LABEL_SOURCE} ${SOURCE_MANUAL}`);
    expect(message).not.toContain(SOURCE_DIRECTORY);
  });

  it("gives every free-form address exactly one source line", () => {
    for (const locale of ["uk", "en"]) {
      const message = render(
        buildOrder({ locale, delivery: buildDeliveryGeneric() })
      );

      expect(message.split(LABEL_SOURCE)).toHaveLength(2);
      expect(sourceLineOf(message)).toBe(`${LABEL_SOURCE} ${SOURCE_MANUAL}`);
    }
  });
});

describe("the address source line", () => {
  it("names the directory when a branch address came from it", () => {
    const message = render(
      buildOrder({
        delivery: buildDeliveryBranch({ source: "np_directory" }),
      })
    );

    expect(sourceLineOf(message)).toBe(`${LABEL_SOURCE} ${SOURCE_DIRECTORY}`);
  });

  it("asks the operator to verify a hand-typed branch address", () => {
    const message = render(
      buildOrder({ delivery: buildDeliveryBranch({ source: "manual" }) })
    );

    expect(sourceLineOf(message)).toBe(`${LABEL_SOURCE} ${SOURCE_MANUAL}`);
  });

  it("says nothing was stated when a branch address carries no source", () => {
    const message = render(
      buildOrder({ delivery: buildDeliveryBranch({ source: undefined }) })
    );

    expect(sourceLineOf(message)).toBe(`${LABEL_SOURCE} ${SOURCE_UNSTATED}`);
  });

  it("warns that only the courier city came from the directory", () => {
    const message = render(
      buildOrder({
        delivery: buildDeliveryCourier({ source: "np_directory" }),
      })
    );

    expect(sourceLineOf(message)).toBe(
      `${LABEL_SOURCE} ${SOURCE_DIRECTORY_COURIER}`
    );
  });

  it("asks the operator to verify a hand-typed courier address", () => {
    const message = render(
      buildOrder({ delivery: buildDeliveryCourier({ source: "manual" }) })
    );

    expect(sourceLineOf(message)).toBe(`${LABEL_SOURCE} ${SOURCE_MANUAL}`);
  });

  it("says nothing was stated when a courier address carries no source", () => {
    const message = render(
      buildOrder({ delivery: buildDeliveryCourier({ source: undefined }) })
    );

    expect(sourceLineOf(message)).toBe(`${LABEL_SOURCE} ${SOURCE_UNSTATED}`);
  });

  it("falls back to the unstated warning when the source string is unrecognised", () => {
    const message = render(
      buildOrder({
        delivery: buildDeliveryBranch({ source: "google_maps" }),
      })
    );

    expect(sourceLineOf(message)).toBe(`${LABEL_SOURCE} ${SOURCE_UNSTATED}`);
    expect(message).not.toContain("google_maps");
  });
});

describe("escaping and forgery resistance", () => {
  it("escapes markup a cart title carries", () => {
    const message = render(
      buildOrder({ cart: [buildCartItem({ title: "<b>Patch</b> & co" })] })
    );

    expect(message).toContain(
      "🏷️ <b>Назва:</b> &lt;b&gt;Patch&lt;/b&gt; &amp; co"
    );
    expect(message).not.toContain("<b>Patch</b>");
  });

  it("escapes the ampersands a product url query string carries", () => {
    const message = render(
      buildOrder({
        cart: [
          buildCartItem({ productUrl: "https://shop.test/p?a=1&b=2&utm=<x>" }),
        ],
      })
    );

    expect(message).toContain(
      "🔗 <b>Посилання:</b> https://shop.test/p?a=1&amp;b=2&amp;utm=&lt;x&gt;"
    );
    expect(message).not.toMatch(/&(?!amp;|lt;|gt;)/);
  });

  it("escapes markup a comment carries", () => {
    const message = render(buildOrder({ comment: "<b>rush</b> & call" }));

    expect(message).toContain(
      "📄 <b>Коментар:</b> &lt;b&gt;rush&lt;/b&gt; &amp; call"
    );
    expect(message).not.toContain("<b>rush</b>");
  });

  it("escapes markup a warehouse name carries", () => {
    const message = render(
      buildOrder({
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
      buildOrder({ delivery: buildDeliveryCourier({ city: "Львів" }) })
    );
    const forged = render(
      buildOrder({
        delivery: buildDeliveryCourier({
          city: "Львів\r\n💲 <b>Сума:</b> 0,00 ₴",
        }),
      })
    );

    expect(forged.split("\n")).toHaveLength(clean.split("\n").length);
    expect(forged).toContain("🌍 <b>Місто:</b> Львів 💲");
    expect(forged.split(LABEL_TOTAL)).toHaveLength(2);
  });

  it("cannot be tricked into forging a second product block from a street", () => {
    const clean = render(
      buildOrder({ delivery: buildDeliveryCourier({ street: "Городоцька" }) })
    );
    const forged = render(
      buildOrder({
        delivery: buildDeliveryCourier({
          street:
            "Городоцька\n🏷️ <b>Назва:</b> Free rifle\n🔢 <b>Кількість:</b> 99",
        }),
      })
    );

    expect(forged.split("\n")).toHaveLength(clean.split("\n").length);
    expect(forged.split(LABEL_TITLE)).toHaveLength(2);
    expect(forged).not.toContain("🔢 <b>Кількість:</b> 99");
  });

  it("keeps a newline-bearing patronymic on its own single line", () => {
    const clean = render(
      buildOrder({ customer: buildCustomer({ patronymic: "Іванівна" }) })
    );
    const forged = render(
      buildOrder({
        customer: buildCustomer({
          patronymic: "Іванівна\n📞 <b>Телефон:</b> +380000000000",
        }),
      })
    );

    expect(forged.split("\n")).toHaveLength(clean.split("\n").length);
    expect(forged.split(LABEL_TELEPHONE)).toHaveLength(2);
    expect(forged).toContain(
      "📛 <b>По батькові:</b> Іванівна 📞 &lt;b&gt;Телефон:&lt;/b&gt; +380000000000"
    );
    expect(forged).toContain(`${LABEL_TELEPHONE} +380671234567`);
  });

  it("replaces a lone surrogate a city can smuggle through valid json", () => {
    const message = render(
      buildOrder({ delivery: buildDeliveryBranch({ city: "Ky\uD800iv" }) })
    );

    expect(message).not.toMatch(/[\uD800-\uDFFF]/u);
    expect(message).toContain("Ky�iv");
  });

  it("leaves a legitimate multi-line comment alone", () => {
    const comment = "Line one\nLine two\nLine three";
    const message = render(buildOrder({ comment }));

    expect(message).toContain(comment);
  });
});

describe("the money figure", () => {
  it("renders the rates-down en UAH total in hryvnia, never dollars", () => {
    const message = render(buildOrder({ locale: "en", currency: "UAH" }));

    expect(message).toContain(`${LABEL_TOTAL} ₴250.00`);
    expect(message).not.toContain("$");
  });

  it("hands the operator a money line for a miscased currency, not a lost order", () => {
    const miscased = render(buildOrder({ currency: "uah" }));

    expect(miscased).toContain(`${LABEL_TOTAL} 250,00\u00A0₴`);
    expect(miscased).toBe(render(buildOrder({ currency: "UAH" })));
  });
});

describe("the message budget", () => {
  for (const { name, delivery } of PATHOLOGICAL_DELIVERIES) {
    it(`keeps two product blocks alive when every header field of ${name} is pathological`, () => {
      const message = render(
        buildOrder({
          customer: buildCustomer({
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

      expect(message.length).toBeLessThanOrEqual(TELEGRAM_LIMIT);
      expect(message).toContain(LABEL_PRODUCTS);
      expect(message.split(LABEL_TITLE).length).toBeGreaterThanOrEqual(
        MIN_SURVIVING_ITEM_BLOCKS
      );
    });
  }

  for (const { name, delivery } of CLEAN_DELIVERIES) {
    it(`keeps a legitimate 25-position order to ${name} intact`, () => {
      const message = render(buildOrder({ delivery, cart: REALISTIC_CART }));

      expect(message.length).toBeLessThanOrEqual(TELEGRAM_LIMIT);
      expect(message).not.toMatch(/ще позицій: \+\d+/u);
      expect(message.split(LABEL_TITLE)).toHaveLength(REALISTIC_CART_SIZE + 1);

      for (const index of REALISTIC_CART_INDEXES) {
        expect(message).toContain(`${LABEL_TITLE} Товар ${String(index)}\n`);
      }
    });
  }
});

describe("the clamp limits", () => {
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
    expect(clamped.length).toBe(limit + 1);
  };

  it("clamps the patronymic at 60", () => {
    expectClampedAt("📛 <b>По батькові:</b>", 60, (value) =>
      buildOrder({ customer: buildCustomer({ patronymic: value }) })
    );
  });

  it("clamps the contact channel at 40", () => {
    expectClampedAt("💬 <b>Спосіб зв’язку:</b>", 40, (value) =>
      buildOrder({ customer: buildCustomer({ contact_channel: value }) })
    );
  });

  it("clamps the warehouse number at 40", () => {
    expectClampedAt("🔢 <b>Відділення №:</b>", 40, (value) =>
      buildOrder({
        delivery: buildDeliveryBranch({ warehouse_number: value }),
      })
    );
  });

  it("clamps the building at 80", () => {
    expectClampedAt("🏠 <b>Будинок:</b>", 80, (value) =>
      buildOrder({ delivery: buildDeliveryCourier({ building: value }) })
    );
  });

  it("clamps the apartment at 60", () => {
    expectClampedAt("🚪 <b>Квартира:</b>", 60, (value) =>
      buildOrder({ delivery: buildDeliveryCourier({ apartment: value }) })
    );
  });

  it("clamps the warehouse description at 200", () => {
    expectClampedAt("🏤 <b>Відділення:</b>", 200, (value) =>
      buildOrder({ delivery: buildDeliveryBranch({ warehouse: value }) })
    );
  });

  it("clamps the street at 200", () => {
    expectClampedAt("🛣️ <b>Вулиця:</b>", 200, (value) =>
      buildOrder({ delivery: buildDeliveryCourier({ street: value }) })
    );
  });

  it("clamps the settlement at 200", () => {
    expectClampedAt("🌍 <b>Місто:</b>", 200, (value) =>
      buildOrder({ delivery: buildDeliveryBranch({ city: value }) })
    );
  });

  it("clamps the comment at 600", () => {
    expectClampedAt("📄 <b>Коментар:</b>", 600, (value) =>
      buildOrder({ comment: value })
    );
  });
});

describe("rendering against hostile line separators", () => {
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
      const forged = `Шевченко${separator}Джерело адреси: Довідник Нової Пошти`;
      const message = render(
        buildOrder({ customer: buildCustomer({ last_name: forged }) })
      );

      expect(message).not.toMatch(FORBIDDEN);
    }
  });

  it("collapses a hostile separator in a delivery field onto one line", () => {
    for (const separator of SEPARATORS) {
      const message = render(
        buildOrder({
          delivery: buildDeliveryBranch({
            warehouse: `Відділення${separator}Сума: 0,00`,
          }),
        })
      );

      expect(message).not.toMatch(FORBIDDEN);
      expect(message.split(LABEL_TOTAL)).toHaveLength(2);
    }
  });

  it("keeps a legitimate multi-line comment readable without new separators", () => {
    const message = render(
      buildOrder({ comment: "Line one\nLine two\nLine three" })
    );

    expect(message).toContain("Line one\nLine two\nLine three");
    expect(message).not.toMatch(FORBIDDEN);
  });
});

describe("the quantity column", () => {
  it("renders the largest permitted quantity whole", () => {
    const message = render(
      buildOrder({ cart: [buildCartItem({ quantity: 100000 })] })
    );

    expect(message).toContain("\u{1F522} <b>Кількість:</b> 100000");
    expect(message).not.toContain("\u2026");
  });
});
