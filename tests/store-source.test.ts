import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const readRepoFile = (relative: string): string =>
  readFileSync(fileURLToPath(new URL(relative, import.meta.url)), "utf8");

const storeSource = readRepoFile("../src/store.ts");
const migration = readRepoFile("../migrations/001_orders.sql");

describe("the pre-send statement", () => {
  it("still narrows on the content hash and the idempotency key", () => {
    expect(storeSource).toContain("content_hash = $1");
    expect(storeSource).toContain("idempotency_key = $2");
  });

  it("still refuses an undelivered prior in sql as well as in typescript", () => {
    expect(storeSource).toContain("sent_at is not null");
  });

  it("still carries the thirty-minute window that the constant mirrors", () => {
    expect(storeSource).toContain("interval '30 minutes'");
  });

  it("returns the prior tuple typescript re-verifies, including a floored age", () => {
    expect(storeSource).toContain("prior_sent_at");
    expect(storeSource).toContain("prior_idempotency_key");
    expect(storeSource).toContain("prior_content_hash");
    expect(storeSource).toMatch(/floor\(\s*extract\(epoch/u);
    expect(storeSource).toContain("prior_age_seconds");
  });

  it("writes the dedupe back-reference in the same roundtrip", () => {
    expect(storeSource).toMatch(
      /values[\s\S]{0,120}select prior\.id from prior/u
    );
  });

  it("never degrades into a key-only match", () => {
    expect(storeSource).not.toMatch(
      /where\s+idempotency_key = \$2\s+and\s+sent_at/u
    );
  });
});

describe("the post-send mark", () => {
  it("updates exactly the three disposition columns and nothing else", () => {
    const clause = /do update set([\s\S]*?)`/u.exec(storeSource)?.[1];

    expect(clause).toBeDefined();
    expect(clause).toContain("sent_at");
    expect(clause).toContain("telegram_message_id");
    expect(clause).toContain("send_failure");
    expect(clause).not.toContain("payload");
    expect(clause).not.toContain("content_hash");
    expect(clause).not.toContain("received_at");
    expect(clause).not.toContain("dedupe_of");
    expect(clause).not.toContain("idempotency_key");
  });

  it("takes the delivered timestamp from the database clock", () => {
    expect(storeSource).toMatch(/case when \$6::boolean then now\(\) end/u);
  });

  it("supplies every not-null column so a recovered database can insert late", () => {
    expect(storeSource).toMatch(
      /insert into orders \(attempt_id, content_hash, idempotency_key, schema_version, payload, sent_at/u
    );
  });
});

describe("the migration", () => {
  it("stores the payload as text, because jsonb rejects orders the decoders accept", () => {
    expect(migration).toContain("payload text not null");
    expect(migration).not.toContain("jsonb");
  });

  it("makes attempt_id unique, which is what lets the mark be an upsert", () => {
    expect(migration).toContain("attempt_id uuid not null unique");
  });

  it("indexes the columns the pre-send predicate leads with", () => {
    expect(migration).toContain("(content_hash, received_at desc)");
  });

  it("is re-runnable so applying it twice is not an incident", () => {
    expect(migration).toContain("create table if not exists");
    expect(migration).toContain("create index if not exists");
  });
});
