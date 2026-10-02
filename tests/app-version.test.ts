import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";

test("keeps the desktop, native package, lockfile, website, and readme versions aligned", () => {
  const source = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
  const version = JSON.parse(source("package.json")).version;
  expect(version).toMatch(/^\d+\.\d+\.\d+$/);
  expect(JSON.parse(source("src-tauri/tauri.conf.json")).version).toBe(version);
  expect(source("src-tauri/Cargo.toml").match(/^version = "([^"]+)"/m)?.[1]).toBe(version);
  expect(source("src-tauri/Cargo.lock").match(/name = "geochat-desktop-tauri"\nversion = "([^"]+)"/)?.[1]).toBe(version);
  expect(source("website/src/site.ts").match(/FALLBACK_VERSION = "([^"]+)"/)?.[1]).toBe(version);
  for (const readme of ["README.md", "README.en.md"]) {
    expect(source(readme)).toContain(`\x60v${version}\x60 ·`);
  }
});
