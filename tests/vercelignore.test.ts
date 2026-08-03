import { execFileSync } from "node:child_process";
import {
  copyFileSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const SOURCE = join(ROOT, ".vercelignore");

const MANIFESTS = [
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

const readModuleGraphDirectories = (): string[] => {
  const listed = execFileSync(
    "npx",
    ["tsc", "-p", "tsconfig.smoke.json", "--noEmit", "--listFiles"],
    { cwd: ROOT, encoding: "utf8" }
  );

  const directories = new Set<string>();

  for (const line of listed.split("\n")) {
    const file = line.trim();

    if (file === "" || file.includes("node_modules")) {
      continue;
    }

    const relativePath = relative(ROOT, file);

    if (relativePath === "" || relativePath.startsWith("..")) {
      continue;
    }

    const [top] = relativePath.split(sep);

    if (top !== undefined && top !== relativePath) {
      directories.add(top);
    }
  }

  return [...directories].sort();
};

let sandbox = "";
let shippedDirectories: string[] = [];

const isWithheld = (path: string): boolean => {
  try {
    execFileSync("git", ["check-ignore", "-q", path], { cwd: sandbox });

    return true;
  } catch {
    return false;
  }
};

const seed = (path: string): void => {
  const target = join(sandbox, path);

  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, "");
};

beforeAll(() => {
  shippedDirectories = readModuleGraphDirectories();
  sandbox = mkdtempSync(join(tmpdir(), "vercelignore-"));

  execFileSync("git", ["init", "-q", "."], { cwd: sandbox });
  copyFileSync(SOURCE, join(sandbox, ".gitignore"));

  for (const path of [...MANIFESTS, ...WITHHELD]) {
    seed(path);
  }

  for (const directory of shippedDirectories) {
    seed(`${directory}/probe.ts`);
  }
}, 60_000);

afterAll(() => {
  rmSync(sandbox, { recursive: true, force: true });
});

describe(".vercelignore", () => {
  it("ships every directory the compiled module graph actually reaches", () => {
    expect(shippedDirectories.length).toBeGreaterThan(0);

    for (const directory of shippedDirectories) {
      expect({
        directory,
        withheld: isWithheld(`${directory}/probe.ts`),
      }).toEqual({ directory, withheld: false });
    }
  });

  it("ships the manifests the build reads", () => {
    for (const path of MANIFESTS) {
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
