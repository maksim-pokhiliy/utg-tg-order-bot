import { execFileSync } from "node:child_process";
import {
  copyFileSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

const SOURCE = fileURLToPath(new URL("../.vercelignore", import.meta.url));

const DEPLOYED = [
  "api/place_order.ts",
  "src/message.ts",
  "src/telegram.ts",
  "package.json",
  "package-lock.json",
  "tsconfig.json",
  "vercel.json",
];

const WITHHELD = [
  "tests/message.test.ts",
  "tests/support/contract.ts",
  "initiatives/bot-polish/charter.md",
  ".github/workflows/ci.yml",
  "scripts/load-smoke.mjs",
  "README.md",
  "CLAUDE.md",
  "tsconfig.smoke.json",
];

let sandbox = "";

const isWithheld = (path: string): boolean => {
  try {
    execFileSync("git", ["check-ignore", "-q", path], { cwd: sandbox });

    return true;
  } catch {
    return false;
  }
};

beforeAll(() => {
  sandbox = mkdtempSync(join(tmpdir(), "vercelignore-"));

  execFileSync("git", ["init", "-q", "."], { cwd: sandbox });
  copyFileSync(SOURCE, join(sandbox, ".gitignore"));

  for (const path of [...DEPLOYED, ...WITHHELD]) {
    const target = join(sandbox, path);

    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, "");
  }
});

afterAll(() => {
  rmSync(sandbox, { recursive: true, force: true });
});

describe(".vercelignore", () => {
  it("ships the function and everything it needs to build", () => {
    for (const path of DEPLOYED) {
      expect({ path, withheld: isWithheld(path) }).toEqual({
        path,
        withheld: false,
      });
    }
  });

  it("keeps the rest of the repository off the relay domain", () => {
    for (const path of WITHHELD) {
      expect({ path, withheld: isWithheld(path) }).toEqual({
        path,
        withheld: true,
      });
    }
  });
});
