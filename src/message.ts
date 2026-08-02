import type { OrderCartItem, OrderPayload, PlainDecimal } from "./payload";

const MAX_TELEGRAM_TEXT_LENGTH = 4096;
const CONTACT_FIELD_LIMIT = 200;
const ADDITIONAL_LIMIT = 600;
const TOTAL_LIMIT = 60;
const CART_TITLE_LIMIT = 200;
const CART_URL_LIMIT = 400;
const OMITTED_MARKER_ALLOWANCE = 64;
const ELLIPSIS = "…";
const ITEM_SEPARATOR = "\n\n";

const DEFAULT_LOCALE = "uk";
const STYLE_LOCALES = ["uk", "en"] as const;
const LOCALE_CURRENCY: Record<string, string> = { uk: "UAH", en: "USD" };
const FALLBACK_CURRENCY = "UAH";

export const escapeHtml = (value: string): string =>
  value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");

export const clampEscaped = (escaped: string, limit: number): string => {
  const points = Array.from(escaped);

  if (points.length <= limit) {
    return escaped;
  }

  const sliced = points.slice(0, limit).join("");

  return sliced.replace(/&[a-zA-Z]*$/, "") + ELLIPSIS;
};

const field = (value: string, limit: number): string =>
  clampEscaped(escapeHtml(value), limit);

const resolveStyleLocale = (locale: string): string =>
  STYLE_LOCALES.some((known) => known === locale) ? locale : DEFAULT_LOCALE;

const resolveCurrency = (
  currency: string | undefined,
  locale: string
): string => currency ?? LOCALE_CURRENCY[locale] ?? FALLBACK_CURRENCY;

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

const buildHeader = (payload: OrderPayload): string =>
  [
    `👤 <b>First Name:</b> ${field(payload.first_name, CONTACT_FIELD_LIMIT)}`,
    `🧔 <b>Last Name:</b> ${field(payload.last_name, CONTACT_FIELD_LIMIT)}`,
    `📞 <b>Telephone:</b> ${field(payload.telephone, CONTACT_FIELD_LIMIT)}`,
    `🌍 <b>Country:</b> ${field(payload.country, CONTACT_FIELD_LIMIT)}`,
    `🌍 <b>State:</b> ${field(payload.state, CONTACT_FIELD_LIMIT)}`,
    `🌍 <b>City:</b> ${field(payload.city, CONTACT_FIELD_LIMIT)}`,
    `🏠 <b>Address:</b> ${field(payload.address, CONTACT_FIELD_LIMIT)}`,
    `💲 <b>Total:</b> ${field(
      formatTotal(payload.total, payload.locale, payload.currency),
      TOTAL_LIMIT
    )}`,
    `📄 <b>Additional Information:</b> ${field(payload.additional, ADDITIONAL_LIMIT)}`,
    "",
    "🛒 <b>Products:</b>",
    "",
    "",
  ].join("\n");

const buildItem = (item: OrderCartItem): string =>
  [
    `🏷️ <b>Title:</b> ${field(item.title, CART_TITLE_LIMIT)}`,
    `🔢 <b>Quantity:</b> ${String(item.quantity)}`,
    `🔗 <b>Product URL:</b> ${field(item.productUrl, CART_URL_LIMIT)}`,
  ].join("\n");

export const buildOrderMessage = (payload: OrderPayload): string => {
  const header = buildHeader(payload);
  const budget =
    MAX_TELEGRAM_TEXT_LENGTH - header.length - OMITTED_MARKER_ALLOWANCE;

  const rendered: string[] = [];
  let used = 0;

  for (const item of payload.cart) {
    const block = buildItem(item);
    const cost = rendered.length === 0 ? block.length : block.length + 2;

    if (used + cost > budget) {
      break;
    }

    rendered.push(block);
    used += cost;
  }

  const omitted = payload.cart.length - rendered.length;
  const body = rendered.join(ITEM_SEPARATOR);

  if (omitted === 0) {
    return header + body;
  }

  const marker = `… <b>+${String(omitted)} more positions</b>`;

  return rendered.length === 0
    ? header + marker
    : `${header}${body}${ITEM_SEPARATOR}${marker}`;
};
