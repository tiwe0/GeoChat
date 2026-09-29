import { describe, expect, test } from "bun:test";
import {
  createDesktopDebugActionExecutor,
  executeRestrictedDesktopUiProbe,
} from "../src/renderer-react/src/features/desktop/mcpDebugActions";
import { setFrontendGeoGebraController } from "../src/renderer-react/src/geogebra/runtime";
import { DEFAULT_MCP_STATUS } from "../src/shared/desktop/mcp-debug-actions";
import { DEFAULT_MODEL_CONFIG } from "../src/shared/desktop/desktop-config";
import type { GeoGebraController } from "../src/renderer-react/src/geogebra/controller";
import type { ModelConfig } from "../src/shared/desktop/workbench-types";

const CONFIGURED: ModelConfig = { ...DEFAULT_MODEL_CONFIG, credentialRef: "credential-ref" };

class FakeUiElement {
  readonly attributes = new Map<string, string>();
  readonly classNames = new Set<string>();
  readonly selectorResults = new Map<string, FakeUiElement | null>();
  readonly selectorListResults = new Map<string, FakeUiElement[]>();
  readonly tagName: string;
  value = "";
  textContent = "";
  innerText = "";
  disabled = false;
  clicked = 0;
  dispatched: Array<{ type: string; key?: string; shiftKey?: boolean }> = [];
  onDispatch?: (event: Event) => void;

  constructor(tagName: string, private readonly owner: FakeUiDocument) {
    this.tagName = tagName.toUpperCase();
  }

  get classList() {
    return { contains: (name: string) => this.classNames.has(name) };
  }

  getAttribute(name: string) { return this.attributes.get(name) ?? null; }
  closest() { return null; }
  getClientRects() { return [{ width: 1, height: 1 }]; }
  querySelector(selector: string) { return this.selectorResults.get(selector) ?? null; }
  querySelectorAll(selector: string) { return this.selectorListResults.get(selector) ?? []; }
  contains(element: unknown) { return element === this || [...this.selectorListResults.values()].flat().includes(element as FakeUiElement); }
  click() { this.clicked += 1; }
  focus() { this.owner.activeElement = this; }
  dispatchEvent(event: Event) {
    const keyboard = event as KeyboardEvent;
    this.dispatched.push({ type: event.type, key: keyboard.key, shiftKey: keyboard.shiftKey });
    this.onDispatch?.(event);
    return !event.defaultPrevented;
  }
}

class FakeUiDocument {
  activeElement: FakeUiElement | null = null;
  readonly selectorResults = new Map<string, FakeUiElement | null>();
  readonly selectorListResults = new Map<string, FakeUiElement[]>();
  readonly defaultView = {
    KeyboardEvent: class extends Event {
      readonly key: string;
      readonly shiftKey: boolean;
      constructor(type: string, init: KeyboardEventInit = {}) {
        super(type, init);
        this.key = init.key ?? "";
        this.shiftKey = init.shiftKey ?? false;
      }
    }
  };

  querySelector(selector: string) { return this.selectorResults.get(selector) ?? null; }
  querySelectorAll(selector: string) { return this.selectorListResults.get(selector) ?? []; }
}

function fakeUiDocument() {
  const document = new FakeUiDocument();
  const composer = new FakeUiElement("form", document);
  const textarea = new FakeUiElement("textarea", document);
  const send = new FakeUiElement("button", document);
  composer.attributes.set("data-composer-variant", "window");
  composer.selectorResults.set("textarea", textarea);
  composer.selectorResults.set("button[data-copilot-tour$='send']", send);
  document.selectorResults.set("[data-geochat-composer='true']", composer);
  document.selectorResults.set("[data-geochat-composer='true'] textarea", textarea);
  document.selectorResults.set("[data-geochat-composer='true'] button[data-copilot-tour$='send']", send);
  document.selectorListResults.set("[data-geochat-message='true']", []);
  document.selectorListResults.set("[aria-live]", []);
  document.selectorListResults.set("[role='dialog']", []);
  return { document, composer, textarea, send };
}

function harness(overrides: {
  model?: ModelConfig;
  running?: boolean;
  conversationId?: string | null;
  controller?: Partial<GeoGebraController> | null;
} = {}) {
  const sent: string[] = [];
  const activated: Array<string | undefined> = [];
  const restored: string[] = [];
  const configured: Array<{ baseUrl: string; model: string; nonce: string }> = [];
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
    restoreConversation: async (next) => {
      restored.push(next);
      conversationId = next;
      return {
        conversationId: next,
        messageCount: 2,
        recovery: { messages: "restored", canvas: "replayed" }
      };
    },
    configureTestProvider: async (baseUrl, model, nonce) => {
      configured.push({ baseUrl, model, nonce });
      return { provider: "custom", model, debugOnly: true };
    },
    clearTestProvider: async () => ({ cleared: true, debugOnly: true }),
    showChat: () => { shownChat = true; }
  });
  return { execute, sent, activated, restored, configured, shownChat: () => shownChat };
}

