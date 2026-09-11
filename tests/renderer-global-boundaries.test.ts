import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test } from "bun:test";

/**
 * Both roots are scanned. The desktop boundary modules moved to src/shared so
 * that a second renderer can consume them; scanning only the renderer would
 * have quietly stopped enforcing this rule on exactly the files it exists for.
 */
const scannedRoots = ["src/renderer-react/src", "src/shared/desktop"];

const allowedBoundaryFiles = {
  "src/shared/desktop/desktop-window-controls.ts": {
    maxLines: 40,
    reason: "desktop window controls are the only renderer surface that imports Tauri window APIs"
  },
  "src/renderer-react/src/main.tsx": {
    maxLines: 50,
    reason: "renderer bootstrapping is the only startup entrypoint for marking readiness"
  },
  "src/renderer-react/src/features/desktop/runtime.ts": {
    maxLines: 80,
    reason: "resolves the shell-reported backend address once, before the first render"
  },
  "src/renderer-react/src/features/desktop/useUpdateState.ts": {
    maxLines: 150,
    reason: "subscribes to both update tracks through the desktop bridge"
  },
  "src/renderer-react/src/features/desktop/useAccessState.ts": {
    maxLines: 120,
    reason: "polls desktop access state through the bridge"
  },
  "src/renderer-react/src/features/desktop/useMcpState.ts": {
    maxLines: 90,
    reason: "owns the MCP toggle and its poll loop's timer globals"
  },
  "src/renderer-react/src/features/desktop/mcpDebugActions.ts": {
    maxLines: 80,
    reason: "executes MCP-queued actions against renderer surfaces"
  },
  "src/renderer-react/src/features/desktop/WindowTitleBar.tsx": {
    maxLines: 90,
    reason: "the window drag region is the only surface that drives Tauri window controls"
  },
  "src/shared/desktop/platform.ts": {
    maxLines: 60,
    reason: "runtime platform detection is the only fallback path for web-vs-desktop runtime info"
  },
  "src/shared/desktop/tauri-bridge.ts": {
    maxLines: 380,
    reason: "Tauri bridge installation maps stable desktop API methods to Tauri commands and events"
  },
  "src/shared/desktop/workbench-desktop-runtime.ts": {
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

  for (const filePath of scannedRoots.flatMap(listSourceFiles)) {
    const relativePath = filePath.split("\\").join("/");
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
    const source = readFileSync(relativePath, "utf8");
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
