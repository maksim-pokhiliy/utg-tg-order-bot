import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { buildOrderMessage } from "../src/message.js";
import { renderOrder } from "../src/messageV2.js";
import { parseOrderPayload } from "../src/payload.js";
import { parseOrder } from "../src/payloadV2.js";

const CORPUS_PATH = fileURLToPath(
  new URL("./fixtures/v1-golden-corpus.json", import.meta.url)
);
const COMMIT_PATTERN = /^[0-9a-f]{40}$/;
const EXPECTED_ENTRIES = 12;

interface CorpusEntry {
  name: string;
  input: Record<string, unknown>;
  message: string;
}

interface Corpus {
  commit: string;
  entries: readonly CorpusEntry[];
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const isList = (value: unknown): value is readonly unknown[] =>
  Array.isArray(value);

const readEntry = (value: unknown): CorpusEntry => {
  if (!isRecord(value)) {
    throw new Error("corpus entry is not an object");
  }

  const { name, input, message } = value;

  if (
    typeof name !== "string" ||
    !isRecord(input) ||
    typeof message !== "string"
  ) {
    throw new Error("corpus entry is malformed");
  }

  return { name, input, message };
};

const readCorpus = (): Corpus => {
  const parsed: unknown = JSON.parse(readFileSync(CORPUS_PATH, "utf8"));

  if (!isRecord(parsed)) {
    throw new Error("corpus file is not an object");
  }

  const commit = parsed["capturedFromCommit"];
  const entries = parsed["entries"];

  if (typeof commit !== "string" || !isList(entries)) {
    throw new Error("corpus file is malformed");
  }

  return { commit, entries: entries.map(readEntry) };
};

const corpus = readCorpus();

const renderThroughV1 = (input: Record<string, unknown>): string => {
  const parsed = parseOrderPayload(input);

  if (!parsed.ok) {
    throw new Error(`corpus fixture rejected: ${parsed.reason}`);
  }

  return buildOrderMessage(parsed.value);
};

const renderThroughDispatch = (input: Record<string, unknown>): string => {
  const parsed = parseOrder(input);

  if (!parsed.ok) {
    throw new Error(`corpus fixture rejected by dispatch: ${parsed.reason}`);
  }

  if (parsed.value.kind !== "v1") {
    throw new Error("a v1 corpus fixture was routed to the v2 decoder");
  }

  return renderOrder(parsed.value);
};

describe("the v1 golden corpus captured from master", () => {
  it("carries every fixture the byte-identity gate requires", () => {
    expect(corpus.entries).toHaveLength(EXPECTED_ENTRIES);
    expect(corpus.commit).toMatch(COMMIT_PATTERN);
    expect(corpus.entries.map((entry) => entry.name)).toEqual([
      "canonical-uk",
      "rates-down-en-uah",
      "distinct-labels",
      "hostile-markup",
      "newline-bearing",
      "multi-line-note",
      "multi-item-cart",
      "truncated-60-item-cart",
      "pathological-header",
      "absent-currency",
      "absent-additional",
      "lone-surrogate-and-astral",
    ]);
  });

  for (const entry of corpus.entries) {
    it(`renders ${entry.name} through the v1 path exactly as master did`, () => {
      expect(renderThroughV1(entry.input)).toBe(entry.message);
    });
  }

  for (const entry of corpus.entries) {
    it(`routes ${entry.name} through the dispatcher to the same bytes`, () => {
      expect(renderThroughDispatch(entry.input)).toBe(entry.message);
    });
  }
});
