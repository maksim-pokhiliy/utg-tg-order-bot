import type { DeliveryMode, OrderDelivery } from "./delivery.js";
import {
  additionalLine,
  addressLine,
  cityLine,
  composeMessage,
  countryLine,
  firstNameLine,
  lastNameLine,
  singleLineField,
  stateLine,
  telephoneLine,
  totalLine,
} from "./render.js";
import type { OrderCustomer, OrderEnvelope, OrderPayload } from "./payload.js";

const PATRONYMIC_LIMIT = 60;
const CONTACT_CHANNEL_LIMIT = 40;
const DELIVERY_FIELD_LIMIT = 200;
const BUILDING_LIMIT = 80;
const APARTMENT_LIMIT = 60;
const WAREHOUSE_NUMBER_LIMIT = 40;

const DELIVERY_MODE_LABELS: Readonly<Record<DeliveryMode, string>> = {
  np_branch: "Відділення Нової Пошти",
  np_postomat: "Поштомат Нової Пошти",
  np_courier: "Кур’єр Нової Пошти",
  generic: "Довільна адреса",
};

const CONTACT_CHANNEL_TEXTS: ReadonlyMap<string, string> = new Map([
  ["call", "Дзвінок"],
  ["telegram", "Telegram"],
  ["viber", "Viber"],
]);

const SOURCE_DIRECTORY = "Довідник Нової Пошти";
const SOURCE_DIRECTORY_COURIER =
  "Довідник Нової Пошти (лише місто — вулицю уточніть у дзвінку)";
const SOURCE_MANUAL = "введено вручну — уточніть у дзвінку";
const SOURCE_UNSTATED = "не вказано — уточніть у дзвінку";

const contactChannelText = (value: string | undefined): string | undefined =>
  value === undefined ? undefined : (CONTACT_CHANNEL_TEXTS.get(value) ?? value);

const optionalLine = (
  label: string,
  value: string | undefined,
  limit: number
): readonly string[] =>
  value === undefined ? [] : [`${label} ${singleLineField(value, limit)}`];

const customerLines = (customer: OrderCustomer): readonly string[] => [
  firstNameLine(customer.first_name),
  lastNameLine(customer.last_name),
  ...optionalLine(
    "📛 <b>По батькові:</b>",
    customer.patronymic,
    PATRONYMIC_LIMIT
  ),
  telephoneLine(customer.phone),
  ...optionalLine(
    "💬 <b>Спосіб зв’язку:</b>",
    contactChannelText(customer.contact_channel),
    CONTACT_CHANNEL_LIMIT
  ),
];

const resolveSourceText = (delivery: OrderDelivery): string => {
  if (delivery.mode === "generic") {
    return SOURCE_MANUAL;
  }

  if (delivery.source === "manual") {
    return SOURCE_MANUAL;
  }

  if (delivery.source === "np_directory") {
    return delivery.mode === "np_courier"
      ? SOURCE_DIRECTORY_COURIER
      : SOURCE_DIRECTORY;
  }

  return SOURCE_UNSTATED;
};

const sourceLine = (delivery: OrderDelivery): string =>
  `🔎 <b>Джерело адреси:</b> ${resolveSourceText(delivery)}`;

const deliveryLines = (delivery: OrderDelivery): readonly string[] => {
  if (delivery.mode === "generic") {
    return [
      ...(delivery.country === undefined
        ? []
        : [countryLine(delivery.country)]),
      ...(delivery.state === undefined ? [] : [stateLine(delivery.state)]),
      cityLine(delivery.city),
      addressLine(delivery.address),
    ];
  }

  if (delivery.mode === "np_courier") {
    return [
      cityLine(delivery.city),
      `🛣️ <b>Вулиця:</b> ${singleLineField(delivery.street, DELIVERY_FIELD_LIMIT)}`,
      `🏠 <b>Будинок:</b> ${singleLineField(delivery.building, BUILDING_LIMIT)}`,
      ...optionalLine(
        "🚪 <b>Квартира:</b>",
        delivery.apartment,
        APARTMENT_LIMIT
      ),
    ];
  }

  return [
    cityLine(delivery.city),
    `🏤 <b>Відділення:</b> ${singleLineField(delivery.warehouse, DELIVERY_FIELD_LIMIT)}`,
    ...optionalLine(
      "🔢 <b>Відділення №:</b>",
      delivery.warehouse_number,
      WAREHOUSE_NUMBER_LIMIT
    ),
  ];
};

const commentLines = (comment: string | undefined): readonly string[] =>
  comment === undefined ? [] : [additionalLine(comment)];

const buildHeader = (payload: OrderPayload): readonly string[] => [
  ...customerLines(payload.customer),
  `🚚 <b>Доставка:</b> ${DELIVERY_MODE_LABELS[payload.delivery.mode]}`,
  sourceLine(payload.delivery),
  ...deliveryLines(payload.delivery),
  totalLine(payload.total, payload.locale, payload.currency),
  ...commentLines(payload.comment),
];

const buildOrderMessage = (payload: OrderPayload): string =>
  composeMessage(buildHeader(payload), payload.cart);

export const renderOrder = (envelope: OrderEnvelope): string =>
  buildOrderMessage(envelope.payload);
