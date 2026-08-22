const TOTAL_PATTERN = /^\d+(\.\d+)?$/;
const CURRENCY_PATTERN = /^[A-Za-z]{3}$/;
const MAX_TOTAL_LENGTH = 20;
const MAX_QUANTITY = 100_000;

export type PlainDecimal = `${number}`;

export type RejectReason =
  | "body_not_object"
  | "locale_not_string"
  | "total_not_plain_decimal"
  | "currency_malformed"
  | "cart_not_array"
  | "cart_empty"
  | "cart_item_malformed"
  | "version_unsupported"
  | "customer_not_object"
  | "customer_field_missing"
  | "delivery_not_object"
  | "delivery_mode_missing"
  | "delivery_mode_unknown"
  | "delivery_city_missing"
  | "delivery_warehouse_missing"
  | "delivery_street_missing"
  | "delivery_building_missing"
  | "delivery_address_missing";

export interface OrderCartItem {
  title: string;
  quantity: number;
  productUrl: string;
}

export const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

export type CurrencyRead =
  { isValid: true; code: string | undefined } | { isValid: false };

export const readCurrency = (
  source: Record<string, unknown>,
  key: string
): CurrencyRead => {
  const value = source[key];

  if (value === undefined) {
    return { isValid: true, code: undefined };
  }

  return typeof value === "string" && CURRENCY_PATTERN.test(value)
    ? { isValid: true, code: value.toUpperCase() }
    : { isValid: false };
};

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
