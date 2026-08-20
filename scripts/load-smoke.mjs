import { execFileSync } from "node:child_process";
import { rmSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

const OUT_DIR = ".smoke-build";
const ENTRYPOINT = `${OUT_DIR}/api/place_order.js`;

const fail = (message) => {
  console.error(`load-smoke: ${message}`);
  process.exitCode = 1;
};

const clean = () => {
  rmSync(OUT_DIR, { recursive: true, force: true });
};

clean();

try {
  execFileSync("npx", ["tsc", "-p", "tsconfig.smoke.json"], {
    stdio: "inherit",
  });

  const loaded = await import(pathToFileURL(resolve(ENTRYPOINT)).href).catch(
    (error) => {
      fail(
        `the deployed entrypoint does not load under native ESM: ${String(error)}`
      );

      return undefined;
    }
  );

  if (loaded !== undefined && typeof loaded.POST !== "function") {
    fail("the entrypoint loaded but exports no POST handler");
  }

  if (process.exitCode === undefined || process.exitCode === 0) {
    console.log("load-smoke: entrypoint loads and exports POST");
  }
} finally {
  clean();
}
