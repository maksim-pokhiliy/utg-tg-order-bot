export const readEnv = (name: string): string | undefined => {
  const raw = process.env[name];

  if (raw === undefined) {
    return undefined;
  }

  const trimmed = raw.trim();

  return trimmed === "" ? undefined : trimmed;
};
