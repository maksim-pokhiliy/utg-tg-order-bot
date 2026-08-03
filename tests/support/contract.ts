export const ORDER_PAYLOAD_KEYS = [
  "first_name",
  "last_name",
  "telephone",
  "country",
  "state",
  "city",
  "address",
  "additional",
  "locale",
  "total",
  "currency",
  "cart",
] as const;

export const CART_ITEM_KEYS = ["title", "quantity", "productUrl"] as const;
