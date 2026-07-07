import type {
  FunctionCallToolName,
  AgentModelConfig,
  DesktopConversationSummary
} from "@geochat-ai/app";
import type {
  DesktopAppBundleUpdateState,
  DesktopImprovementPlanPreferences,
  DesktopAccessState,
  DesktopMcpStatus,
  DesktopUnifiedUpdateState,
  DesktopUpdateState
} from "../../shared/desktop-api";
import type { FunctionCallCard } from "./functioncalls";
import type { Locale } from "./i18n";

export type DesktopChatMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  createdAt: string;
  createdAtIso?: string;
  activity?: DesktopChatActivity;
  attachments?: ImageAttachment[];
  toolCalls?: import("@geochat-ai/app").DesktopFunctionCall[];
  cards?: FunctionCallCard[];
  usage?: {
    inputTokens?: number;
    outputTokens?: number;
    totalTokens?: number;
  };
};

export type DesktopChatActivity =
  | { kind: "backend_planning" }
  | { kind: "backend_cached_tool" }
  | { kind: "backend_tool_running"; toolName: FunctionCallToolName }
  | { kind: "backend_tool_submitted"; toolName?: FunctionCallToolName };

export type ImageAttachment = {
  id: string;
  name: string;
  mediaType: string;
  size: number;
  dataUrl: string;
};

export type HistoryItem = DesktopConversationSummary;

export type ConfigTab = "model" | "skills" | "externalMcp" | "memory" | "runs" | "about" | "credits" | "debug";
export type ViewMode = "chat" | "problem-bank";

export type ModelConfig = AgentModelConfig & {
  modelStepTimeoutMs?: number | null;
};

export type DebugConfig = {
  modelStepTimeoutMs: number;
};

export type ProviderCredentialConfig = {
  apiKey: string;
  customBaseUrl: string;
};

export type SkillConfig = {
  enabled: boolean;
  autoActivate: boolean;
  enabledSkillNames: string[];
  visualProfile: VisualProfileName;
};

export type VisualProfileName =
  | "exam-clean"
  | "teaching-demo"
  | "choice-comparison"
  | "dynamic-exploration"
  | "proof-highlight"
  | "spatial-3d";

export type DesktopConfig = {
  model: ModelConfig;
  visionModel: ModelConfig;
  providerCredentials: Record<string, ProviderCredentialConfig>;
  skills: SkillConfig;
  debug: DebugConfig;
  locale: Locale;
};

export type RendererMcpStatus = DesktopMcpStatus & { available: boolean };
export type RendererAccessState = DesktopAccessState & { available: boolean };
export type RendererUpdateState = DesktopUpdateState & { available: boolean };
export type RendererAppBundleUpdateState = DesktopAppBundleUpdateState & { available: boolean };
export type RendererUnifiedUpdateState = DesktopUnifiedUpdateState & {
  shell: RendererUpdateState;
  appBundle: RendererAppBundleUpdateState;
};
export type RendererImprovementPlanState = DesktopImprovementPlanPreferences & { available: boolean };
