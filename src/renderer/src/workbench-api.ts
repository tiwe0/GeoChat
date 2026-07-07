import type {
  BlackboardEntry,
  CloudProblemBankIndexResponse,
  CloudProblemBankProblemPageResponse,
  CloudProblemRecord,
  DesktopConversationBlackboardResponse,
  DesktopConversationDetailResponse,
  DesktopConversationListResponse,
  DesktopConversationSummary,
  HealthStatus,
  ProblemDetail,
  ProblemListResponse,
  ProblemSetSummary,
  RuntimeInfo,
  AgentModelRegistrySchema
} from "@geochat-ai/app";
import {
  cloudProblemBankSummaryToProblemSetSummary,
  cloudProblemRecordToProblemDetail,
  cloudProblemSummaryToProblemSummary,
  normalizeAgentModelRegistrySchema
} from "@geochat-ai/app";
import type { ProblemBankFilters } from "./problem-bank-utils";
import { readCachedCloudProblemJson, writeCachedCloudProblemJson } from "./problem-bank-cache";
import type { DesktopChatMessage } from "./workbench-types";

export type DesktopDebugAction =
  | {
      id: string;
      type: "get_ui_status";
    }
  | {
      id: string;
      type: "export_png";
      exportScale?: number;
      transparent?: boolean;
      dpi?: number;
    }
  | {
      id: string;
      type: "send_message";
      conversationId?: string;
      content: string;
    }
  | {
      id: string;
      type: "select_problem";
      conversationId?: string;
      source?: "local" | "cloud";
      cloudBaseUrl?: string;
      bankSlug?: string;
      problemApiPath?: string | null;
      problemId: string;
      mode: "show" | "draft" | "send";
    };

export type ProblemListSource = {
  source?: "local" | "cloud";
  backendBaseUrl: string;
  backendAuthToken?: string;
  setId: string;
  cloudBaseUrl?: string;
  bankSlug?: string;
  cursor?: string;
  filters: ProblemBankFilters;
};

export type ProblemDetailSource = {
  source?: "local" | "cloud";
  backendBaseUrl: string;
  backendAuthToken?: string;
  cloudBaseUrl?: string;
  bankSlug?: string;
  problemApiPath?: string | null;
  id: string;
};

const CLOUD_PROBLEM_BANK_TIMEOUT_MS = 2500;
const CLOUD_MODEL_REGISTRY_TIMEOUT_MS = 2500;

export function desktopHeaders(runtime?: Pick<RuntimeInfo, "backendAuthToken">): HeadersInit {
  return runtime?.backendAuthToken ? { authorization: `Bearer ${runtime.backendAuthToken}` } : {};
}

function desktopJsonHeaders(runtime?: Pick<RuntimeInfo, "backendAuthToken">): HeadersInit {
  return { "content-type": "application/json", ...desktopHeaders(runtime) };
}

export async function fetchHealth(runtime: RuntimeInfo | undefined) {
  if (!runtime) return undefined;
  const response = await fetch(`${runtime.backendBaseUrl}/health`, { headers: desktopHeaders(runtime) });
  if (!response.ok) throw new Error(`Backend health check failed: ${response.status}`);
  return (await response.json()) as HealthStatus;
}

export async function fetchConversations(runtime: RuntimeInfo | undefined) {
  if (!runtime) return [] satisfies DesktopConversationSummary[];
  const response = await fetch(`${runtime.backendBaseUrl}/v1/conversations`, { headers: desktopHeaders(runtime) });
  if (!response.ok) throw new Error(`Conversations failed: ${response.status}`);
  const payload = (await response.json()) as DesktopConversationListResponse;
  return payload.conversations;
}

export async function fetchConversationDetail(runtime: RuntimeInfo | undefined, conversationId: string) {
  if (!runtime) return undefined;
  const response = await fetch(`${runtime.backendBaseUrl}/v1/conversations/${encodeURIComponent(conversationId)}`, { headers: desktopHeaders(runtime) });
  if (!response.ok) throw new Error(`Conversation detail failed: ${response.status}`);
  const payload = (await response.json()) as DesktopConversationDetailResponse;
  return payload.conversation;
}

export async function fetchConversationBlackboard(runtime: RuntimeInfo | undefined, conversationId: string) {
  if (!runtime) return [] satisfies BlackboardEntry[];
  const response = await fetch(`${runtime.backendBaseUrl}/v1/conversations/${encodeURIComponent(conversationId)}/blackboard?limit=30`, { headers: desktopHeaders(runtime) });
  if (response.status === 404) return [] satisfies BlackboardEntry[];
  if (!response.ok) throw new Error(`Conversation blackboard failed: ${response.status}`);
  const payload = (await response.json()) as DesktopConversationBlackboardResponse;
  return payload.entries;
}

