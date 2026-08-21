import { describe, expect, it } from "vitest";

import { renderOrder } from "../src/message.js";
import { parseOrder } from "../src/payload.js";
import {
  buildCartItem,
  buildCustomer,
  buildDeliveryBranch,
  buildDeliveryCourier,
  buildDeliveryGeneric,
  buildDeliveryPostomat,
  buildOrder,
} from "./support/orderPayload.js";

const RLO = "‮";
const POP_DIRECTIONAL = "‬";
const LEFT_TO_RIGHT_ISOLATE = "⁦";
const ZERO_WIDTH_SPACE = "​";
const ZERO_WIDTH_NON_JOINER = "‌";
const ZERO_WIDTH_JOINER = "‍";
const BYTE_ORDER_MARK = "﻿";
const SOFT_HYPHEN = "­";
const TAG_LETTER = "\u{E0067}";
const MATH_BOLD_A = "\u{1D400}";
const FULLWIDTH_B = "Ｂ";
const VARIATION_SELECTOR = "️";

const HOSTILE_PROBE = [
  "X",
  RLO,
  LEFT_TO_RIGHT_ISOLATE,
  ZERO_WIDTH_SPACE,
  ZERO_WIDTH_NON_JOINER,
  ZERO_WIDTH_JOINER,
  BYTE_ORDER_MARK,
  SOFT_HYPHEN,
  TAG_LETTER,
  MATH_BOLD_A,
  FULLWIDTH_B,
  "Y",
].join("");

const SANITIZED_PROBE = "XABY";

const FORMAT_CONTROL = /\p{Cf}/u;
const MATH_ALPHANUMERIC = /[\u{1D400}-\u{1D7FF}]/u;
const FULLWIDTH_FORM = /[！-｠]/u;

interface FieldProbe {
  name: string;
  build: (value: string) => Record<string, unknown>;
}

const ADDITIONAL_LABEL = "📄 <b>Коментар:</b>";
const WAREHOUSE_LABEL = "🏤 <b>Відділення:</b>";
const SOURCE_LABEL = "🔎 <b>Джерело адреси:</b>";

const RELAY_LABELS: readonly string[] = [
  "👤 <b>Ім’я:</b>",
  "🧔 <b>Прізвище:</b>",
  "📛 <b>По батькові:</b>",
  "📞 <b>Телефон:</b>",
  "💬 <b>Спосіб зв’язку:</b>",
  "🚚 <b>Доставка:</b>",
  SOURCE_LABEL,
  "🌍 <b>Країна:</b>",
  "🌍 <b>Область:</b>",
  "🌍 <b>Місто:</b>",
  "🏠 <b>Адреса:</b>",
  "🛣️ <b>Вулиця:</b>",
  "🏠 <b>Будинок:</b>",
  "🚪 <b>Квартира:</b>",
  WAREHOUSE_LABEL,
  "🔢 <b>Відділення №:</b>",
  "💲 <b>Сума:</b>",
  ADDITIONAL_LABEL,
  "🛒 <b>Товари:</b>",
  "🏷️ <b>Назва:</b>",
  "🔢 <b>Кількість:</b>",
  "🔗 <b>Посилання:</b>",
];

const NORMALIZES_TO_MARKUP: readonly (readonly [string, string])[] = [
  ["﹠", "&amp;"],
  ["﹤", "&lt;"],
  ["﹥", "&gt;"],
  ["＆", "&amp;"],
  ["＜", "&lt;"],
  ["＞", "&gt;"],
];

const render = (input: Record<string, unknown>): string => {
  const result = parseOrder(input);

  if (!result.ok) {
    throw new Error(`fixture rejected: ${result.reason}`);
  }

  return renderOrder(result.value);
};

const valueOf = (message: string, label: string): string =>
  lineOf(message, label).slice(label.length + 1);

const countOf = (message: string, label: string): number =>
  message.split(label).length - 1;

const lineOf = (message: string, label: string): string => {
  const line = message.split("\n").find((entry) => entry.startsWith(label));

  if (line === undefined) {
    throw new Error(`no line labelled ${label}`);
  }

  return line;
};

