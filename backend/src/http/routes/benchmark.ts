import type {
  BenchmarkCaseResultStatus,
  BenchmarkEvidenceRef,
  BenchmarkJsonObject,
  BenchmarkRepositoryResult
} from "../../db/benchmark-repository";
import type { BackendHttpContext } from "../context";
import { benchmarkRunActionPath, benchmarkRunPath, benchmarkRunResultsPath } from "../paths";
import { json, readJson } from "../response";
import type { DataScopeResolver } from "../scope";

export async function handleBenchmarkRoute(
  request: Request,
  url: URL,
  context: BackendHttpContext,
  authenticatedDataScope: DataScopeResolver
) {
  if (!url.pathname.startsWith("/v1/benchmark-runs")) return undefined;

  const dataScope = await authenticatedDataScope(request);
  if ("response" in dataScope) return dataScope.response;
  const repository = context.repositories.benchmarks;
  const repositoryScope = { ownerUserId: dataScope.scope.ownerUserId };

  if (request.method === "GET" && url.pathname === "/v1/benchmark-runs") {
    const limit = clampInteger(Number(url.searchParams.get("limit") ?? 50), 1, 200);
    return json({ runs: await repository.listRuns({ ...repositoryScope, limit }) });
  }

  if (request.method === "POST" && url.pathname === "/v1/benchmark-runs") {
    const payload = await readJson(request);
    if (containsCredential(payload)) return credentialNotAllowed();
    const input = parseCreateRunInput(payload);
    if (!input) return invalidRequest("suiteId, suiteVersion, suiteHash, configHash, totalCases, and config are required.");
    const run = await repository.createRun({ ...input, ownerUserId: dataScope.scope.ownerUserId });
    return json({ run }, { status: 201 });
  }

  const resultsRunId = benchmarkRunResultsPath(url.pathname);
  if (request.method === "POST" && resultsRunId) {
    const payload = await readJson(request);
    if (containsCredential(payload)) return credentialNotAllowed();
    const input = parseCaseResultInput(payload);
    if (!input) return invalidRequest("caseId and a supported result status are required.");
    return repositoryResultResponse(await repository.upsertCaseResult(resultsRunId, input, repositoryScope), (value) => value);
  }

  const action = benchmarkRunActionPath(url.pathname);
  if (request.method === "POST" && action) {
    const payload = request.body ? await readJson(request) ?? {} : {};
    if (containsCredential(payload)) return credentialNotAllowed();
    const finishInput = parseFinishInput(action.action, payload);
    if (!finishInput) return invalidRequest("metrics and evidenceRefs must use the benchmark JSON format.");
    return repositoryResultResponse(await repository.finishRun(action.runId, finishInput, repositoryScope), (run) => ({ run }));
  }

  const runId = benchmarkRunPath(url.pathname);
  if (request.method === "GET" && runId) {
    const detail = await repository.getRun(runId, repositoryScope);
    return detail
      ? json(detail)
      : json({ error: "not_found", message: "Benchmark run was not found." }, { status: 404 });
  }

  return undefined;
}

function parseCreateRunInput(value: unknown) {
  if (!isObject(value)) return undefined;
  const suiteId = nonEmptyString(value.suiteId);
  const suiteVersion = nonEmptyString(value.suiteVersion);
  const suiteHash = nonEmptyString(value.suiteHash);
  const configHash = nonEmptyString(value.configHash);
  const config = jsonObject(value.config);
  if (!suiteId || !suiteVersion || !suiteHash || !configHash || !config) return undefined;
  if (!Number.isInteger(value.totalCases) || (value.totalCases as number) < 0 || (value.totalCases as number) > 100_000) return undefined;
  return { suiteId, suiteVersion, suiteHash, configHash, totalCases: value.totalCases as number, config };
}

