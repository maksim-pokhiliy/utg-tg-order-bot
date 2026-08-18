type EnvName =
  | "TELEGRAM_BOT_TOKEN"
  | "TELEGRAM_CHAT_ID"
  | "ORDER_RELAY_SECRET"
  | "DATABASE_URL";

export const readEnv = (name: EnvName): string | undefined => {
  const raw = process.env[name];

  if (raw === undefined) {
    return undefined;
  }

  const trimmed = raw.trim();

  return trimmed === "" ? undefined : trimmed;
};