const USER_FIELDS: readonly FieldProbe[] = [
  {
    name: "customer.first_name",
    build: (value) =>
      buildOrder({ customer: buildCustomer({ first_name: value }) }),
  },
  {
    name: "customer.last_name",
    build: (value) =>
      buildOrder({ customer: buildCustomer({ last_name: value }) }),
  },
  {
    name: "customer.patronymic",
    build: (value) =>
      buildOrder({ customer: buildCustomer({ patronymic: value }) }),
  },
  {
    name: "customer.phone",
    build: (value) => buildOrder({ customer: buildCustomer({ phone: value }) }),
  },
  {
    name: "customer.contact_channel",
    build: (value) =>
      buildOrder({ customer: buildCustomer({ contact_channel: value }) }),
  },
  { name: "comment", build: (value) => buildOrder({ comment: value }) },
  {
    name: "cart title",
    build: (value) => buildOrder({ cart: [buildCartItem({ title: value })] }),
  },
  {
    name: "cart productUrl",
    build: (value) =>
      buildOrder({ cart: [buildCartItem({ productUrl: value })] }),
  },
  {
    name: "np_branch city",
    build: (value) =>
      buildOrder({ delivery: buildDeliveryBranch({ city: value }) }),
  },
  {
    name: "np_branch warehouse",
    build: (value) =>
      buildOrder({ delivery: buildDeliveryBranch({ warehouse: value }) }),
  },
  {
    name: "np_branch warehouse_number",
    build: (value) =>
      buildOrder({
        delivery: buildDeliveryBranch({ warehouse_number: value }),
      }),
  },
  {
    name: "np_postomat warehouse",
    build: (value) =>
      buildOrder({ delivery: buildDeliveryPostomat({ warehouse: value }) }),
  },
  {
    name: "np_courier city",
    build: (value) =>
      buildOrder({ delivery: buildDeliveryCourier({ city: value }) }),
  },
  {
    name: "np_courier street",
    build: (value) =>
      buildOrder({ delivery: buildDeliveryCourier({ street: value }) }),
  },
  {
    name: "np_courier building",
    build: (value) =>
      buildOrder({ delivery: buildDeliveryCourier({ building: value }) }),
  },
  {
    name: "np_courier apartment",
    build: (value) =>
      buildOrder({ delivery: buildDeliveryCourier({ apartment: value }) }),
  },
  {
    name: "generic country",
    build: (value) =>
      buildOrder({ delivery: buildDeliveryGeneric({ country: value }) }),
  },
  {
    name: "generic state",
    build: (value) =>
      buildOrder({ delivery: buildDeliveryGeneric({ state: value }) }),
  },
  {
    name: "generic city",
    build: (value) =>
      buildOrder({ delivery: buildDeliveryGeneric({ city: value }) }),
  },
  {
    name: "generic address",
    build: (value) =>
      buildOrder({ delivery: buildDeliveryGeneric({ address: value }) }),
  },
];

const expectNothingMisleadingSurvives = (message: string): void => {
  expect(message).not.toMatch(FORMAT_CONTROL);
  expect(message).not.toMatch(MATH_ALPHANUMERIC);
  expect(message).not.toMatch(FULLWIDTH_FORM);
  expect(message).toContain(SANITIZED_PROBE);
};

describe("every user-controlled field is sanitized (BDEF-5)", () => {
  for (const field of USER_FIELDS) {
    it(`strips and folds misleading characters out of ${field.name}`, () => {
      expectNothingMisleadingSurvives(render(field.build(HOSTILE_PROBE)));
    });
  }
});

