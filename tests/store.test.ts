import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  createAttempt,
  markAttempt,
  recordAttempt,
  STORE_MARK_TIMEOUT_MS,
  STORE_QUERY_TIMEOUT_MS,
} from "../src/store.js";
import {
  buildEnvelopeV1,
  buildEnvelopeV2,
  PINNED_KEY,
} from "./support/envelope.js";
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
    const attempt = createAttempt(buildEnvelopeV2());

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
      recordAttempt(createAttempt(buildEnvelopeV2()))
    ).resolves.toEqual({ ok: false, reason: "not_configured" });
    expect(stub).not.toHaveBeenCalled();
  });

  it("keeps the mark dark too", async () => {
    const stub = stubRelayFetch();

    await expect(
      markAttempt(createAttempt(buildEnvelopeV2()), {
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

    await recordAttempt(createAttempt(buildEnvelopeV2()));

    const [call] = readNeonCalls(stub);

    expect(call?.url).toBe(NEON_SQL_URL);
    expect(call?.connectionString).toBe(TEST_DATABASE_URL);
    expect(call?.contentType).toBe("application/json");
  });

  it("refuses to follow a redirect, so the connection string cannot be forwarded", async () => {
    const stub = stubRelayFetch();

    await recordAttempt(createAttempt(buildEnvelopeV2()));

    expect(readNeonCalls(stub)[0]?.redirect).toBe("error");
  });

  it("carries the v2 key, schema version and the verbatim envelope as params", async () => {
    const stub = stubRelayFetch();
    const attempt = createAttempt(buildEnvelopeV2());

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
    const attempt = createAttempt(buildEnvelopeV2());

    await recordAttempt(attempt);

    expect(String(readNeonCalls(stub)[0]?.params[4])).toContain(PINNED_KEY);
  });

  it("binds exactly as many params as the statement has placeholders", async () => {
    const stub = stubRelayFetch({ neon: async () => neonMarkOk() });
    const attempt = createAttempt(buildEnvelopeV2());

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

  it("sends a null key and schema version 1 for a v1 order", async () => {
    const stub = stubRelayFetch();

    await recordAttempt(createAttempt(buildEnvelopeV1()));

    const [call] = readNeonCalls(stub);

    expect(call?.params[1]).toBeNull();
    expect(call?.params[3]).toBe(1);
  });
});

describe("the store response", () => {
  beforeEach(configure);

  it("reports a fresh row with no prior", async () => {
    stubRelayFetch({ neon: async () => neonFresh("12") });

    await expect(
      recordAttempt(createAttempt(buildEnvelopeV2()))
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

    const result = await recordAttempt(createAttempt(buildEnvelopeV2()));

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

  it("reports response_unreadable when the envelope carries no rows array", async () => {
    stubRelayFetch({
      neon: async () => new Response(JSON.stringify({ rows: "nope" })),
    });

    await expect(
      recordAttempt(createAttempt(buildEnvelopeV2()))
    ).resolves.toEqual({ ok: false, reason: "response_unreadable" });
  });

  it("reports response_unreadable when the body is not json at all", async () => {
    stubRelayFetch({ neon: async () => new Response("<html>502</html>") });

    await expect(
      recordAttempt(createAttempt(buildEnvelopeV2()))
    ).resolves.toEqual({ ok: false, reason: "response_unreadable" });
  });
});

describe("the store failure classification", () => {
  beforeEach(configure);

  it("fails open when the orders table does not exist yet", async () => {
    stubRelayFetch({ neon: async () => neonError("missing-table") });

    await expect(
      recordAttempt(createAttempt(buildEnvelopeV2()))
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
      recordAttempt(createAttempt(buildEnvelopeV2()))
    ).resolves.toEqual({ ok: false, reason: "upstream_rejected" });
    expect(joinAllLogged(logs)).not.toContain("password authentication failed");
  });

  it("never treats a syntax error as anything but a store outage", async () => {
    stubRelayFetch({ neon: async () => neonError("syntax") });

    await expect(
      recordAttempt(createAttempt(buildEnvelopeV2()))
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
      recordAttempt(createAttempt(buildEnvelopeV2()))
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
      recordAttempt(createAttempt(buildEnvelopeV2()))
    ).resolves.toEqual({ ok: false, reason: "network_error" });
    expect(joinAllLogged(logs)).toContain("network_error");
  });

  it("names a hostless connection string bad_config rather than blaming the network", async () => {
    vi.stubEnv("DATABASE_URL", "postgresql:///neondb");
    const stub = stubRelayFetch();

    await expect(
      recordAttempt(createAttempt(buildEnvelopeV2()))
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

    await recordAttempt(createAttempt(buildEnvelopeV2()));

    const logged = joinAllLogged(logs);

    expect(logged).toContain("order_store_unavailable");
    expect(logged).not.toContain("вул. Шевченка");
    expect(logged).not.toContain("not a sqlstate");
  });

  it("reports bad_config for an unparseable connection string and never echoes it", async () => {
    vi.stubEnv("DATABASE_URL", "not a url at all");
    const stub = stubRelayFetch();

    await expect(
      recordAttempt(createAttempt(buildEnvelopeV2()))
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
    const attempt = createAttempt(buildEnvelopeV2());

    await expect(
      markAttempt(attempt, { isDelivered: true, messageId: 4242 })
    ).resolves.toEqual({ ok: true });

    const [call] = readNeonCalls(stub);

    expect(call?.query).toContain("on conflict (attempt_id) do update");
    expect(call?.params[0]).toBe(attempt.attemptId);
    expect(call?.params[5]).toBe("true");
    expect(call?.params[6]).toBe(4242);
    expect(call?.params[7]).toBeNull();
  });

  it("records a named send failure and no message id when delivery failed", async () => {
    const stub = stubRelayFetch({ neon: async () => neonMarkOk() });

    await markAttempt(createAttempt(buildEnvelopeV2()), {
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
    const attempt = createAttempt(buildEnvelopeV2());

    await markAttempt(attempt, { isDelivered: true, messageId: undefined });

    const [call] = readNeonCalls(stub);

    expect(call?.params[1]).toBe(attempt.contentHash);
    expect(call?.params[3]).toBe(2);
    expect(call?.params[4]).toBe(JSON.stringify(attempt.envelope));
    expect(call?.params[6]).toBeNull();
  });

  it("fails open with its own event when the mark cannot land", async () => {
    stubRelayFetch({ neon: async () => neonError("missing-table") });

    await expect(
      markAttempt(createAttempt(buildEnvelopeV2()), {
        isDelivered: true,
        messageId: 1,
      })
    ).resolves.toEqual({ ok: false, reason: "upstream_rejected" });
    expect(joinAllLogged(logs)).toContain("order_store_mark_failed");
  });

  it("boxes the mark in its own shorter budget", async () => {
    stubRelayFetch({
      neon: async () => {
        throw new DOMException("The operation timed out.", "TimeoutError");
      },
    });

    await markAttempt(createAttempt(buildEnvelopeV2()), {
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

    await recordAttempt(createAttempt(buildEnvelopeV2()));

    const logged = joinAllLogged(logs);

    expect(logged).not.toContain(TEST_DATABASE_URL);
    expect(logged).not.toContain(NEON_PASSWORD);
    expect(logged).not.toContain(NEON_HOST);
  });

  it("keeps every buyer value and the full key and hash out of every line", async () => {
    stubRelayFetch({ neon: async () => neonError("missing-table") });
    const attempt = createAttempt(buildEnvelopeV2());

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
