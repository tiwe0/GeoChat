export type BenchmarkDifficulty = "smoke" | "easy" | "medium" | "hard";

export interface BenchmarkAsset {
  id: string;
  path: string;
  mimeType: string;
  alt?: string;
}

export interface BenchmarkPublicTask {
  title: string;
  prompt: string;
  tags: string[];
  difficulty: BenchmarkDifficulty;
  assets?: BenchmarkAsset[];
}

export interface BenchmarkExactMatcher {
  kind: "exact";
  expected: string;
}

export interface BenchmarkNormalizedMatcher {
  kind: "normalized";
  expected: string;
  caseSensitive?: boolean;
}

export interface BenchmarkNumericMatcher {
  kind: "numeric";
  expected: number;
  absoluteTolerance?: number;
  relativeTolerance?: number;
  extraction?: "whole" | "single-number";
}

export type BenchmarkAnswerMatcher =
  | BenchmarkExactMatcher
  | BenchmarkNormalizedMatcher
  | BenchmarkNumericMatcher;

export interface BenchmarkOracle {
  answer: BenchmarkAnswerMatcher;
  requiredTools?: string[];
  forbiddenTools?: string[];
  canvasObjects?: BenchmarkCanvasObjectMatcher[];
}

export interface BenchmarkCanvasObjectMatcher {
  id: string;
  type?: string;
  label?: string;
  definitionIncludes?: string;
  cardinality?: "exactly-one" | "at-least-one";
}

export interface BenchmarkLimits {
  timeoutMs?: number;
  maxToolCalls?: number;
}

export interface BenchmarkCase {
  id: string;
  version: string;
  path: string;
  publicTask: BenchmarkPublicTask;
  oracle: BenchmarkOracle;
  limits?: BenchmarkLimits;
}

export interface BenchmarkSuite {
  schemaVersion: 1;
  id: string;
  version: string;
  title: string;
  description?: string;
  cases: BenchmarkCase[];
  /** A reproducible fingerprint. It is excluded when calculating the fingerprint itself. */
  contentHash?: string;
}

export interface PublicBenchmarkCase {
  id: string;
  version: string;
  title: string;
  prompt: string;
  tags: string[];
  difficulty: BenchmarkDifficulty;
  assets: BenchmarkAsset[];
}

export interface PublicBenchmarkSuite {
  schemaVersion: 1;
  id: string;
  version: string;
  title: string;
  description?: string;
  cases: PublicBenchmarkCase[];
}

export type BenchmarkValidationIssueCode =
  | "invalid_type"
  | "invalid_schema_version"
  | "invalid_version"
  | "invalid_path"
  | "duplicate_id"
  | "duplicate_path"
  | "empty_value"
  | "non_finite_number"
  | "invalid_number"
  | "ambiguous_matcher"
  | "unknown_assertion"
  | "forbidden_private_field"
  | "content_hash_mismatch";

export interface BenchmarkValidationIssue {
  path: string;
  code: BenchmarkValidationIssueCode;
  message: string;
}

export interface BenchmarkValidationResult {
  valid: boolean;
  issues: BenchmarkValidationIssue[];
  contentHash: string | null;
}

const PRIVATE_TASK_KEYS = new Set(["answer", "analysis", "rawPayload", "correct", "oracle"]);
const VERSION_PATTERN = /^(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)(?:-[0-9A-Za-z.-]+)?$/;
const SAFE_RELATIVE_PATH = /^(?!\/)(?!.*(?:^|\/)\.\.(?:\/|$))(?!.*\\)[A-Za-z0-9._/-]+\.json$/;
const NUMBER_PATTERN = /[-+]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][-+]?\d+)?/g;

