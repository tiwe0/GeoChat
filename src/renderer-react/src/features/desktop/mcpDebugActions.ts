import { hasConfiguredApiKey } from "../../../../shared/desktop/desktop-config";
import type { DesktopDebugAction } from "../../../../shared/desktop/mcp-debug-actions";
import type { ModelConfig, RendererMcpStatus } from "../../../../shared/desktop/workbench-types";
import { getFrontendGeoGebraController } from "../../geogebra/runtime";

/**
 * Executes an action the MCP server queued for the renderer.
 *
 * Narrower than the SolidJS renderer's executor by one action: `select_problem`
 * drives the problem bank, which is a Pro surface and is not part of this
 * build. It reports that explicitly rather than failing obscurely, because an
 * MCP client has no other way to find out the capability is gone.
 */
export function createDesktopDebugActionExecutor(input: {
  getConversationId: () => string | null;
  getView: () => string;
  getModelConfig: () => ModelConfig;
  getMcpStatus: () => RendererMcpStatus;
  isRunning: () => boolean;
  sendMessage: (content: string) => Promise<void>;
  activateConversation: (conversationId: string | undefined) => Promise<void>;
  showChat: () => void;
}) {
  return async function executeDesktopDebugAction(action: DesktopDebugAction) {
    if (input.isRunning()) throw new Error("Agent is already running; wait for the current message to finish.");
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

    if (action.type === "export_png") {
      if (!controller?.ready) throw new Error("The GeoGebra canvas is not ready.");
      return controller.executeTool("getPNGBase64", {
        exportScale: action.exportScale,
        transparent: action.transparent,
        dpi: action.dpi
      });
    }

    if (action.type === "send_message") {
      const content = action.content.trim();
      if (!content) throw new Error("send_message needs non-empty content.");
      if (!hasConfiguredApiKey(input.getModelConfig())) throw new Error("No API key is configured; set one in Settings first.");
      await input.activateConversation(action.conversationId);
      input.showChat();
      await input.sendMessage(content);
      return { type: action.type, conversationId: input.getConversationId(), sent: true };
    }

    throw new Error(`The problem bank is not part of this build, so ${action.type} is unavailable. It returns with the Pro release.`);
  };
}
