import { hasConfiguredApiKey } from "../../../../shared/desktop/desktop-config";
import type { DesktopDebugAction } from "../../../../shared/desktop/mcp-debug-actions";
import type { ModelConfig, RendererMcpStatus } from "../../../../shared/desktop/workbench-types";
import { getFrontendGeoGebraController } from "../../geogebra/runtime";

/**
 * Executes an action the MCP server queued for the renderer.
 *
 * Only actions the renderer can execute end-to-end belong in this contract.
 * Problem lookup happens on the MCP server; a resolved prompt then uses the
 * same `send_message` path as an ordinary user submission.
 */
export function createDesktopDebugActionExecutor(input: {
  getConversationId: () => string | null;
  getView: () => string;
  getModelConfig: () => ModelConfig;
  getMcpStatus: () => RendererMcpStatus;
  isRunning: () => boolean;
  sendMessage: (content: string, conversationId?: string) => string;
  activateConversation: (conversationId: string | undefined) => Promise<void>;
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
          hasApiKey: hasConfiguredApiKey(model),
          customBaseUrlConfigured: Boolean(model.customBaseUrl.trim())
        },
        geogebra: { ready: Boolean(controller?.ready) },
        running: input.isRunning(),
        mcp: { running: mcp.running, endpoint: mcp.endpoint }
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

    if (action.type === "send_message") {
      const content = action.content.trim();
      if (!content) throw new Error("send_message needs non-empty content.");
      if (!hasConfiguredApiKey(input.getModelConfig())) throw new Error("No API key is configured; set one in Settings first.");
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
