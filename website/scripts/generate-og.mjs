#!/usr/bin/env node
/**
 * Renders scripts/og.html to public/og.png (1200x630).
 *
 *   node scripts/generate-og.mjs
 *
 * Uses whatever Chrome-family browser is already installed via its headless
 * screenshot flag, so this needs no npm dependency of its own — the site should
 * not carry a browser automation package just to produce one static image.
 *
 * Renders at 2x and downsamples, which is noticeably crisper than rendering at
 * 1x. Requires `sips` (macOS) or ImageMagick for the downsample step; without
 * either, the 2x file is kept and a note is printed.
 */
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, renameSync, rmSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { tmpdir } from "node:os";

const here = path.dirname(fileURLToPath(import.meta.url));
const source = path.join(here, "og.html");
const target = path.join(here, "..", "public", "og.png");
const scratch = path.join(tmpdir(), `geochat-og-${process.pid}.png`);

const CANDIDATES = [
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  "/Applications/Chromium.app/Contents/MacOS/Chromium",
  "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge",
  "/Applications/Brave Browser.app/Contents/MacOS/Brave Browser",
  "/usr/bin/google-chrome",
  "/usr/bin/chromium",
  "/usr/bin/chromium-browser",
  "C:/Program Files/Google/Chrome/Application/chrome.exe"
];

const browser = CANDIDATES.find((candidate) => existsSync(candidate));
if (!browser) {
  console.error(
    "generate-og: no Chrome-family browser found. Install Chrome or Chromium, " +
      "or add its path to CANDIDATES in this script."
  );
  process.exit(1);
}

if (!existsSync(source)) {
  console.error(`generate-og: ${source} is missing`);
  process.exit(1);
}

console.log(`generate-og: rendering with ${path.basename(browser)}`);

execFileSync(
  browser,
  [
    "--headless=new",
    "--disable-gpu",
    "--hide-scrollbars",
    "--force-device-scale-factor=2",
    "--window-size=1200,630",
    `--screenshot=${scratch}`,
    `file://${source}`
  ],
  { stdio: ["ignore", "ignore", "inherit"] }
);

if (!existsSync(scratch)) {
  console.error("generate-og: the browser produced no screenshot");
  process.exit(1);
}

function downsample() {
  // sips ships with macOS; magick is the cross-platform fallback.
  if (spawnSync("sips", ["--version"], { stdio: "ignore" }).status === 0) {
    execFileSync("sips", ["-z", "630", "1200", scratch, "--out", target], {
      stdio: ["ignore", "ignore", "inherit"]
    });
    return true;
  }
  if (spawnSync("magick", ["-version"], { stdio: "ignore" }).status === 0) {
    execFileSync("magick", [scratch, "-resize", "1200x630", "-strip", target], {
      stdio: "inherit"
    });
    return true;
  }
  return false;
}

if (downsample()) {
  rmSync(scratch, { force: true });
  console.log(`generate-og: wrote ${path.relative(process.cwd(), target)} (1200x630)`);
} else {
  renameSync(scratch, target);
  console.log(
    `generate-og: wrote ${path.relative(process.cwd(), target)} at 2x — ` +
      "install sips or ImageMagick to downsample to 1200x630."
  );
}
