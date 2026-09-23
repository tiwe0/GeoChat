import { describe, expect, test } from "bun:test";
import { createDesktopDebugActionExecutor } from "../src/renderer-react/src/features/desktop/mcpDebugActions";
import { setFrontendGeoGebraController } from "../src/renderer-react/src/geogebra/runtime";
import { DEFAULT_MCP_STATUS } from "../src/shared/desktop/mcp-debug-actions";
import { DEFAULT_MODEL_CONFIG } from "../src/shared/desktop/desktop-config";
import type { GeoGebraController } from "../src/renderer-react/src/geogebra/controller";
import type { ModelConfig } from "../src/shared/desktop/workbench-types";

const CONFIGURED: ModelConfig = { ...DEFAULT_MODEL_CONFIG, apiKey: "sk-test" };

function harness(overrides: {
  model?: ModelConfig;
  running?: boolean;
  conversationId?: string | null;
  controller?: Partial<GeoGebraController> | null;
} = {}) {
  const sent: string[] = [];
  const activated: Array<string | undefined> = [];
  let conversationId = overrides.conversationId ?? null;
  let shownChat = false;
  setFrontendGeoGebraController((overrides.controller ?? null) as GeoGebraController | null);
  const execute = createDesktopDebugActionExecutor({
    getConversationId: () => conversationId,
    getView: () => "chat",
    getModelConfig: () => overrides.model ?? CONFIGURED,
    getMcpStatus: () => ({ ...DEFAULT_MCP_STATUS, running: true, endpoint: "http://127.0.0.1:17369/mcp" }),
    isRunning: () => overrides.running ?? false,
    sendMessage: (content, requestedConversationId) => {
      sent.push(content);
      conversationId = requestedConversationId ?? conversationId ?? "conv_generated";
      return conversationId;
    },
    activateConversation: async (next) => {
      activated.push(next);
      if (next) conversationId = next;
    },
    showChat: () => { shownChat = true; }
  });
  return { execute, sent, activated, shownChat: () => shownChat };
}

describe("react MCP debug action executor", () => {
  test("reports UI status without touching the canvas", async () => {
    const { execute } = harness({ controller: { ready: true } });
    const result = await execute({ id: "1", type: "get_ui_status" }) as Record<string, any>;
    expect(result.geogebra.ready).toBe(true);
    expect(result.model.hasApiKey).toBe(true);
    expect(result.mcp.endpoint).toBe("http://127.0.0.1:17369/mcp");
  });

  test("reports the canvas as not ready when no controller is mounted", async () => {
    const { execute } = harness({ controller: null });
    const result = await execute({ id: "1", type: "get_ui_status" }) as Record<string, any>;
    expect(result.geogebra.ready).toBe(false);
  });

  test("reports status during a run but refuses mutating actions", async () => {
    const { execute } = harness({ running: true, controller: { ready: true } });
    const status = await execute({ id: "1", type: "get_ui_status" }) as Record<string, unknown>;
    expect(status.running).toBe(true);
    await expect(execute({ id: "2", type: "send_message", content: "draw" })).rejects.toThrow(/already running/);
  });

  test("exports a PNG through the same tool path the agent uses", async () => {
    const calls: Array<[string, unknown]> = [];
    const { execute } = harness({
      controller: {
        ready: true,
        executeTool: async (name: string, args: unknown) => { calls.push([name, args]); return { ok: true, base64: "AAA" }; }
      } as Partial<GeoGebraController>
    });
    const result = await execute({ id: "1", type: "export_png", exportScale: 2 }) as Record<string, unknown>;
    expect(result.ok).toBe(true);
    expect(calls[0]?.[0]).toBe("getPNGBase64");
    expect((calls[0]?.[1] as Record<string, unknown>).exportScale).toBe(2);
  });

  test("fails the export when the canvas is not mounted", async () => {
    const { execute } = harness({ controller: null });
    await expect(execute({ id: "1", type: "export_png" })).rejects.toThrow(/not ready/);
  });

  test("executes GeoGebra commands directly without sending a chat message", async () => {
    const calls: Array<[string, unknown]> = [];
    const h = harness({
      controller: {
        ready: true,
        executeTool: async (name: string, args: unknown) => {
          calls.push([name, args]);
          return { ok: true };
        }
      } as Partial<GeoGebraController>
    });

    const result = await h.execute({
      id: "1",
      type: "execute_geogebra_tool",
      toolName: "executeGeoGebraCommands",
      args: {
        commands: ["O=(0,0)", "c=Circle(O,3)"],
        resetBefore: true,
        restoreOnError: true
      }
    }) as Record<string, unknown>;

    expect(result.ok).toBe(true);
    expect(h.sent).toEqual([]);
    expect(calls).toEqual([["executeGeoGebraCommands", {
      commands: ["O=(0,0)", "c=Circle(O,3)"],
      resetBefore: true,
      restoreOnError: true
    }]]);
  });

  test("sends a message through the conversation it names", async () => {
    const h = harness({ conversationId: null, controller: { ready: true } });
    const result = await h.execute({ id: "1", type: "send_message", conversationId: "conv_a", content: " draw a square " }) as Record<string, unknown>;
    expect(h.sent).toEqual(["draw a square"]);
    expect(h.activated).toEqual(["conv_a"]);
    expect(h.shownChat()).toBe(true);
    expect(result.conversationId).toBe("conv_a");
  });

  test("refuses to send without a configured key, rather than starting a run that cannot finish", async () => {
    const { execute, sent } = harness({ model: DEFAULT_MODEL_CONFIG, controller: { ready: true } });
    await expect(execute({ id: "1", type: "send_message", content: "hi" })).rejects.toThrow(/API key/);
    expect(sent).toEqual([]);
  });

  test("refuses to start a model run before the GeoGebra canvas is ready", async () => {
    const { execute, sent } = harness({ controller: null });
    await expect(execute({ id: "1", type: "send_message", content: "draw" })).rejects.toThrow(/not ready/);
    expect(sent).toEqual([]);
  });

  test("rejects empty content", async () => {
    const { execute } = harness({ controller: { ready: true } });
    await expect(execute({ id: "1", type: "send_message", content: "   " })).rejects.toThrow(/non-empty/);
  });

  test("returns the debug action id so the server can correlate submission evidence", async () => {
    const h = harness({ conversationId: null, controller: { ready: true } });
    const result = await h.execute({ id: "action-correlation", type: "send_message", content: "draw" }) as Record<string, unknown>;
    expect(result.debugActionId).toBe("action-correlation");
    expect(typeof result.submittedAt).toBe("string");
  });
});
