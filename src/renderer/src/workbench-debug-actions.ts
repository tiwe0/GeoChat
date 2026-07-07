import type { Accessor } from "solid-js";
import type { RuntimeInfo } from "@geochat-ai/app";
import type { createGeoGebraController } from "./geogebra";
import { hasConfiguredApiKey } from "./desktop-config";
import {
  fetchProblemDetail,
  type DesktopDebugAction
} from "./workbench-api";
import type { ModelConfig, RendererMcpStatus, ViewMode } from "./workbench-types";

type GeoGebraController = ReturnType<typeof createGeoGebraController>;

export function createDesktopDebugActionExecutor(input: {
  runtime: Accessor<RuntimeInfo | undefined>;
  isRunning: Accessor<boolean>;
  conversationId: Accessor<string>;
  view: Accessor<ViewMode>;
  modelConfig: Accessor<ModelConfig>;
  mcpStatus: Accessor<RendererMcpStatus>;
  geogebra: GeoGebraController;
  activateConversation: (conversationId: string | undefined) => Promise<void>;
  sendMessage: (content: string) => Promise<void>;
  showChat: () => void;
  showProblemBank: () => void;
  expandPanel: () => void;
  cacheProblemDetail: (problem: Awaited<ReturnType<typeof fetchProblemDetail>>) => void;
  selectProblem: (problemId: string) => void;
  useProblem: (problem: Awaited<ReturnType<typeof fetchProblemDetail>>, mode: "draft" | "send") => void;
}) {
  return async function executeDesktopDebugAction(action: DesktopDebugAction) {
    const info = input.runtime();
    if (!info) throw new Error("Desktop runtime is not ready.");
    if (input.isRunning()) throw new Error("Agent is already running; wait for the current message to finish.");
    if (action.type === "get_ui_status") {
      const model = input.modelConfig();
      const mcp = input.mcpStatus();
      return {
        type: action.type,
        conversationId: input.conversationId(),
        view: input.view(),
        model: {
          provider: model.provider,
          model: model.model,
          hasApiKey: hasConfiguredApiKey(model),
          customBaseUrlConfigured: Boolean(model.customBaseUrl.trim())
        },
        geogebra: {
          ready: input.geogebra.isReady()
        },
        running: input.isRunning(),
        mcp: {
          running: mcp.running,
          endpoint: mcp.endpoint
        }
      };
    }
    if (action.type === "export_png") {
      const payload = await input.geogebra.getPNGBase64({
        exportScale: action.exportScale,
        transparent: action.transparent,
        dpi: action.dpi
      });
      return {
        type: action.type,
        conversationId: input.conversationId(),
        ok: payload.ok,
        base64: payload.base64,
        dataUrl: `data:${payload.mediaType};base64,${payload.base64}`,
        mediaType: payload.mediaType,
        exportScale: payload.exportScale,
        transparent: payload.transparent,
        dpi: payload.dpi,
        byteEstimate: payload.byteEstimate,
        clientMeta: payload.clientMeta
      };
    }
    await input.activateConversation(action.conversationId);

    if (action.type === "send_message") {
      input.showChat();
      input.expandPanel();
      await input.sendMessage(action.content);
      return { type: action.type, conversationId: input.conversationId() };
    }

    const problem = await fetchProblemDetail({
      source: action.source === "cloud" ? "cloud" : undefined,
      backendBaseUrl: info.backendBaseUrl,
      backendAuthToken: info.backendAuthToken,
      cloudBaseUrl: action.cloudBaseUrl,
      bankSlug: action.bankSlug,
      problemApiPath: action.problemApiPath,
      id: action.problemId
    });
    input.cacheProblemDetail(problem);
    input.selectProblem(problem.id);
    if (action.mode === "show") {
      input.showProblemBank();
      input.expandPanel();
      return { type: action.type, mode: action.mode, problemId: problem.id, title: problem.title };
    }
    input.useProblem(problem, action.mode);
    return { type: action.type, mode: action.mode, problemId: problem.id, title: problem.title, conversationId: input.conversationId() };
  };
}
