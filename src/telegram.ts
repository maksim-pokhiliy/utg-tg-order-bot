import { readEnv } from "./env.js";

const TELEGRAM_API_ORIGIN = "https://api.telegram.org";
const PARSE_MODE = "HTML";
export const REQUEST_TIMEOUT_MS = 10_000;

export type SendFailure =
  | "config_missing"
  | "upstream_rejected"
  | "upstream_not_ok"
  | "ack_unreadable"
  | "timeout"
  | "network_error";

export type SendResult =
  | { ok: true; messageId: number | undefined }
  | { ok: false; reason: SendFailure };

interface TelegramVerdict {
  isAccepted: boolean;
  isReadable: boolean;
  errorCode: number | undefined;
  messageId: number | undefined;
}

const logEvent = (event: string, detail: Record<string, unknown>): void => {
  console.error(JSON.stringify({ event, ...detail }));
};

export const createTimeoutSignal = (ms: number): AbortSignal =>
  AbortSignal.timeout(ms);

const isTimeout = (error: unknown): boolean =>
  error instanceof Error &&
  (error.name === "TimeoutError" || error.name === "AbortError");

const readVerdict = async (response: Response): Promise<TelegramVerdict> => {
  try {
    const body: unknown = await response.json();

    if (typeof body !== "object" || body === null) {
      return {
        isAccepted: false,
        isReadable: false,
        errorCode: undefined,
        messageId: undefined,
      };
    }

    const isAccepted = "ok" in body && body.ok === true;
    const rawCode = "error_code" in body ? body.error_code : undefined;
    const rawResult = "result" in body ? body.result : undefined;
    const rawId =
      typeof rawResult === "object" &&
      rawResult !== null &&
      "message_id" in rawResult
        ? rawResult.message_id
        : undefined;

    return {
      isAccepted,
      isReadable: true,
      errorCode: typeof rawCode === "number" ? rawCode : undefined,
      messageId: typeof rawId === "number" ? rawId : undefined,
    };
  } catch (error) {
    if (isTimeout(error)) {
      throw error;
    }

    return {
      isAccepted: false,
      isReadable: false,
      errorCode: undefined,
      messageId: undefined,
    };
  }
};

export const sendOrderMessage = async (text: string): Promise<SendResult> => {
  const token = readEnv("TELEGRAM_BOT_TOKEN");
  const chatId = readEnv("TELEGRAM_CHAT_ID");

  if (token === undefined || chatId === undefined) {
    logEvent("telegram_config_missing", {
      hasToken: token !== undefined,
      hasChatId: chatId !== undefined,
    });

    return { ok: false, reason: "config_missing" };
  }

  try {
    const response = await fetch(
      `${TELEGRAM_API_ORIGIN}/bot${token}/sendMessage`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id: chatId,
          text,
          parse_mode: PARSE_MODE,
        }),
        signal: createTimeoutSignal(REQUEST_TIMEOUT_MS),
      }
    );

    const verdict = await readVerdict(response);

    if (!response.ok) {
      logEvent("telegram_send_rejected", {
        status: response.status,
        errorCode: verdict.errorCode,
      });

      return { ok: false, reason: "upstream_rejected" };
    }

    if (!verdict.isReadable) {
      logEvent("telegram_ack_unreadable", { status: response.status });

      return { ok: false, reason: "ack_unreadable" };
    }

    if (!verdict.isAccepted) {
      logEvent("telegram_send_not_ok", {
        status: response.status,
        errorCode: verdict.errorCode,
      });

      return { ok: false, reason: "upstream_not_ok" };
    }

    return { ok: true, messageId: verdict.messageId };
  } catch (error) {
    if (isTimeout(error)) {
      logEvent("telegram_timeout", { timeoutMs: REQUEST_TIMEOUT_MS });

      return { ok: false, reason: "timeout" };
    }

    logEvent("telegram_network_error", {
      errorName: error instanceof Error ? error.name : "unknown",
    });

    return { ok: false, reason: "network_error" };
  }
};
