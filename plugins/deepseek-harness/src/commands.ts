import {
  GEOGEBRA_COMMAND_REFERENCE,
  searchGeoGebraCommandReference
} from "../../../packages/app/src/geogebra-command-reference.js";

const SCRIPT_RISK = "risk:script-execution";
const blockedNames = new Set(
  GEOGEBRA_COMMAND_REFERENCE.filter((entry) => entry.tags.some((tag) => tag === SCRIPT_RISK))
    .flatMap((entry) => [entry.command, entry.localizedName ?? ""])
    .filter(Boolean)
    .map((name) => name.toLowerCase())
);

// Inspect every call, including nested/localized forms, without treating quoted
// labels as executable syntax. This is a narrow command gate, not an applet sandbox:
// changing an existing object can still invoke its pre-existing update script.
export function validateCanvasCommands(commands: readonly string[]): void {
  for (const command of commands) {
    let quoted = false;
    let token = "";
    for (let index = 0; index < command.length; index++) {
      const char = command[index]!;
      if (quoted) {
        if (char === "\\") index++;
        else if (char === '"') quoted = false;
        continue;
      }
      if (/[\p{L}\p{N}\p{M}_]/u.test(char)) {
        token += char;
        continue;
      }
      if (token) {
        const next = command.slice(index).trimStart()[0];
        if ((next === "(" || next === "[") && blockedNames.has(token.toLowerCase())) {
          throw new Error(
            "GeoChat rejects commands tagged risk:script-execution; use native expressions, If or Sequence instead."
          );
        }
        token = "";
      }
      if (char === '"') quoted = true;
    }
    if (quoted) throw new Error("GeoChat command contains an unterminated quoted string.");
  }
}

export function searchCanvasCommands(query: string, topN = 8) {
  return searchGeoGebraCommandReference(query, 12, "zh-CN")
    .filter((entry) => !entry.tags.some((tag) => tag === SCRIPT_RISK))
    .slice(0, topN);
}
