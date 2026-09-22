import { describe, expect, test } from "bun:test";
import { MockLanguageModelV3 } from "ai/test";
import type { AgentModelConfig, AgentRunLedgerRecord, FunctionCallToolName } from "@geochat-ai/app";
import { activeNativeToolNames } from "../backend/src/agent/native-chat";
import { createBackendLanguageModel } from "../backend/src/agent/ai-sdk-models";
import { selectAgentSkillsForRun } from "../backend/src/agent/skill-selector";
import { createBackendPlanningTools } from "../backend/src/agent/ai-sdk-tools";
import { refineExecuteGeoGebraCommands, validateNativeToolInput } from "../backend/src/agent/native-tool-policy";

const availableTools: FunctionCallToolName[] = [
  "getCanvasContext",
  "createGeometryPlan",
  "executeGeoGebraCommands",
  "showSolutionSteps",
  "setFinished",
];

function runWithTools(tools: AgentRunLedgerRecord["tools"]): Pick<AgentRunLedgerRecord, "tools"> {
  return { tools };
}

function succeededTool(toolName: FunctionCallToolName, index: number) {
  return {
    toolCallId: `tool-${index}`,
    toolName,
    status: "succeeded" as const,
    args: {},
    result: { ok: true },
    startedAt: "2026-09-22T00:00:00.000Z",
    completedAt: "2026-09-22T00:00:01.000Z",
    durationMs: 1_000,
  };
}

