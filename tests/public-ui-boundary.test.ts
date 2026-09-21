import { describe, expect, test } from "bun:test";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const ROOT = join(import.meta.dir, "..");
const SCAN_ROOTS = [
  "src/renderer-react",
  "packages/app/src",
  "backend/src",
] as const;

const FORBIDDEN = [
  /geochatpro/i,
  /web-geochatpro/i,
  /\bpro (?:build|surface|release|backend|side|tier)\b/i,
  /belongs? to (?:the )?pro\b/i,
  /stay(?:s)? in pro\b/i,
  /apple iap/i,
  /storekit/i,
  /\bemerald theme\b/i,
  /\buserPage\s*:/,
  /\bauth\s*:\s*{/,
  /purchase credits/i,
  /billing records/i,
  /wechat payment/i,
] as const;

function filesUnder(path: string): string[] {
  const absolute = join(ROOT, path);
  if (!statSync(absolute).isDirectory()) return [absolute];
  return readdirSync(absolute).flatMap((entry) => filesUnder(join(path, entry)));
}

describe("public renderer boundary", () => {
  test("contains no legacy commercial UI branding or hosted billing copy", () => {
    const findings: string[] = [];
    for (const file of SCAN_ROOTS.flatMap(filesUnder)) {
      if (!/\.(?:css|html|md|ts|tsx)$/.test(file)) continue;
      const source = readFileSync(file, "utf8");
      for (const pattern of FORBIDDEN) {
        if (pattern.test(source)) findings.push(`${relative(ROOT, file)}: ${pattern}`);
      }
    }
    expect(findings).toEqual([]);
  });
});
