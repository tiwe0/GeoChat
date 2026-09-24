import { useTheme } from "@mui/material";
import { Joyride, STATUS, type Step } from "react-joyride";
import { useTranslation } from "react-i18next";

export function FusionOnboardingTour(props: { run: boolean; onComplete: () => void }) {
  const { t } = useTranslation();
  const theme = useTheme();
  const steps: Step[] = [
    { target: '[data-copilot-tour="fusion-summon"]', title: t("fusionTour.summonTitle"), content: t("fusionTour.summonDescription"), placement: "bottom-end", skipBeacon: true },
    { target: '[data-copilot-tour="fusion-position"]', title: t("fusionTour.positionTitle"), content: t("fusionTour.positionDescription"), placement: "bottom-end", skipBeacon: true },
    { target: '[data-copilot-tour="fusion-composer"]', title: t("fusionTour.composerTitle"), content: t("fusionTour.composerDescription"), placement: "top", skipBeacon: true },
    { target: '[data-copilot-tour="fusion-model"]', title: t("tour.modelTitle"), content: t("tour.modelDescription"), placement: "top", skipBeacon: true },
    { target: '[data-copilot-tour="fusion-attachments"]', title: t("tour.attachmentsTitle"), content: t("tour.attachmentsDescription"), placement: "top", skipBeacon: true },
    { target: '[data-copilot-tour="fusion-send"]', title: t("tour.sendTitle"), content: t("fusionTour.sendDescription"), placement: "top", skipBeacon: true },
    { target: '[data-copilot-tour="fusion-new"]', title: t("tour.newConversationTitle"), content: t("tour.newConversationDescription"), placement: "bottom-end", skipBeacon: true },
    { target: '[data-copilot-tour="fusion-history"]', title: t("tour.historyTitle"), content: t("tour.historyDescription"), placement: "bottom-end", skipBeacon: true },
    { target: '[data-copilot-tour="fusion-transcript"]', title: t("fusionTour.transcriptTitle"), content: t("fusionTour.transcriptDescription"), placement: "bottom-end", skipBeacon: true },
    { target: '[data-copilot-tour="fusion-blackboard"]', title: t("tour.blackboardTitle"), content: t("tour.blackboardDescription"), placement: "bottom-end", skipBeacon: true },
    { target: '[data-copilot-tour="fusion-problem-bank"]', title: t("tour.problemBankTitle"), content: t("tour.problemBankDescription"), placement: "bottom-end", skipBeacon: true },
    { target: '[data-copilot-tour="fusion-language"]', title: t("tour.languageTitle"), content: t("tour.languageDescription"), placement: "bottom-end", skipBeacon: true },
    { target: '[data-copilot-tour="fusion-settings"]', title: t("tour.settingsTitle"), content: t("tour.settingsDescription"), placement: "bottom-end", skipBeacon: true },
    { target: '[data-interaction-mode-toggle]', title: t("fusionTour.modeTitle"), content: t("fusionTour.modeDescription"), placement: "bottom-end", skipBeacon: true },
  ];
  return (
    <Joyride
      steps={steps}
      run={props.run}
      continuous
      scrollToFirstStep={false}
      locale={{ back: t("tour.back"), close: t("tour.close"), last: t("tour.done"), next: t("tour.next"), nextWithProgress: t("tour.nextWithProgress"), skip: t("tour.skip") }}
      options={{ primaryColor: theme.palette.primary.main, overlayColor: "rgba(17,24,39,.5)", overlayClickAction: false, spotlightPadding: 6, spotlightRadius: 10, showProgress: true, zIndex: 1600 }}
      styles={{ tooltip: { borderRadius: 12, padding: 16 }, tooltipTitle: { fontSize: 15, fontWeight: 800 }, tooltipContent: { fontSize: 13, lineHeight: 1.55, padding: "8px 0 12px" }, buttonPrimary: { borderRadius: 8, fontSize: 13, fontWeight: 700 } }}
      onEvent={(data) => { if (data.status === STATUS.FINISHED || data.status === STATUS.SKIPPED) props.onComplete(); }}
    />
  );
}
