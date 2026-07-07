import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { expect, test } from "bun:test";

const rendererRoot = "src/renderer/src";

const allowedBoundaryFiles = {
  "desktop-window-controls.ts": {
    maxLines: 40,
    reason: "desktop window controls are the only renderer surface that imports Tauri window APIs"
  },
  "main.tsx": {
    maxLines: 40,
    reason: "renderer bootstrapping is the only startup entrypoint for marking readiness"
  },
  "platform.ts": {
    maxLines: 60,
    reason: "runtime platform detection is the only fallback path for web-vs-desktop runtime info"
  },
  "tauri-bridge.ts": {
    maxLines: 380,
    reason: "Tauri bridge installation maps stable desktop API methods to Tauri commands and events"
  },
  "workbench-desktop-runtime.ts": {
    maxLines: 90,
    reason: "default injected runtime adapters own timer globals for workbench state modules"
  }
} as const satisfies Record<string, { maxLines: number; reason: string }>;

const directGlobalPatterns = [
  { label: "desktop bridge global", pattern: /window\.geochatDesktop/g },
  { label: "Tauri internals probe", pattern: /window\.__TAURI_INTERNALS__/g },
  { label: "Tauri API import", pattern: /@tauri-apps\/api/g },
  { label: "timer global", pattern: /\b(?:globalThis|window)\.setInterval\b/g }
];

function listSourceFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return listSourceFiles(path);
    if (!entry.isFile()) return [];
    if (!/\.(ts|tsx)$/.test(entry.name)) return [];
    return [path];
  });
}

test("renderer direct global and Tauri API access stays in boundary modules", () => {
  const violations: string[] = [];

  for (const filePath of listSourceFiles(rendererRoot)) {
    const relativePath = relative(rendererRoot, filePath);
    const source = readFileSync(filePath, "utf8");

    for (const { label, pattern } of directGlobalPatterns) {
      pattern.lastIndex = 0;
      const hasMatch = pattern.test(source);
      if (hasMatch && !(relativePath in allowedBoundaryFiles)) {
        violations.push(`${relativePath}: ${label}`);
      }
    }
  }

  expect(violations).toEqual([]);
});

test("approved renderer boundary modules stay documented and thin", () => {
  const boundaryHealth = Object.entries(allowedBoundaryFiles).map(([relativePath, boundary]) => {
    const source = readFileSync(join(rendererRoot, relativePath), "utf8");
    return {
      path: relativePath,
      lines: source.split(/\r?\n/).length,
      maxLines: boundary.maxLines,
      reason: boundary.reason
    };
  });

  expect(boundaryHealth).toEqual(
    boundaryHealth.map((boundary) => ({
      ...boundary,
      reason: expect.stringMatching(/\S/),
      lines: expect.any(Number)
    }))
  );
  expect(boundaryHealth.filter((boundary) => boundary.lines > boundary.maxLines)).toEqual([]);
});
