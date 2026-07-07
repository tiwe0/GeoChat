import { loadLocalProblemCaseBundle } from "./case-source";
import { createProblemCaseSets } from "./set-builder";
import { transformProblemCase } from "./transform";
import { problemBankSourceId, type ProblemBankImportPlan, type ProblemBankSourceSnapshot } from "./types";

const localProblemBankSourceName = "GeoChat Built-in Problem Cases";
const localProblemBankSourceVersion = "2026-06-11";

export function buildLocalProblemBankImportPlan(sourcePath: string): ProblemBankImportPlan {
  const bundle = loadLocalProblemCaseBundle(sourcePath);
  const problems = bundle.cases.map(transformProblemCase).filter((problem): problem is NonNullable<typeof problem> => Boolean(problem));
  const source: ProblemBankSourceSnapshot = {
    id: problemBankSourceId,
    kind: "geochat_benchmark_case",
    name: localProblemBankSourceName,
    version: localProblemBankSourceVersion,
    sourcePath,
    sourceHash: bundle.sourceHash,
    fileCount: bundle.files.length,
    caseCount: bundle.cases.length
  };
  return {
    source,
    problems,
    sets: createProblemCaseSets(problems)
  };
}
