#!/usr/bin/env node
/**
 * Verifies every foreground/background pair the design actually ships against
 * WCAG AA. Run it whenever a token in src/styles/app.css changes.
 *
 *   node scripts/check-contrast.mjs
 *
 * Exits non-zero if any pair fails, so it can gate a build.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const cssPath = path.join(here, "..", "src", "styles", "app.css");

/* ---- OKLCH -> sRGB ------------------------------------------------------ */

function oklchToLinearSrgb(L, C, hDeg) {
  const h = (hDeg * Math.PI) / 180;
  const a = C * Math.cos(h);
  const b = C * Math.sin(h);

  const l_ = L + 0.3963377774 * a + 0.2158037573 * b;
  const m_ = L - 0.1055613458 * a - 0.0638541728 * b;
  const s_ = L - 0.0894841775 * a - 1.291485548 * b;

  const l = l_ ** 3;
  const m = m_ ** 3;
  const s = s_ ** 3;

  return [
    +4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s
  ];
}

/** WCAG relative luminance works on linear-light values, which is what we have. */
function relativeLuminance([r, g, b]) {
  const clamp = (v) => Math.min(1, Math.max(0, v));
  return 0.2126 * clamp(r) + 0.7152 * clamp(g) + 0.0722 * clamp(b);
}

function contrast(fg, bg) {
  const a = relativeLuminance(oklchToLinearSrgb(...fg));
  const b = relativeLuminance(oklchToLinearSrgb(...bg));
  const [hi, lo] = a > b ? [a, b] : [b, a];
  return (hi + 0.05) / (lo + 0.05);
}

/* ---- Read the tokens straight from the stylesheet ------------------------ */

const css = readFileSync(cssPath, "utf8");
const tokens = {};
for (const m of css.matchAll(
  /(--color-[a-z-]+):\s*oklch\(([\d.]+)\s+([\d.]+)\s+([\d.]+)\)/g
)) {
  tokens[m[1]] = [Number(m[2]), Number(m[3]), Number(m[4])];
}

const WHITE = [1, 0, 0];

/**
 * Every pair below corresponds to a combination that appears in the shipped
 * markup. `min` is 4.5 for body text, 3 for large text and graphic strokes.
 */
const pairs = [
  ["body text", "--color-ink", "--color-paper", 4.5],
  ["body text on sunk", "--color-ink", "--color-paper-sunk", 4.5],
  ["secondary text", "--color-ink-soft", "--color-paper", 4.5],
  ["secondary text on sunk", "--color-ink-soft", "--color-paper-sunk", 4.5],
  ["faint meta (large only)", "--color-ink-faint", "--color-paper", 3],
  ["construct label", "--color-construct", "--color-paper", 4.5],
  ["construct on its wash", "--color-construct", "--color-construct-wash", 4.5],
  ["construct stroke", "--color-construct", "--color-paper", 3],
  ["result label", "--color-result", "--color-paper", 4.5],
  ["result on its wash", "--color-result", "--color-result-wash", 4.5],
  ["white on result (CTA)", null, "--color-result", 4.5],
  ["white on ink (CTA)", null, "--color-ink", 4.5],
  ["ochre stroke (graphic only)", "--color-ochre", "--color-paper", 3],
  ["ochre text", "--color-ochre-ink", "--color-paper", 4.5],
  ["ochre text on its wash", "--color-ochre-ink", "--color-ochre-wash", 4.5],
  ["rule against paper", "--color-rule-strong", "--color-paper", 1.4]
];

let failed = 0;
const rows = pairs.map(([label, fgKey, bgKey, min]) => {
  const fg = fgKey ? tokens[fgKey] : WHITE;
  const bg = tokens[bgKey];
  if (!fg || !bg) {
    failed += 1;
    return { label, ratio: "MISSING TOKEN", min, ok: false };
  }
  const ratio = contrast(fg, bg);
  const ok = ratio >= min;
  if (!ok) failed += 1;
  return { label, ratio: ratio.toFixed(2), min: min.toFixed(1), ok };
});

const width = Math.max(...rows.map((r) => r.label.length));
for (const r of rows) {
  const mark = r.ok ? "PASS" : "FAIL";
  console.log(
    `${r.ok ? " " : "!"} ${r.label.padEnd(width)}  ${String(r.ratio).padStart(6)} : 1  (min ${r.min})  ${mark}`
  );
}

if (failed > 0) {
  console.error(`\n${failed} contrast pair(s) below target.`);
  process.exit(1);
}
console.log(`\nAll ${rows.length} pairs meet target.`);
