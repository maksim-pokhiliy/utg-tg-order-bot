import type { OrderCartItem, OrderPayload, PlainDecimal } from "./payload.js";

const MAX_TELEGRAM_TEXT_LENGTH = 4096;
const CONTACT_FIELD_LIMIT = 200;
const ADDITIONAL_LIMIT = 600;
const TOTAL_LIMIT = 60;
const QUANTITY_LIMIT = 12;
const CART_TITLE_LIMIT = 200;
const CART_URL_LIMIT = 400;
const MAX_ESCAPE_EXPANSION = 5;
const MAX_OMITTED_DIGITS = 6;
const ELLIPSIS = "…";
const ITEM_SEPARATOR = "\n\n";
const PRODUCTS_HEADING = "🛒 <b>Products:</b>";
const LEGACY_LISTING_PREFIX = " ";

const DEFAULT_LOCALE = "uk";
const FALLBACK_CURRENCY = "UAH";
const STYLE_LOCALES: ReadonlySet<string> = new Set(["uk", "en"]);
const LOCALE_CURRENCY: ReadonlyMap<string, string> = new Map([
  ["uk", "UAH"],
  ["en", "USD"],
]);

export const countCodePoints = (value: string): number => {
  let total = 0;

  for (const _ of value) {
    total += 1;
  }

  return total;
};

const buildOmittedMarker = (omitted: number): string =>
  `${ELLIPSIS} <b>+${String(omitted)} more positions</b>`;

const OMITTED_MARKER_ALLOWANCE =
  countCodePoints(buildOmittedMarker(0)) +
  MAX_OMITTED_DIGITS +
  countCodePoints(ITEM_SEPARATOR);

export const escapeHtml = (value: string): string =>
  value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");

export const clampEscaped = (escaped: string, limit: number): string => {
  if (escaped.length <= limit) {
    return escaped;
  }

  const points = Array.from(escaped);

  if (points.length <= limit) {
    return escaped;
  }

  const sliced = points.slice(0, limit).join("");

  return sliced.replace(/&[a-zA-Z]*$/, "") + ELLIPSIS;
};

const field = (value: string, limit: number): string => {
  const bounded = value.slice(0, limit * MAX_ESCAPE_EXPANSION);

  return clampEscaped(escapeHtml(bounded.toWellFormed()), limit);
};

export const collapseNewlines = (value: string): string =>
  value.replaceAll(/\r\n|[\n\r\v\f\u0085\u2028\u2029]/gu, " ");

export const singleLineField = (value: string, limit: number): string =>
  field(collapseNewlines(value), limit);

const resolveStyleLocale = (locale: string): string =>
  STYLE_LOCALES.has(locale) ? locale : DEFAULT_LOCALE;

const resolveCurrency = (
  currency: string | undefined,
  locale: string
): string => currency ?? LOCALE_CURRENCY.get(locale) ?? FALLBACK_CURRENCY;

export const formatTotal = (
  total: PlainDecimal,
  locale: string,
  currency: string | undefined
): string =>
  new Intl.NumberFormat(resolveStyleLocale(locale), {
    style: "currency",
    currency: resolveCurrency(currency, locale),
    currencyDisplay: "narrowSymbol",
  }).format(total);

export const firstNameLine = (value: string): string =>
  `👤 <b>First Name:</b> ${singleLineField(value, CONTACT_FIELD_LIMIT)}`;

export const lastNameLine = (value: string): string =>
  `🧔 <b>Last Name:</b> ${singleLineField(value, CONTACT_FIELD_LIMIT)}`;

export const telephoneLine = (value: string): string =>
  `📞 <b>Telephone:</b> ${singleLineField(value, CONTACT_FIELD_LIMIT)}`;

export const countryLine = (value: string): string =>
  `🌍 <b>Country:</b> ${singleLineField(value, CONTACT_FIELD_LIMIT)}`;

export const stateLine = (value: string): string =>
  `🌍 <b>State:</b> ${singleLineField(value, CONTACT_FIELD_LIMIT)}`;

export const cityLine = (value: string): string =>
  `🌍 <b>City:</b> ${singleLineField(value, CONTACT_FIELD_LIMIT)}`;

export const addressLine = (value: string): string =>
  `🏠 <b>Address:</b> ${singleLineField(value, CONTACT_FIELD_LIMIT)}`;

export const totalLine = (
  total: PlainDecimal,
  locale: string,
  currency: string | undefined
): string =>
  `💲 <b>Total:</b> ${field(formatTotal(total, locale, currency), TOTAL_LIMIT)}`;

export const additionalLine = (value: string): string =>
  `📄 <b>Additional Information:</b> ${field(value, ADDITIONAL_LIMIT)}`;

const buildHeader = (payload: OrderPayload): readonly string[] => [
  firstNameLine(payload.first_name),
  lastNameLine(payload.last_name),
  telephoneLine(payload.telephone),
  countryLine(payload.country),
  stateLine(payload.state),
  cityLine(payload.city),
  addressLine(payload.address),
  totalLine(payload.total, payload.locale, payload.currency),
  additionalLine(payload.additional),
];

const buildItem = (item: OrderCartItem): string =>
  [
    `🏷️ <b>Title:</b> ${singleLineField(item.title, CART_TITLE_LIMIT)}`,
    `🔢 <b>Quantity:</b> ${field(String(item.quantity), QUANTITY_LIMIT)}`,
    `🔗 <b>Product URL:</b> ${singleLineField(item.productUrl, CART_URL_LIMIT)}`,
  ].join("\n");

export const composeMessage = (
  headerLines: readonly string[],
  cart: readonly OrderCartItem[]
): string => {
  const header = [
    ...headerLines,
    "",
    PRODUCTS_HEADING,
    "",
    LEGACY_LISTING_PREFIX,
  ].join("\n");

  const budget =
    MAX_TELEGRAM_TEXT_LENGTH -
    countCodePoints(header) -
    OMITTED_MARKER_ALLOWANCE;

  const separatorCost = countCodePoints(ITEM_SEPARATOR);
  const rendered: string[] = [];
  let used = 0;

  for (const item of cart) {
    const block = buildItem(item);
    const cost =
      countCodePoints(block) + (rendered.length === 0 ? 0 : separatorCost);

    if (used + cost > budget) {
      break;
    }

    rendered.push(block);
    used += cost;
  }

  const omitted = cart.length - rendered.length;
  const body = rendered.join(ITEM_SEPARATOR);

  if (omitted === 0) {
    return header + body;
  }

  const marker = buildOmittedMarker(omitted);

  return rendered.length === 0
    ? header + marker
    : `${header}${body}${ITEM_SEPARATOR}${marker}`;
};

export const buildOrderMessage = (payload: OrderPayload): string =>
  composeMessage(buildHeader(payload), payload.cart);
