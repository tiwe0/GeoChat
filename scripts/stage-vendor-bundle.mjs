import { cpSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { extname, join, resolve } from "node:path";

const vendorDir = resolve("dist/vendor");
const geogebraVendorDir = resolve(vendorDir, "geogebra");
const agentSkillsDir = resolve("dist/agent-skills");

function stripJavaScriptSourceMaps(root) {
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    const path = join(root, entry.name);
    if (entry.isDirectory()) {
      stripJavaScriptSourceMaps(path);
      continue;
    }
    if (!entry.isFile() || extname(entry.name) !== ".js") continue;

    const source = readFileSync(path, "utf8");
    const stripped = source
      .replace(/^[ \t]*\/\/# sourceMappingURL=.*(?:\r?\n)?/gm, "")
      .replace(/\\n\/\/# sourceMappingURL=.*?\\n/g, "\\n");
    if (stripped !== source) writeFileSync(path, stripped);
  }
}

rmSync(vendorDir, { recursive: true, force: true });
rmSync(agentSkillsDir, { recursive: true, force: true });
mkdirSync(vendorDir, { recursive: true });
mkdirSync(agentSkillsDir, { recursive: true });
cpSync(resolve("vendor/geogebra"), geogebraVendorDir, { recursive: true });
cpSync(resolve("backend/src/agent/builtin-skills"), agentSkillsDir, { recursive: true });
stripJavaScriptSourceMaps(geogebraVendorDir);
