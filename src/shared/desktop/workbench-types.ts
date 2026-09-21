export type FunctionCallCard = {
  title: string;
  summary?: string | null;
  answer?: string | null;
  steps?: Array<{ label: string; body: string }>;
  items?: string[] | null;
  commands?: string[] | null;
  controls?: string[] | null;
  observations?: string[] | null;
  baseConditions?: string[] | null;
  displayMode?: "single_active_choice" | "compare_choices" | "text_only" | null;
  choices?: Array<{
    label: "A" | "B" | "C" | "D";
    statement: string;
    verdict: "true" | "false" | "unknown";
    explanation: string;
    constructionFocus?: string | null;
    evidence?: string[] | null;
    commands?: string[] | null;
  }> | null;
  elements?: Array<{
    label: string;
    type?: string | null;
    description?: string | null;
    role?: string | null;
  }> | null;
  nextActionHint?: string | null;
};

import type {
  FunctionCallToolName,
  AgentModelConfig,
  AgentModelProtocol,
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
import type { Locale } from "./locale";

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

export type CustomModelDefinition = {
  name: string;
  callName: string;
  supportsImages: boolean;
};

export type CustomProviderConfig = {
  name: string;
  baseUrl: string;
  apiKey: string;
  protocol: AgentModelProtocol;
  models: CustomModelDefinition[];
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
  customProvider: CustomProviderConfig;
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
