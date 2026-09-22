import type { ProblemImportResponse, ProblemSetListResponse, ProblemSetSummary } from "@geochat-ai/app";

function problemBankHeaders(token: string | null): Record<string, string> {
  const headers: Record<string, string> = { "x-client-channel": "desktop-workbench" };
  if (token) headers.Authorization = `Bearer ${token}`;
  return headers;
}

function responseMessage(value: unknown, fallback: string) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return fallback;
  const data = value as Record<string, unknown>;
  if (typeof data.message === "string" && data.message.trim()) return data.message;
  if (typeof data.error === "string" && data.error.trim()) return data.error;
  return fallback;
}

function isProblemSetSummary(value: unknown): value is ProblemSetSummary {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const data = value as Record<string, unknown>;
  return typeof data.id === "string"
    && typeof data.slug === "string"
    && typeof data.title === "string"
    && typeof data.description === "string"
    && ["curated", "generated", "imported", "eval"].includes(String(data.kind))
    && typeof data.problemCount === "number"
    && Number.isFinite(data.problemCount);
}

export function parseProblemSetList(value: unknown): ProblemSetListResponse {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Invalid problem-set response.");
  }
  const sets = (value as Record<string, unknown>).sets;
  if (!Array.isArray(sets) || !sets.every(isProblemSetSummary)) {
    throw new Error("Invalid problem-set response.");
  }
  return { sets };
}

export function parseProblemImportResponse(value: unknown): ProblemImportResponse {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Invalid problem-bank import response.");
  }
  const data = value as Record<string, unknown>;
  if (
    typeof data.imported !== "number"
    || !Number.isFinite(data.imported)
    || typeof data.sets !== "number"
    || !Number.isFinite(data.sets)
    || typeof data.skipped !== "boolean"
  ) {
    throw new Error("Invalid problem-bank import response.");
  }
  return {
    imported: data.imported,
    sets: data.sets,
    skipped: data.skipped,
    ...(typeof data.sourcePath === "string" ? { sourcePath: data.sourcePath } : {}),
    ...(typeof data.message === "string" ? { message: data.message } : {}),
  };
}

export async function fetchProblemSets(
  apiOrigin: string,
  token: string | null,
  options: { signal?: AbortSignal; request?: typeof fetch } = {},
) {
  const response = await (options.request ?? fetch)(`${apiOrigin}/v1/problem-sets`, {
    cache: "no-store",
    headers: problemBankHeaders(token),
    signal: options.signal,
  });
  const data = await response.json() as unknown;
  if (!response.ok) throw new Error(responseMessage(data, "Unable to load the problem bank."));
  return parseProblemSetList(data);
}

export async function reindexProblemBank(
  apiOrigin: string,
  token: string | null,
  request: typeof fetch = fetch,
) {
  const response = await request(`${apiOrigin}/v1/problem-bank/import`, {
    method: "POST",
    headers: problemBankHeaders(token),
  });
  const data = await response.json() as unknown;
  if (!response.ok) throw new Error(responseMessage(data, "Unable to reindex the problem bank."));
  return parseProblemImportResponse(data);
}
