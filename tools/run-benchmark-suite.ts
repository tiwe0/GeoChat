import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import {
  evaluateBenchmarkCase,
  summarizeBenchmarkResults,
  validateBenchmarkSuite,
  type BenchmarkCaseOutcome,
  type BenchmarkCanvasObjectEvidence,
  type BenchmarkExecutionEvidence,
  type BenchmarkSuite
} from "@geochat-ai/app";

type JsonRpcResponse<T> = {
  result?: { structuredContent?: T; content?: Array<{ type: string; text: string }>; isError?: boolean };
  error?: unknown;
};

type Action = { id: string; status: "queued" | "claimed" | "succeeded" | "failed"; result?: unknown; error?: string };
type UiStatus = {
  model?: { provider?: string; model?: string; hasApiKey?: boolean };
  geogebra?: { ready?: boolean };
  mcp?: { running?: boolean };
  running?: boolean;
};

export type ConversationMessage = { role?: string; content?: string; createdAt?: string };
export type CanvasContextLike = { objects?: unknown[]; result?: { objects?: unknown[] } };

const mcpUrl = process.env.GEOCHAT_DESKTOP_MCP_URL ?? "http://127.0.0.1:17369/mcp";
const backendUrl = (process.env.GEOCHAT_DESKTOP_BACKEND_URL ?? "http://127.0.0.1:17365").replace(/\/$/, "");
const authToken = process.env.GEOCHAT_DESKTOP_MCP_AUTH_TOKEN
  ?? process.env.GEOCHAT_DESKTOP_BACKEND_AUTH_TOKEN
  ?? process.env.GEOCHAT_DESKTOP_LOCAL_AUTH_TOKEN;
const suitePath = resolve(process.env.GEOCHAT_BENCHMARK_SUITE ?? "benchmarks/core-v1/suite.json");
const outputPath = resolve(process.env.GEOCHAT_BENCHMARK_OUTPUT ?? ".artifacts/benchmarks/latest.json");
const selectedCaseIds = new Set((process.env.GEOCHAT_BENCHMARK_CASES ?? "").split(",").map((value) => value.trim()).filter(Boolean));
let requestId = 1;

function headers() {
  return { "content-type": "application/json", ...(authToken ? { authorization: `Bearer ${authToken}` } : {}) };
}

async function callTool<T>(name: string, args: Record<string, unknown>): Promise<T> {
  const response = await fetch(mcpUrl, {
    method: "POST",
    headers: { ...headers(), accept: "application/json, text/event-stream" },
    body: JSON.stringify({ jsonrpc: "2.0", id: requestId++, method: "tools/call", params: { name, arguments: args } })
  });
  if (!response.ok) throw new Error(`MCP HTTP ${response.status}: ${await response.text()}`);
  const payload = await response.json() as JsonRpcResponse<T>;
  if (payload.error) throw new Error(`MCP JSON-RPC error: ${JSON.stringify(payload.error)}`);
  if (payload.result?.isError) throw new Error(payload.result.content?.find((entry) => entry.type === "text")?.text ?? "MCP tool failed.");
  if (payload.result?.structuredContent) return payload.result.structuredContent;
  const text = payload.result?.content?.find((entry) => entry.type === "text")?.text;
  if (!text) throw new Error(`MCP tool ${name} returned no structured content.`);
  return JSON.parse(text) as T;
}

