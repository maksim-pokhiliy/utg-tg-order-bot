import type {
  DeliveryCourier,
  DeliveryGeneric,
  DeliveryMode,
  DeliveryWarehouse,
  OrderDelivery,
} from "../../src/delivery.js";
import type { OrderCartItem } from "../../src/decode.js";
import type { OrderCustomer, OrderPayload } from "../../src/payload.js";

export type Saturated<T> = { [K in keyof T]-?: Exclude<T[K], undefined> };

const ASTRAL = "🎯";
const FILLER = ASTRAL.repeat(1000);
const SATURATED_CART_SIZE = 40;

export const saturatedCartItem = (index: number): Saturated<OrderCartItem> => ({
  title: `${String(index)}${FILLER}`,
  quantity: 100000,
  productUrl: `https://s.test/${FILLER}`,
});

export const saturatedCart: readonly OrderCartItem[] = Array.from(
  { length: SATURATED_CART_SIZE },
  (_, index) => saturatedCartItem(index)
);

const saturatedCustomer: Saturated<OrderCustomer> = {
  first_name: FILLER,
  last_name: FILLER,
  patronymic: FILLER,
  phone: FILLER,
  contact_channel: FILLER,
};

const saturatedWarehouse = (
  mode: "np_branch" | "np_postomat"
): Saturated<DeliveryWarehouse> => ({
  mode,
  source: "np_directory",
  city: FILLER,
  warehouse: FILLER,
  warehouse_number: FILLER,
});

const saturatedCourier: Saturated<DeliveryCourier> = {
  mode: "np_courier",
  source: "np_directory",
  city: FILLER,
  street: FILLER,
  building: FILLER,
  apartment: FILLER,
};

const saturatedGeneric: Saturated<DeliveryGeneric> = {
  mode: "generic",
  country: FILLER,
  state: FILLER,
  city: FILLER,
  address: FILLER,
};

export const SATURATED_DELIVERIES: Readonly<
  Record<DeliveryMode, OrderDelivery>
> = {
  np_branch: saturatedWarehouse("np_branch"),
  np_postomat: saturatedWarehouse("np_postomat"),
  np_courier: saturatedCourier,
  generic: saturatedGeneric,
};

export const saturatedPayload = (
  delivery: OrderDelivery
): Saturated<OrderPayload> => ({
  customer: saturatedCustomer,
  delivery,
  comment: FILLER,
  idempotency_key: FILLER,
  locale: "uk",
  total: "99999999999999999999",
  currency: "UAH",
  cart: saturatedCart,
});
