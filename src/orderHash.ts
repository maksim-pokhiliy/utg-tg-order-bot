import { createHash } from "node:crypto";

import type { OrderEnvelope } from "./payload.js";

export const canonicalize = (value: unknown): string => {
  if (value === null) {
    return "null";
  }

  if (Array.isArray(value)) {
    return `[${value.map(canonicalize).join(",")}]`;
  }

  if (typeof value === "object") {
    const source = value as Record<string, unknown>;
    const keys = Object.keys(source)
      .filter((key) => source[key] !== undefined)
      .sort();

    return `{${keys
      .map((key) => `${JSON.stringify(key)}:${canonicalize(source[key])}`)
      .join(",")}}`;
  }

  return JSON.stringify(value) ?? "null";
};

const withoutKey = (envelope: OrderEnvelope): OrderEnvelope => ({
  kind: "v2",
  payload: { ...envelope.payload, idempotency_key: undefined },
});

export const hashOrder = (envelope: OrderEnvelope): string =>
  createHash("sha256")
    .update(canonicalize(withoutKey(envelope)), "utf8")
    .digest("hex");
