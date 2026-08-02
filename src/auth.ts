import { createHash, timingSafeEqual } from "node:crypto";

const SECRET_HEADER = "x-relay-secret";

const digest = (value: string): Buffer =>
  createHash("sha256").update(value, "utf8").digest();

export const isAuthorized = (request: Request): boolean => {
  const secret = process.env["ORDER_RELAY_SECRET"];

  if (secret === undefined || secret.trim() === "") {
    return true;
  }

  const presented = request.headers.get(SECRET_HEADER);

  if (presented === null) {
    return false;
  }

  return timingSafeEqual(digest(secret), digest(presented));
};
