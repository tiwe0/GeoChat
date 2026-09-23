import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import {
  GEOGEBRA_COMMAND_TAXONOMY_SOURCE,
  getGeoGebraCommandTaxonomyTags
} from "./geogebra-command-taxonomy.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const VENDOR_ROOT = path.join(ROOT, "vendor/geogebra/HTML5/5.0/web3d");
const ENGLISH_PROPERTIES = path.join(VENDOR_ROOT, "js/properties_keys_en.js");
const CHINESE_PROPERTIES = path.join(VENDOR_ROOT, "js/properties_keys_zh-CN.js");
const SERVICE_WORKER = path.join(VENDOR_ROOT, "sworker-locked.js");
const OUTPUT = path.join(ROOT, "packages/app/src/geogebra-command-reference-data.ts");

function loadCommandProperties(filePath, locale) {
  const source = readFileSync(filePath, "utf8");
  const marker = `__GGB__keysVar["${locale}"].command = JSON.parse(`;
  const markerIndex = source.indexOf(marker);
  if (markerIndex < 0) throw new Error(`Command properties marker not found for ${locale}: ${filePath}`);
  const valueStart = markerIndex + marker.length;
  const valueEnd = source.indexOf(");", valueStart);
  if (valueEnd < 0) throw new Error(`Command properties payload is incomplete for ${locale}: ${filePath}`);
  return JSON.parse(JSON.parse(source.slice(valueStart, valueEnd)));
}

function readRuntimeVersion() {
  const source = readFileSync(SERVICE_WORKER, "utf8");
  const match = source.match(/"unique_id"\s*:\s*"#([^:"]+):/u);
  if (!match) throw new Error(`GeoGebra runtime version is missing from ${SERVICE_WORKER}`);
  return match[1];
}

function sha256(filePath) {
  return createHash("sha256").update(readFileSync(filePath)).digest("hex");
}

function parseExistingEntries() {
  const source = readFileSync(OUTPUT, "utf8");
  const marker = "export const GENERATED_GEOGEBRA_COMMAND_REFERENCE = [";
  const start = source.indexOf(marker);
  const end = source.lastIndexOf("] satisfies");
  if (start < 0 || end < 0) throw new Error(`Generated command array not found in ${OUTPUT}`);
  return JSON.parse(source.slice(start + marker.indexOf("["), end + 1));
}

function syntaxLines(properties, sourceCommand) {
  return ["Syntax", "Syntax3D", "SyntaxCAS"]
    .flatMap((suffix) => String(properties[`${sourceCommand}.${suffix}`] ?? "").split("\n"))
    .map((line) => line.trim())
    .filter(Boolean)
    .filter((line, index, all) => all.indexOf(line) === index);
}

function formatSyntax(command, lines) {
  return lines
    .map((line) => {
      const normalized = line === "[]" || line === "[ ]" ? "" : line.replace(/^\[\s*/u, "").replace(/\s*\]$/u, "");
      return `${command}(${normalized ? ` ${normalized} ` : ""})`;
    })
    .join("; ");
}

function compactEntry(value) {
  return Object.fromEntries(Object.entries(value).filter(([, item]) => item !== undefined && item !== null));
}

