import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  collectStaticImportGraph,
  findStaticImportCycles,
} from "../scripts/lib/renderer-chunk-graph.mjs";

describe("renderer chunk safety", () => {
  test("detects circular static imports while ignoring dynamic imports", () => {
    const graph = collectStaticImportGraph([
      { name: "entry.js", source: 'import { value } from "./runtime-a.js"; import("./lazy.js");' },
      { name: "runtime-a.js", source: 'export { value } from "./runtime-b.js";' },
      { name: "runtime-b.js", source: 'import "./runtime-a.js"; export const value = 1;' },
      { name: "lazy.js", source: 'import("./entry.js");' },
    ]);

    expect(findStaticImportCycles(graph)).toEqual([["runtime-a.js", "runtime-b.js"]]);
  });

  test("keeps runtime families whole instead of splitting them by maxSize", () => {
    const config = readFileSync(resolve(import.meta.dir, "../vite.react.config.ts"), "utf8");

    expect(config).not.toContain("maxSize:");
    expect(config).toContain('name: "mui-runtime"');
    expect(config).toContain('name: "markdown-core"');
    expect(config).toContain('name: "markdown-ui"');
    expect(config).toContain('name: "math-rendering"');
  });
});
