import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { REQUEST_TIMEOUT_MS } from "../src/telegram.js";

const configPath = fileURLToPath(new URL("../vercel.json", import.meta.url));
const config: unknown = JSON.parse(readFileSync(configPath, "utf8"));

const asRecord = (value: unknown): Record<string, unknown> => {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error("vercel.json is not an object");
  }

  return { ...value };
};

describe("vercel.json", () => {
  it("rewrites the sacred /place_order path onto the function", () => {
    const rewrites = asRecord(config)["rewrites"];

    expect(rewrites).toEqual([
      { source: "/place_order", destination: "/api/place_order" },
    ]);
  });

  it("carries no legacy builds or routes configuration", () => {
    const record = asRecord(config);

    expect(record["builds"]).toBeUndefined();
    expect(record["routes"]).toBeUndefined();
    expect(record["version"]).toBeUndefined();
  });

  it("gives the function more time than the upstream call is allowed", () => {
    const functions = asRecord(asRecord(config)["functions"]);
    const entry = asRecord(functions["api/place_order.ts"]);
    const maxDuration = entry["maxDuration"];

    expect(typeof maxDuration).toBe("number");
    expect(Number(maxDuration) * 1000).toBeGreaterThan(REQUEST_TIMEOUT_MS);
  });
});
