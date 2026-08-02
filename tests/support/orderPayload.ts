export const BOT_TOKEN = "1234567:TEST-TOKEN-DO-NOT-USE";
export const CHAT_ID = "-100999";
export const TELEGRAM_URL = `https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`;
export const RELAY_URL = "https://relay.test/api/place_order";

interface CartItemOverrides {
  title?: string;
  quantity?: number;
  productUrl?: string;
}

export const buildCartItem = (
  overrides: CartItemOverrides = {}
): Record<string, unknown> => ({
  id: "patches/waiting",
  title: overrides.title ?? "Шеврон «Очікування»",
  price: 350,
  quantity: overrides.quantity ?? 2,
  image: "/images/patches/waiting.png",
  productUrl:
    overrides.productUrl ??
    "https://www.ua-tactical-gear.com/uk/category/patches/waiting",
});

export const buildOrder = (
  overrides: Record<string, unknown> = {}
): Record<string, unknown> => ({
  first_name: "Олександр",
  last_name: "Петренко",
  telephone: "+380671234567",
  country: "Україна",
  state: "Київська область",
  city: "Київ",
  address: "вул. Шевченка, 12, кв. 5",
  additional: "",
  locale: "uk",
  total: "46200.00",
  currency: "UAH",
  cart: [buildCartItem()],
  ...overrides,
});

export class StubRequest extends Request {
  readonly #payload: unknown;

  constructor(payload: unknown, headers: Record<string, string> = {}) {
    super(RELAY_URL, { method: "POST", headers });
    this.#payload = payload;
  }

  override json = (): Promise<unknown> => Promise.resolve(this.#payload);
}

export class BrokenBodyRequest extends Request {
  constructor() {
    super(RELAY_URL, { method: "POST" });
  }

  override json = (): Promise<unknown> =>
    Promise.reject(new SyntaxError("Unexpected token"));
}
