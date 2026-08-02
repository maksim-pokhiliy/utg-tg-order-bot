const TELEGRAM_API_ORIGIN = "https://api.telegram.org";
const PARSE_MODE = "HTML";

export type SendFailure =
  "config_missing" | "upstream_rejected" | "network_error";

export type SendResult = { ok: true } | { ok: false; reason: SendFailure };

const logEvent = (event: string, detail: Record<string, unknown>): void => {
  console.error(JSON.stringify({ event, ...detail }));
};

const readDescription = async (response: Response): Promise<string> => {
  try {
    const body: unknown = await response.json();

    if (typeof body === "object" && body !== null && "description" in body) {
      const { description } = body;

      return typeof description === "string" ? description : "";
    }

    return "";
  } catch {
    return "";
  }
};

const readSetting = (name: string): string | undefined => {
  const value = process.env[name];

  return value === undefined || value.trim() === "" ? undefined : value;
};

export const sendOrderMessage = async (text: string): Promise<SendResult> => {
  const token = readSetting("TELEGRAM_BOT_TOKEN");
  const chatId = readSetting("TELEGRAM_CHAT_ID");

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
      }
    );

    if (!response.ok) {
      logEvent("telegram_send_rejected", {
        status: response.status,
        description: await readDescription(response),
      });

      return { ok: false, reason: "upstream_rejected" };
    }

    return { ok: true };
  } catch (error) {
    logEvent("telegram_network_error", {
      errorName: error instanceof Error ? error.name : "unknown",
    });

    return { ok: false, reason: "network_error" };
  }
};
