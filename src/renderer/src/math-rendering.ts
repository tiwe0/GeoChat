export type LatexSegment = {
  type: "text" | "math";
  value: string;
  display?: boolean;
};

function isEscaped(text: string, index: number) {
  let slashCount = 0;
  for (let cursor = index - 1; cursor >= 0 && text[cursor] === "\\"; cursor -= 1) {
    slashCount += 1;
  }
  return slashCount % 2 === 1;
}

function findNextMathStart(text: string, startAt: number) {
  const candidates = [
    { open: "$$", close: "$$", display: true },
    { open: "\\[", close: "\\]", display: true },
    { open: "\\(", close: "\\)", display: false },
    { open: "$", close: "$", display: false }
  ];
  let next: { index: number; open: string; close: string; display: boolean } | undefined;
  for (const candidate of candidates) {
    let index = text.indexOf(candidate.open, startAt);
    while (index >= 0 && isEscaped(text, index)) {
      index = text.indexOf(candidate.open, index + candidate.open.length);
    }
    if (index >= 0 && (!next || index < next.index || (index === next.index && candidate.open.length > next.open.length))) {
      next = { index, ...candidate };
    }
  }
  return next;
}

function findMathClose(text: string, close: string, startAt: number) {
  let index = text.indexOf(close, startAt);
  while (index >= 0 && isEscaped(text, index)) {
    index = text.indexOf(close, index + close.length);
  }
  return index;
}

const bareLatexCandidatePattern = /[A-Za-z0-9_{}()[\]|.,+\-=<>^\\/\\ \t]+/g;
const bareLatexSignalPattern = /\\[a-zA-Z]+|_[{A-Za-z0-9]|\^[{A-Za-z0-9\\]/;

function parseBareLatexSegments(text: string): LatexSegment[] {
  const segments: LatexSegment[] = [];
  let cursor = 0;
  for (const match of text.matchAll(bareLatexCandidatePattern)) {
    const value = match[0];
    const index = match.index ?? 0;
    if (index > cursor) segments.push({ type: "text", value: text.slice(cursor, index) });

    const leading = value.match(/^\s*/)?.[0] ?? "";
    const trailing = value.match(/\s*$/)?.[0] ?? "";
    const core = value.slice(leading.length, value.length - trailing.length);
    if (!core && value.trim().length === 0) {
      segments.push({ type: "text", value });
      cursor = index + value.length;
      continue;
    }
    if (leading) segments.push({ type: "text", value: leading });
    if (core) {
      segments.push(bareLatexSignalPattern.test(core) ? { type: "math", value: core, display: false } : { type: "text", value: core });
    }
    if (trailing) segments.push({ type: "text", value: trailing });
    cursor = index + value.length;
  }
  if (cursor < text.length) segments.push({ type: "text", value: text.slice(cursor) });
  return segments;
}

export function parseLatexSegments(text: string): LatexSegment[] {
  const segments: LatexSegment[] = [];
  let cursor = 0;
  while (cursor < text.length) {
    const start = findNextMathStart(text, cursor);
    if (!start) {
      segments.push(...parseBareLatexSegments(text.slice(cursor)));
      break;
    }
    if (start.index > cursor) {
      segments.push(...parseBareLatexSegments(text.slice(cursor, start.index)));
    }
    const contentStart = start.index + start.open.length;
    const end = findMathClose(text, start.close, contentStart);
    if (end < 0) {
      segments.push({ type: "text", value: text.slice(start.index) });
      break;
    }
    const value = text.slice(contentStart, end).trim();
    segments.push(value ? { type: "math", value, display: start.display } : { type: "text", value: text.slice(start.index, end + start.close.length) });
    cursor = end + start.close.length;
  }
  return mergeTextSegments(segments).filter((segment) => segment.value.length > 0);
}

function mergeTextSegments(segments: LatexSegment[]) {
  const merged: LatexSegment[] = [];
  for (const segment of segments) {
    const previous = merged[merged.length - 1];
    if (previous?.type === "text" && segment.type === "text") {
      previous.value += segment.value;
      continue;
    }
    merged.push({ ...segment });
  }
  return merged;
}

const bareMarkdownMathPattern =
  /([A-Za-z0-9_{}()[\]|.,;:+\-=<>^\\/\\ \t]*(?:\\(?:sqrt|frac|cdot|pm|leq?|geq?|in|notin|times|div|perp|parallel|angle|circ|pi|lambda|mu|alpha|beta|gamma|theta|varphi|overrightarrow|overline|boldsymbol|vec))[A-Za-z0-9_{}()[\]|.,;:+\-=<>^\\/\\ \t]*)/g;

function normalizeStandardMathDelimiters(text: string) {
  return text
    .replace(/\\\[/g, () => "$$")
    .replace(/\\\]/g, () => "$$")
    .replace(/\\\(/g, () => "$")
    .replace(/\\\)/g, () => "$");
}

export function normalizeStreamdownMath(content: string) {
  const lines = content.split("\n");
  let inFence = false;
  let inDisplayMath = false;
  return lines.map((line) => {
    if (/^\s*(```|~~~)/.test(line)) {
      inFence = !inFence;
      return line;
    }
    if (inFence) return line;
    const normalizedLine = line
      .split(/(`[^`]*`)/g)
      .map((part) => part.startsWith("`") && part.endsWith("`") ? part : normalizeStandardMathDelimiters(part))
      .join("");
    if (normalizedLine.trim() === "$$") {
      inDisplayMath = !inDisplayMath;
      return normalizedLine;
    }
    if (inDisplayMath) return normalizedLine;
    return normalizedLine
      .split(/(`[^`]*`)/g)
      .map((part) => part.startsWith("`") && part.endsWith("`") ? part : part.includes("$") ? part : wrapBareMarkdownMath(part))
      .join("");
  }).join("\n");
}

function wrapBareMarkdownMath(text: string) {
  if (!text.includes("\\")) return text;
  return text.replace(bareMarkdownMathPattern, (raw) => {
    if (!raw.trim() || raw.includes("$")) return raw;
    const leading = raw.match(/^\s*/)?.[0] ?? "";
    const trailing = raw.match(/\s*$/)?.[0] ?? "";
    const core = raw.slice(leading.length, raw.length - trailing.length);
    if (!core || !/\\[a-zA-Z]+/.test(core)) return raw;
    const normalized = core
      .replace(/,;/g, ",")
      .replace(/\s+/g, " ")
      .trim();
    return `${leading}$${normalized}$${trailing}`;
  });
}