async function backend<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${backendUrl}${path}`, { ...init, headers: { ...headers(), ...init?.headers } });
  if (!response.ok) throw new Error(`Backend ${response.status} ${path}: ${await response.text()}`);
  return response.json() as Promise<T>;
}

async function waitForAction(actionId: string, timeoutMs = 60_000): Promise<Action> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const listed = await callTool<{ actions: Action[] }>("list_desktop_debug_actions", { limit: 200 });
    const action = listed.actions.find((entry) => entry.id === actionId);
    if (action?.status === "succeeded") return action;
    if (action?.status === "failed") throw new Error(action.error ?? `Desktop action ${actionId} failed.`);
    await Bun.sleep(500);
  }
  throw new Error(`Desktop action ${actionId} timed out after ${timeoutMs}ms.`);
}

async function executeDesktopTool<T>(name: string, args: Record<string, unknown> = {}, timeoutMs = 60_000): Promise<T> {
  const queued = await callTool<{ action: Action }>(name, args);
  return (await waitForAction(queued.action.id, timeoutMs)).result as T;
}

export function finalAssistantAnswer(messages: ConversationMessage[]): string | null {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    if (message?.role === "assistant" && typeof message.content === "string" && message.content.trim()) {
      return message.content.trim();
    }
  }
  return null;
}

export function canvasObjectEvidence(value: CanvasContextLike | null | undefined): BenchmarkCanvasObjectEvidence[] {
  const objects = Array.isArray(value?.objects) ? value.objects : Array.isArray(value?.result?.objects) ? value.result.objects : [];
  return objects.flatMap((entry) => {
    if (!entry || typeof entry !== "object") return [];
    const object = entry as Record<string, unknown>;
    const type = typeof object.type === "string" ? object.type : typeof object.objectType === "string" ? object.objectType : null;
    if (!type) return [];
    return [{
      type,
      ...(typeof object.label === "string" ? { label: object.label } : {}),
      ...(typeof object.definition === "string" ? { definition: object.definition }
        : typeof object.command === "string" ? { definition: object.command } : {})
    }];
  });
}

export function persistentResultStatus(outcome: BenchmarkCaseOutcome): "passed" | "failed" | "error" | "skipped" {
  if (outcome === "passed") return "passed";
  if (outcome === "failed" || outcome === "invalid-output") return "failed";
  if (outcome === "infrastructure-error" || outcome === "evaluator-error") return "error";
  return "skipped";
}

async function fingerprint(value: unknown) {
  const bytes = new TextEncoder().encode(JSON.stringify(value));
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return `sha256:${Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("")}`;
}

async function main() {
  const suite = JSON.parse(await readFile(suitePath, "utf8")) as BenchmarkSuite;
  const validation = validateBenchmarkSuite(suite);
  if (!validation.valid || !validation.contentHash) throw new Error(`Invalid benchmark suite: ${JSON.stringify(validation.issues)}`);
  const cases = selectedCaseIds.size ? suite.cases.filter((entry) => selectedCaseIds.has(entry.id)) : suite.cases;
  if (cases.length === 0) throw new Error("No benchmark cases were selected.");

  const diagnostics = await callTool<{ database?: { path?: unknown } }>("get_desktop_runtime_diagnostics", {});
  const databasePath = typeof diagnostics.database?.path === "string" ? diagnostics.database.path : "";
  const isolatedProfile = process.env.GEOCHAT_BENCHMARK_ALLOW_CANVAS_RESET === "1"
    || /(?:^|[/\\.\-_])benchmark(?:[/\\.\-_]|$)/i.test(databasePath);
  if (!isolatedProfile) {
    throw new Error(
      "Refusing to reset a non-benchmark desktop canvas. Start the current repository with an isolated benchmark user-data/database path, "
      + "or set GEOCHAT_BENCHMARK_ALLOW_CANVAS_RESET=1 for an explicitly disposable profile."
    );
  }

  const statusAction = await callTool<{ action: Action }>("get_desktop_ui_status", {});
  const status = (await waitForAction(statusAction.action.id)).result as UiStatus;
  if (!status?.model?.hasApiKey || !status.geogebra?.ready || !status.mcp?.running) {
    throw new Error(`Desktop is not benchmark-ready: ${JSON.stringify(status)}`);
  }
  const config = { mode: "desktop-mcp", provider: status.model.provider ?? "unknown", model: status.model.model ?? "unknown" };
  const created = await backend<{ run: { id: string } }>("/v1/benchmark-runs", {
    method: "POST",
    body: JSON.stringify({
      suiteId: suite.id,
      suiteVersion: suite.version,
      suiteHash: validation.contentHash,
      configHash: await fingerprint(config),
      totalCases: cases.length,
      config
    })
  });

  const results = [];
  try {
    for (const [index, benchmarkCase] of cases.entries()) {
      const startedAt = new Date().toISOString();
      const startedMs = Date.now();
      const conversationId = `benchmark-${created.run.id}-${String(index + 1).padStart(3, "0")}`;
      let evidence: BenchmarkExecutionEvidence;
      let runId: string | null = null;
      try {
        await executeDesktopTool("resetCanvas", {});
        const execution = await callTool<{
          ok?: boolean;
          completed?: boolean;
          timedOut?: boolean;
          conversationId?: string;
          runSummary?: { run?: { run_id?: unknown } };
          note?: string;
        }>("run_single_problem_test", {
          content: benchmarkCase.publicTask.prompt,
          conversationId,
          timeoutMs: benchmarkCase.limits?.timeoutMs ?? 180_000,
          pollIntervalMs: 750,
          includeSensitive: false
        });
        runId = typeof execution.runSummary?.run?.run_id === "string" ? execution.runSummary.run.run_id : null;
        if (!execution.completed || execution.timedOut || !execution.ok) {
          evidence = {
            status: execution.timedOut ? "incomplete" : "error",
            durationMs: Date.now() - startedMs,
            error: execution.note ?? "Desktop benchmark execution did not complete successfully."
          };
        } else {
          const detail = await backend<{ conversation: { messages?: ConversationMessage[] } }>(`/v1/conversations/${encodeURIComponent(execution.conversationId ?? conversationId)}`);
          const debug = runId ? await callTool<{ toolRequests?: Array<{ tool_name?: unknown }> }>("get_agent_run_debug_bundle", { runId }) : {};
          const canvas = await executeDesktopTool<CanvasContextLike>("getCanvasContext", {});
          evidence = {
            status: "complete",
            answer: finalAssistantAnswer(detail.conversation.messages ?? []),
            tools: (debug.toolRequests ?? []).flatMap((entry) => typeof entry.tool_name === "string" ? [entry.tool_name] : []),
            canvasObjects: canvasObjectEvidence(canvas),
            durationMs: Date.now() - startedMs
          };
        }
      } catch (error) {
        evidence = { status: "error", durationMs: Date.now() - startedMs, error: error instanceof Error ? error.message : String(error) };
      }

      const result = evaluateBenchmarkCase(benchmarkCase, evidence);
      results.push(result);
      await backend(`/v1/benchmark-runs/${encodeURIComponent(created.run.id)}/results`, {
        method: "POST",
        body: JSON.stringify({
          caseId: benchmarkCase.id,
          status: persistentResultStatus(result.outcome),
          score: result.outcome === "passed" ? 1 : result.outcome === "failed" || result.outcome === "invalid-output" ? 0 : null,
          metrics: { outcome: result.outcome, durationMs: result.durationMs, assertions: result.assertions },
          evidenceRefs: runId ? [{ type: "agent-run", uri: `geochat://agent-runs/${runId}` }] : [],
          error: result.error ?? null,
          startedAt,
          completedAt: new Date().toISOString()
        })
      });
      console.log(`[${index + 1}/${cases.length}] ${benchmarkCase.id}: ${result.outcome}`);
    }

    const summary = summarizeBenchmarkResults(results, cases.length);
    await backend(`/v1/benchmark-runs/${encodeURIComponent(created.run.id)}/complete`, {
      method: "POST",
      body: JSON.stringify({ metrics: summary, evidenceRefs: [{ type: "report", uri: outputPath }] })
    });
    const report = { schemaVersion: 1, runId: created.run.id, suiteId: suite.id, suiteVersion: suite.version, suiteHash: validation.contentHash, config, summary, results };
    await mkdir(dirname(outputPath), { recursive: true });
    await writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
    console.log(`Benchmark report written to ${outputPath}`);
    if (summary.failedCases > 0 || summary.infrastructureErrorCases > 0 || summary.evaluatorErrorCases > 0) process.exitCode = 1;
  } catch (error) {
    await backend(`/v1/benchmark-runs/${encodeURIComponent(created.run.id)}/fail`, {
      method: "POST",
      body: JSON.stringify({ error: error instanceof Error ? error.message : String(error) })
    }).catch(() => undefined);
    throw error;
  }
}

if (import.meta.main) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.stack : error);
    process.exit(1);
  });
}