function issue(
  issues: BenchmarkValidationIssue[],
  path: string,
  code: BenchmarkValidationIssueCode,
  message: string
) {
  issues.push({ path, code, message });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function validateRequiredString(
  value: unknown,
  path: string,
  issues: BenchmarkValidationIssue[]
): value is string {
  if (typeof value !== "string") {
    issue(issues, path, "invalid_type", "Expected a string.");
    return false;
  }
  if (value.trim().length === 0) {
    issue(issues, path, "empty_value", "Value must not be empty.");
    return false;
  }
  return true;
}

function findForbiddenPrivateFields(
  value: unknown,
  path: string,
  issues: BenchmarkValidationIssue[]
) {
  if (Array.isArray(value)) {
    value.forEach((entry, index) => findForbiddenPrivateFields(entry, `${path}[${index}]`, issues));
    return;
  }
  if (!isRecord(value)) return;
  for (const [key, entry] of Object.entries(value)) {
    const entryPath = `${path}.${key}`;
    if (PRIVATE_TASK_KEYS.has(key)) {
      issue(issues, entryPath, "forbidden_private_field", `Public task contains private field '${key}'.`);
    }
    findForbiddenPrivateFields(entry, entryPath, issues);
  }
}

function validateStringList(value: unknown, path: string, issues: BenchmarkValidationIssue[]) {
  if (!Array.isArray(value)) {
    issue(issues, path, "invalid_type", "Expected an array of strings.");
    return;
  }
  value.forEach((entry, index) => validateRequiredString(entry, `${path}[${index}]`, issues));
}

function validateFiniteNonNegative(value: unknown, path: string, issues: BenchmarkValidationIssue[]) {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    issue(issues, path, "non_finite_number", "Expected a finite number.");
  } else if (value < 0) {
    issue(issues, path, "invalid_number", "Expected a non-negative number.");
  }
}

function validateMatcher(value: unknown, path: string, issues: BenchmarkValidationIssue[]) {
  if (!isRecord(value)) {
    issue(issues, path, "invalid_type", "Expected an answer matcher object.");
    return;
  }
  const kind = value.kind;
  const keysByKind: Record<string, ReadonlySet<string>> = {
    exact: new Set(["kind", "expected"]),
    normalized: new Set(["kind", "expected", "caseSensitive"]),
    numeric: new Set(["kind", "expected", "absoluteTolerance", "relativeTolerance", "extraction"])
  };
  if (typeof kind !== "string" || !keysByKind[kind]) {
    issue(issues, `${path}.kind`, "ambiguous_matcher", "Matcher must select exactly one supported kind.");
    return;
  }
  const unexpected = Object.keys(value).filter((key) => !keysByKind[kind]!.has(key));
  if (unexpected.length > 0) {
    issue(issues, path, "ambiguous_matcher", `Matcher mixes incompatible fields: ${unexpected.join(", ")}.`);
  }
  if (kind === "numeric") {
    if (typeof value.expected !== "number" || !Number.isFinite(value.expected)) {
      issue(issues, `${path}.expected`, "non_finite_number", "Numeric expectation must be finite.");
    }
    for (const key of ["absoluteTolerance", "relativeTolerance"] as const) {
      if (value[key] !== undefined) validateFiniteNonNegative(value[key], `${path}.${key}`, issues);
    }
    if (value.extraction !== undefined && value.extraction !== "whole" && value.extraction !== "single-number") {
      issue(issues, `${path}.extraction`, "invalid_type", "Unsupported numeric extraction mode.");
    }
    return;
  }
  validateRequiredString(value.expected, `${path}.expected`, issues);
  if (kind === "normalized" && value.caseSensitive !== undefined && typeof value.caseSensitive !== "boolean") {
    issue(issues, `${path}.caseSensitive`, "invalid_type", "Expected a boolean.");
  }
}

