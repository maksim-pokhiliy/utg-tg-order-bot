import { vi, type MockInstance } from "vitest";

export type FetchStub = (
  input: string | URL | Request,
  init?: RequestInit
) => Promise<Response>;

export interface SentMessage {
  url: string;
  chatId: unknown;
  text: string;
  parseMode: unknown;
}

export const stubTelegram = (
  respond: () => Promise<Response> = async () =>
    new Response(JSON.stringify({ ok: true }), { status: 200 })
) => {
  const fetchStub = vi.fn<FetchStub>(respond);

  vi.stubGlobal("fetch", fetchStub);

  return fetchStub;
};

export const readSentMessage = (
  fetchStub: ReturnType<typeof stubTelegram>
): SentMessage => {
  const call = fetchStub.mock.calls[0];

  if (call === undefined) {
    throw new Error("fetch was never called");
  }

  const [input, init] = call;
  const rawBody = init?.body;

  if (typeof rawBody !== "string") {
    throw new Error("fetch was called without a serialized JSON body");
  }

  const body: unknown = JSON.parse(rawBody);

  if (typeof body !== "object" || body === null) {
    throw new Error("telegram body was not an object");
  }

  const text = "text" in body ? body.text : undefined;

  if (typeof text !== "string") {
    throw new Error("telegram body carried no text");
  }

  return {
    url: String(input),
    chatId: "chat_id" in body ? body.chat_id : undefined,
    text,
    parseMode: "parse_mode" in body ? body.parse_mode : undefined,
  };
};

export const captureConsoleError = (): MockInstance =>
  vi.spyOn(console, "error").mockImplementation(() => undefined);

export const captureConsoleWarn = (): MockInstance =>
  vi.spyOn(console, "warn").mockImplementation(() => undefined);

export const joinLoggedLines = (spy: MockInstance): string =>
  spy.mock.calls
    .map((args) => args.map((arg) => String(arg)).join(" "))
    .join("\n");