describe("react MCP debug action executor", () => {
  test("drives only the active composer controls and reports the resulting DOM state", () => {
    const ui = fakeUiDocument();
    const filled = executeRestrictedDesktopUiProbe(
      ui.document as unknown as Document,
      "set_composer_text",
      { text: "Draw point A." },
    ) as { text: string; focused: boolean; snapshot: { composer: { text: string } } };
    expect(filled).toMatchObject({ text: "Draw point A.", focused: true });
    expect(filled.snapshot.composer.text).toBe("Draw point A.");
    expect(ui.textarea.dispatched.map((event) => event.type)).toEqual(["input"]);

    executeRestrictedDesktopUiProbe(ui.document as unknown as Document, "submit_composer", {});
    expect(ui.send.clicked).toBe(1);
  });

  test("proves both keyboard boundaries wrap inside the named Fusion dialog", () => {
    const ui = fakeUiDocument();
    const dialog = new FakeUiElement("section", ui.document);
    const first = new FakeUiElement("button", ui.document);
    const last = new FakeUiElement("button", ui.document);
    dialog.attributes.set("data-fusion-panel", "settings");
    dialog.selectorListResults.set([
      "button:not([disabled])",
      "[href]",
      "input:not([disabled]):not([type='hidden'])",
      "select:not([disabled])",
      "textarea:not([disabled])",
      "[tabindex]:not([tabindex='-1'])",
    ].join(","), [first, last]);
    ui.document.selectorResults.set("[data-fusion-panel='settings'] [role='dialog'], [role='dialog'][data-fusion-panel='settings']", dialog);
    last.onDispatch = (event) => {
      if ((event as KeyboardEvent).key === "Tab" && !(event as KeyboardEvent).shiftKey) first.focus();
    };
    first.onDispatch = (event) => {
      if ((event as KeyboardEvent).key === "Tab" && (event as KeyboardEvent).shiftKey) last.focus();
    };

    const result = executeRestrictedDesktopUiProbe(
      ui.document as unknown as Document,
      "cycle_dialog_focus",
      { target: "settings" },
    );
    expect(result).toMatchObject({ forwardWrapped: true, backwardWrapped: true, focusableCount: 2 });
    expect(last.dispatched).toEqual([expect.objectContaining({ key: "Tab", shiftKey: false })]);
    expect(first.dispatched).toEqual([expect.objectContaining({ key: "Tab", shiftKey: true })]);
  });

  test("reports UI status without touching the canvas", async () => {
    const { execute } = harness({ controller: { ready: true } });
    const result = await execute({ id: "1", type: "get_ui_status" }) as Record<string, any>;
    expect(result.geogebra.ready).toBe(true);
    expect(result.model.hasApiKey).toBe(true);
    expect(result.model.hasCredential).toBe(true);
    expect(result.mcp.endpoint).toBe("http://127.0.0.1:17369/mcp");
  });

  test("refuses the real UI probe outside a development renderer", async () => {
    const { execute } = harness({ controller: { ready: true } });
    await expect(execute({
      id: "ui-probe-1",
      type: "probe_real_ui",
      nonce: "123e4567-e89b-42d3-a456-426614174000",
      operation: "snapshot",
    })).rejects.toThrow(/development build/);
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

  test("restores a conversation through the real history selection callback", async () => {
    const h = harness({ conversationId: null, controller: { ready: true } });
    const result = await h.execute({ id: "restore-1", type: "restore_conversation", conversationId: "conv_a" });
    expect(h.restored).toEqual(["conv_a"]);
    expect(h.sent).toEqual([]);
    expect(h.shownChat()).toBe(true);
    expect(result).toEqual({
      conversationId: "conv_a",
      messageCount: 2,
      recovery: { messages: "restored", canvas: "replayed" }
    });
  });

  test("configures a loopback fake provider without accepting a credential in the action", async () => {
    const h = harness();
    const result = await h.execute({
      id: "provider-1",
      type: "configure_test_provider",
      baseUrl: "http://127.0.0.1:19001/v1",
      model: "geochat-e2e",
      nonce: "123e4567-e89b-42d3-a456-426614174000"
    });
    expect(h.configured).toEqual([{
      baseUrl: "http://127.0.0.1:19001/v1",
      model: "geochat-e2e",
      nonce: "123e4567-e89b-42d3-a456-426614174000"
    }]);
    expect(result).toEqual({ provider: "custom", model: "geochat-e2e", debugOnly: true });
  });

  test("refuses to send without a configured key, rather than starting a run that cannot finish", async () => {
    const { execute, sent } = harness({ model: DEFAULT_MODEL_CONFIG, controller: { ready: true } });
    await expect(execute({ id: "1", type: "send_message", content: "hi" })).rejects.toThrow(/API credential/);
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