function parseCaseResultInput(value: unknown) {
  if (!isObject(value)) return undefined;
  const caseId = nonEmptyString(value.caseId);
  const status = isCaseResultStatus(value.status) ? value.status : undefined;
  const metrics = value.metrics === undefined ? {} : jsonObject(value.metrics);
  const evidenceRefs = value.evidenceRefs === undefined ? [] : parseEvidenceRefs(value.evidenceRefs);
  if (!caseId || !status || !metrics || !evidenceRefs) return undefined;
  if (value.score !== undefined && value.score !== null &&
      (typeof value.score !== "number" || !Number.isFinite(value.score) || value.score < 0 || value.score > 1)) return undefined;
  if (value.error !== undefined && value.error !== null && typeof value.error !== "string") return undefined;
  if (value.startedAt !== undefined && value.startedAt !== null && !isIsoDate(value.startedAt)) return undefined;
  if (value.completedAt !== undefined && !isIsoDate(value.completedAt)) return undefined;
  if (typeof value.startedAt === "string" && typeof value.completedAt === "string" &&
      Date.parse(value.completedAt) < Date.parse(value.startedAt)) return undefined;
  return {
    caseId,
    status,
    score: value.score as number | null | undefined,
    metrics,
    evidenceRefs,
    error: value.error as string | null | undefined,
    startedAt: value.startedAt as string | null | undefined,
    completedAt: value.completedAt as string | undefined
  };
}

function parseFinishInput(action: "complete" | "cancel" | "fail" | "interrupt", value: unknown) {
  if (!isObject(value)) return undefined;
  const metrics = value.metrics === undefined ? {} : jsonObject(value.metrics);
  const evidenceRefs = value.evidenceRefs === undefined ? [] : parseEvidenceRefs(value.evidenceRefs);
  if (!metrics || !evidenceRefs) return undefined;
  if (value.error !== undefined && value.error !== null && typeof value.error !== "string") return undefined;
  return {
    status: action === "complete" ? "completed" as const
      : action === "cancel" ? "cancelled" as const
        : action === "fail" ? "failed" as const
          : "interrupted" as const,
    metrics,
    evidenceRefs,
    error: value.error as string | null | undefined
  };
}

function repositoryResultResponse<T>(
  result: BenchmarkRepositoryResult<T>,
  serialize: (value: T) => unknown
) {
  if (result.ok) return json(serialize(result.value));
  if (result.reason === "not_found") {
    return json({ error: "not_found", message: "Benchmark run was not found." }, { status: 404 });
  }
  if (result.reason === "incomplete") {
    return json({ error: "incomplete", message: "All benchmark cases must have a result before completion." }, { status: 409 });
  }
  if (result.reason === "case_limit_exceeded") {
    return json({ error: "case_limit_exceeded", message: "The benchmark run already contains its declared number of case results." }, { status: 409 });
  }
  return json({ error: "invalid_state", message: "The benchmark run is already terminal." }, { status: 409 });
}

function parseEvidenceRefs(value: unknown): BenchmarkEvidenceRef[] | undefined {
  if (!Array.isArray(value) || value.length > 500) return undefined;
  const refs: BenchmarkEvidenceRef[] = [];
  for (const item of value) {
    if (!isObject(item)) return undefined;
    const type = nonEmptyString(item.type);
    const uri = nonEmptyString(item.uri);
    const label = item.label === undefined ? undefined : nonEmptyString(item.label);
    if (!type || !uri || (item.label !== undefined && !label)) return undefined;
    refs.push({ type, uri, ...(label ? { label } : {}) });
  }
  return refs;
}

function containsCredential(value: unknown): boolean {
  if (Array.isArray(value)) return value.some(containsCredential);
  if (!isObject(value)) return false;
  return Object.entries(value).some(([key, child]) =>
    /^(api[-_]?key|authorization|password|secret|access[-_]?token|refresh[-_]?token|cookie)$/i.test(key)
      || containsCredential(child)
  );
}

function isCaseResultStatus(value: unknown): value is BenchmarkCaseResultStatus {
  return value === "passed" || value === "failed" || value === "error" || value === "skipped";
}

function jsonObject(value: unknown): BenchmarkJsonObject | undefined {
  return isObject(value) ? value : undefined;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function nonEmptyString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function isIsoDate(value: unknown) {
  return typeof value === "string" && Number.isFinite(Date.parse(value));
}

function clampInteger(value: number, min: number, max: number) {
  if (!Number.isFinite(value)) return min;
  return Math.min(Math.max(Math.trunc(value), min), max);
}

function invalidRequest(message: string) {
  return json({ error: "invalid_request", message }, { status: 400 });
}

function credentialNotAllowed() {
  return json({
    error: "credential_not_allowed",
    message: "Benchmark records must reference model configuration without embedding credentials."
  }, { status: 400 });
}
