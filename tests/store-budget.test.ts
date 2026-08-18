import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { STORE_MARK_TIMEOUT_MS, STORE_QUERY_TIMEOUT_MS } from "../src/store.js";
import { REQUEST_TIMEOUT_MS } from "../src/telegram.js";

const MS_PER_SECOND = 1000;

const configPath = fileURLToPath(new URL("../vercel.json", import.meta.url));
const config: unknown = JSON.parse(readFileSync(configPath, "utf8"));

const readMaxDuration = (): number => {
  if (typeof config !== "object" || config === null) {
    throw new Error("vercel.json is not an object");
  }

  const functions = "functions" in config ? config.functions : undefined;

  if (typeof functions !== "object" || functions === null) {
    throw new Error("vercel.json declares no functions");
  }

  const entry =
    "api/place_order.ts" in functions
      ? functions["api/place_order.ts"]
      : undefined;

  if (typeof entry !== "object" || entry === null) {
    throw new Error("vercel.json declares no entry for the relay function");
  }

  const maxDuration = "maxDuration" in entry ? entry.maxDuration : undefined;

  if (typeof maxDuration !== "number") {
    throw new Error("maxDuration is not a number");
  }

  return maxDuration;
};

describe("the relay's time budget", () => {
  it("keeps the pre-send box at the amended two seconds", () => {
    expect(STORE_QUERY_TIMEOUT_MS).toBe(2000);
  });

  it("keeps the post-send mark box shorter still", () => {
    expect(STORE_MARK_TIMEOUT_MS).toBe(2500);
  });

  it("gives the function more time than all three outgoing budgets can take together", () => {
    const total =
      STORE_QUERY_TIMEOUT_MS + REQUEST_TIMEOUT_MS + STORE_MARK_TIMEOUT_MS;

    expect(readMaxDuration() * MS_PER_SECOND).toBeGreaterThan(total);
  });

  it("leaves headroom for the work outside the boxes, not just a hair", () => {
    const total =
      STORE_QUERY_TIMEOUT_MS + REQUEST_TIMEOUT_MS + STORE_MARK_TIMEOUT_MS;

    expect(readMaxDuration() * MS_PER_SECOND - total).toBeGreaterThanOrEqual(
      REQUEST_TIMEOUT_MS
    );
  });

  it("stays at the ratified thirty seconds rather than drifting either way", () => {
    expect(readMaxDuration()).toBe(30);
  });
});
