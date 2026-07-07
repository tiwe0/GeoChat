import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { spawnSync } from "node:child_process";

const backendDir = resolve("dist/backend");
const backendOutfile = resolve(backendDir, "backend.bundle.js");

rmSync(backendDir, { recursive: true, force: true });
mkdirSync(dirname(backendOutfile), { recursive: true });

const bunExecutable = process.execPath;

const result = spawnSync(
  bunExecutable,
  ["build", "backend/src/index.ts", "--target=bun", "--outfile", backendOutfile],
  {
    stdio: "inherit",
    shell: process.platform === "win32"
  }
);

if (result.status !== 0) {
  process.exit(result.status ?? 1);
}

writeFileSync(
  resolve("dist/backend/manifest.json"),
  JSON.stringify(
    {
      kind: "geochat-backend-bundle",
      entry: "backend.bundle.js"
    },
    null,
    2
  )
);
