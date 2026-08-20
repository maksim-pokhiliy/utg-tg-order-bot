import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  createAttempt,
  markAttempt,
  MAX_PAYLOAD_CHARS,
  recordAttempt,
  STORE_MARK_TIMEOUT_MS,
  STORE_QUERY_TIMEOUT_MS,
} from "../src/store.js";
import { buildEnvelope, PINNED_KEY } from "./support/envelope.js";
import {
  captureConsole,
  joinAllLogged,
  neonDuplicate,
  neonError,
  neonFresh,
  neonMarkOk,
  NEON_HOST,
  NEON_PASSWORD,
  NEON_REQUEST_ID,
  NEON_SQL_URL,
  PROBE_SENT_AT,
  readNeonCalls,
  stubRelayFetch,
  TEST_DATABASE_URL,
  type ConsoleCaptures,
} from "./support/relayFetch.js";

const configure = (): void => {
  vi.stubEnv("DATABASE_URL", TEST_DATABASE_URL);
};

let logs: ConsoleCaptures;

beforeEach(() => {
  logs = captureConsole();
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("the store without configuration", () => {
  it("reports not_configured, touches the network zero times and says nothing", async () => {
    const stub = stubRelayFetch();
    const attempt = createAttempt(buildEnvelope());

    await expect(recordAttempt(attempt)).resolves.toEqual({
      ok: false,
      reason: "not_configured",
    });

    expect(stub).not.toHaveBeenCalled();
    expect(joinAllLogged(logs)).toBe("\n\n");
  });

  it("treats a whitespace-only DATABASE_URL as unset", async () => {
    vi.stubEnv("DATABASE_URL", "  \n ");
    const stub = stubRelayFetch();

    await expect(
      recordAttempt(createAttempt(buildEnvelope()))
    ).resolves.toEqual({ ok: false, reason: "not_configured" });
    expect(stub).not.toHaveBeenCalled();
  });

  it("keeps the mark dark too", async () => {
    const stub = stubRelayFetch();

    await expect(
      markAttempt(createAttempt(buildEnvelope()), {
        isDelivered: true,
        messageId: 1,
      })
    ).resolves.toEqual({ ok: false, reason: "not_configured" });
    expect(stub).not.toHaveBeenCalled();
  });
});

describe("the store request", () => {
  beforeEach(configure);

  it("posts the statement to the /sql endpoint of the configured host", async () => {
    const stub = stubRelayFetch();

    await recordAttempt(createAttempt(buildEnvelope()));

    const [call] = readNeonCalls(stub);

    expect(call?.url).toBe(NEON_SQL_URL);
    expect(call?.connectionString).toBe(TEST_DATABASE_URL);
    expect(call?.contentType).toBe("application/json");
  });

  it("boxes both statements in an abort signal", async () => {
    const stub = stubRelayFetch({ neon: async () => neonMarkOk() });
    const attempt = createAttempt(buildEnvelope());

    await recordAttempt(attempt);
    await markAttempt(attempt, { isDelivered: true, messageId: 1 });

    const calls = readNeonCalls(stub);

    expect(calls).toHaveLength(2);

    for (const call of calls) {
      expect({
        query: call.query.slice(0, 12),
        hasSignal: call.hasSignal,
      }).toEqual({ query: call.query.slice(0, 12), hasSignal: true });
    }
  });

  it("refuses to follow a redirect, so the connection string cannot be forwarded", async () => {
    const stub = stubRelayFetch();

    await recordAttempt(createAttempt(buildEnvelope()));

    expect(readNeonCalls(stub)[0]?.redirect).toBe("error");
  });

  it("carries the key, schema version and the verbatim envelope as params", async () => {
    const stub = stubRelayFetch();
    const attempt = createAttempt(buildEnvelope());

    await recordAttempt(attempt);

    const [call] = readNeonCalls(stub);

    expect(call?.params[0]).toBe(attempt.contentHash);
    expect(call?.params[1]).toBe(PINNED_KEY);
    expect(call?.params[2]).toBe(attempt.attemptId);
    expect(call?.params[3]).toBe(2);
    expect(call?.params[4]).toBe(JSON.stringify(attempt.envelope));
  });

  it("stores the idempotency key inside the payload even though the hash excludes it", async () => {
    const stub = stubRelayFetch();
    const attempt = createAttempt(buildEnvelope());

    await recordAttempt(attempt);

    expect(String(readNeonCalls(stub)[0]?.params[4])).toContain(PINNED_KEY);
  });

  it("binds exactly as many params as the statement has placeholders", async () => {
    const stub = stubRelayFetch({ neon: async () => neonMarkOk() });
    const attempt = createAttempt(buildEnvelope());

    await recordAttempt(attempt);
    await markAttempt(attempt, { isDelivered: true, messageId: 1 });

    for (const call of readNeonCalls(stub)) {
      const highest = Math.max(
        ...[...call.query.matchAll(/\$(\d+)/g)].map((match) => Number(match[1]))
      );

      expect({ highest, bound: call.params.length }).toEqual({
        highest,
        bound: highest,
      });
    }
  });

  it("sends a null key for a keyless order and stamps schema version 2", async () => {
    const stub = stubRelayFetch();

    await recordAttempt(
      createAttempt(buildEnvelope({ idempotency_key: undefined }))
    );

    const [call] = readNeonCalls(stub);

    expect(call?.params[1]).toBeNull();
    expect(call?.params[3]).toBe(2);
  });

  it("stamps schema version 2 on an order that does carry a key", async () => {
    const stub = stubRelayFetch();

    await recordAttempt(createAttempt(buildEnvelope()));

    const [call] = readNeonCalls(stub);

    expect(call?.params[1]).toBe(PINNED_KEY);
    expect(call?.params[3]).toBe(2);
  });
});

describe("the store response", () => {
  beforeEach(configure);

  it("reports a fresh row with no prior", async () => {
    stubRelayFetch({ neon: async () => neonFresh("12") });

    await expect(
      recordAttempt(createAttempt(buildEnvelope()))
    ).resolves.toEqual({ ok: true, value: { rowId: "12", prior: undefined } });
  });

  it("reads bigints as strings and the prior age as a number", async () => {
    stubRelayFetch({
      neon: async () =>
        neonDuplicate({
          rowId: "7",
          dupeOf: "6",
          contentHash: "abc",
          ageSeconds: 61,
        }),
    });

    const result = await recordAttempt(createAttempt(buildEnvelope()));

    expect(result).toEqual({
      ok: true,
      value: {
        rowId: "7",
        prior: {
          id: "6",
          sentAt: PROBE_SENT_AT,
          idempotencyKey: PINNED_KEY,
          contentHash: "abc",
          ageSeconds: 61,
        },
      },
    });
    if (!result.ok) {
      throw new Error(`expected a recorded attempt, got ${result.reason}`);
    }

    expect(typeof result.value.prior?.id).toBe("string");
    expect(typeof result.value.prior?.ageSeconds).toBe("number");
  });

  it("reports a stored row even when the statement returns no rows at all", async () => {
    stubRelayFetch({ neon: async () => neonMarkOk() });

    await expect(
      recordAttempt(createAttempt(buildEnvelope()))
    ).resolves.toEqual({ ok: true, value: { rowId: null, prior: undefined } });

    expect(joinAllLogged(logs)).toContain("order_stored");
  });

  it("names an unreadable prior instead of quietly reporting none", async () => {
    stubRelayFetch({
      neon: async () => neonDuplicate({ dupeOf: "6", contentHash: null }),
    });

    const result = await recordAttempt(createAttempt(buildEnvelope()));

    expect(result).toEqual({
      ok: true,
      value: { rowId: "7", prior: undefined },
    });
    expect(joinAllLogged(logs)).toContain("order_store_prior_unreadable");
  });

  it("refuses to store a payload past the size cap, and says so", async () => {
    const stub = stubRelayFetch();
    const huge = "я".repeat(MAX_PAYLOAD_CHARS);

    await expect(
      recordAttempt(createAttempt(buildEnvelope({ comment: huge })))
    ).resolves.toEqual({ ok: false, reason: "payload_too_large" });

    expect(stub).not.toHaveBeenCalled();

    const logged = joinAllLogged(logs);

    expect(logged).toContain("payload_too_large");
    expect(logged).toContain("order_store_unavailable");
    expect(logged).not.toContain("яяяя");
  });

  it("reports response_unreadable when the envelope carries no rows array", async () => {
    stubRelayFetch({
      neon: async () => new Response(JSON.stringify({ rows: "nope" })),
    });

    await expect(
      recordAttempt(createAttempt(buildEnvelope()))
    ).resolves.toEqual({ ok: false, reason: "response_unreadable" });
  });

  it("reports response_unreadable when the body is not json at all", async () => {
    stubRelayFetch({ neon: async () => new Response("<html>502</html>") });

    await expect(
      recordAttempt(createAttempt(buildEnvelope()))
    ).resolves.toEqual({ ok: false, reason: "response_unreadable" });
  });
});

describe("the store failure classification", () => {
  beforeEach(configure);

  it("fails open when the orders table does not exist yet", async () => {
    stubRelayFetch({ neon: async () => neonError("missing-table") });

    await expect(
      recordAttempt(createAttempt(buildEnvelope()))
    ).resolves.toEqual({ ok: false, reason: "upstream_rejected" });

    const logged = joinAllLogged(logs);

    expect(logged).toContain("order_store_unavailable");
    expect(logged).toContain("42P01");
    expect(logged).toContain(NEON_REQUEST_ID);
    expect(logged).toContain("elapsedMs");
    expect(logged).not.toContain("does not exist");
  });

  it("survives an authentication failure whose SQLSTATE is an empty string", async () => {
    stubRelayFetch({ neon: async () => neonError("auth") });

    await expect(
      recordAttempt(createAttempt(buildEnvelope()))
    ).resolves.toEqual({ ok: false, reason: "upstream_rejected" });
    expect(joinAllLogged(logs)).not.toContain("password authentication failed");
  });

  it("never treats a syntax error as anything but a store outage", async () => {
    stubRelayFetch({ neon: async () => neonError("syntax") });

    await expect(
      recordAttempt(createAttempt(buildEnvelope()))
    ).resolves.toEqual({ ok: false, reason: "upstream_rejected" });
    expect(joinAllLogged(logs)).not.toContain("syntax error");
  });

  it("classifies an abort as a timeout and names the budget", async () => {
    stubRelayFetch({
      neon: async () => {
        throw new DOMException("The operation timed out.", "TimeoutError");
      },
    });

    await expect(
      recordAttempt(createAttempt(buildEnvelope()))
    ).resolves.toEqual({ ok: false, reason: "timeout" });
    expect(joinAllLogged(logs)).toContain(String(STORE_QUERY_TIMEOUT_MS));
  });

  it("classifies a dead socket as a network error", async () => {
    stubRelayFetch({
      neon: async () => {
        throw new TypeError("fetch failed");
      },
    });

    await expect(
      recordAttempt(createAttempt(buildEnvelope()))
    ).resolves.toEqual({ ok: false, reason: "network_error" });
    expect(joinAllLogged(logs)).toContain("network_error");
  });

  it("never dials a host outside neon.tech, whatever the connection string says", async () => {
    for (const hostile of [
      "postgresql://u:p@evil.example/neondb",
      "postgresql://u:p@10.0.0.1/neondb",
      "postgresql://u:p@127.0.0.1:5432/neondb",
      "postgresql://u:p@neon.tech.attacker.example/neondb",
      "postgresql://u:p@neon.tech/neondb",
    ]) {
      vi.stubEnv("DATABASE_URL", hostile);
      const stub = stubRelayFetch();

      await expect(
        recordAttempt(createAttempt(buildEnvelope()))
      ).resolves.toEqual({ ok: false, reason: "bad_config" });

      expect({ hostile, calls: stub.mock.calls.length }).toEqual({
        hostile,
        calls: 0,
      });

      vi.unstubAllGlobals();
    }
  });

  it("accepts a real neon endpoint host", async () => {
    vi.stubEnv(
      "DATABASE_URL",
      "postgresql://u:p@ep-cool-darkness-123456-pooler.us-east-2.aws.neon.tech/neondb?sslmode=require"
    );
    const stub = stubRelayFetch();

    await recordAttempt(createAttempt(buildEnvelope()));

    expect(readNeonCalls(stub)[0]?.url).toBe(
      "https://ep-cool-darkness-123456-pooler.us-east-2.aws.neon.tech/sql"
    );
  });

  it("names a hostless connection string bad_config rather than blaming the network", async () => {
    vi.stubEnv("DATABASE_URL", "postgresql:///neondb");
    const stub = stubRelayFetch();

    await expect(
      recordAttempt(createAttempt(buildEnvelope()))
    ).resolves.toEqual({ ok: false, reason: "bad_config" });

    expect(stub).not.toHaveBeenCalled();
    expect(joinAllLogged(logs)).not.toContain("network_error");
  });

  it("logs a sqlstate only when it is shaped like one", async () => {
    stubRelayFetch({
      neon: async () =>
        new Response(
          JSON.stringify({
            message: "nope",
            code: "вул. Шевченка, 12 -- not a sqlstate",
          }),
          { status: 400 }
        ),
    });

    await recordAttempt(createAttempt(buildEnvelope()));

    const logged = joinAllLogged(logs);

    expect(logged).toContain("order_store_unavailable");
    expect(logged).not.toContain("вул. Шевченка");
    expect(logged).not.toContain("not a sqlstate");
  });

  it("reports bad_config for an unparseable connection string and never echoes it", async () => {
    vi.stubEnv("DATABASE_URL", "not a url at all");
    const stub = stubRelayFetch();

    await expect(
      recordAttempt(createAttempt(buildEnvelope()))
    ).resolves.toEqual({ ok: false, reason: "bad_config" });

    expect(stub).not.toHaveBeenCalled();

    const logged = joinAllLogged(logs);

    expect(logged).toContain("bad_config");
    expect(logged).not.toContain("not a url at all");
  });
});

describe("the post-send mark", () => {
  beforeEach(configure);

  it("upserts the delivered outcome with the telegram message id", async () => {
    const stub = stubRelayFetch({ neon: async () => neonMarkOk() });
    const attempt = createAttempt(buildEnvelope());

    await expect(
      markAttempt(attempt, { isDelivered: true, messageId: 4242 })
    ).resolves.toEqual({ ok: true });

    const [call] = readNeonCalls(stub);

    expect(call?.query).toContain("on conflict (attempt_id) do update");
    expect(call?.params[0]).toBe(attempt.attemptId);
    expect(call?.params[1]).toBe(attempt.contentHash);
    expect(call?.params[2]).toBe(PINNED_KEY);
    expect(call?.params[3]).toBe(2);
    expect(call?.params[5]).toBe("true");
    expect(call?.params[6]).toBe(4242);
    expect(call?.params[7]).toBeNull();
  });

  it("records a named send failure and no message id when delivery failed", async () => {
    const stub = stubRelayFetch({ neon: async () => neonMarkOk() });

    await markAttempt(createAttempt(buildEnvelope()), {
      isDelivered: false,
      failure: "ack_unreadable",
    });

    const [call] = readNeonCalls(stub);

    expect(call?.params[5]).toBe("false");
    expect(call?.params[6]).toBeNull();
    expect(call?.params[7]).toBe("ack_unreadable");
  });

  it("carries the whole row so a recovered database can write it late", async () => {
    const stub = stubRelayFetch({ neon: async () => neonMarkOk() });
    const attempt = createAttempt(buildEnvelope());

    await markAttempt(attempt, { isDelivered: true, messageId: undefined });

    const [call] = readNeonCalls(stub);

    expect(call?.params[1]).toBe(attempt.contentHash);
    expect(call?.params[3]).toBe(2);
    expect(call?.params[4]).toBe(JSON.stringify(attempt.envelope));
    expect(call?.params[6]).toBeNull();
  });

  it("refuses to mark an oversized payload rather than sending it twice", async () => {
    const stub = stubRelayFetch();
    const huge = "я".repeat(MAX_PAYLOAD_CHARS);

    await expect(
      markAttempt(createAttempt(buildEnvelope({ comment: huge })), {
        isDelivered: true,
        messageId: 1,
      })
    ).resolves.toEqual({ ok: false, reason: "payload_too_large" });

    expect(stub).not.toHaveBeenCalled();
    expect(joinAllLogged(logs)).toContain("order_store_mark_failed");
    expect(joinAllLogged(logs)).toContain("payload_too_large");
  });

  it("fails open with its own event when the mark cannot land", async () => {
    stubRelayFetch({ neon: async () => neonError("missing-table") });

    await expect(
      markAttempt(createAttempt(buildEnvelope()), {
        isDelivered: true,
        messageId: 1,
      })
    ).resolves.toEqual({ ok: false, reason: "upstream_rejected" });
    expect(joinAllLogged(logs)).toContain("order_store_mark_failed");
  });

  it("boxes the mark in its own budget, not the pre-send one", async () => {
    stubRelayFetch({
      neon: async () => {
        throw new DOMException("The operation timed out.", "TimeoutError");
      },
    });

    await markAttempt(createAttempt(buildEnvelope()), {
      isDelivered: true,
      messageId: 1,
    });

    expect(joinAllLogged(logs)).toContain(String(STORE_MARK_TIMEOUT_MS));
    expect(STORE_MARK_TIMEOUT_MS).not.toBe(STORE_QUERY_TIMEOUT_MS);
  });
});

describe("what the store is never allowed to log", () => {
  beforeEach(configure);

  it("keeps the connection string, its password and its host out of every line", async () => {
    stubRelayFetch({ neon: async () => neonError("auth") });

    await recordAttempt(createAttempt(buildEnvelope()));

    const logged = joinAllLogged(logs);

    expect(logged).not.toContain(TEST_DATABASE_URL);
    expect(logged).not.toContain(NEON_PASSWORD);
    expect(logged).not.toContain(NEON_HOST);
  });

  it("keeps every buyer value and the full key and hash out of every line", async () => {
    stubRelayFetch({ neon: async () => neonError("missing-table") });
    const attempt = createAttempt(buildEnvelope());

    await recordAttempt(attempt);

    const logged = joinAllLogged(logs);

    for (const secret of [
      "Марія",
      "Шевченко",
      "+380671234567",
      "Городоцька",
      PINNED_KEY,
      attempt.contentHash,
    ]) {
      expect(logged).not.toContain(secret);
    }

    expect(logged).toContain(attempt.contentHash.slice(0, 12));
  });
});
