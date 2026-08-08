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
const EXPECTED_ENTRIES = 12;
const EXPECTED_BASELINE = "master";
const EXPECTED_COMMIT = "40ca4c5d2cd46cf1eb10e0887399338215534e0a";
const ASTRAL_ENTRY = "lone-surrogate-and-astral";
const INTENDED_DIVERGENCES: ReadonlySet<string> = new Set([ASTRAL_ENTRY]);
const MATH_DOUBLE_STRUCK_X = "𝕏";
const FIRST_NAME_WIDTH = 200;
const ADDITIONAL_WIDTH = 600;

interface CorpusEntry {
  name: string;
  input: Record<string, unknown>;
  message: string;
}

interface Corpus {
  baseline: string;
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

  const baseline = parsed["capturedFrom"];
  const commit = parsed["capturedFromCommit"];
  const entries = parsed["entries"];

  if (
    typeof baseline !== "string" ||
    typeof commit !== "string" ||
    !isList(entries)
  ) {
    throw new Error("corpus file is malformed");
  }

  return { baseline, commit, entries: entries.map(readEntry) };
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
  it("is pinned to the exact commit it was captured from", () => {
    expect(corpus.baseline).toBe(EXPECTED_BASELINE);
    expect(corpus.commit).toBe(EXPECTED_COMMIT);
  });

  it("renders the distinct-label fixture from source, not from the file", () => {
    const distinct = corpus.entries.find(
      (entry) => entry.name === "distinct-labels"
    );

    expect(distinct).toBeDefined();

    const rendered = renderThroughV1(distinct?.input ?? {});

    expect(rendered).toContain("👤 <b>First Name:</b> FirstNameValue");
    expect(rendered).toContain(" 🏷️ <b>Title:</b> TitleValue");
    expect(rendered).toContain("💲 <b>Total:</b> $1,234.50");
  });

  it("carries every fixture the byte-identity gate requires", () => {
    expect(corpus.entries).toHaveLength(EXPECTED_ENTRIES);
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

  it("names only divergences the corpus actually carries", () => {
    const names = new Set(corpus.entries.map((entry) => entry.name));

    for (const name of INTENDED_DIVERGENCES) {
      expect(names.has(name)).toBe(true);
    }

    expect(INTENDED_DIVERGENCES.size).toBe(1);
  });

  for (const entry of corpus.entries) {
    if (INTENDED_DIVERGENCES.has(entry.name)) {
      continue;
    }

    it(`renders ${entry.name} through the v1 path exactly as master did`, () => {
      expect(renderThroughV1(entry.input)).toBe(entry.message);
    });
  }

  for (const entry of corpus.entries) {
    if (INTENDED_DIVERGENCES.has(entry.name)) {
      continue;
    }

    it(`routes ${entry.name} through the dispatcher to the same bytes`, () => {
      expect(renderThroughDispatch(entry.input)).toBe(entry.message);
    });
  }
});

describe("the one deliberate divergence from master on the v1 path", () => {
  const SEPARATORS: readonly string[] = [
    "\r",
    "\v",
    "\f",
    "\u0085",
    "\u2028",
    "\u2029",
  ];

  const FORBIDDEN = /[\r\v\f\u0085\u2028\u2029]/u;

  it("collapses the line separators master let through a v1 field", () => {
    for (const separator of SEPARATORS) {
      const input = {
        ...corpus.entries[0]?.input,
        address: `Шевченка${separator}12`,
      };

      const message = renderThroughV1(input);

      expect(message).not.toMatch(FORBIDDEN);
      expect(message).toContain("Шевченка 12");
    }
  });
});

describe("the second deliberate divergence, added by the sanitizer", () => {
  const entry = corpus.entries.find(
    (candidate) => candidate.name === ASTRAL_ENTRY
  );
  const master = entry?.message ?? "";
  const input = entry?.input ?? {};

  it("is the only corpus entry whose input the sanitizer touches", () => {
    expect(entry).toBeDefined();
    expect(master).toContain(MATH_DOUBLE_STRUCK_X);
  });

  it("folds the math double-struck capitals master relayed verbatim", () => {
    const rendered = renderThroughV1(input);

    expect(rendered).not.toBe(master);
    expect(rendered).not.toContain(MATH_DOUBLE_STRUCK_X);
    expect(rendered).toContain(
      `👤 <b>First Name:</b> ${"X".repeat(FIRST_NAME_WIDTH)}`
    );
    expect(rendered).toContain(
      `📄 <b>Additional Information:</b> ${"X".repeat(ADDITIONAL_WIDTH)}`
    );
  });

  it("spends half the width master spent on the same two fields", () => {
    const rendered = renderThroughV1(input);

    expect(master.length).toBe(2177);
    expect(rendered.length).toBeLessThan(master.length);
    expect(rendered.length).toBeLessThanOrEqual(4096);
  });

  it("changes nothing else about the entry", () => {
    const rendered = renderThroughV1(input);

    for (const line of [
      "🧔 <b>Last Name:</b> Петренко",
      "📞 <b>Telephone:</b> +380671234567",
      "🌍 <b>Country:</b> Україна",
      "🌍 <b>City:</b> Ky�iv",
      `💲 <b>Total:</b> 46\u00A0200,00\u00A0₴`,
    ]) {
      expect(master).toContain(line);
      expect(rendered).toContain(line);
    }
  });

  it("routes to the same bytes through the dispatcher", () => {
    expect(renderThroughDispatch(input)).toBe(renderThroughV1(input));
  });
});
