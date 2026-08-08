import { describe, expect, it } from "vitest";

import { renderOrder } from "../src/messageV2.js";
import { parseOrder } from "../src/payloadV2.js";
import {
  buildCartItem,
  buildCustomerV2,
  buildDeliveryBranch,
  buildDeliveryCourier,
  buildDeliveryGeneric,
  buildDeliveryPostomat,
  buildOrder,
  buildOrderV2,
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

const render = (input: Record<string, unknown>): string => {
  const result = parseOrder(input);

  if (!result.ok) {
    throw new Error(`fixture rejected: ${result.reason}`);
  }

  return renderOrder(result.value);
};

const V1_FIELDS: readonly FieldProbe[] = [
  { name: "first_name", build: (value) => buildOrder({ first_name: value }) },
  { name: "last_name", build: (value) => buildOrder({ last_name: value }) },
  { name: "telephone", build: (value) => buildOrder({ telephone: value }) },
  { name: "country", build: (value) => buildOrder({ country: value }) },
  { name: "state", build: (value) => buildOrder({ state: value }) },
  { name: "city", build: (value) => buildOrder({ city: value }) },
  { name: "address", build: (value) => buildOrder({ address: value }) },
  { name: "additional", build: (value) => buildOrder({ additional: value }) },
  {
    name: "cart title",
    build: (value) => buildOrder({ cart: [buildCartItem({ title: value })] }),
  },
  {
    name: "cart productUrl",
    build: (value) =>
      buildOrder({ cart: [buildCartItem({ productUrl: value })] }),
  },
];

const V2_FIELDS: readonly FieldProbe[] = [
  {
    name: "customer.first_name",
    build: (value) =>
      buildOrderV2({ customer: buildCustomerV2({ first_name: value }) }),
  },
  {
    name: "customer.last_name",
    build: (value) =>
      buildOrderV2({ customer: buildCustomerV2({ last_name: value }) }),
  },
  {
    name: "customer.patronymic",
    build: (value) =>
      buildOrderV2({ customer: buildCustomerV2({ patronymic: value }) }),
  },
  {
    name: "customer.phone",
    build: (value) =>
      buildOrderV2({ customer: buildCustomerV2({ phone: value }) }),
  },
  {
    name: "customer.contact_channel",
    build: (value) =>
      buildOrderV2({ customer: buildCustomerV2({ contact_channel: value }) }),
  },
  { name: "comment", build: (value) => buildOrderV2({ comment: value }) },
  {
    name: "cart title",
    build: (value) => buildOrderV2({ cart: [buildCartItem({ title: value })] }),
  },
  {
    name: "cart productUrl",
    build: (value) =>
      buildOrderV2({ cart: [buildCartItem({ productUrl: value })] }),
  },
  {
    name: "np_branch city",
    build: (value) =>
      buildOrderV2({ delivery: buildDeliveryBranch({ city: value }) }),
  },
  {
    name: "np_branch warehouse",
    build: (value) =>
      buildOrderV2({ delivery: buildDeliveryBranch({ warehouse: value }) }),
  },
  {
    name: "np_branch warehouse_number",
    build: (value) =>
      buildOrderV2({
        delivery: buildDeliveryBranch({ warehouse_number: value }),
      }),
  },
  {
    name: "np_postomat warehouse",
    build: (value) =>
      buildOrderV2({ delivery: buildDeliveryPostomat({ warehouse: value }) }),
  },
  {
    name: "np_courier city",
    build: (value) =>
      buildOrderV2({ delivery: buildDeliveryCourier({ city: value }) }),
  },
  {
    name: "np_courier street",
    build: (value) =>
      buildOrderV2({ delivery: buildDeliveryCourier({ street: value }) }),
  },
  {
    name: "np_courier building",
    build: (value) =>
      buildOrderV2({ delivery: buildDeliveryCourier({ building: value }) }),
  },
  {
    name: "np_courier apartment",
    build: (value) =>
      buildOrderV2({ delivery: buildDeliveryCourier({ apartment: value }) }),
  },
  {
    name: "generic country",
    build: (value) =>
      buildOrderV2({ delivery: buildDeliveryGeneric({ country: value }) }),
  },
  {
    name: "generic state",
    build: (value) =>
      buildOrderV2({ delivery: buildDeliveryGeneric({ state: value }) }),
  },
  {
    name: "generic city",
    build: (value) =>
      buildOrderV2({ delivery: buildDeliveryGeneric({ city: value }) }),
  },
  {
    name: "generic address",
    build: (value) =>
      buildOrderV2({ delivery: buildDeliveryGeneric({ address: value }) }),
  },
];

const expectNothingMisleadingSurvives = (message: string): void => {
  expect(message).not.toMatch(FORMAT_CONTROL);
  expect(message).not.toMatch(MATH_ALPHANUMERIC);
  expect(message).not.toMatch(FULLWIDTH_FORM);
  expect(message).toContain(SANITIZED_PROBE);
};

describe("every user-controlled v1 field is sanitized (BDEF-5)", () => {
  for (const field of V1_FIELDS) {
    it(`strips and folds misleading characters out of ${field.name}`, () => {
      expectNothingMisleadingSurvives(render(field.build(HOSTILE_PROBE)));
    });
  }
});

describe("every user-controlled v2 field is sanitized (BDEF-5)", () => {
  for (const field of V2_FIELDS) {
    it(`strips and folds misleading characters out of ${field.name}`, () => {
      expectNothingMisleadingSurvives(render(field.build(HOSTILE_PROBE)));
    });
  }
});

describe("the characters that were lying to the operator", () => {
  it("does not let an embedded RLO reverse a branch number", () => {
    const message = render(
      buildOrderV2({
        delivery: buildDeliveryBranch({
          warehouse: `Відділення No. 4${RLO}3${POP_DIRECTIONAL}`,
        }),
      })
    );

    expect(message).toContain("Відділення No. 43");
    expect(message).not.toMatch(FORMAT_CONTROL);
  });

  it("folds math-bold so a comment cannot imitate a relay label", () => {
    const forgery =
      "\u{1D400}\u{1D41D}\u{1D41D}\u{1D42B}\u{1D41E}\u{1D42C}\u{1D42C} \u{1D412}\u{1D428}\u{1D42E}\u{1D42B}\u{1D41C}\u{1D41E}:";
    const message = render(buildOrderV2({ comment: forgery }));

    expect(message).toContain("Address Source:");
    expect(message).not.toMatch(MATH_ALPHANUMERIC);
    expect(message.split("<b>Address Source:</b>")).toHaveLength(2);
  });

  it("escapes markup that only exists after normalization", () => {
    const message = render(buildOrder({ first_name: "＜b＞Bobby＜/b＞" }));

    expect(message).toContain("&lt;b&gt;Bobby&lt;/b&gt;");
    expect(message).not.toContain("<b>Bobby</b>");
  });

  it("drops tag characters, which carry no visible glyph at all", () => {
    const message = render(
      buildOrder({ city: `Київ${TAG_LETTER}${TAG_LETTER}` })
    );

    expect(message).toContain("🌍 <b>City:</b> Київ");
    expect(message).not.toMatch(FORMAT_CONTROL);
  });

  it("keeps a variation selector, which is a mark and not a format control", () => {
    const message = render(
      buildOrder({ additional: `на пошту 🏷${VARIATION_SELECTOR} будь ласка` })
    );

    expect(message).toContain(`🏷${VARIATION_SELECTOR}`);
  });

  it("still replaces the lone surrogates valid json can carry", () => {
    const message = render(buildOrder({ city: "Ky\uD800iv" }));

    expect(message).not.toMatch(/[\uD800-\uDFFF]/u);
    expect(message).toContain("Ky�iv");
  });
});

describe("the fold the carrier directory will show the operator", () => {
  it("renders the numero sign nova poshta uses as No", () => {
    const message = render(
      buildOrderV2({
        delivery: buildDeliveryBranch({
          warehouse: "Відділення №1: вул. Городоцька, 359",
        }),
      })
    );

    expect(message).toContain("Відділення No1: вул. Городоцька, 359");
    expect(message).not.toContain("№");
  });
});

describe("the text the relay generates itself is never sanitized", () => {
  it("keeps the non-breaking spaces the uk money format puts in", () => {
    const message = render(
      buildOrder({ locale: "uk", currency: "UAH", total: "46200.00" })
    );

    expect(message).toContain("💲 <b>Total:</b> 46 200,00 ₴");
  });

  it("keeps them on the v2 path too", () => {
    const message = render(
      buildOrderV2({ locale: "uk", currency: "UAH", total: "46200.00" })
    );

    expect(message).toContain("💲 <b>Total:</b> 46 200,00 ₴");
  });
});
