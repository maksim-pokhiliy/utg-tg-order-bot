import {
  isRecord,
  readOptionalText,
  readText,
  type RejectReason,
} from "./payload.js";

const DELIVERY_MODES = [
  "np_branch",
  "np_postomat",
  "np_courier",
  "generic",
] as const;

const DELIVERY_SOURCES = ["np_directory", "manual"] as const;

export type DeliveryMode = (typeof DELIVERY_MODES)[number];

export type DeliverySource = (typeof DELIVERY_SOURCES)[number];

export type WarehouseMode = "np_branch" | "np_postomat";

export interface DeliveryWarehouse {
  mode: WarehouseMode;
  source: DeliverySource | undefined;
  city: string;
  warehouse: string;
  warehouse_number: string | undefined;
}

export interface DeliveryCourier {
  mode: "np_courier";
  source: DeliverySource | undefined;
  city: string;
  street: string;
  building: string;
  apartment: string | undefined;
}

export interface DeliveryGeneric {
  mode: "generic";
  country: string | undefined;
  state: string | undefined;
  city: string;
  address: string;
}

export type OrderDelivery =
  DeliveryWarehouse | DeliveryCourier | DeliveryGeneric;

const isDeliveryMode = (value: unknown): value is DeliveryMode =>
  typeof value === "string" &&
  DELIVERY_MODES.some((candidate) => candidate === value);

const styleText = (
  input: Record<string, unknown>,
  key: string
): string | undefined => {
  const text = readOptionalText(input, key);

  return text.ok ? text.value : undefined;
};

const numberedText = (
  input: Record<string, unknown>,
  key: string
): string | undefined => {
  const value = input[key];

  if (typeof value === "number") {
    return Number.isSafeInteger(value) && value >= 0
      ? String(value)
      : undefined;
  }

  return styleText(input, key);
};

const readSource = (
  input: Record<string, unknown>
): DeliverySource | undefined => {
  const text = styleText(input, "source");

  return DELIVERY_SOURCES.find((candidate) => candidate === text);
};

const readWarehouse = (
  input: Record<string, unknown>,
  mode: WarehouseMode
): OrderDelivery | RejectReason => {
  const city = readText(input, "city");

  if (city === undefined) {
    return "delivery_city_missing";
  }

  const warehouse = readText(input, "warehouse");

  if (warehouse === undefined) {
    return "delivery_warehouse_missing";
  }

  return {
    mode,
    source: readSource(input),
    city,
    warehouse,
    warehouse_number: numberedText(input, "warehouse_number"),
  };
};

const readCourier = (
  input: Record<string, unknown>
): OrderDelivery | RejectReason => {
  const city = readText(input, "city");

  if (city === undefined) {
    return "delivery_city_missing";
  }

  const street = readText(input, "street");

  if (street === undefined) {
    return "delivery_street_missing";
  }

  const building = readText(input, "building");

  if (building === undefined) {
    return "delivery_building_missing";
  }

  return {
    mode: "np_courier",
    source: readSource(input),
    city,
    street,
    building,
    apartment: numberedText(input, "apartment"),
  };
};

const readGeneric = (
  input: Record<string, unknown>
): OrderDelivery | RejectReason => {
  const city = readText(input, "city");

  if (city === undefined) {
    return "delivery_city_missing";
  }

  const address = readText(input, "address");

  if (address === undefined) {
    return "delivery_address_missing";
  }

  return {
    mode: "generic",
    country: styleText(input, "country"),
    state: styleText(input, "state"),
    city,
    address,
  };
};

export const readDelivery = (input: unknown): OrderDelivery | RejectReason => {
  if (!isRecord(input)) {
    return "delivery_not_object";
  }

  const mode = input["mode"];

  if (mode === undefined || mode === null) {
    return "delivery_mode_missing";
  }

  if (!isDeliveryMode(mode)) {
    return "delivery_mode_unknown";
  }

  if (mode === "generic") {
    return readGeneric(input);
  }

  if (mode === "np_courier") {
    return readCourier(input);
  }

  return readWarehouse(input, mode);
};
