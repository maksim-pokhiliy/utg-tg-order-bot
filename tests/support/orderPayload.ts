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

export const buildCustomer = (
  overrides: Record<string, unknown> = {}
): Record<string, unknown> => ({
  first_name: "Марія",
  last_name: "Шевченко",
  patronymic: "Іванівна",
  phone: "+380671234567",
  contact_channel: "telegram",
  ...overrides,
});

export const buildDeliveryBranch = (
  overrides: Record<string, unknown> = {}
): Record<string, unknown> => ({
  mode: "np_branch",
  source: "np_directory",
  city: "м. Львів, Львівська обл.",
  warehouse: "Відділення №1: вул. Городоцька, 359",
  warehouse_number: "1",
  ...overrides,
});

export const buildDeliveryPostomat = (
  overrides: Record<string, unknown> = {}
): Record<string, unknown> =>
  buildDeliveryBranch({
    mode: "np_postomat",
    warehouse: "Поштомат №12345: вул. Стрийська, 30, магазин «АТБ»",
    warehouse_number: "12345",
    ...overrides,
  });

export const buildDeliveryCourier = (
  overrides: Record<string, unknown> = {}
): Record<string, unknown> => ({
  mode: "np_courier",
  source: "manual",
  city: "м. Львів, Львівська обл.",
  street: "вул. Городоцька",
  building: "359",
  apartment: "12",
  ...overrides,
});

export const buildDeliveryGeneric = (
  overrides: Record<string, unknown> = {}
): Record<string, unknown> => ({
  mode: "generic",
  country: "Poland",
  state: "Lesser Poland",
  city: "Kraków",
  address: "ul. Floriańska 3/5",
  ...overrides,
});

export const buildOrder = (
  overrides: Record<string, unknown> = {}
): Record<string, unknown> => ({
  version: 2,
  idempotency_key: "3f2b8c1e-9a44-4d7e-8b2f-16c0a9e5d731",
  locale: "uk",
  customer: buildCustomer(),
  delivery: buildDeliveryBranch(),
  comment: "після 18:00",
  cart: [buildCartItem()],
  total: "250.00",
  currency: "UAH",
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

export class JsonBodyRequest extends Request {
  constructor(payload: unknown, headers: Record<string, string> = {}) {
    super(RELAY_URL, {
      method: "POST",
      headers: { "content-type": "application/json", ...headers },
      body: JSON.stringify(payload),
    });
  }
}
