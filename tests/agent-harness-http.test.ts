import { describe, expect, test } from "bun:test";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  createAgentRunLedger,
  finishAgentRunLedger,
  upsertAgentRunTool
} from "@geochat-ai/app";
import { createHttpHarness } from "./agent-harness-http-utils";

describe("desktop-only renderer and backend boundaries", () => {
  test("keeps heavy math renderers out of the static Workbench import graph", async () => {
    const workbenchSource = await readFile(join(process.cwd(), "src/renderer/src/WorkbenchApp.tsx"), "utf8");
    const chatPanelSource = await readFile(join(process.cwd(), "src/renderer/src/ChatPanel.tsx"), "utf8");
    const chatTimelineSource = await readFile(join(process.cwd(), "src/renderer/src/chat-panel/ChatMessageTimeline.tsx"), "utf8");
    const latexTextSource = await readFile(join(process.cwd(), "src/renderer/src/LatexText.tsx"), "utf8");
    expect(workbenchSource).not.toMatch(/import\s+\{[^}]*Streamdown[^}]*\}\s+from\s+["']streamdown["']/);
    expect(workbenchSource).not.toContain('import "streamdown/styles.css"');
    expect(workbenchSource).not.toContain('import("streamdown")');
    expect(workbenchSource).not.toContain('import("streamdown/styles.css")');
    expect(chatPanelSource).not.toMatch(/import\s+\{[^}]*Streamdown[^}]*\}\s+from\s+["']streamdown["']/);
    expect(chatPanelSource).not.toContain('import "streamdown/styles.css"');
    expect(chatTimelineSource).not.toMatch(/import\s+\{[^}]*Streamdown[^}]*\}\s+from\s+["']streamdown["']/);
    expect(chatTimelineSource).not.toContain('import "streamdown/styles.css"');
    expect(chatTimelineSource).toContain('import("streamdown")');
    expect(chatTimelineSource).toContain('import("streamdown/styles.css")');
    expect(workbenchSource).not.toMatch(/import\s+.*\s+from\s+["']katex["']/);
    expect(workbenchSource).not.toContain('import "katex/dist/katex.min.css"');
    expect(workbenchSource).not.toContain('import("katex")');
    expect(workbenchSource).not.toContain('import("katex/dist/katex.min.css")');
    expect(latexTextSource).not.toMatch(/import\s+.*\s+from\s+["']katex["']/);
    expect(latexTextSource).not.toContain('import "katex/dist/katex.min.css"');
    expect(latexTextSource).toContain('import("katex")');
    expect(latexTextSource).toContain('import("katex/dist/katex.min.css")');
  });

  test("renders choice analysis cards as switchable choice scenarios", async () => {
    const chatPanelSource = await readFile(join(process.cwd(), "src/renderer/src/ChatPanel.tsx"), "utf8");
    const chatTimelineSource = await readFile(join(process.cwd(), "src/renderer/src/chat-panel/ChatMessageTimeline.tsx"), "utf8");
    const workbenchSource = await readFile(join(process.cwd(), "src/renderer/src/WorkbenchApp.tsx"), "utf8");
    const geogebraSource = await readFile(join(process.cwd(), "src/renderer/src/geogebra-execution.ts"), "utf8");
    const stylesSource = await readFile(join(process.cwd(), "src/renderer/src/styles.css"), "utf8");
    const i18nSource = await readFile(join(process.cwd(), "src/renderer/src/i18n.ts"), "utf8");
    expect(chatTimelineSource).toContain("function-card-choice-tabs");
    expect(chatTimelineSource).toContain("setActiveChoice");
    expect(chatTimelineSource).toContain("choiceAll");
    expect(chatPanelSource).toContain("onPreviewChoiceScenario");
    expect(chatTimelineSource).toContain("previewRunId");
    expect(chatTimelineSource).toContain('label: "all"');
    expect(workbenchSource).toContain("previewChoiceScenario");
    expect(workbenchSource).toContain("choiceScenarioBaseXmlByCard");
    expect(workbenchSource).toContain("restoreBeforeXml");
    expect(workbenchSource).toContain("normalizeFreeParameters: true");
    expect(geogebraSource).toContain("restoreBeforeXml");
    expect(geogebraSource).toContain("normalizeFreeParameters");
    expect(stylesSource).toContain(".function-card-choice-tab.active");
    expect(stylesSource).toContain(".function-card-choice-verdict.true");
    expect(stylesSource).toContain(".function-card-choice-preview-error");
    expect(i18nSource).toContain('choiceAll: "全部"');
    expect(i18nSource).toContain('choiceAll: "All"');
    expect(i18nSource).toContain("choicePreviewing");
  });

  test("does not turn KaTeX spans inside function-card list items into block elements", async () => {
    const stylesSource = await readFile(join(process.cwd(), "src/renderer/src/styles.css"), "utf8");
    expect(stylesSource).not.toContain(".function-card li span");
    expect(stylesSource).toContain(".function-card li > span");
  });

  test("uses the current repository problem cases as the default desktop import source", async () => {
    const { defaultProblemCasesRoot, problemCasesRootFromUrl } = await import("../backend/src/problem-cases");
    const defaultRoot = defaultProblemCasesRoot("/tmp/geochat-resource-root");
    const root = problemCasesRootFromUrl(new URL("http://127.0.0.1:17365/v1/problem-sets"), {
      defaultRoot,
      env: {}
    });
    const configured = problemCasesRootFromUrl(new URL("http://127.0.0.1:17365/v1/problem-sets"), {
      defaultRoot,
      env: { GEOCHAT_PROBLEM_CASES_DIR: "/tmp/custom-cases" }
    });
    const explicit = problemCasesRootFromUrl(new URL("http://127.0.0.1:17365/v1/problem-sets?sourcePath=/tmp/request-cases"), {
      defaultRoot,
      env: { GEOCHAT_PROBLEM_CASES_DIR: "/tmp/custom-cases" }
    });

    expect(root).toBe("/tmp/geochat-resource-root/data/problem-cases");
    expect(root).not.toContain("/Users/ivory/Project/GeoChat/");
    expect(configured).toBe("/tmp/custom-cases");
    expect(explicit).toBe("/tmp/request-cases");
  });

  test("does not serve a Web SPA from the desktop backend", async () => {
    const { request } = await createHttpHarness();
    const rootResponse = await request("/");
    expect(rootResponse.status).toBe(404);
    expect(rootResponse.json.error).toBe("not_found");

    const apiResponse = await request("/v1/not-real");
    expect(apiResponse.status).toBe(404);
    expect(apiResponse.json.error).toBe("not_found");
  });

  test("serves desktop health and bundled GeoGebra assets", async () => {
    const { request } = await createHttpHarness();
    const healthResponse = await request("/health");
    expect(healthResponse.status).toBe(200);
    expect(healthResponse.json).toMatchObject({
      status: "ok",
      service: "geochat-desktop-backend",
      database: {
        requestedDriver: "sqlite",
        migrationsSchema: "sqlite"
      }
    });

    const assetResponse = await request("/tools/geogebra-assets-v2/deployggb.js", { method: "HEAD" });
    expect(assetResponse.status).toBe(200);
    expect(assetResponse.response.headers.get("content-type")).toContain("javascript");
    expect(assetResponse.response.headers.get("cross-origin-resource-policy")).toBe("cross-origin");
  });

  test("strips GeoGebra remote source maps from served JavaScript assets", async () => {
    const { handleRequest } = await createHttpHarness();
    const response = await handleRequest(new Request("http://127.0.0.1:17365/tools/geogebra-assets-v2/HTML5/5.0/web3d/web3d.devmode.js"));
    const text = await response.text();

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("javascript");
    expect(text).not.toContain("sourceMappingURL");
    expect(text).not.toContain("apps-builds.s3-eu-central-1.amazonaws.com/geogebra/sourcemaps");
  });

  test("serves problem bank routes and records problem attempts", async () => {
    const { request } = await createHttpHarness();
    const sourcePath = await mkdtemp(join(tmpdir(), "geochat-problem-cases-"));
    await writeFile(
      join(sourcePath, "fixture.json"),
      JSON.stringify({
        id: "fixture-problem-1",
        title: "Fixture visual problem",
        input: { text: "已知圆 O 和直径 AB，说明圆周角 ACB 是直角。" },
        expected: { answer: "90 degrees" },
        tags: ["visual-candidate", "plane-geometry"],
        taskType: "construct",
        metadata: {
          sourceQuestionType: "open_ended",
          sourceYear: "2026",
          sourceTopics: ["plane-geometry"],
          visualPotential: true
        }
      })
    );
    const sourceQuery = `sourcePath=${encodeURIComponent(sourcePath)}`;

    const imported = await request(`/v1/problem-bank/import?${sourceQuery}`, { method: "POST" });
    expect(imported.status).toBe(200);
    expect(imported.json).toMatchObject({ imported: 1, skipped: false });

    const sets = await request(`/v1/problem-sets?${sourceQuery}`);
    expect(sets.status).toBe(200);
    expect(sets.json.sets.some((set: { slug: string; problemCount: number }) => set.slug === "curated-agent" && set.problemCount === 1)).toBe(true);
    expect(sets.json.sets.some((set: { slug: string; problemCount: number }) => set.slug === "visual-candidates" && set.problemCount === 1)).toBe(true);

    const list = await request(`/v1/problem-sets/curated-agent/problems?limit=1&offset=0&${sourceQuery}`);
    expect(list.status).toBe(200);
    expect(list.json.problems).toHaveLength(1);
    const problemId = list.json.problems[0].id;

    const detail = await request(`/v1/problems/${encodeURIComponent(problemId)}?${sourceQuery}`);
    expect(detail.status).toBe(200);
    expect(detail.json.problem.id).toBe(problemId);
    expect(detail.json.problem).toMatchObject({
      id: "fixture-problem-1",
      questionType: "open_ended",
      visualPotential: true
    });

    const invalidAttempt = await request(`/v1/problems/${encodeURIComponent(problemId)}/attempts`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({})
    });
    expect(invalidAttempt).toMatchObject({
      status: 400,
      json: { error: "invalid_request" }
    });

    const conversationId = `problem-bank-${crypto.randomUUID()}`;
    await request(`/v1/conversations/${encodeURIComponent(conversationId)}/messages`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        conversationId,
        message: {
          id: `${conversationId}-user`,
          role: "user",
          content: "记录题库作答。",
          createdAt: "2026-06-06T04:03:00.000Z",
          payload: {
            id: `${conversationId}-user`,
            role: "user",
            content: "记录题库作答。",
            createdAt: "12:03:00"
          }
        }
      })
    });

    const attempt = await request(`/v1/problems/${encodeURIComponent(problemId)}/attempts`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        conversationId,
        runId: `${conversationId}-run`,
        modelProvider: "openai",
        modelId: "gpt-5.5"
      })
    });
    expect(attempt.status).toBe(201);
    expect(attempt.json.attempt).toMatchObject({
      problemId,
      conversationId,
      runId: `${conversationId}-run`,
      status: "started"
    });
  }, 20_000);

  test("serves agent run command usage through the desktop backend", async () => {
    const { request } = await createHttpHarness();
    const runId = `command-usage-route-${crypto.randomUUID()}`;
    const run = createAgentRunLedger({
      runId,
      conversationId: `conversation-${runId}`,
      mode: "ai-sdk",
      model: { provider: "openai", model: "gpt-5.5", apiKey: "", customBaseUrl: "" },
      prompt: "画一个圆。",
      attachmentCount: 0,
      startedAt: "2026-06-06T04:04:00.000Z"
    });
    const withInitialRead = upsertAgentRunTool(run, {
      toolCallId: `${runId}-initial-read`,
      toolName: "getCanvasContext",
      status: "succeeded",
      args: { includeXml: false },
      result: { ok: true, canvasContext: { objects: [] } },
      startedAt: "2026-06-06T04:04:01.000Z",
      completedAt: "2026-06-06T04:04:02.000Z"
    });
    const withSearch = upsertAgentRunTool(withInitialRead, {
      toolCallId: `${runId}-search`,
      toolName: "searchGeoGebraCommands",
      status: "succeeded",
      args: { query: "Circle", scope: "conic", topN: 2 },
      result: { ok: true, result: [{ command: "Circle" }] },
      startedAt: "2026-06-06T04:04:02.100Z",
      completedAt: "2026-06-06T04:04:02.900Z"
    });
    const withExecute = upsertAgentRunTool(withSearch, {
      toolCallId: `${runId}-execute`,
      toolName: "executeGeoGebraCommands",
      status: "succeeded",
      args: { commands: ["O = (0, 0)", "c = Circle(O, 2)"] },
      result: { ok: true },
      startedAt: "2026-06-06T04:04:03.000Z",
      completedAt: "2026-06-06T04:04:04.000Z"
    });
    const withVerification = upsertAgentRunTool(withExecute, {
      toolCallId: `${runId}-verify`,
      toolName: "getCanvasContext",
      status: "succeeded",
      args: { includeXml: false },
      result: { ok: true, canvasContext: { objects: [{ name: "c", type: "circle" }] } },
      startedAt: "2026-06-06T04:04:05.000Z",
      completedAt: "2026-06-06T04:04:06.000Z"
    });
    const finished = finishAgentRunLedger(withVerification, {
      status: "succeeded",
      error: null,
      usage: null,
      completedAt: "2026-06-06T04:04:07.000Z"
    });

    const saved = await request("/v1/agent-runs", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(finished)
    });
    expect(saved.status).toBe(201);

    const runsResponse = await request("/v1/agent-runs");
    const runsPayload = runsResponse.json as {
      reviews?: Record<string, { verdict?: string; metrics?: { canvasWriteTools?: number; canvasVerificationTools?: number } }>;
    };
    expect(runsResponse.status).toBe(200);
    expect(runsPayload.reviews?.[runId]).toMatchObject({
      verdict: "pass",
      metrics: {
        canvasWriteTools: 1,
        canvasVerificationTools: 2
      }
    });

    const response = await request("/v1/agent-command-usage?limit=5000");
    const payload = response.json as {
      stats?: { commands?: Array<{ commandName: string; runCount: number }> };
    };

    expect(response.status).toBe(200);
    expect(payload.stats?.commands).toContainEqual(expect.objectContaining({ commandName: "Circle", runCount: 1 }));
  });
});
