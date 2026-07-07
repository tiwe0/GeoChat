import { createSignal, onCleanup, type Accessor } from "solid-js";
import type { RuntimeInfo } from "@geochat-ai/app";
import { createImprovementPlanUploader } from "./improvement-plan";
import type { Locale } from "./i18n";
import type {
  DesktopChatMessage,
  DesktopConfig,
  RendererImprovementPlanState,
  RendererAccessState
} from "./workbench-types";
import {
  resolveWorkbenchDesktopRuntime,
  type WorkbenchDesktopRuntime
} from "./workbench-desktop-runtime";

const DEFAULT_IMPROVEMENT_PLAN_STATE: RendererImprovementPlanState = {
  available: false,
  enabled: true
};

export function createWorkbenchImprovementState(input: {
  runtime: Accessor<RuntimeInfo | undefined>;
  accessState: Accessor<RendererAccessState>;
  config: Accessor<DesktopConfig>;
  locale: Accessor<Locale>;
  desktopRuntime?: Partial<WorkbenchDesktopRuntime>;
  createUploader?: typeof createImprovementPlanUploader;
}) {
  const desktopRuntime = resolveWorkbenchDesktopRuntime(input.desktopRuntime);
  const [improvementPlanState, setImprovementPlanState] =
    createSignal<RendererImprovementPlanState>(DEFAULT_IMPROVEMENT_PLAN_STATE);
  const improvementPlanUploader = (input.createUploader ?? createImprovementPlanUploader)({
    runtime: input.runtime,
    enabled: () => improvementPlanState().enabled && input.accessState().features.improvementUpload,
    desktopRuntime
  });

  onCleanup(improvementPlanUploader.dispose);

  async function refreshImprovementPlanState() {
    const desktopApi = desktopRuntime.desktopApi();
    if (!desktopApi?.getImprovementPlanPreferences) {
      setImprovementPlanState(DEFAULT_IMPROVEMENT_PLAN_STATE);
      return DEFAULT_IMPROVEMENT_PLAN_STATE;
    }
    const preferences = await desktopApi
      .getImprovementPlanPreferences()
      .catch(() => DEFAULT_IMPROVEMENT_PLAN_STATE);
    const nextState = { ...preferences, available: true };
    setImprovementPlanState(nextState);
    return nextState;
  }

  async function changeImprovementPlanPreferences(preferences: Partial<RendererImprovementPlanState>) {
    const desktopApi = desktopRuntime.desktopApi();
    if (!desktopApi?.setImprovementPlanPreferences) return refreshImprovementPlanState();
    const nextPreferences = await desktopApi
      .setImprovementPlanPreferences({ enabled: preferences.enabled })
      .catch(() => improvementPlanState());
    const nextState = { ...nextPreferences, available: true };
    setImprovementPlanState(nextState);
    return nextState;
  }

  function enqueueMessage(inputMessage: {
    conversationId: string;
    message: DesktopChatMessage;
  }) {
    if (!improvementPlanState().enabled) return;
    void improvementPlanUploader.enqueueMessage({
      conversationId: inputMessage.conversationId,
      message: inputMessage.message,
      config: input.config(),
      locale: input.locale(),
      appVersion: input.runtime()?.appVersion ?? null
    });
  }

  void refreshImprovementPlanState();

  return {
    improvementPlanState,
    refreshImprovementPlanState,
    changeImprovementPlanPreferences,
    enqueueMessage
  };
}
