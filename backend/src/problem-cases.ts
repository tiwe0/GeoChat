import { resolve } from "node:path";

export const defaultProblemCasesRelativeRoot = "data/problem-cases";

export type ProblemCasesEnv = {
  GEOCHAT_PROBLEM_CASES_DIR?: string;
};

export function defaultProblemCasesRoot(resourceRoot: string) {
  return resolve(resourceRoot, defaultProblemCasesRelativeRoot);
}

export function problemCasesRootFromUrl(
  url: URL,
  options: {
    defaultRoot: string;
    env?: ProblemCasesEnv;
  }
) {
  const explicit = url.searchParams.get("sourcePath")?.trim();
  return explicit || options.env?.GEOCHAT_PROBLEM_CASES_DIR || options.defaultRoot;
}
