import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { vi, type MockInstance } from "vitest";

import {
  captureConsoleError,
  captureConsoleWarn,
  joinLoggedLines,
  type FetchStub,
  type SentMessage,
} from "./telegram.js";

export {
  captureConsoleError,
  captureConsoleWarn,
  joinLoggedLines,
  type SentMessage,
};

export const NEON_HOST = "ep-b5-executor-pooler.us-east-1.aws.neon.tech";
export const NEON_PASSWORD = "not-a-real-password";
export const TEST_DATABASE_URL = `postgresql://relay_owner:${NEON_PASSWORD}@${NEON_HOST}/neondb?sslmode=require`;
export const NEON_SQL_URL = `https://${NEON_HOST}/sql`;
export const NEON_REQUEST_ID = "8f14e45f-ceea-467a-9f0b-6f1c2e3d4a5b";
export const TELEGRAM_HOST = "api.telegram.org";

export const PROBE_SENT_AT = "2026-08-17 22:20:13.854062+00";

const HTTP_OK = 200;
const HTTP_BAD_REQUEST = 400;

export type NeonErrorName = "missing-table" | "syntax" | "auth";

const readFixture = (name: string): Record<string, unknown> => {
  const path = fileURLToPath(
    new URL(`../fixtures/neon/${name}.json`, import.meta.url)
  );
  const parsed: unknown = JSON.parse(readFileSync(path, "utf8"));

  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    throw new Error(`neon fixture ${name} is not an object`);
  }

  return { ...parsed };
};

const readFirstRow = (
  envelope: Record<string, unknown>
): Record<string, unknown> => {
  const rows = envelope["rows"];
  const row = Array.isArray(rows) ? rows[0] : undefined;

  if (typeof row !== "object" || row === null) {
    throw new Error("neon fixture carries no row");
  }

  return { ...row };
};

const neonResponse = (body: unknown, status: number): Response =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
      "neon-request-id": NEON_REQUEST_ID,
    },
  });

export const neonFresh = (rowId = "1"): Response => {
  const envelope = readFixture("insert-fresh");
  const row = readFirstRow(envelope);

  return neonResponse({ ...envelope, rows: [{ ...row, id: rowId }] }, HTTP_OK);
};

export interface PriorOverrides {
  rowId?: string;
  dupeOf?: string | null;
  sentAt?: string | null;
  idempotencyKey?: string | null;
  contentHash?: string | null;
  ageSeconds?: number | null;
}

const pick = (override: unknown, fallback: unknown): unknown =>
  override === undefined ? fallback : override;

export const neonDuplicate = (prior: PriorOverrides = {}): Response => {
  const envelope = readFixture("insert-duplicate");
  const row = readFirstRow(envelope);

  return neonResponse(
    {
      ...envelope,
      rows: [
        {
          id: pick(prior.rowId, row["id"]),
          dupe_of: pick(prior.dupeOf, row["dupe_of"]),
          prior_sent_at: pick(prior.sentAt, row["prior_sent_at"]),
          prior_idempotency_key: pick(
            prior.idempotencyKey,
            row["prior_idempotency_key"]
          ),
          prior_content_hash: pick(
            prior.contentHash,
            row["prior_content_hash"]
          ),
          prior_age_seconds: pick(prior.ageSeconds, row["prior_age_seconds"]),
        },
      ],
    },
    HTTP_OK
  );
};

export const neonMarkOk = (): Response =>
  neonResponse(readFixture("mark-ok"), HTTP_OK);

export const neonError = (name: NeonErrorName): Response =>
  neonResponse(readFixture(`error-${name}`), HTTP_BAD_REQUEST);

export const telegramOk = (messageId: number | undefined = 4242): Response =>
  new Response(
    JSON.stringify({
      ok: true,
      result: messageId === undefined ? {} : { message_id: messageId },
    }),
    { status: HTTP_OK }
  );

export interface RelayRoutes {
  telegram?: (call: number) => Promise<Response>;
  neon?: (call: number) => Promise<Response>;
}

