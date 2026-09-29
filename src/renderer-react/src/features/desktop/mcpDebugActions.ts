import { hasConfiguredCredential } from "../../../../shared/desktop/desktop-config";
import type { DesktopDebugAction } from "../../../../shared/desktop/mcp-debug-actions";
import type { ModelConfig, RendererMcpStatus } from "../../../../shared/desktop/workbench-types";
import { getFrontendGeoGebraController } from "../../geogebra/runtime";
import { assertRestrictedUiProbeOwner, executeRestrictedDesktopUiProbe } from "./realUiProbe";
export { executeRestrictedDesktopUiProbe } from "./realUiProbe";

/** Executes the finite actions the MCP server may queue for renderer-owned surfaces. */
export function createDesktopDebugActionExecutor(input: {
  getConversationId: () => string | null;
  getView: () => string;
  getModelConfig: () => ModelConfig;
  getMcpStatus: () => RendererMcpStatus;
  isRunning: () => boolean;
  sendMessage: (content: string, conversationId?: string) => string;
  activateConversation: (conversationId: string | undefined) => Promise<void>;
  restoreConversation: (conversationId: string) => Promise<unknown>;
  configureTestProvider: (baseUrl: string, model: string, nonce: string) => Promise<unknown>;
  clearTestProvider: (nonce: string, credentialRef: string, restoreConfigJson: string) => Promise<unknown>;
  showChat: () => void;
}) {
  return async function executeDesktopDebugAction(action: DesktopDebugAction) {
    const controller = getFrontendGeoGebraController();

    if (action.type === "get_ui_status") {
      const model = input.getModelConfig();
      const mcp = input.getMcpStatus();
      return {
        type: action.type,
        conversationId: input.getConversationId(),
        view: input.getView(),
        model: {
          provider: model.provider,
          model: model.model,
          hasApiKey: hasConfiguredCredential(model),
          hasCredential: hasConfiguredCredential(model)
        },
        geogebra: { ready: Boolean(controller?.ready) },
        running: input.isRunning(),
        mcp: { running: mcp.running, endpoint: mcp.endpoint }
      };
    }

    if (action.type === "probe_real_ui") {
      assertRestrictedUiProbeOwner(action.nonce);
      if (typeof document === "undefined") throw new Error("The real UI probe requires an active WebView document.");
      const readOnly = action.operation === "snapshot";
      if (!readOnly && input.isRunning()) throw new Error("Agent is already running; mutating real UI probes must wait for the current message to finish.");
      return {
        type: action.type,
        operation: action.operation,
        conversationId: input.getConversationId(),
        result: executeRestrictedDesktopUiProbe(document, action.operation, {
          text: action.text,
          target: action.target,
        }),
      };
    }

    if (input.isRunning()) throw new Error("Agent is already running; wait for the current message to finish.");

    if (action.type === "export_png") {
      if (!controller?.ready) throw new Error("The GeoGebra canvas is not ready.");
      return controller.executeTool("getPNGBase64", {
        exportScale: action.exportScale,
        transparent: action.transparent,
        dpi: action.dpi
      });
    }

    if (action.type === "execute_geogebra_tool") {
      if (!controller?.ready) throw new Error("The GeoGebra canvas is not ready.");
      return controller.executeTool(action.toolName, action.args);
    }

    if (action.type === "restore_conversation") {
      input.showChat();
      return input.restoreConversation(action.conversationId);
    }

    if (action.type === "configure_test_provider") {
      return input.configureTestProvider(action.baseUrl, action.model, action.nonce);
    }

    if (action.type === "clear_test_provider") {
      return input.clearTestProvider(action.nonce, action.credentialRef, action.restoreConfigJson);
    }

    if (action.type === "send_message") {
      const content = action.content.trim();
      if (!content) throw new Error("send_message needs non-empty content.");
      if (!hasConfiguredCredential(input.getModelConfig())) throw new Error("No API credential is configured; set one in Settings first.");
      if (!controller?.ready) throw new Error("The GeoGebra canvas is not ready.");
      await input.activateConversation(action.conversationId);
      input.showChat();
      const submittedAt = new Date().toISOString();
      const conversationId = input.sendMessage(content, action.conversationId);
      return {
        type: action.type,
        conversationId,
        sent: true,
        debugActionId: action.id,
        submittedAt
      };
    }
  };
}
