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
} from "./message.js";
import type {
  OrderCustomer,
  OrderEnvelope,
  OrderPayloadV2,
} from "./payloadV2.js";

const PATRONYMIC_LIMIT = 60;
const CONTACT_CHANNEL_LIMIT = 40;
const DELIVERY_FIELD_LIMIT = 200;
const BUILDING_LIMIT = 80;
const APARTMENT_LIMIT = 60;
const WAREHOUSE_NUMBER_LIMIT = 40;

const DELIVERY_MODE_LABELS: Readonly<Record<DeliveryMode, string>> = {
  np_branch: "Nova Poshta branch",
  np_postomat: "Nova Poshta parcel locker",
  np_courier: "Nova Poshta courier",
  generic: "Free-form address",
};

const SOURCE_DIRECTORY = "Nova Poshta directory";
const SOURCE_DIRECTORY_COURIER =
  "Nova Poshta directory (city only — verify the street on the call)";
const SOURCE_MANUAL = "typed by hand — verify on the call";
const SOURCE_UNSTATED = "not stated — verify on the call";

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
    "📛 <b>Patronymic:</b>",
    customer.patronymic,
    PATRONYMIC_LIMIT
  ),
  telephoneLine(customer.phone),
  ...optionalLine(
    "💬 <b>Preferred Contact:</b>",
    customer.contact_channel,
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
  `🔎 <b>Address Source:</b> ${resolveSourceText(delivery)}`;

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
      `🛣️ <b>Street:</b> ${singleLineField(delivery.street, DELIVERY_FIELD_LIMIT)}`,
      `🏠 <b>Building:</b> ${singleLineField(delivery.building, BUILDING_LIMIT)}`,
      ...optionalLine(
        "🚪 <b>Apartment:</b>",
        delivery.apartment,
        APARTMENT_LIMIT
      ),
    ];
  }

  return [
    cityLine(delivery.city),
    `🏤 <b>Warehouse:</b> ${singleLineField(delivery.warehouse, DELIVERY_FIELD_LIMIT)}`,
    ...optionalLine(
      "🔢 <b>Warehouse No:</b>",
      delivery.warehouse_number,
      WAREHOUSE_NUMBER_LIMIT
    ),
  ];
};

const commentLines = (comment: string | undefined): readonly string[] =>
  comment === undefined ? [] : [additionalLine(comment)];

const buildHeaderV2 = (payload: OrderPayloadV2): readonly string[] => [
  ...customerLines(payload.customer),
  `🚚 <b>Delivery:</b> ${DELIVERY_MODE_LABELS[payload.delivery.mode]}`,
  sourceLine(payload.delivery),
  ...deliveryLines(payload.delivery),
  totalLine(payload.total, payload.locale, payload.currency),
  ...commentLines(payload.comment),
];

const buildOrderMessageV2 = (payload: OrderPayloadV2): string =>
  composeMessage(buildHeaderV2(payload), payload.cart);

export const renderOrder = (envelope: OrderEnvelope): string =>
  buildOrderMessageV2(envelope.payload);
