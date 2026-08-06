import { readDelivery, type OrderDelivery } from "./delivery.js";
import {
  isCurrencyCode,
  isPlainDecimal,
  isRecord,
  parseCart,
  parseOrderPayload,
  readOptionalText,
  readText,
  type OrderCartItem,
  type OrderPayload,
  type PlainDecimal,
  type RejectReason,
} from "./payload.js";

const V1_VERSION = 1;
const V2_VERSION = 2;

export interface OrderCustomer {
  first_name: string;
  last_name: string;
  patronymic: string | undefined;
  phone: string;
  contact_channel: string | undefined;
}

export interface OrderPayloadV2 {
  customer: OrderCustomer;
  delivery: OrderDelivery;
  comment: string | undefined;
  idempotency_key: string | undefined;
  locale: string;
  total: PlainDecimal;
  currency: string | undefined;
  cart: readonly OrderCartItem[];
}

export interface OrderEnvelopeV1 {
  kind: "v1";
  payload: OrderPayload;
}

export interface OrderEnvelopeV2 {
  kind: "v2";
  payload: OrderPayloadV2;
}

export type OrderEnvelope = OrderEnvelopeV1 | OrderEnvelopeV2;

export type OrderParseResult =
  { ok: true; value: OrderEnvelope } | { ok: false; reason: RejectReason };

const reject = (reason: RejectReason): OrderParseResult => ({
  ok: false,
  reason,
});

const styleText = (
  input: Record<string, unknown>,
  key: string
): string | undefined => {
  const text = readOptionalText(input, key);

  return text.ok ? text.value : undefined;
};

const readCustomer = (input: unknown): OrderCustomer | RejectReason => {
  if (!isRecord(input)) {
    return "customer_not_object";
  }

  const first_name = readText(input, "first_name");
  const last_name = readText(input, "last_name");
  const phone = readText(input, "phone");

  if (
    first_name === undefined ||
    last_name === undefined ||
    phone === undefined
  ) {
    return "customer_field_missing";
  }

  return {
    first_name,
    last_name,
    patronymic: styleText(input, "patronymic"),
    phone,
    contact_channel: styleText(input, "contact_channel"),
  };
};

export const parseOrderPayloadV2 = (
  input: Record<string, unknown>
): OrderParseResult => {
  const customer = readCustomer(input["customer"]);

  if (typeof customer === "string") {
    return reject(customer);
  }

  const delivery = readDelivery(input["delivery"]);

  if (typeof delivery === "string") {
    return reject(delivery);
  }

  const { locale, total, currency } = input;

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
      kind: "v2",
      payload: {
        customer,
        delivery,
        comment: styleText(input, "comment"),
        idempotency_key: styleText(input, "idempotency_key"),
        locale,
        total,
        currency,
        cart,
      },
    },
  };
};

export const parseOrder = (input: unknown): OrderParseResult => {
  if (!isRecord(input)) {
    return reject("body_not_object");
  }

  const version = input["version"];

  if (version === V2_VERSION) {
    return parseOrderPayloadV2(input);
  }

  if (version !== undefined && version !== V1_VERSION) {
    return reject("version_unsupported");
  }

  const parsed = parseOrderPayload(input);

  return parsed.ok
    ? { ok: true, value: { kind: "v1", payload: parsed.value } }
    : { ok: false, reason: parsed.reason };
};