describe("AI SDK native integration boundaries", () => {
  test("keeps native operational tools visible while gating only terminal completion", () => {
    expect(activeNativeToolNames(runWithTools([]), availableTools)).toEqual([
      "getCanvasContext",
      "createGeometryPlan",
      "executeGeoGebraCommands",
      "showSolutionSteps",
    ]);

    const afterRead = [succeededTool("getCanvasContext", 1)];
    expect(activeNativeToolNames(runWithTools(afterRead), availableTools)).toEqual([
      "getCanvasContext",
      "createGeometryPlan",
      "executeGeoGebraCommands",
      "showSolutionSteps",
      "setFinished",
    ]);

    const afterPlan = [...afterRead, succeededTool("createGeometryPlan", 2)];
    expect(activeNativeToolNames(runWithTools(afterPlan), availableTools)).toContain("executeGeoGebraCommands");

    const afterWrite = [...afterPlan, succeededTool("executeGeoGebraCommands", 3)];
    expect(activeNativeToolNames(runWithTools(afterWrite), availableTools)).not.toContain("setFinished");

    const afterVerification = [...afterWrite, succeededTool("getCanvasContext", 4)];
    expect(activeNativeToolNames(runWithTools(afterVerification), availableTools)).toContain("setFinished");
  });

  test("does not turn documented native tools into unavailable tool errors", () => {
    const afterRead = [succeededTool("getCanvasContext", 1)];
    expect(activeNativeToolNames({ tools: afterRead }, availableTools)).toContain("executeGeoGebraCommands");
  });

  test("uses AI SDK schemas for runtime tool-input validation", async () => {
    const tools = createBackendPlanningTools("zh-CN", [], undefined, {
      tools: [],
      prompt: "画出函数与 x 轴的交点。",
    });
    const schema = tools.executeGeoGebraCommands.inputSchema;
    const invalid = await schema.validate?.({ commands: ["xAxis = 0.5"] });
    expect(invalid?.success).toBe(false);
    if (invalid && !invalid.success) expect(invalid.error.message).toContain("内置固定坐标轴");
    const valid = await schema.validate?.({ commands: ["f(x) = x^2 - 1", "Z = Root(f, -2, 0)"] });
    expect(valid?.success).toBe(true);
  });

  test("uses AI SDK input refinement for safe style and viewport normalization", () => {
    const refined = refineExecuteGeoGebraCommands({
      commands: [
        "O = (0, 0)",
        "c = Circle(O, 3)",
        "SetLineThickness(c, 3)",
        "ZoomIn(-3, -1.2, 3, 3.4)",
      ],
      reason: "Draw and frame the circle.",
    }, {
      prompt: "画一个二维圆并标出圆心。",
      locale: "zh-CN",
    });
    expect(refined.commands).toEqual([
      "O = (0, 0)",
      "c = Circle(O, 3)",
      "ZoomIn(-3, -1.9, 3, 4.1)",
    ]);
    expect(refined.reason).toContain("违规命令：SetLineThickness");
    expect(refined.reason).toContain("1:1 比例");
    expect(validateNativeToolInput("executeGeoGebraCommands", {
      commands: Array.from({ length: 101 }, (_, index) => `P${index} = (${index}, 0)`),
    }, { prompt: "画点", locale: "zh-CN" })).toMatchObject({ success: false });
  });

  test.each([
    [{ provider: "openai", model: "gpt-5.1", apiKey: "test", customBaseUrl: "" }, "openai.responses"],
    [{ provider: "openrouter", model: "openai/gpt-5.1", apiKey: "test", customBaseUrl: "" }, "openrouter"],
    [{ provider: "qwen", model: "qwen-max", apiKey: "test", customBaseUrl: "" }, "alibaba.chat"],
    [{ provider: "anthropic", model: "claude-sonnet-4-5", apiKey: "test", customBaseUrl: "" }, "anthropic.messages"],
    [{ provider: "google", model: "gemini-2.5-pro", apiKey: "test", customBaseUrl: "" }, "google.generative-ai"],
    [{ provider: "deepseek", model: "deepseek-chat", apiKey: "test", customBaseUrl: "" }, "deepseek.chat"],
    [{ provider: "custom", model: "private-model", apiKey: "test", customBaseUrl: "https://example.invalid/v1", protocol: "openai-compatible" }, "openai.chat"],
  ] satisfies Array<[AgentModelConfig, string]>) (
    "resolves $provider through an AI SDK provider registry",
    (config, expectedProvider) => {
      const model = createBackendLanguageModel(config);
      expect(model.modelId).toBe(config.model);
      expect(model.provider).toBe(expectedProvider);
    },
  );

  test("requests schema-validated skill selection through Output.object", async () => {
    let responseFormat: unknown;
    let providerOptions: unknown;
    const model = new MockLanguageModelV3({
      doGenerate: async (options) => {
        responseFormat = options.responseFormat;
        providerOptions = options.providerOptions;
        return {
          content: [{
            type: "text",
            text: JSON.stringify({
              status: "not_needed",
              curriculumNodes: [],
              selectedSkills: [],
              selectorReason: "The deterministic candidate context is sufficient.",
            }),
          }],
          finishReason: { unified: "stop", raw: "stop" },
          usage: {
            inputTokens: { total: 1, noCache: 1, cacheRead: 0, cacheWrite: 0 },
            outputTokens: { total: 1, text: 1, reasoning: 0 },
          },
          warnings: [],
        };
      },
    });

    const packet = await selectAgentSkillsForRun({
      run: {
        runId: `structured-skill-${crypto.randomUUID()}`,
        prompt: "请用圆与三角形相关技能画一个三角形外接圆。",
        locale: "zh-CN",
        attachmentCount: 0,
        modelProvider: "deepseek",
      } as AgentRunLedgerRecord,
      model,
      temperature: 0,
    });

    expect(packet.status).toBe("not_needed");
    expect(packet.modelCallCount).toBe(1);
    expect(packet.usage).toEqual({ inputTokens: 1, outputTokens: 1, totalTokens: 2 });
    expect(responseFormat).toMatchObject({
      type: "json",
      name: "geochat_skill_selection",
      schema: expect.objectContaining({ type: "object" }),
    });
    expect(providerOptions).toEqual({ deepseek: { thinking: { type: "disabled" } } });
  });
});
