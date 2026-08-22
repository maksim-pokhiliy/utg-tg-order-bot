import { readDelivery, type OrderDelivery } from "./delivery.js";
import {
  isPlainDecimal,
  isRecord,
  parseCart,
  readCurrency,
  readText,
  type OrderCartItem,
  type PlainDecimal,
  type RejectReason,
} from "./decode.js";

const PAYLOAD_VERSION = 2;

export interface OrderCustomer {
  first_name: string;
  last_name: string;
  patronymic: string | undefined;
  phone: string;
  contact_channel: string | undefined;
}

export interface OrderPayload {
  customer: OrderCustomer;
  delivery: OrderDelivery;
  comment: string | undefined;
  idempotency_key: string | undefined;
  locale: string;
  total: PlainDecimal;
  currency: string | undefined;
  cart: readonly OrderCartItem[];
}

export interface OrderEnvelope {
  kind: "v2";
  payload: OrderPayload;
}

export type OrderParseResult =
  { ok: true; value: OrderEnvelope } | { ok: false; reason: RejectReason };

const reject = (reason: RejectReason): OrderParseResult => ({
  ok: false,
  reason,
});

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
    patronymic: readText(input, "patronymic"),
    phone,
    contact_channel: readText(input, "contact_channel"),
  };
};

export const decodeEnvelopeBody = (
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

  const { locale, total } = input;

  if (typeof locale !== "string") {
    return reject("locale_not_string");
  }

  if (!isPlainDecimal(total)) {
    return reject("total_not_plain_decimal");
  }

  const currencyInput = input["currency"];
  const currency = readCurrency(currencyInput);

  if (currencyInput !== undefined && currency === undefined) {
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
        comment: readText(input, "comment"),
        idempotency_key: readText(input, "idempotency_key"),
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

  if (input["version"] !== PAYLOAD_VERSION) {
    return reject("version_unsupported");
  }

  return decodeEnvelopeBody(input);
};