export function validateBenchmarkSuite(value: unknown): BenchmarkValidationResult {
  const issues: BenchmarkValidationIssue[] = [];
  if (!isRecord(value)) {
    issue(issues, "$", "invalid_type", "Benchmark suite must be an object.");
    return { valid: false, issues, contentHash: null };
  }
  if (value.schemaVersion !== 1) {
    issue(issues, "schemaVersion", "invalid_schema_version", "Only benchmark schema version 1 is supported.");
  }
  validateRequiredString(value.id, "id", issues);
  if (validateRequiredString(value.version, "version", issues) && !VERSION_PATTERN.test(value.version)) {
    issue(issues, "version", "invalid_version", "Version must use semantic version syntax.");
  }
  validateRequiredString(value.title, "title", issues);
  if (!Array.isArray(value.cases)) {
    issue(issues, "cases", "invalid_type", "Expected an array of benchmark cases.");
    return { valid: false, issues, contentHash: null };
  }

  const ids = new Set<string>();
  const paths = new Set<string>();
  value.cases.forEach((entry, index) => {
    const base = `cases[${index}]`;
    if (!isRecord(entry)) {
      issue(issues, base, "invalid_type", "Benchmark case must be an object.");
      return;
    }
    if (validateRequiredString(entry.id, `${base}.id`, issues)) {
      if (ids.has(entry.id)) issue(issues, `${base}.id`, "duplicate_id", `Duplicate case id '${entry.id}'.`);
      ids.add(entry.id);
    }
    if (validateRequiredString(entry.version, `${base}.version`, issues) && !VERSION_PATTERN.test(entry.version)) {
      issue(issues, `${base}.version`, "invalid_version", "Version must use semantic version syntax.");
    }
    if (validateRequiredString(entry.path, `${base}.path`, issues)) {
      if (!SAFE_RELATIVE_PATH.test(entry.path)) {
        issue(issues, `${base}.path`, "invalid_path", "Path must be a safe relative JSON path.");
      }
      if (paths.has(entry.path)) issue(issues, `${base}.path`, "duplicate_path", `Duplicate case path '${entry.path}'.`);
      paths.add(entry.path);
    }
    if (!isRecord(entry.publicTask)) {
      issue(issues, `${base}.publicTask`, "invalid_type", "Public task must be an object.");
    } else {
      findForbiddenPrivateFields(entry.publicTask, `${base}.publicTask`, issues);
      validateRequiredString(entry.publicTask.title, `${base}.publicTask.title`, issues);
      validateRequiredString(entry.publicTask.prompt, `${base}.publicTask.prompt`, issues);
      validateStringList(entry.publicTask.tags, `${base}.publicTask.tags`, issues);
      if (!["smoke", "easy", "medium", "hard"].includes(String(entry.publicTask.difficulty))) {
        issue(issues, `${base}.publicTask.difficulty`, "invalid_type", "Unsupported difficulty.");
      }
      if (entry.publicTask.assets !== undefined) {
        if (!Array.isArray(entry.publicTask.assets)) {
          issue(issues, `${base}.publicTask.assets`, "invalid_type", "Assets must be an array.");
        } else {
          entry.publicTask.assets.forEach((asset, assetIndex) => {
            const assetPath = `${base}.publicTask.assets[${assetIndex}]`;
            if (!isRecord(asset)) {
              issue(issues, assetPath, "invalid_type", "Asset must be an object.");
              return;
            }
            validateRequiredString(asset.id, `${assetPath}.id`, issues);
            validateRequiredString(asset.path, `${assetPath}.path`, issues);
            validateRequiredString(asset.mimeType, `${assetPath}.mimeType`, issues);
          });
        }
      }
    }
    if (!isRecord(entry.oracle)) {
      issue(issues, `${base}.oracle`, "invalid_type", "Oracle must be an object.");
    } else {
      const knownOracleKeys = new Set(["answer", "requiredTools", "forbiddenTools", "canvasObjects"]);
      for (const key of Object.keys(entry.oracle)) {
        if (!knownOracleKeys.has(key)) {
          issue(issues, `${base}.oracle.${key}`, "unknown_assertion", `Unknown oracle assertion '${key}'.`);
        }
      }
      validateMatcher(entry.oracle.answer, `${base}.oracle.answer`, issues);
      if (entry.oracle.requiredTools !== undefined) {
        validateStringList(entry.oracle.requiredTools, `${base}.oracle.requiredTools`, issues);
      }
      if (entry.oracle.forbiddenTools !== undefined) {
        validateStringList(entry.oracle.forbiddenTools, `${base}.oracle.forbiddenTools`, issues);
      }
      if (entry.oracle.canvasObjects !== undefined) {
        if (!Array.isArray(entry.oracle.canvasObjects)) {
          issue(issues, `${base}.oracle.canvasObjects`, "invalid_type", "Canvas object assertions must be an array.");
        } else {
          entry.oracle.canvasObjects.forEach((matcher, matcherIndex) => {
            const matcherPath = `${base}.oracle.canvasObjects[${matcherIndex}]`;
            if (!isRecord(matcher)) {
              issue(issues, matcherPath, "invalid_type", "Canvas object matcher must be an object.");
              return;
            }
            const knownMatcherKeys = new Set(["id", "type", "label", "definitionIncludes", "cardinality"]);
            for (const key of Object.keys(matcher)) {
              if (!knownMatcherKeys.has(key)) {
                issue(issues, `${matcherPath}.${key}`, "unknown_assertion", `Unknown canvas matcher field '${key}'.`);
              }
            }
            validateRequiredString(matcher.id, `${matcherPath}.id`, issues);
            for (const key of ["type", "label", "definitionIncludes"] as const) {
              if (matcher[key] !== undefined) validateRequiredString(matcher[key], `${matcherPath}.${key}`, issues);
            }
            if (matcher.type === undefined && matcher.label === undefined && matcher.definitionIncludes === undefined) {
              issue(issues, matcherPath, "ambiguous_matcher", "Canvas matcher must contain at least one semantic condition.");
            }
            if (matcher.cardinality !== undefined
              && matcher.cardinality !== "exactly-one"
              && matcher.cardinality !== "at-least-one") {
              issue(issues, `${matcherPath}.cardinality`, "invalid_type", "Unsupported canvas matcher cardinality.");
            }
          });
        }
      }
    }
    if (entry.limits !== undefined) {
      if (!isRecord(entry.limits)) {
        issue(issues, `${base}.limits`, "invalid_type", "Limits must be an object.");
      } else {
        if (entry.limits.timeoutMs !== undefined) {
          validateFiniteNonNegative(entry.limits.timeoutMs, `${base}.limits.timeoutMs`, issues);
        }
        if (entry.limits.maxToolCalls !== undefined) {
          validateFiniteNonNegative(entry.limits.maxToolCalls, `${base}.limits.maxToolCalls`, issues);
          if (typeof entry.limits.maxToolCalls === "number" && !Number.isInteger(entry.limits.maxToolCalls)) {
            issue(issues, `${base}.limits.maxToolCalls`, "invalid_number", "Tool call limit must be an integer.");
          }
        }
      }
    }
  });

  const contentHash = issues.some((entry) => entry.code === "non_finite_number")
    ? null
    : benchmarkSuiteHash(value as unknown as BenchmarkSuite);
  if (contentHash && value.contentHash !== undefined && value.contentHash !== contentHash) {
    issue(issues, "contentHash", "content_hash_mismatch", `Expected ${contentHash}.`);
  }
  return { valid: issues.length === 0, issues, contentHash };
}