const refuse = (host: string): Promise<Response> => {
  throw new Error(`no route stubbed for ${host}`);
};

export const stubRelayFetch = (
  routes: RelayRoutes = {}
): ReturnType<typeof vi.fn<FetchStub>> => {
  let neonCalls = 0;
  let telegramCalls = 0;

  const stub = vi.fn<FetchStub>(async (input) => {
    const url = String(input);

    if (url.includes(TELEGRAM_HOST)) {
      telegramCalls += 1;

      return routes.telegram === undefined
        ? telegramOk()
        : routes.telegram(telegramCalls);
    }

    if (url.includes(NEON_HOST)) {
      neonCalls += 1;

      return routes.neon === undefined ? neonFresh() : routes.neon(neonCalls);
    }

    return refuse(url);
  });

  vi.stubGlobal("fetch", stub);

  return stub;
};

export type RelayFetchStub = ReturnType<typeof stubRelayFetch>;

const callsFor = (
  stub: RelayFetchStub,
  host: string
): readonly Parameters<FetchStub>[] =>
  stub.mock.calls.filter(([input]) => String(input).includes(host));

export interface NeonCall {
  url: string;
  connectionString: string | null;
  contentType: string | null;
  redirect: RequestInit["redirect"];
  query: string;
  params: readonly unknown[];
}

export const readNeonCalls = (stub: RelayFetchStub): readonly NeonCall[] =>
  callsFor(stub, NEON_HOST).map(([input, init]) => {
    const rawBody = init?.body;

    if (typeof rawBody !== "string") {
      throw new Error("the store called fetch without a serialized JSON body");
    }

    const body: unknown = JSON.parse(rawBody);

    if (typeof body !== "object" || body === null) {
      throw new Error("the store body was not an object");
    }

    const query = "query" in body ? body.query : undefined;
    const params = "params" in body ? body.params : undefined;

    if (typeof query !== "string" || !Array.isArray(params)) {
      throw new Error("the store body carried no query and params");
    }

    const headers = new Headers(init?.headers);

    return {
      url: String(input),
      connectionString: headers.get("Neon-Connection-String"),
      contentType: headers.get("Content-Type"),
      redirect: init?.redirect,
      query,
      params,
    };
  });

export const readTelegramCalls = (
  stub: RelayFetchStub
): readonly SentMessage[] =>
  callsFor(stub, TELEGRAM_HOST).map(([input, init]) => {
    const rawBody = init?.body;

    if (typeof rawBody !== "string") {
      throw new Error("telegram was called without a serialized JSON body");
    }

    const body: unknown = JSON.parse(rawBody);

    if (typeof body !== "object" || body === null) {
      throw new Error("the telegram body was not an object");
    }

    const text = "text" in body ? body.text : undefined;

    if (typeof text !== "string") {
      throw new Error("the telegram body carried no text");
    }

    return {
      url: String(input),
      chatId: "chat_id" in body ? body.chat_id : undefined,
      text,
      parseMode: "parse_mode" in body ? body.parse_mode : undefined,
    };
  });

export const readTelegramCall = (stub: RelayFetchStub): SentMessage => {
  const [first] = readTelegramCalls(stub);

  if (first === undefined) {
    throw new Error("telegram was never called");
  }

  return first;
};

export const captureConsoleLog = (): MockInstance =>
  vi.spyOn(console, "log").mockImplementation(() => undefined);

export interface ConsoleCaptures {
  log: MockInstance;
  warn: MockInstance;
  error: MockInstance;
}

export const captureConsole = (): ConsoleCaptures => ({
  log: captureConsoleLog(),
  warn: captureConsoleWarn(),
  error: captureConsoleError(),
});

export const joinAllLogged = (captures: ConsoleCaptures): string =>
  [
    joinLoggedLines(captures.log),
    joinLoggedLines(captures.warn),
    joinLoggedLines(captures.error),
  ].join("\n");
