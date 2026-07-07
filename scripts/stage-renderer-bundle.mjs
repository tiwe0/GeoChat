import { cpSync, existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const source = resolve("out/renderer");
const target = resolve("dist/renderer");

if (!existsSync(source)) {
  throw new Error(`Renderer build output not found: ${source}`);
}

rmSync(target, { recursive: true, force: true });
mkdirSync(target, { recursive: true });
cpSync(source, target, { recursive: true });

writeFileSync(
  resolve(target, "manifest.json"),
  JSON.stringify(
    {
      kind: "geochat-renderer-bundle",
      entry: "index.html"
    },
    null,
    2
  )
);
