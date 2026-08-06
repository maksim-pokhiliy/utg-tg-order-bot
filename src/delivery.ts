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
  country: string;
  state: string | undefined;
  city: string;
  address: string;
}

export type OrderDelivery =
  DeliveryWarehouse | DeliveryCourier | DeliveryGeneric;

type SourceResult =
  { ok: true; value: DeliverySource | undefined } | { ok: false };

type NumberResult = { ok: true; value: string | undefined } | { ok: false };

const isDeliveryMode = (value: unknown): value is DeliveryMode =>
  typeof value === "string" &&
  DELIVERY_MODES.some((candidate) => candidate === value);

const readSource = (input: Record<string, unknown>): SourceResult => {
  const text = readOptionalText(input, "source");

  if (!text.ok) {
    return { ok: false };
  }

  return {
    ok: true,
    value: DELIVERY_SOURCES.find((candidate) => candidate === text.value),
  };
};

const readWarehouseNumber = (input: Record<string, unknown>): NumberResult => {
  const value = input["warehouse_number"];

  if (typeof value === "number") {
    return Number.isInteger(value)
      ? { ok: true, value: String(value) }
      : { ok: false };
  }

  return readOptionalText(input, "warehouse_number");
};

const readWarehouse = (
  input: Record<string, unknown>,
  mode: WarehouseMode,
  source: DeliverySource | undefined
): OrderDelivery | RejectReason => {
  const city = readText(input, "city");
  const warehouse = readText(input, "warehouse");

  if (city === undefined || warehouse === undefined) {
    return "delivery_field_missing";
  }

  const number = readWarehouseNumber(input);

  if (!number.ok) {
    return "delivery_optional_not_string";
  }

  return { mode, source, city, warehouse, warehouse_number: number.value };
};

const readCourier = (
  input: Record<string, unknown>,
  source: DeliverySource | undefined
): OrderDelivery | RejectReason => {
  const city = readText(input, "city");
  const street = readText(input, "street");
  const building = readText(input, "building");

  if (city === undefined || street === undefined || building === undefined) {
    return "delivery_field_missing";
  }

  const apartment = readOptionalText(input, "apartment");

  if (!apartment.ok) {
    return "delivery_optional_not_string";
  }

  return {
    mode: "np_courier",
    source,
    city,
    street,
    building,
    apartment: apartment.value,
  };
};

const readGeneric = (
  input: Record<string, unknown>
): OrderDelivery | RejectReason => {
  const country = readText(input, "country");
  const city = readText(input, "city");
  const address = readText(input, "address");

  if (country === undefined || city === undefined || address === undefined) {
    return "delivery_field_missing";
  }

  const state = readOptionalText(input, "state");

  if (!state.ok) {
    return "delivery_optional_not_string";
  }

  return { mode: "generic", country, state: state.value, city, address };
};

export const readDelivery = (input: unknown): OrderDelivery | RejectReason => {
  if (!isRecord(input)) {
    return "delivery_not_object";
  }

  const mode = input["mode"];

  if (!isDeliveryMode(mode)) {
    return "delivery_mode_unknown";
  }

  if (mode === "generic") {
    return readGeneric(input);
  }

  const source = readSource(input);

  if (!source.ok) {
    return "delivery_source_not_string";
  }

  if (mode === "np_courier") {
    return readCourier(input, source.value);
  }

  return readWarehouse(input, mode, source.value);
};