describe("the characters that were lying to the operator", () => {
  it("does not let an embedded RLO reverse a branch number", () => {
    const message = render(
      buildOrder({
        delivery: buildDeliveryBranch({
          warehouse: `Відділення No. 4${RLO}3${POP_DIRECTIONAL}`,
        }),
      })
    );

    expect(message).toContain("Відділення No. 43");
    expect(message).not.toMatch(FORMAT_CONTROL);
  });

  it("folds a math-bold comment to plain text without minting a source label", () => {
    const forgery =
      "\u{1D400}\u{1D41D}\u{1D41D}\u{1D42B}\u{1D41E}\u{1D42C}\u{1D42C} \u{1D412}\u{1D428}\u{1D42E}\u{1D42B}\u{1D41C}\u{1D41E}:";
    const message = render(buildOrder({ comment: forgery }));

    expect(lineOf(message, ADDITIONAL_LABEL)).toBe(
      `${ADDITIONAL_LABEL} Address Source:`
    );
    expect(message).not.toMatch(MATH_ALPHANUMERIC);
    expect(countOf(message, SOURCE_LABEL)).toBe(1);
  });

  it("escapes markup that only exists after normalization", () => {
    const message = render(
      buildOrder({
        customer: buildCustomer({ first_name: "＜b＞Bobby＜/b＞" }),
      })
    );

    expect(message).toContain("&lt;b&gt;Bobby&lt;/b&gt;");
    expect(message).not.toContain("<b>Bobby</b>");
  });

  const MARKUP_CARRIERS: readonly FieldProbe[] = [
    {
      name: "customer.first_name",
      build: (value) =>
        buildOrder({ customer: buildCustomer({ first_name: value }) }),
    },
    { name: "comment", build: (value) => buildOrder({ comment: value }) },
  ];

  const LABEL_OF: Readonly<Record<string, string>> = {
    "customer.first_name": "👤 <b>Ім’я:</b>",
    comment: ADDITIONAL_LABEL,
  };

  for (const carrier of MARKUP_CARRIERS) {
    for (const [raw, escaped] of NORMALIZES_TO_MARKUP) {
      it(`escapes ${JSON.stringify(raw)} out of ${carrier.name}, which normalization turns into markup`, () => {
        const label = LABEL_OF[carrier.name] ?? "";
        const message = render(carrier.build(`A${raw}B`));

        expect(lineOf(message, label)).toBe(`${label} A${escaped}B`);
      });
    }
  }

  it("cannot be talked into a live anchor by a fullwidth comment", () => {
    const message = render(
      buildOrder({ comment: "＜a href=＂https://evil.test＂＞click＜/a＞" })
    );

    expect(message).not.toMatch(/<a\s/u);
    expect(lineOf(message, ADDITIONAL_LABEL)).toBe(
      `${ADDITIONAL_LABEL} &lt;a href="https://evil.test"&gt;click&lt;/a&gt;`
    );
  });

  it("bounds the work before NFKC can multiply it", () => {
    const before = process.memoryUsage().heapUsed;
    const started = Date.now();

    const message = render(buildOrder({ comment: "\uFDFA".repeat(4_000_000) }));

    expect(Date.now() - started).toBeLessThan(250);
    expect(process.memoryUsage().heapUsed - before).toBeLessThan(60_000_000);
    expect(message.length).toBeLessThanOrEqual(4096);
  });

  it("bounds the work before sanitizing, not after", () => {
    const beyondTheBound = `${ZERO_WIDTH_SPACE.repeat(2000)}Kyiv`;
    const message = render(
      buildOrder({ delivery: buildDeliveryGeneric({ city: beyondTheBound }) })
    );

    expect(message).not.toContain("Kyiv");
    expect(lineOf(message, "🌍 <b>Місто:</b>")).toBe("🌍 <b>Місто:</b> ");
  });

  it("drops tag characters, which carry no visible glyph at all", () => {
    const message = render(
      buildOrder({
        delivery: buildDeliveryGeneric({
          city: `Київ${TAG_LETTER}${TAG_LETTER}`,
        }),
      })
    );

    expect(message).toContain("🌍 <b>Місто:</b> Київ");
    expect(message).not.toMatch(FORMAT_CONTROL);
  });

  it("keeps a variation selector, which is a mark and not a format control", () => {
    const typed = `🏷${VARIATION_SELECTOR}`;
    const message = render(buildOrder({ comment: typed }));

    expect(lineOf(message, ADDITIONAL_LABEL)).toBe(
      `${ADDITIONAL_LABEL} ${typed}`
    );
  });

  it("splits a zwj sequence, because the joiner is a format character", () => {
    const family = `👨${ZERO_WIDTH_JOINER}👩${ZERO_WIDTH_JOINER}👧`;
    const message = render(buildOrder({ comment: family }));

    expect(lineOf(message, ADDITIONAL_LABEL)).toBe(
      `${ADDITIONAL_LABEL} 👨👩👧`
    );
    expect(message).not.toContain(family);
  });

  it("degrades a tag-sequence flag to its base flag", () => {
    const scotland = "🏴\u{E0067}\u{E0062}\u{E0073}\u{E0063}\u{E0074}\u{E007F}";
    const message = render(buildOrder({ comment: scotland }));

    expect(lineOf(message, ADDITIONAL_LABEL)).toBe(`${ADDITIONAL_LABEL} 🏴`);
  });

  it("still replaces the lone surrogates valid json can carry", () => {
    const message = render(
      buildOrder({ delivery: buildDeliveryGeneric({ city: "Ky\uD800iv" }) })
    );

    expect(message).not.toMatch(/[\uD800-\uDFFF]/u);
    expect(message).toContain("Ky�iv");
  });
});

describe("the fold the carrier directory will show the operator", () => {
  it("renders the numero sign nova poshta uses as No", () => {
    const message = render(
      buildOrder({
        delivery: buildDeliveryBranch({
          warehouse: "Відділення №1: вул. Городоцька, 359",
        }),
      })
    );

    expect(message).toContain("Відділення No1: вул. Городоцька, 359");
    expect(valueOf(message, WAREHOUSE_LABEL)).not.toContain("№");
  });
});

describe("the text the relay generates itself is never sanitized", () => {
  it("keeps the non-breaking spaces the uk money format puts in", () => {
    const message = render(
      buildOrder({ locale: "uk", currency: "UAH", total: "46200.00" })
    );

    expect(message).toContain("💲 <b>Сума:</b> 46 200,00 ₴");
  });
});

describe("no payload value can mint a label the relay writes", () => {
  const DELIVERIES: readonly Record<string, unknown>[] = [
    buildDeliveryBranch(),
    buildDeliveryPostomat(),
    buildDeliveryCourier(),
    buildDeliveryGeneric(),
  ];

  it("never adds a copy of any label when a comment quotes it verbatim", () => {
    for (const delivery of DELIVERIES) {
      for (const label of RELAY_LABELS) {
        const clean = render(buildOrder({ delivery, comment: "clean" }));
        const forged = render(
          buildOrder({ delivery, comment: `${label} forged` })
        );

        expect(countOf(forged, label)).toBe(countOf(clean, label));
      }
    }
  });

  it("covers every label the relay can write, so the list cannot rot", () => {
    const seen = new Set<string>();

    for (const delivery of DELIVERIES) {
      const message = render(buildOrder({ delivery }));

      for (const label of RELAY_LABELS) {
        if (message.includes(label)) {
          seen.add(label);
        }
      }
    }

    expect(seen.size).toBe(RELAY_LABELS.length);
  });
});
