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
const MAX_TOTAL_LENGTH = 20;
const MAX_QUANTITY = 100_000;

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
  | "cart_item_malformed"
  | "version_unsupported"
  | "customer_not_object"
  | "customer_field_missing"
  | "patronymic_not_string"
  | "contact_channel_not_string"
  | "delivery_not_object"
  | "delivery_mode_unknown"
  | "delivery_field_missing"
  | "delivery_optional_not_string"
  | "delivery_source_not_string"
  | "comment_not_string";

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

export type OptionalText =
  { ok: true; value: string | undefined } | { ok: false };

const reject = (reason: RejectReason): ParseResult => ({ ok: false, reason });

export const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

export const isCurrencyCode = (value: unknown): value is string =>
  typeof value === "string" && CURRENCY_PATTERN.test(value);

export const isPlainDecimal = (value: unknown): value is PlainDecimal =>
  typeof value === "string" &&
  value.length <= MAX_TOTAL_LENGTH &&
  TOTAL_PATTERN.test(value);

export const readText = (
  source: Record<string, unknown>,
  key: string
): string | undefined => {
  const value = source[key];

  return typeof value === "string" && value.trim() !== "" ? value : undefined;
};

export const readOptionalText = (
  source: Record<string, unknown>,
  key: string
): OptionalText => {
  const value = source[key];

  if (value === undefined || value === null) {
    return { ok: true, value: undefined };
  }

  if (typeof value !== "string") {
    return { ok: false };
  }

  return { ok: true, value: value.trim() === "" ? undefined : value };
};

const readContact = (
  source: Record<string, unknown>
): OrderContact | undefined => {
  const first_name = readText(source, "first_name");
  const last_name = readText(source, "last_name");
  const telephone = readText(source, "telephone");
  const country = readText(source, "country");
  const state = readText(source, "state");
  const city = readText(source, "city");
  const address = readText(source, "address");

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

  if (typeof productUrl !== "string" || productUrl.trim() === "") {
    return undefined;
  }

  if (typeof quantity !== "number" || !Number.isInteger(quantity)) {
    return undefined;
  }

  if (quantity < 1 || quantity > MAX_QUANTITY) {
    return undefined;
  }

  return { title, quantity, productUrl };
};

export const parseCart = (
  input: unknown
): readonly OrderCartItem[] | RejectReason => {
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
