import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const BASELINE = process.argv[2] ?? "master";
const OUTPUT = join(ROOT, "tests", "fixtures", "v1-golden-corpus.json");

const ASTRAL = "𝕏";
const CYRILLIC = "ф";

const cartItem = (overrides = {}) => ({
  id: "patches/waiting",
  title: "Шеврон «Очікування»",
  price: 350,
  quantity: 2,
  image: "/images/patches/waiting.png",
  productUrl: "https://www.ua-tactical-gear.com/uk/category/patches/waiting",
  ...overrides,
});

const order = (overrides = {}) => ({
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
  cart: [cartItem()],
  ...overrides,
});

const withoutKey = (input, key) => {
  const copy = { ...input };

  delete copy[key];

  return copy;
};

const repeatedCart = (length) =>
  Array.from({ length }, (_, index) =>
    cartItem({ title: `Товар ${String(index)}` })
  );

const FIXTURES = [
  { name: "canonical-uk", input: order() },
  {
    name: "rates-down-en-uah",
    input: order({ locale: "en", currency: "UAH" }),
  },
  {
    name: "distinct-labels",
    input: {
      first_name: "FirstNameValue",
      last_name: "LastNameValue",
      telephone: "TelephoneValue",
      country: "CountryValue",
      state: "StateValue",
      city: "CityValue",
      address: "AddressValue",
      additional: "AdditionalValue",
      locale: "en",
      total: "1234.50",
      currency: "USD",
      cart: [
        cartItem({
          title: "TitleValue",
          quantity: 7,
          productUrl: "ProductUrlValue",
        }),
      ],
    },
  },
  {
    name: "hostile-markup",
    input: order({
      first_name: "<b>Bobby</b> & co",
      address: "вул._Шевченка_*12*",
      cart: [
        cartItem({
          title: "<b>Patch</b> & co",
          productUrl: "https://shop.test/p?a=1&b=2&utm=<x>",
        }),
      ],
    }),
  },
  {
    name: "newline-bearing",
    input: order({ city: "Kyiv\r\n💲 <b>Total:</b> 0,00 ₴" }),
  },
  {
    name: "multi-line-note",
    input: order({ additional: "Line one\nLine two\nLine three" }),
  },
  { name: "multi-item-cart", input: order({ cart: repeatedCart(3) }) },
  {
    name: "truncated-60-item-cart",
    input: order({ cart: repeatedCart(60) }),
  },
  {
    name: "pathological-header",
    input: order({
      first_name: CYRILLIC.repeat(9000),
      last_name: CYRILLIC.repeat(9000),
      telephone: "9".repeat(9000),
      country: CYRILLIC.repeat(9000),
      state: CYRILLIC.repeat(9000),
      city: CYRILLIC.repeat(9000),
      address: CYRILLIC.repeat(9000),
      additional: CYRILLIC.repeat(9000),
      total: "9".repeat(20),
    }),
  },
  { name: "absent-currency", input: withoutKey(order(), "currency") },
  { name: "absent-additional", input: withoutKey(order(), "additional") },
  {
    name: "lone-surrogate-and-astral",
    input: order({
      city: "Ky\uD800iv",
      first_name: ASTRAL.repeat(200),
      additional: ASTRAL.repeat(600),
      cart: [cartItem(), cartItem({ title: "Second" })],
    }),
  },
];

const run = (command, args, cwd) =>
  execFileSync(command, args, { cwd, encoding: "utf8", stdio: "pipe" });

const commitOf = (revision) => run("git", ["rev-parse", revision], ROOT).trim();

const capture = async (worktree) => {
  symlinkSync(join(ROOT, "node_modules"), join(worktree, "node_modules"));
  run("npx", ["tsc", "-p", "tsconfig.smoke.json"], worktree);

  const built = join(worktree, ".smoke-build", "src");
  const { parseOrderPayload } = await import(
    pathToFileURL(join(built, "payload.js")).href
  );
  const { buildOrderMessage } = await import(
    pathToFileURL(join(built, "message.js")).href
  );

  return FIXTURES.map(({ name, input }) => {
    const parsed = parseOrderPayload(input);

    if (!parsed.ok) {
      throw new Error(`fixture ${name} was rejected: ${parsed.reason}`);
    }

    return { name, input, message: buildOrderMessage(parsed.value) };
  });
};

const worktree = mkdtempSync(join(tmpdir(), "utg-v1-corpus-"));

try {
  run("git", ["worktree", "add", "--detach", worktree, BASELINE], ROOT);

  const entries = await capture(worktree);

  writeFileSync(
    OUTPUT,
    `${JSON.stringify(
      {
        capturedFrom: BASELINE,
        capturedFromCommit: commitOf(BASELINE),
        entries,
      },
      null,
      2
    )}\n`,
    "utf8"
  );

  console.log(
    `capture-v1-corpus: ${String(entries.length)} entries from ${BASELINE} (${commitOf(BASELINE).slice(0, 7)})`
  );
} finally {
  try {
    run("git", ["worktree", "remove", "--force", worktree], ROOT);
  } catch {
    run("git", ["worktree", "prune"], ROOT);
  }

  rmSync(worktree, { recursive: true, force: true });
}