/**
 * Produces the only benchmark shape that may be sent to a model. This is an
 * allowlist projection rather than a redaction pass so future private fields
 * cannot leak by default.
 */
export function projectBenchmarkSuiteForModel(suite: BenchmarkSuite): PublicBenchmarkSuite {
  return {
    schemaVersion: 1,
    id: suite.id,
    version: suite.version,
    title: suite.title,
    ...(suite.description === undefined ? {} : { description: suite.description }),
    cases: suite.cases.map((entry) => ({
      id: entry.id,
      version: entry.version,
      title: entry.publicTask.title,
      prompt: entry.publicTask.prompt,
      tags: [...entry.publicTask.tags],
      difficulty: entry.publicTask.difficulty,
      assets: (entry.publicTask.assets ?? []).map((asset) => ({
        id: asset.id,
        path: asset.path,
        mimeType: asset.mimeType,
        ...(asset.alt === undefined ? {} : { alt: asset.alt })
      }))
    }))
  };
}

function canonicalJson(value: unknown): string {
  if (value === null || typeof value === "boolean" || typeof value === "string") return JSON.stringify(value);
  if (typeof value === "number") return Number.isFinite(value) ? JSON.stringify(value) : JSON.stringify(String(value));
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (isRecord(value)) {
    const entries = Object.entries(value)
      .filter(([key, entry]) => key !== "contentHash" && entry !== undefined)
      .sort(([left], [right]) => left.localeCompare(right));
    return `{${entries.map(([key, entry]) => `${JSON.stringify(key)}:${canonicalJson(entry)}`).join(",")}}`;
  }
  return JSON.stringify(String(value));
}

/** Stable FNV-1a 64-bit fingerprint over canonical UTF-8 JSON. */
export function benchmarkSuiteHash(suite: BenchmarkSuite): string {
  let hash = 0xcbf29ce484222325n;
  for (const byte of new TextEncoder().encode(canonicalJson(suite))) {
    hash ^= BigInt(byte);
    hash = BigInt.asUintN(64, hash * 0x100000001b3n);
  }
  return `fnv1a64:${hash.toString(16).padStart(16, "0")}`;
}

export type BenchmarkCaseOutcome =
  | "passed"
  | "failed"
  | "invalid-output"
  | "unsupported"
  | "incomplete"
  | "pending-review"
  | "infrastructure-error"
  | "evaluator-error";

export interface BenchmarkCanvasObjectEvidence {
  type: string;
  label?: string;
  definition?: string;
}

