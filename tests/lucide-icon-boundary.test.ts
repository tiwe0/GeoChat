import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { expect, test } from "bun:test";

function sourceFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return sourceFiles(path);
    return entry.isFile() && /\.(ts|tsx)$/.test(entry.name) ? [path] : [];
  });
}

test("renderer icons use Lucide instead of the legacy MUI icon package", () => {
  const sources = sourceFiles("src/renderer-react/src").map((path) => readFileSync(path, "utf8"));
  const packageJson = JSON.parse(readFileSync("package.json", "utf8")) as {
    devDependencies?: Record<string, string>;
  };

  expect(sources.some((source) => source.includes('from "lucide-react"'))).toBe(true);
  expect(sources.filter((source) => source.includes("@mui/icons-material"))).toEqual([]);
  expect(packageJson.devDependencies?.["lucide-react"]).toBeDefined();
  expect(packageJson.devDependencies?.["@mui/icons-material"]).toBeUndefined();
});