export function generateGeoGebraCommandReference() {
  const english = loadCommandProperties(ENGLISH_PROPERTIES, "en");
  const chinese = loadCommandProperties(CHINESE_PROPERTIES, "zh-CN");
  const existing = parseExistingEntries();
  const byName = new Map(existing.flatMap((entry) => [[entry.command, entry], [entry.localizedName, entry]]));
  const sourceCommands = [...new Set(Object.keys(english)
    .filter((key) => /\.Syntax(?:3D|CAS)?$/u.test(key))
    .map((key) => key.split(".")[0]))]
    .sort((left, right) => String(english[left]).localeCompare(String(english[right]), "en"));

  const entries = sourceCommands.map((sourceCommand) => {
    const command = english[sourceCommand];
    const localizedName = chinese[sourceCommand] ?? command;
    const previous = byName.get(sourceCommand) ?? byName.get(command) ?? byName.get(localizedName) ?? {};
    const syntaxEn = formatSyntax(command, syntaxLines(english, sourceCommand));
    const syntax = formatSyntax(command, syntaxLines(chinese, sourceCommand));
    const searchTextEn = [...new Set([
      command,
      sourceCommand === command ? undefined : sourceCommand,
      localizedName,
      syntaxEn
    ].filter(Boolean).join(" ").split(/\s+/u).filter(Boolean))].join(" ");
    const tags = getGeoGebraCommandTaxonomyTags(command);
    return compactEntry({
      command,
      localizedName,
      syntax,
      syntaxEn,
      description: previous.description ?? `${localizedName} command.`,
      descriptionEn: previous.descriptionEn,
      searchTextEn,
      note: previous.note,
      examples: previous.examples ?? [],
      tags
    });
  });

  if (entries.length !== sourceCommands.length) throw new Error("GeoGebra command generation lost entries");
  if (entries.some((entry) => !entry.command || !entry.syntax || !entry.syntaxEn)) {
    throw new Error("GeoGebra command generation produced an incomplete command entry");
  }
  if (new Set(entries.map((entry) => entry.command)).size !== entries.length) {
    throw new Error("GeoGebra command generation produced duplicate canonical command names");
  }
  const uncategorizedCommands = entries
    .filter((entry) => !entry.tags.some((tag) => tag.startsWith("category:")))
    .map((entry) => entry.command);
  if (uncategorizedCommands.length > 0) {
    throw new Error(`GeoGebra command taxonomy is missing categories for: ${uncategorizedCommands.join(", ")}`);
  }

  const metadata = {
    runtimeVersion: readRuntimeVersion(),
    commandCount: entries.length,
    sources: {
      english: "vendor/geogebra/HTML5/5.0/web3d/js/properties_keys_en.js",
      chinese: "vendor/geogebra/HTML5/5.0/web3d/js/properties_keys_zh-CN.js",
      runtimeManifest: "vendor/geogebra/HTML5/5.0/web3d/sworker-locked.js",
      taxonomy: GEOGEBRA_COMMAND_TAXONOMY_SOURCE
    },
    sha256: {
      english: sha256(ENGLISH_PROPERTIES),
      chinese: sha256(CHINESE_PROPERTIES),
      runtimeManifest: sha256(SERVICE_WORKER)
    }
  };
  const tags = [...new Set(entries.flatMap((entry) => entry.tags))].sort();

  return `// Generated from the command localization bundles shipped with GeoGebra ${metadata.runtimeVersion}.\n// These bundles are the runtime authority for canonical command names and exact parameter signatures.\n// Run \`bun run geogebra:commands:generate\` after updating the vendored GeoGebra runtime.\n\nimport type { GeoGebraCommandReferenceEntry } from "./geogebra-command-reference";\n\nexport const GENERATED_GEOGEBRA_COMMAND_REFERENCE_METADATA = ${JSON.stringify(metadata, null, 2)} as const;\n\nexport const GENERATED_GEOGEBRA_COMMAND_TAGS = ${JSON.stringify(tags, null, 2)} as const;\n\nexport const GENERATED_GEOGEBRA_COMMAND_REFERENCE = ${JSON.stringify(entries, null, 2)} satisfies readonly GeoGebraCommandReferenceEntry[];\n`;
}

const generated = generateGeoGebraCommandReference();
if (process.argv.includes("--check")) {
  if (readFileSync(OUTPUT, "utf8") !== generated) {
    console.error("GeoGebra command reference is stale. Run: bun run geogebra:commands:generate");
    process.exitCode = 1;
  }
} else {
  writeFileSync(OUTPUT, generated);
  console.log(`Generated ${OUTPUT}`);
}