export interface BenchmarkExecutionEvidence {
  status?: "complete" | "incomplete" | "unsupported" | "pending-review" | "error";
  answer?: string | number | null;
  tools?: string[];
  canvasObjects?: BenchmarkCanvasObjectEvidence[];
  durationMs?: number;
  error?: string;
}

export interface BenchmarkAssertionResult {
  id: "answer" | "required-tools" | "forbidden-tools" | `canvas-object:${string}`;
  passed: boolean;
  ambiguous?: boolean;
  message: string;
}

export interface BenchmarkCaseResult {
  caseId: string;
  caseVersion: string;
  outcome: BenchmarkCaseOutcome;
  assertions: BenchmarkAssertionResult[];
  durationMs: number;
  error?: string;
}

function normalizeAnswer(value: string, caseSensitive: boolean): string {
  const normalized = value.normalize("NFKC").trim().replace(/\s+/g, " ");
  return caseSensitive ? normalized : normalized.toLocaleLowerCase("en-US");
}

function numericCandidate(answer: string | number, extraction: "whole" | "single-number"): number | null {
  if (typeof answer === "number") return Number.isFinite(answer) ? answer : null;
  const text = answer.trim();
  if (text.length === 0) return null;
  if (extraction === "whole") {
    const parsed = Number(text);
    return Number.isFinite(parsed) ? parsed : null;
  }
  const matches = text.match(NUMBER_PATTERN) ?? [];
  if (matches.length !== 1) return null;
  const parsed = Number(matches[0]);
  return Number.isFinite(parsed) ? parsed : null;
}

function matchAnswer(
  matcher: BenchmarkAnswerMatcher,
  answer: string | number | null | undefined
): { valid: boolean; passed: boolean; message: string } {
  if (answer === null || answer === undefined) return { valid: false, passed: false, message: "Answer is missing." };
  if (matcher.kind === "exact") {
    if (typeof answer !== "string") return { valid: false, passed: false, message: "Expected a text answer." };
    return { valid: true, passed: answer === matcher.expected, message: answer === matcher.expected ? "Exact answer matched." : "Exact answer did not match." };
  }
  if (matcher.kind === "normalized") {
    if (typeof answer !== "string") return { valid: false, passed: false, message: "Expected a text answer." };
    const passed = normalizeAnswer(answer, matcher.caseSensitive ?? false)
      === normalizeAnswer(matcher.expected, matcher.caseSensitive ?? false);
    return { valid: true, passed, message: passed ? "Normalized answer matched." : "Normalized answer did not match." };
  }
  if (matcher.kind !== "numeric" || !Number.isFinite(matcher.expected)) {
    throw new Error("Invalid benchmark answer matcher.");
  }
  const actual = numericCandidate(answer, matcher.extraction ?? "whole");
  if (actual === null) return { valid: false, passed: false, message: "Expected exactly one finite numeric answer." };
  const absoluteTolerance = matcher.absoluteTolerance ?? 0;
  const relativeTolerance = matcher.relativeTolerance ?? 0;
  if (!Number.isFinite(absoluteTolerance) || absoluteTolerance < 0
    || !Number.isFinite(relativeTolerance) || relativeTolerance < 0) {
    throw new Error("Invalid numeric tolerance.");
  }
  const tolerance = absoluteTolerance + relativeTolerance * Math.abs(matcher.expected);
  const passed = Math.abs(actual - matcher.expected) <= tolerance;
  return { valid: true, passed, message: passed ? "Numeric answer is within tolerance." : "Numeric answer is outside tolerance." };
}