export async function upsertConversationMessage(runtime: RuntimeInfo | undefined, conversationId: string, message: DesktopChatMessage) {
  if (!runtime) return undefined;
  const response = await fetch(`${runtime.backendBaseUrl}/v1/conversations/${encodeURIComponent(conversationId)}/messages`, {
    method: "POST",
    headers: desktopJsonHeaders(runtime),
    body: JSON.stringify({
      conversationId,
      message: {
        id: message.id,
        role: message.role,
        content: message.content,
        createdAt: storageTimestampForMessage(message),
        payload: message
      }
    })
  });
  if (!response.ok) throw new Error(`Conversation message save failed: ${response.status}`);
  return ((await response.json()) as DesktopConversationDetailResponse).conversation;
}

function storageTimestampForMessage(message: DesktopChatMessage) {
  if (message.createdAtIso) return message.createdAtIso;
  const parsed = Date.parse(message.createdAt);
  return Number.isFinite(parsed) ? new Date(parsed).toISOString() : new Date().toISOString();
}

export async function deleteConversationRemote(runtime: RuntimeInfo | undefined, conversationId: string) {
  if (!runtime) return;
  const response = await fetch(`${runtime.backendBaseUrl}/v1/conversations/${encodeURIComponent(conversationId)}`, {
    method: "DELETE",
    headers: desktopHeaders(runtime)
  });
  if (!response.ok && response.status !== 404) throw new Error(`Conversation delete failed: ${response.status}`);
}

export async function fetchProblemSets(runtime: RuntimeInfo | undefined) {
  return fetchCloudProblemSets();
}

export async function fetchCloudModelRegistrySchema(): Promise<AgentModelRegistrySchema | undefined> {
  const cloudBaseUrl = modelRegistryCloudBaseUrl();
  if (!cloudBaseUrl) return undefined;
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), CLOUD_MODEL_REGISTRY_TIMEOUT_MS);
  try {
    const response = await fetch(`${cloudBaseUrl}/model-registry/schema`, {
      signal: controller.signal,
      headers: { accept: "application/json" }
    });
    if (!response.ok) return undefined;
    const payload = await response.json() as unknown;
    return normalizeAgentModelRegistrySchema(payload);
  } catch {
    return undefined;
  } finally {
    window.clearTimeout(timeout);
  }
}

async function fetchCloudProblemSets() {
  const cloudBaseUrl = problemBankCloudBaseUrl();
  if (!cloudBaseUrl) return [] satisfies ProblemSetSummary[];
  const payload = await fetchCloudJson<CloudProblemBankIndexResponse>(cloudBaseUrl, "/problem-bank/v1/index");
  return payload.banks.map((bank) => cloudProblemBankSummaryToProblemSetSummary(bank, { releaseId: payload.releaseId, releaseChannel: payload.channel, cloudBaseUrl }));
}

export function encodeProblemListSource(source: ProblemListSource) {
  return JSON.stringify(source);
}

export function decodeProblemListSource(source: string): ProblemListSource {
  return JSON.parse(source) as ProblemListSource;
}

export function encodeProblemDetailSource(source: ProblemDetailSource) {
  return JSON.stringify(source);
}

export function decodeProblemDetailSource(source: string): ProblemDetailSource {
  return JSON.parse(source) as ProblemDetailSource;
}

export async function fetchProblems(input: ProblemListSource) {
  if (input.source !== "cloud") {
    return emptyProblemList("cloud");
  }
  return fetchCloudProblems(input);
}

export async function fetchProblemDetail(source: ProblemDetailSource) {
  if (source.source !== "cloud") {
    throw new Error("Local bundled problem banks are no longer included in the desktop app.");
  }
  return fetchCloudProblemDetail(source);
}

async function fetchCloudProblems(input: ProblemListSource): Promise<ProblemListResponse> {
  const cloudBaseUrl = input.cloudBaseUrl || problemBankCloudBaseUrl();
  if (!cloudBaseUrl || !input.bankSlug) {
    throw new Error("Cloud problem-bank source is incomplete.");
  }
  const params = cloudProblemParams(input.filters);
  if (input.cursor) params.set("cursor", input.cursor);
  const payload = await fetchCloudJson<CloudProblemBankProblemPageResponse>(
    cloudBaseUrl,
    `/problem-bank/v1/banks/${encodeURIComponent(input.bankSlug)}/problems?${params}`,
  );
  const problems = payload.items
    .map((row) => cloudProblemSummaryToProblemSummary(row, input.bankSlug))
    .filter((problem) => matchesProblemFilters(problem, input.filters))
    .slice(0, 80);
  return {
    problems,
    total: problems.length,
    limit: 80,
    offset: 0,
    source: "cloud",
    nextCursor: payload.nextCursor
  };
}

