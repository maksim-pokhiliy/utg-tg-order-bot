import type { OrderCartItem } from "../../src/decode.js";
import type {
  OrderCustomer,
  OrderEnvelope,
  OrderPayload,
} from "../../src/payload.js";

export const PINNED_KEY = "3f2b8c1e-9a44-4d7e-8b2f-16c0a9e5d731";

export const PINNED_HASH =
  "40e0bf098e497406c172a639ce949a3f0fc538b50d425b78715c0f4d96c42958";

export const buildCartLine = (
  overrides: Partial<OrderCartItem> = {}
): OrderCartItem => ({
  title: "Шеврон «Очікування»",
  quantity: 2,
  productUrl: "https://www.ua-tactical-gear.com/uk/category/patches/waiting",
  ...overrides,
});

const buildCustomer = (
  overrides: Partial<OrderCustomer> = {}
): OrderCustomer => ({
  first_name: "Марія",
  last_name: "Шевченко",
  patronymic: undefined,
  phone: "+380671234567",
  contact_channel: undefined,
  ...overrides,
});

const buildPayload = (overrides: Partial<OrderPayload> = {}): OrderPayload => ({
  customer: buildCustomer(),
  delivery: {
    mode: "np_branch",
    source: "np_directory",
    city: "м. Львів, Львівська обл.",
    warehouse: "Відділення №1: вул. Городоцька, 359",
    warehouse_number: "1",
  },
  comment: undefined,
  idempotency_key: PINNED_KEY,
  locale: "uk",
  total: "250.00",
  currency: "UAH",
  cart: [buildCartLine()],
  ...overrides,
});

export const buildEnvelope = (
  overrides: Partial<OrderPayload> = {}
): OrderEnvelope => ({
  kind: "v2",
  payload: buildPayload(overrides),
});

export const PINNED_ENVELOPE: OrderEnvelope = buildEnvelope();
