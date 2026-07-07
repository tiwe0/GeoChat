import { createHash } from "node:crypto";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import type { ProblemCase, ProblemCaseBundle } from "./types";

export function loadLocalProblemCaseBundle(sourcePath: string): ProblemCaseBundle {
  const files = listCaseJsonFiles(sourcePath);
  const rawCases = files.map((file) => readFileSync(join(sourcePath, file), "utf8"));
  return {
    files,
    sourceHash: createHash("sha256").update(files.map((file, index) => `${file}\n${rawCases[index]}`).join("\n")).digest("hex"),
    cases: rawCases.flatMap((raw) => {
      const parsed = JSON.parse(raw) as ProblemCase | ProblemCase[];
      return Array.isArray(parsed) ? parsed : [parsed];
    })
  };
}

function listCaseJsonFiles(sourcePath: string) {
  const files: string[] = [];
  const visit = (dir: string) => {
    for (const name of readdirSync(dir).sort()) {
      const fullPath = join(dir, name);
      if (statSync(fullPath).isDirectory()) {
        visit(fullPath);
      } else if (name.endsWith(".json")) {
        files.push(relative(sourcePath, fullPath));
      }
    }
  };
  visit(sourcePath);
  return files.sort();
}
