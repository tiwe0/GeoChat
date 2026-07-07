import { chmodSync, copyFileSync, mkdirSync, rmSync } from "node:fs";
import { dirname, resolve } from "node:path";

const runtimeDir = resolve("dist/runtime");
const runtimeOutfile = resolve(runtimeDir, process.platform === "win32" ? "bun.exe" : "bun");

rmSync(runtimeDir, { recursive: true, force: true });
mkdirSync(dirname(runtimeOutfile), { recursive: true });

copyFileSync(process.execPath, runtimeOutfile);
if (process.platform !== "win32") {
  chmodSync(runtimeOutfile, 0o755);
}
