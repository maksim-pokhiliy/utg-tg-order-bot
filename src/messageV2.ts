import type {
  DeliveryMode,
  DeliverySource,
  OrderDelivery,
  WarehouseMode,
} from "./delivery.js";
import {
  ADDITIONAL_LIMIT,
  CONTACT_FIELD_LIMIT,
  TOTAL_LIMIT,
  buildOrderMessage,
  composeMessage,
  field,
  formatTotal,
  singleLineField,
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
  `👤 <b>First Name:</b> ${singleLineField(customer.first_name, CONTACT_FIELD_LIMIT)}`,
  `🧔 <b>Last Name:</b> ${singleLineField(customer.last_name, CONTACT_FIELD_LIMIT)}`,
  ...optionalLine(
    "📛 <b>Patronymic:</b>",
    customer.patronymic,
    PATRONYMIC_LIMIT
  ),
  `📞 <b>Telephone:</b> ${singleLineField(customer.phone, CONTACT_FIELD_LIMIT)}`,
  ...optionalLine(
    "💬 <b>Preferred Contact:</b>",
    customer.contact_channel,
    CONTACT_CHANNEL_LIMIT
  ),
];

const resolveSourceText = (
  mode: WarehouseMode | "np_courier",
  source: DeliverySource | undefined
): string => {
  if (source === "manual") {
    return SOURCE_MANUAL;
  }

  if (source === "np_directory") {
    return mode === "np_courier" ? SOURCE_DIRECTORY_COURIER : SOURCE_DIRECTORY;
  }

  return SOURCE_UNSTATED;
};

const sourceLines = (delivery: OrderDelivery): readonly string[] =>
  delivery.mode === "generic"
    ? []
    : [
        `🔎 <b>Address Source:</b> ${resolveSourceText(
          delivery.mode,
          delivery.source
        )}`,
      ];

const deliveryLines = (delivery: OrderDelivery): readonly string[] => {
  if (delivery.mode === "generic") {
    return [
      `🌍 <b>Country:</b> ${singleLineField(delivery.country, DELIVERY_FIELD_LIMIT)}`,
      ...optionalLine("🌍 <b>State:</b>", delivery.state, DELIVERY_FIELD_LIMIT),
      `🌍 <b>City:</b> ${singleLineField(delivery.city, DELIVERY_FIELD_LIMIT)}`,
      `🏠 <b>Address:</b> ${singleLineField(delivery.address, DELIVERY_FIELD_LIMIT)}`,
    ];
  }

  if (delivery.mode === "np_courier") {
    return [
      `🌍 <b>City:</b> ${singleLineField(delivery.city, DELIVERY_FIELD_LIMIT)}`,
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
    `🌍 <b>City:</b> ${singleLineField(delivery.city, DELIVERY_FIELD_LIMIT)}`,
    `🏤 <b>Warehouse:</b> ${singleLineField(delivery.warehouse, DELIVERY_FIELD_LIMIT)}`,
    ...optionalLine(
      "🔢 <b>Warehouse No:</b>",
      delivery.warehouse_number,
      WAREHOUSE_NUMBER_LIMIT
    ),
  ];
};

const commentLines = (comment: string | undefined): readonly string[] =>
  comment === undefined
    ? []
    : [`📄 <b>Additional Information:</b> ${field(comment, ADDITIONAL_LIMIT)}`];

const buildHeaderV2 = (payload: OrderPayloadV2): readonly string[] => [
  ...customerLines(payload.customer),
  `🚚 <b>Delivery:</b> ${DELIVERY_MODE_LABELS[payload.delivery.mode]}`,
  ...sourceLines(payload.delivery),
  ...deliveryLines(payload.delivery),
  `💲 <b>Total:</b> ${field(
    formatTotal(payload.total, payload.locale, payload.currency),
    TOTAL_LIMIT
  )}`,
  ...commentLines(payload.comment),
];

export const buildOrderMessageV2 = (payload: OrderPayloadV2): string =>
  composeMessage(buildHeaderV2(payload), payload.cart);

export const renderOrder = (envelope: OrderEnvelope): string =>
  envelope.kind === "v1"
    ? buildOrderMessage(envelope.payload)
    : buildOrderMessageV2(envelope.payload);
