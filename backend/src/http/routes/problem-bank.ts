import type { ProblemSetListResponse } from "@geochat-ai/app";
import type { ProblemListFilters } from "../../db/problem-bank-repository";
import { problemCasesRootFromUrl as resolveProblemCasesRootFromUrl } from "../../problem-cases";
import type { BackendHttpContext } from "../context";
import {
  problemAttemptPath,
  problemDetailPath,
  problemSetProblemsPath
} from "../paths";
import { json, readJson } from "../response";
import type { DataScopeResolver } from "../scope";

export async function handleProblemBankRoute(
  request: Request,
  url: URL,
  context: BackendHttpContext,
  authenticatedDataScope: DataScopeResolver
) {
  const problemBankRepository = context.repositories.problemBank;
  const conversationRepository = context.repositories.conversations;

  if (request.method === "POST" && url.pathname === "/v1/problem-bank/import") {
    return json(await problemBankRepository.importFromCases(problemCasesRootFromUrl(url, context)));
  }

  if (request.method === "GET" && url.pathname === "/v1/problem-sets") {
    await problemBankRepository.ensureSeeded(problemCasesRootFromUrl(url, context));
    return json({ sets: await problemBankRepository.listProblemSets() } satisfies ProblemSetListResponse);
  }

  const problemSetPath = problemSetProblemsPath(url.pathname);
  if (request.method === "GET" && problemSetPath) {
    await problemBankRepository.ensureSeeded(problemCasesRootFromUrl(url, context));
    return json(await problemBankRepository.listProblemsForSet(problemSetPath, problemListFiltersFromUrl(url)));
  }

  const problemId = problemDetailPath(url.pathname);
  if (request.method === "GET" && problemId) {
    await problemBankRepository.ensureSeeded(problemCasesRootFromUrl(url, context));
    const problem = await problemBankRepository.getProblemDetail(problemId);
    if (!problem) return json({ error: "not_found", message: "Problem was not found." }, { status: 404 });
    return json({ problem });
  }

  const attemptProblemId = problemAttemptPath(url.pathname);
  if (request.method === "POST" && attemptProblemId) {
    const dataScope = await authenticatedDataScope(request);
    if ("response" in dataScope) return dataScope.response;
    const payload = (await readJson(request)) as { conversationId?: unknown; runId?: unknown; modelProvider?: unknown; modelId?: unknown } | undefined;
    if (typeof payload?.conversationId !== "string" || !payload.conversationId.trim()) {
      return json({ error: "invalid_request", message: "conversationId is required." }, { status: 400 });
    }
    const conversation = await conversationRepository.getConversationDetail(payload.conversationId, dataScope.scope);
    if (!conversation) return json({ error: "not_found", message: "Conversation was not found." }, { status: 404 });
    const attempt = await problemBankRepository.recordProblemAttempt(attemptProblemId, {
      conversationId: payload.conversationId,
      ownerUserId: dataScope.scope.ownerUserId,
      runId: typeof payload.runId === "string" ? payload.runId : null,
      modelProvider: typeof payload.modelProvider === "string" ? payload.modelProvider : null,
      modelId: typeof payload.modelId === "string" ? payload.modelId : null
    });
    if (!attempt) return json({ error: "not_found", message: "Problem was not found." }, { status: 404 });
    return json(attempt, { status: 201 });
  }

  return undefined;
}

function problemCasesRootFromUrl(url: URL, context: BackendHttpContext) {
  return resolveProblemCasesRootFromUrl(url, {
    defaultRoot: context.resources.problemCasesDefaultRoot,
    env: { GEOCHAT_PROBLEM_CASES_DIR: Bun.env.GEOCHAT_PROBLEM_CASES_DIR }
  });
}

function problemListFiltersFromUrl(url: URL): ProblemListFilters {
  return {
    query: url.searchParams.get("query")?.trim() || undefined,
    difficulty: url.searchParams.get("difficulty")?.trim() || undefined,
    questionType: url.searchParams.get("questionType")?.trim() || undefined,
    year: url.searchParams.get("year")?.trim() || undefined,
    paper: url.searchParams.get("paper")?.trim() || undefined,
    topic: url.searchParams.get("topic")?.trim() || undefined,
    taskType: url.searchParams.get("taskType")?.trim() || undefined,
    visualOnly: url.searchParams.get("visualOnly") === "true",
    limit: clampNumber(Number(url.searchParams.get("limit") ?? 40), 1, 120),
    offset: clampNumber(Number(url.searchParams.get("offset") ?? 0), 0, 20_000)
  };
}

function clampNumber(value: number, min: number, max: number) {
  if (!Number.isFinite(value)) return min;
  return Math.min(Math.max(Math.trunc(value), min), max);
}