function cloudProblemParams(filters: ProblemBankFilters) {
  const params = new URLSearchParams();
  params.set("limit", "80");
  if (filters.query.trim()) params.set("query", filters.query.trim());
  if (filters.difficulty !== "all") params.set("difficulty", filters.difficulty);
  if (filters.questionType === "mcq" || filters.questionType === "open_ended") params.set("questionType", filters.questionType);
  if (filters.year !== "all") params.set("year", filters.year);
  if (filters.paper !== "all") params.set("paper", filters.paper);
  if (filters.visualOnly) params.set("hasMedia", "true");
  return params;
}

async function fetchCloudProblemDetail(source: ProblemDetailSource): Promise<ProblemDetail> {
  const cloudBaseUrl = source.cloudBaseUrl || problemBankCloudBaseUrl();
  if (!cloudBaseUrl) throw new Error("Cloud problem-bank base URL is not configured.");
  const path = source.problemApiPath || `/problem-bank/v1/problems/${encodeURIComponent(source.id)}`;
  const record = await fetchCloudJson<CloudProblemRecord>(cloudBaseUrl, path);
  return cloudProblemRecordToProblemDetail(record, source.bankSlug);
}

async function fetchCloudJson<T>(baseUrl: string, path: string): Promise<T> {
  const url = `${baseUrl.replace(/\/+$/, "")}${path.startsWith("/") ? path : `/${path}`}`;
  const cacheKey = cloudProblemJsonCacheKey(url);
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), CLOUD_PROBLEM_BANK_TIMEOUT_MS);
  let authorizationFailure = false;
  try {
    const response = await fetch(url, {
      signal: controller.signal,
    });
    if (!response.ok) {
      const error = new Error(`Cloud problem bank failed: ${response.status}`);
      authorizationFailure = response.status === 401 || response.status === 403 || response.status === 404;
      throw error;
    }
    const payload = (await response.json()) as T;
    void writeCachedCloudProblemJson(cacheKey, payload);
    return payload;
  } catch (error) {
    if (authorizationFailure) throw error;
    const cached = await readCachedCloudProblemJson<T>(cacheKey);
    if (cached) return cached;
    throw error;
  } finally {
    window.clearTimeout(timeout);
  }
}

function cloudProblemJsonCacheKey(url: string) {
  return `public:${url}`;
}

function problemBankCloudBaseUrl() {
  const configured = import.meta.env.VITE_GEOCHAT_PROBLEM_BANK_API_BASE_URL?.trim();
  if (configured === "disabled" || configured === "off") return "";
  return configured ? configured.replace(/\/+$/, "") : "";
}

function modelRegistryCloudBaseUrl() {
  const configured = import.meta.env.VITE_GEOCHAT_MODEL_REGISTRY_API_BASE_URL?.trim();
  if (configured === "disabled" || configured === "off") return "";
  return configured ? configured.replace(/\/+$/, "") : "";
}

function emptyProblemList(source: ProblemListResponse["source"]): ProblemListResponse {
  return {
    problems: [],
    total: 0,
    limit: 80,
    offset: 0,
    source
  };
}

function matchesProblemFilters(problem: ProblemDetail | ProblemListResponse["problems"][number], filters: ProblemBankFilters): boolean {
  if (filters.visualOnly && !problem.visualPotential) return false;
  if (filters.difficulty !== "all" && problem.difficulty !== filters.difficulty) return false;
  if (filters.questionType !== "all" && problem.questionType !== filters.questionType) return false;
  if (filters.year !== "all" && problem.year !== filters.year) return false;
  if (filters.paper !== "all" && problem.paper !== filters.paper) return false;
  const query = filters.query.trim().toLowerCase();
  if (!query) return true;
  const haystack = [
    problem.id,
    problem.title,
    problem.prompt,
    problem.category,
    ...problem.tags,
    ...problem.topics
  ].filter(Boolean).join("\n").toLowerCase();
  return haystack.includes(query);
}

export function desktopMcpHttpBase(endpoint: string | null | undefined) {
  return endpoint?.replace(/\/mcp\/?$/, "") ?? "";
}

export async function fetchNextDesktopDebugAction(endpoint: string, authToken?: string) {
  const response = await fetch(`${desktopMcpHttpBase(endpoint)}/debug-actions/next`, {
    headers: desktopHeaders({ backendAuthToken: authToken })
  });
  if (!response.ok) throw new Error(`MCP debug action poll failed: ${response.status}`);
  const payload = await response.json() as { action?: DesktopDebugAction | null };
  return payload.action ?? null;
}

export async function reportDesktopDebugAction(endpoint: string, id: string, payload: { ok: boolean; result?: unknown; error?: string }, authToken?: string) {
  await fetch(`${desktopMcpHttpBase(endpoint)}/debug-actions/${encodeURIComponent(id)}/result`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...desktopHeaders({ backendAuthToken: authToken }) },
    body: JSON.stringify(payload)
  }).catch(() => undefined);
}
