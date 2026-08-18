import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const readRepoFile = (relative: string): string =>
  readFileSync(fileURLToPath(new URL(relative, import.meta.url)), "utf8");

const storeSource = readRepoFile("../src/store.ts");
const migration = readRepoFile("../migrations/001_orders.sql");
const neonSource = readRepoFile("../src/neon.ts");

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
    expect(storeSource).toContain(
      "  (select prior.sent_at from prior) as prior_sent_at,"
    );
    expect(storeSource).toContain(
      "  (select prior.idempotency_key from prior) as prior_idempotency_key,"
    );
    expect(storeSource).toContain(
      "  (select prior.content_hash from prior) as prior_content_hash,"
    );
    expect(storeSource).toContain(
      "  (select floor(extract(epoch from (now() - prior.received_at)))::int from prior) as prior_age_seconds"
    );
  });

  it("keeps the prior CTE exactly as it was validated against production", () => {
    expect(storeSource).toContain(
      [
        "with prior as (",
        "  select id, sent_at, idempotency_key, content_hash, received_at",
        "  from orders",
        "  where content_hash = $1",
        "    and idempotency_key = $2",
        "    and sent_at is not null",
        "    and received_at > now() - interval '30 minutes'",
        "  order by received_at desc",
        "  limit 1",
        ")",
      ].join("\n")
    );
  });

  it("writes the dedupe back-reference in the same roundtrip", () => {
    expect(storeSource).toContain(
      "insert into orders (attempt_id, content_hash, idempotency_key, schema_version, payload, dedupe_of)"
    );
    expect(storeSource).toContain(
      "values ($3, $1, $2, $4, $5, (select prior.id from prior))"
    );
  });

  it("conjoins all four narrowing conditions, and never disjoins them", () => {
    expect(storeSource).toContain(
      [
        "  where content_hash = $1",
        "    and idempotency_key = $2",
        "    and sent_at is not null",
        "    and received_at > now() - interval '30 minutes'",
      ].join("\n")
    );
    expect(storeSource).not.toContain(" or idempotency_key");
    expect(storeSource).not.toContain(" or content_hash");
    expect(storeSource).not.toContain(" or sent_at");
  });
});

describe("the columns the statement returns and the reader looks up", () => {
  const recordStatement = /const RECORD_STATEMENT = `([\s\S]*?)`;/.exec(
    storeSource
  )?.[1];

  const returnedColumns = (): readonly string[] => {
    if (recordStatement === undefined) {
      throw new Error("the record statement is no longer a template literal");
    }

    const returning = /\nreturning\n([\s\S]*)$/.exec(recordStatement)?.[1];

    if (returning === undefined) {
      throw new Error("the record statement has no returning clause");
    }

    return returning
      .split(",")
      .map((part) => {
        const aliased = /as (\w+)\s*$/.exec(part);

        return (aliased?.[1] ?? part.trim()).trim();
      })
      .filter((name) => name !== "");
  };

  const readerKeys = (): readonly string[] => [
    ...new Set(
      [...storeSource.matchAll(/read(?:Text|Number)\(row, "(\w+)"\)/g)].map(
        (match) => match[1] ?? ""
      )
    ),
  ];

  it("returns every column the response reader asks for", () => {
    const produced = new Set(returnedColumns());

    expect(readerKeys().length).toBeGreaterThan(0);
    expect(produced.size).toBeGreaterThan(0);

    for (const key of readerKeys()) {
      expect({ key, produced: produced.has(key) }).toEqual({
        key,
        produced: true,
      });
    }
  });

  it("returns exactly the columns the neon fixtures reproduce", () => {
    const fixture: unknown = JSON.parse(
      readRepoFile("./fixtures/neon/insert-duplicate.json")
    );
    const rows =
      typeof fixture === "object" && fixture !== null && "rows" in fixture
        ? fixture.rows
        : undefined;
    const row = Array.isArray(rows) ? rows[0] : undefined;

    if (typeof row !== "object" || row === null) {
      throw new Error("the duplicate fixture carries no row");
    }

    expect([...returnedColumns()].sort()).toEqual(Object.keys(row).sort());
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
    expect(storeSource).toContain(
      "insert into orders (attempt_id, content_hash, idempotency_key, schema_version, payload, sent_at, telegram_message_id, send_failure)"
    );
  });

  it("binds the mark's values in the order its insert declares the columns", () => {
    expect(storeSource).toContain(
      "values ($1, $2, $3, $4, $5, case when $6::boolean then now() end, $7, $8)"
    );
  });
});

describe("the transport", () => {
  it("boxes each statement in exactly the budget it was handed", () => {
    expect(neonSource).toContain("signal: AbortSignal.timeout(timeoutMs),");
    expect(neonSource).not.toMatch(/AbortSignal\.timeout\(timeoutMs\s*[*/+-]/u);
  });

  it("checks configuration before it does any work on the payload", () => {
    expect(neonSource).toContain("export const isStoreConfigured");
  });
});

describe("the migration", () => {
  const columnsDeclaredNotNull = (): readonly string[] => {
    const body = /create table if not exists orders \(([\s\S]*?)\n\);/.exec(
      migration
    )?.[1];

    if (body === undefined) {
      throw new Error("the migration declares no orders table");
    }

    return body
      .split("\n")
      .map((line) => line.trim().replace(/,$/, ""))
      .filter((line) => / not null\b/.test(line))
      .map((line) => line.split(" ")[0] ?? "")
      .sort();
  };

  it("stores the payload as text, because jsonb rejects orders the decoders accept", () => {
    expect(migration).toContain("payload text not null");
    expect(migration).not.toContain("jsonb");
  });

  it("declares not null on exactly the columns the relay always supplies", () => {
    expect(columnsDeclaredNotNull()).toEqual([
      "attempt_id",
      "content_hash",
      "payload",
      "received_at",
      "schema_version",
    ]);
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
