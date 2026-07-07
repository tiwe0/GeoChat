import type { ProblemSummary } from "@geochat-ai/app";

export const problemBankSourceId = "geochat-benchmark-cases";

export type ProblemCase = {
  id?: unknown;
  title?: unknown;
  kind?: unknown;
  input?: { text?: unknown };
  expected?: { answer?: unknown };
  oracle?: { knownAnswer?: unknown };
  tags?: unknown;
  difficulty?: unknown;
  taskType?: unknown;
  metadata?: {
    sourcePaper?: unknown;
    sourceDataset?: unknown;
    sourceCollection?: unknown;
    sourceLicense?: unknown;
    sourceRepository?: unknown;
    sourceSplit?: unknown;
    sourceYear?: unknown;
    sourceQuestionType?: unknown;
    sourceScore?: unknown;
    sourceCategory?: unknown;
    sourceTopics?: unknown;
    visualPotential?: unknown;
    sourceAnalysis?: unknown;
    sourceMedia?: unknown;
  };
  media?: unknown;
};

export type ProblemCaseBundle = {
  files: string[];
  sourceHash: string;
  cases: ProblemCase[];
};

export type ProblemBankSourceSnapshot = {
  id: typeof problemBankSourceId;
  kind: "geochat_benchmark_case";
  name: string;
  version: string;
  sourcePath: string;
  sourceHash: string;
  fileCount: number;
  caseCount: number;
};

export type ImportedProblem = Omit<ProblemSummary, "tags" | "topics"> & {
  sourceId: string;
  answer: string | null;
  analysis: string | null;
  rawPayload: unknown;
  tags: string[];
  topics: string[];
};

export type ProblemCaseSet = {
  id: string;
  slug: string;
  title: string;
  description: string;
  kind: "imported" | "generated" | "curated";
  problemIds: string[];
};

export type ProblemBankImportPlan = {
  source: ProblemBankSourceSnapshot;
  problems: ImportedProblem[];
  sets: ProblemCaseSet[];
};
