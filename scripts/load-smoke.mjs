import { execFileSync } from "node:child_process";
import { rmSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

const OUT_DIR = ".smoke-build";
const ENTRYPOINT = `${OUT_DIR}/api/place_order.js`;

const fail = (message) => {
  console.error(`load-smoke: ${message}`);
  process.exit(1);
};

rmSync(OUT_DIR, { recursive: true, force: true });

execFileSync("npx", ["tsc", "-p", "tsconfig.smoke.json"], { stdio: "inherit" });

const loaded = await import(pathToFileURL(resolve(ENTRYPOINT)).href).catch(
  (error) => {
    fail(
      `the deployed entrypoint does not load under native ESM: ${String(error)}`
    );
  }
);

if (typeof loaded.POST !== "function") {
  fail("the entrypoint loaded but exports no POST handler");
}

rmSync(OUT_DIR, { recursive: true, force: true });

console.log("load-smoke: entrypoint loads and exports POST");