export function evaluateBenchmarkCase(
  benchmarkCase: BenchmarkCase,
  evidence: BenchmarkExecutionEvidence
): BenchmarkCaseResult {
  const durationMs = typeof evidence.durationMs === "number" && Number.isFinite(evidence.durationMs) && evidence.durationMs >= 0
    ? evidence.durationMs
    : 0;
  const base = { caseId: benchmarkCase.id, caseVersion: benchmarkCase.version, assertions: [], durationMs };
  if (evidence.status === "incomplete") return { ...base, outcome: "incomplete" };
  if (evidence.status === "unsupported") return { ...base, outcome: "unsupported", error: evidence.error };
  if (evidence.status === "pending-review") return { ...base, outcome: "pending-review", error: evidence.error };
  if (evidence.status === "error") {
    return { ...base, outcome: "infrastructure-error", error: evidence.error ?? "Benchmark execution failed." };
  }

  try {
    const answer = matchAnswer(benchmarkCase.oracle.answer, evidence.answer);
    const assertions: BenchmarkAssertionResult[] = [{ id: "answer", passed: answer.passed, message: answer.message }];
    if (!answer.valid) return { ...base, outcome: "invalid-output", assertions };

    const tools = new Set(evidence.tools ?? []);
    const required = benchmarkCase.oracle.requiredTools ?? [];
    if (required.length > 0) {
      const missing = required.filter((tool) => !tools.has(tool));
      assertions.push({
        id: "required-tools",
        passed: missing.length === 0,
        message: missing.length === 0 ? "All required tools were used." : `Missing required tools: ${missing.join(", ")}.`
      });
    }
    const forbidden = benchmarkCase.oracle.forbiddenTools ?? [];
    if (forbidden.length > 0) {
      const used = forbidden.filter((tool) => tools.has(tool));
      assertions.push({
        id: "forbidden-tools",
        passed: used.length === 0,
        message: used.length === 0 ? "No forbidden tools were used." : `Forbidden tools used: ${used.join(", ")}.`
      });
    }
    for (const matcher of benchmarkCase.oracle.canvasObjects ?? []) {
      const matches = (evidence.canvasObjects ?? []).filter((object) => {
        if (matcher.type !== undefined && object.type !== matcher.type) return false;
        if (matcher.label !== undefined && object.label !== matcher.label) return false;
        if (matcher.definitionIncludes !== undefined
          && !(object.definition ?? "").includes(matcher.definitionIncludes)) return false;
        return true;
      });
      const ambiguous = (matcher.cardinality ?? "exactly-one") === "exactly-one" && matches.length > 1;
      const passed = (matcher.cardinality ?? "exactly-one") === "at-least-one"
        ? matches.length >= 1
        : matches.length === 1;
      assertions.push({
        id: `canvas-object:${matcher.id}`,
        passed,
        ...(ambiguous ? { ambiguous: true } : {}),
        message: passed
          ? "Canvas object matched."
          : ambiguous
            ? `Canvas object matcher is ambiguous (${matches.length} matches).`
            : "Canvas object was not found."
      });
    }
    const hasAmbiguity = assertions.some((entry) => entry.ambiguous);
    return {
      ...base,
      outcome: assertions.every((entry) => entry.passed) ? "passed" : hasAmbiguity ? "pending-review" : "failed",
      assertions
    };
  } catch (error) {
    return {
      ...base,
      outcome: "evaluator-error",
      error: error instanceof Error ? error.message : String(error)
    };
  }
}

export interface BenchmarkSummary {
  totalCases: number;
  attemptedCases: number;
  evaluatedCases: number;
  passedCases: number;
  failedCases: number;
  incompleteCases: number;
  unsupportedCases: number;
  pendingReviewCases: number;
  infrastructureErrorCases: number;
  evaluatorErrorCases: number;
  coverage: number;
  attemptCoverage: number;
  score: number;
}

export function summarizeBenchmarkResults(
  results: BenchmarkCaseResult[],
  totalCases: number
): BenchmarkSummary {
  const safeTotal = Number.isInteger(totalCases) && totalCases >= 0 ? totalCases : 0;
  const passedCases = results.filter((entry) => entry.outcome === "passed").length;
  const failedCases = results.filter((entry) => entry.outcome === "failed" || entry.outcome === "invalid-output").length;
  const incompleteCases = results.filter((entry) => entry.outcome === "incomplete").length;
  const unsupportedCases = results.filter((entry) => entry.outcome === "unsupported").length;
  const pendingReviewCases = results.filter((entry) => entry.outcome === "pending-review").length;
  const infrastructureErrorCases = results.filter((entry) => entry.outcome === "infrastructure-error").length;
  const evaluatorErrorCases = results.filter((entry) => entry.outcome === "evaluator-error").length;
  const evaluatedCases = passedCases + failedCases;
  const attemptedCases = results.length;
  return {
    totalCases: safeTotal,
    attemptedCases,
    evaluatedCases,
    passedCases,
    failedCases,
    incompleteCases,
    unsupportedCases,
    pendingReviewCases,
    infrastructureErrorCases,
    evaluatorErrorCases,
    coverage: safeTotal === 0 ? 0 : evaluatedCases / safeTotal,
    attemptCoverage: safeTotal === 0 ? 0 : attemptedCases / safeTotal,
    score: evaluatedCases === 0 ? 0 : passedCases / evaluatedCases
  };
}
