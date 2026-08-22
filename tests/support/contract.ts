export const ORDER_KEYS = [
  "version",
  "idempotency_key",
  "locale",
  "customer",
  "delivery",
  "comment",
  "cart",
  "total",
  "currency",
] as const;

export const ORDER_CUSTOMER_KEYS = [
  "first_name",
  "last_name",
  "patronymic",
  "phone",
  "contact_channel",
] as const;

export const ORDER_DELIVERY_BRANCH_KEYS = [
  "mode",
  "source",
  "city",
  "warehouse",
  "warehouse_number",
] as const;

export const ORDER_DELIVERY_COURIER_KEYS = [
  "mode",
  "source",
  "city",
  "street",
  "building",
  "apartment",
] as const;

export const ORDER_DELIVERY_GENERIC_KEYS = [
  "mode",
  "country",
  "state",
  "city",
  "address",
] as const;

export const CART_ITEM_KEYS = ["title", "quantity", "productUrl"] as const;

export const ORDER_CONTACT_CHANNEL_VALUES = [
  "call",
  "telegram",
  "viber",
] as const;
