import { readEnv } from "./env.js";

const NEON_SQL_PATH = "/sql";
const NEON_HOST_SUFFIX = ".neon.tech";
const CONNECTION_HEADER = "Neon-Connection-String";
const REQUEST_ID_HEADER = "neon-request-id";

export type StoreFailure =
  | "not_configured"
  | "bad_config"
  | "payload_too_large"
  | "upstream_rejected"
  | "response_unreadable"
  | "timeout"
  | "network_error";

export interface NeonStatement {
  query: string;
  params: readonly unknown[];
}

export type NeonOutcome =
  | { ok: true; rows: readonly Record<string, unknown>[] }
  | { ok: false; reason: StoreFailure };

export const isStoreConfigured = (): boolean =>
  readEnv("DATABASE_URL") !== undefined;

const logFailure = (event: string, detail: Record<string, unknown>): void => {
  console.warn(JSON.stringify({ event, ...detail }));
};

const isTimeout = (error: unknown): boolean =>
  error instanceof Error &&
  (error.name === "TimeoutError" || error.name === "AbortError");

const SQLSTATE_PATTERN = /^[0-9A-Z]{5}$/;

const readEndpoint = (connectionString: string): string | undefined => {
  try {
    const { hostname } = new URL(connectionString);

    return hostname.endsWith(NEON_HOST_SUFFIX)
      ? `https://${hostname}${NEON_SQL_PATH}`
      : undefined;
  } catch {
    return undefined;
  }
};

const readErrorCode = async (
  response: Response
): Promise<string | undefined> => {
  try {
    const body: unknown = await response.json();

    if (typeof body !== "object" || body === null) {
      return undefined;
    }

    const code = "code" in body ? body.code : undefined;

    if (typeof code !== "string") {
      return undefined;
    }

    return code === "" || SQLSTATE_PATTERN.test(code) ? code : undefined;
  } catch (error) {
    if (isTimeout(error)) {
      throw error;
    }

    return undefined;
  }
};

const readRows = async (
  response: Response
): Promise<readonly Record<string, unknown>[] | undefined> => {
  try {
    const body: unknown = await response.json();

    if (typeof body !== "object" || body === null) {
      return undefined;
    }

    const rows = "rows" in body ? body.rows : undefined;

    if (!Array.isArray(rows)) {
      return undefined;
    }

    return rows.every((row) => typeof row === "object" && row !== null)
      ? (rows as Record<string, unknown>[])
      : undefined;
  } catch (error) {
    if (isTimeout(error)) {
      throw error;
    }

    return undefined;
  }
};

export const runStatement = async (
  event: string,
  context: Record<string, unknown>,
  statement: NeonStatement,
  timeoutMs: number
): Promise<NeonOutcome> => {
  const connectionString = readEnv("DATABASE_URL");

  if (connectionString === undefined) {
    return { ok: false, reason: "not_configured" };
  }

  const endpoint = readEndpoint(connectionString);

  if (endpoint === undefined) {
    logFailure(event, { ...context, reason: "bad_config" });

    return { ok: false, reason: "bad_config" };
  }

  const startedAt = performance.now();

  try {
    const response = await fetch(endpoint, {
      method: "POST",
      redirect: "error",
      headers: {
        [CONNECTION_HEADER]: connectionString,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(statement),
      signal: AbortSignal.timeout(timeoutMs),
    });

    const requestId = response.headers.get(REQUEST_ID_HEADER);

    if (!response.ok) {
      const code = await readErrorCode(response);

      logFailure(event, {
        ...context,
        reason: "upstream_rejected",
        status: response.status,
        code,
        requestId,
        elapsedMs: Math.round(performance.now() - startedAt),
      });

      return { ok: false, reason: "upstream_rejected" };
    }

    const rows = await readRows(response);

    if (rows === undefined) {
      logFailure(event, {
        ...context,
        reason: "response_unreadable",
        status: response.status,
        requestId,
        elapsedMs: Math.round(performance.now() - startedAt),
      });

      return { ok: false, reason: "response_unreadable" };
    }

    return { ok: true, rows };
  } catch (error) {
    if (isTimeout(error)) {
      logFailure(event, {
        ...context,
        reason: "timeout",
        timeoutMs,
        elapsedMs: Math.round(performance.now() - startedAt),
      });

      return { ok: false, reason: "timeout" };
    }

    logFailure(event, {
      ...context,
      reason: "network_error",
      errorName: error instanceof Error ? error.name : "unknown",
      elapsedMs: Math.round(performance.now() - startedAt),
    });

    return { ok: false, reason: "network_error" };
  }
};
