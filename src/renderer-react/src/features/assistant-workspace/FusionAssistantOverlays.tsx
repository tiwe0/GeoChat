import { AnimatePresence } from "motion/react";
import type { ReactNode } from "react";
import type { BlackboardEntry } from "@geochat-ai/app/blackboard";
import { useTranslation } from "react-i18next";
import { BlackboardDrawer } from "../../components/BlackboardDrawer";
import { ConversationDrawer, type ConversationSummary } from "../../components/ConversationDrawer";
import { ProblemBankSidecar } from "../../components/ProblemBankSidecar";
import {
  FusionOnboardingTour,
  FusionTranscript,
  FusionViewportCard,
  type FusionPanelId,
} from "../fusion-mode";

export function FusionAssistantOverlays(props: {
  activePanel: FusionPanelId | null;
  panelTitle: string;
  isStreaming: boolean;
  conversationHistory: {
    conversations: ConversationSummary[];
    loading: boolean;
    selectingId: string | null;
    deletingId: string | null;
    error: string | null;
    migrationRecoveryAvailable: boolean;
    exportMigrationRecovery: () => void;
    select: (conversation: ConversationSummary) => Promise<unknown>;
    remove: (conversation: ConversationSummary) => Promise<boolean>;
  };
  currentConversationId: string | null;
  blackboard: {
    loading: boolean;
    error: string | null;
    entries: BlackboardEntry[];
    load: () => Promise<void>;
  };
  onClose: (options?: { restoreFocus?: boolean }) => void;
  onUseProblem: (problem: string) => void;
  settings: ReactNode;
  onboardingReady: boolean;
  onCompleteOnboarding: () => void;
}) {
  const { t } = useTranslation();
  const panel = props.activePanel;

  return (
    <>
      <ConversationDrawer
        viewport
        open={panel === "history"}
        interactionDisabled={props.isStreaming}
        loading={props.conversationHistory.loading}
        selectingId={props.conversationHistory.selectingId}
        deletingId={props.conversationHistory.deletingId}
        error={props.conversationHistory.error}
        onExportRecovery={props.conversationHistory.migrationRecoveryAvailable
          ? props.conversationHistory.exportMigrationRecovery
          : undefined}
        conversations={props.conversationHistory.conversations}
        currentConversationId={props.currentConversationId}
        onClose={props.onClose}
        onSelect={(conversation) => {
          void props.conversationHistory.select(conversation).finally(() => props.onClose());
        }}
        onDelete={props.conversationHistory.remove}
      />
      <BlackboardDrawer
        viewport
        open={panel === "blackboard"}
        conversationId={props.currentConversationId}
        loading={props.blackboard.loading}
        error={props.blackboard.error}
        entries={props.blackboard.entries}
        onClose={props.onClose}
        onRefresh={() => void props.blackboard.load()}
      />
      <AnimatePresence initial={false}>
        {panel === "transcript" && (
          <FusionViewportCard key="fusion-transcript" panelId="transcript" title={props.panelTitle} closeLabel={t("history.close")} onClose={props.onClose}>
            <FusionTranscript emptyLabel={t("history.empty")} ariaLabel={t("fusion.transcript")} />
          </FusionViewportCard>
        )}
        {panel === "problem-bank" && (
          <FusionViewportCard key="fusion-problem-bank" panelId="problem-bank" title={t("problemBank.title")} closeLabel={t("problemBank.close")} onClose={props.onClose} hideHeader>
            <ProblemBankSidecar onClose={props.onClose} onUseProblem={props.onUseProblem} />
          </FusionViewportCard>
        )}
        {panel === "settings" && (
          <FusionViewportCard key="fusion-settings" panelId="settings" wide title={t("settings.title")} closeLabel={t("settings.back")} onClose={props.onClose}>
            {props.settings}
          </FusionViewportCard>
        )}
      </AnimatePresence>
      <FusionOnboardingTour run={props.onboardingReady} onComplete={props.onCompleteOnboarding} />
    </>
  );
}
