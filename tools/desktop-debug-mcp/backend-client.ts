import type { DesktopDebugMcpConfig } from "./config";

export type ProblemSearchInput = {
  setIdOrSlug?: string;
  query?: string;
  difficulty?: string;
  questionType?: string;
  year?: string;
  paper?: string;
  topic?: string;
  taskType?: string;
  visualOnly?: boolean;
  limit?: number;
  offset?: number;
};

export async function fetchProblemSets(config: DesktopDebugMcpConfig) {
  const payload = await getJson(config, "/v1/problem-sets");
  return (payload as { sets?: unknown[] }).sets ?? [];
}

export async function fetchProblems(config: DesktopDebugMcpConfig, input: ProblemSearchInput = {}) {
  const setIdOrSlug = input.setIdOrSlug?.trim() || await firstProblemSetId(config);
  if (!setIdOrSlug) return { problems: [], total: 0, limit: 0, offset: 0 };

  const params = new URLSearchParams();
  appendSearchParam(params, "query", input.query);
  appendSearchParam(params, "difficulty", input.difficulty);
  appendSearchParam(params, "questionType", input.questionType);
  appendSearchParam(params, "year", input.year);
  appendSearchParam(params, "paper", input.paper);
  appendSearchParam(params, "topic", input.topic);
  appendSearchParam(params, "taskType", input.taskType);
  if (input.visualOnly !== undefined) params.set("visualOnly", input.visualOnly ? "true" : "false");
  params.set("limit", String(input.limit ?? 20));
  params.set("offset", String(input.offset ?? 0));

  return getJson(config, `/v1/problem-sets/${encodeURIComponent(setIdOrSlug)}/problems?${params}`);
}

export async function fetchProblemDetail(config: DesktopDebugMcpConfig, problemId: string) {
  const payload = await getJson(config, `/v1/problems/${encodeURIComponent(problemId)}`);
  return (payload as { problem?: unknown }).problem;
}

async function firstProblemSetId(config: DesktopDebugMcpConfig) {
  const sets = await fetchProblemSets(config);
  const first = sets[0];
  return first && typeof first === "object" && "id" in first && typeof first.id === "string" ? first.id : undefined;
}

async function getJson(config: DesktopDebugMcpConfig, path: string) {
  const response = await fetch(`${config.backendBaseUrl}${path}`, {
    headers: config.backendAuthToken ? { authorization: `Bearer ${config.backendAuthToken}` } : undefined
  });
  if (!response.ok) {
    throw new Error(`Backend request failed: ${response.status} ${response.statusText}`);
  }
  return response.json();
}

function appendSearchParam(params: URLSearchParams, key: string, value: string | undefined) {
  const normalized = value?.trim();
  if (normalized) params.set(key, normalized);
}
