const REQUIRED_TEXT_KEYS = [
  "first_name",
  "last_name",
  "telephone",
  "country",
  "state",
  "city",
  "address",
] as const;

const TOTAL_PATTERN = /^\d+(\.\d+)?$/;
const CURRENCY_PATTERN = /^[A-Z]{3}$/;

type RequiredTextKey = (typeof REQUIRED_TEXT_KEYS)[number];

export type PlainDecimal = `${number}`;

export type RejectReason =
  | "body_not_object"
  | "required_field_missing"
  | "additional_not_string"
  | "locale_not_string"
  | "total_not_plain_decimal"
  | "currency_malformed"
  | "cart_not_array"
  | "cart_empty"
  | "cart_item_malformed";

export interface OrderCartItem {
  title: string;
  quantity: number;
  productUrl: string;
}

export type OrderContact = Record<RequiredTextKey, string>;

export interface OrderPayload extends OrderContact {
  additional: string;
  locale: string;
  total: PlainDecimal;
  currency: string | undefined;
  cart: readonly OrderCartItem[];
}

export type ParseResult =
  { ok: true; value: OrderPayload } | { ok: false; reason: RejectReason };

const reject = (reason: RejectReason): ParseResult => ({ ok: false, reason });

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const isCurrencyCode = (value: unknown): value is string =>
  typeof value === "string" && CURRENCY_PATTERN.test(value);

const isPlainDecimal = (value: unknown): value is PlainDecimal =>
  typeof value === "string" && TOTAL_PATTERN.test(value);

const readRequiredText = (
  source: Record<string, unknown>,
  key: RequiredTextKey
): string | undefined => {
  const value = source[key];

  return typeof value === "string" && value.trim() !== "" ? value : undefined;
};

const readContact = (
  source: Record<string, unknown>
): OrderContact | undefined => {
  const first_name = readRequiredText(source, "first_name");
  const last_name = readRequiredText(source, "last_name");
  const telephone = readRequiredText(source, "telephone");
  const country = readRequiredText(source, "country");
  const state = readRequiredText(source, "state");
  const city = readRequiredText(source, "city");
  const address = readRequiredText(source, "address");

  if (
    first_name === undefined ||
    last_name === undefined ||
    telephone === undefined ||
    country === undefined ||
    state === undefined ||
    city === undefined ||
    address === undefined
  ) {
    return undefined;
  }

  return {
    first_name,
    last_name,
    telephone,
    country,
    state,
    city,
    address,
  };
};

const parseCartItem = (input: unknown): OrderCartItem | undefined => {
  if (!isRecord(input)) {
    return undefined;
  }

  const { title, quantity, productUrl } = input;

  if (typeof title !== "string" || title.trim() === "") {
    return undefined;
  }

  if (typeof productUrl !== "string") {
    return undefined;
  }

  if (typeof quantity !== "number" || !Number.isInteger(quantity)) {
    return undefined;
  }

  return quantity >= 1 ? { title, quantity, productUrl } : undefined;
};

const parseCart = (input: unknown): readonly OrderCartItem[] | RejectReason => {
  if (!Array.isArray(input)) {
    return "cart_not_array";
  }

  if (input.length === 0) {
    return "cart_empty";
  }

  const items: OrderCartItem[] = [];

  for (const entry of input) {
    const item = parseCartItem(entry);

    if (item === undefined) {
      return "cart_item_malformed";
    }

    items.push(item);
  }

  return items;
};

export const parseOrderPayload = (input: unknown): ParseResult => {
  if (!isRecord(input)) {
    return reject("body_not_object");
  }

  const contact = readContact(input);

  if (contact === undefined) {
    return reject("required_field_missing");
  }

  const { additional, locale, total, currency } = input;

  if (additional !== undefined && typeof additional !== "string") {
    return reject("additional_not_string");
  }

  if (typeof locale !== "string") {
    return reject("locale_not_string");
  }

  if (!isPlainDecimal(total)) {
    return reject("total_not_plain_decimal");
  }

  if (currency !== undefined && !isCurrencyCode(currency)) {
    return reject("currency_malformed");
  }

  const cart = parseCart(input["cart"]);

  if (typeof cart === "string") {
    return reject(cart);
  }

  return {
    ok: true,
    value: {
      ...contact,
      additional: additional ?? "",
      locale,
      total,
      currency,
      cart,
    },
  };
};
