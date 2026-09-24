import AddCommentRounded from "@mui/icons-material/AddCommentRounded";
import FactCheckRounded from "@mui/icons-material/FactCheckRounded";
import ForumOutlined from "@mui/icons-material/ForumOutlined";
import LibraryBooksOutlined from "@mui/icons-material/LibraryBooksOutlined";
import MyLocationRounded from "@mui/icons-material/MyLocationRounded";
import SettingsRounded from "@mui/icons-material/SettingsRounded";
import SubjectRounded from "@mui/icons-material/SubjectRounded";
import { IconButton, Paper, Stack, Tooltip } from "@mui/material";
import type { ReactNode } from "react";
import { InteractionModeButton } from "./InteractionModeButton";
import type { FusionPoint } from "./geometry";

export function FusionToolbar(props: {
  summonLabel: string;
  positionLabel: string;
  windowLabel: string;
  historyLabel: string;
  transcriptLabel: string;
  newConversationLabel: string;
  blackboardLabel: string;
  problemBankLabel: string;
  settingsLabel: string;
  activePanel?: "transcript" | "history" | "blackboard" | "problem-bank" | "settings" | null;
  disabled?: boolean;
  languageControl?: ReactNode;
  onSummon: () => void;
  onPosition: () => void;
  onOpenHistory: (trigger: HTMLButtonElement) => void;
  onOpenTranscript: (trigger: HTMLButtonElement) => void;
  onNewConversation: () => void;
  onOpenBlackboard: (trigger: HTMLButtonElement) => void;
  onOpenProblemBank: (trigger: HTMLButtonElement) => void;
  onOpenSettings: (trigger: HTMLButtonElement) => void;
  onSwitchToWindow: (origin: FusionPoint) => void;
}) {
  return (
    <Paper
      elevation={3}
      sx={{
        position: "fixed",
        top: 54,
        right: 18,
        zIndex: 1350,
        border: 1,
        borderColor: "divider",
        borderRadius: 999,
        pointerEvents: "auto",
      }}
    >
      <Stack direction="row" spacing={0.25} sx={{ p: 0.375 }}>
        <Tooltip title={props.summonLabel} arrow>
          <IconButton size="small" onClick={props.onSummon} aria-label={props.summonLabel} data-copilot-tour="fusion-summon">
            <AddCommentRounded fontSize="small" />
          </IconButton>
        </Tooltip>
        <Tooltip title={props.positionLabel} arrow>
          <IconButton size="small" onClick={props.onPosition} aria-label={props.positionLabel} data-copilot-tour="fusion-position">
            <MyLocationRounded fontSize="small" />
          </IconButton>
        </Tooltip>
        <Tooltip title={props.newConversationLabel} arrow>
          <span><IconButton size="small" disabled={props.disabled} onClick={props.onNewConversation} aria-label={props.newConversationLabel} data-copilot-tour="fusion-new"><AddCommentRounded fontSize="small" /></IconButton></span>
        </Tooltip>
        <Tooltip title={props.historyLabel} arrow>
          <IconButton size="small" color={props.activePanel === "history" ? "primary" : "default"} onClick={(event) => props.onOpenHistory(event.currentTarget)} aria-label={props.historyLabel} data-copilot-tour="fusion-history"><ForumOutlined fontSize="small" /></IconButton>
        </Tooltip>
        <Tooltip title={props.transcriptLabel} arrow>
          <IconButton size="small" color={props.activePanel === "transcript" ? "primary" : "default"} onClick={(event) => props.onOpenTranscript(event.currentTarget)} aria-label={props.transcriptLabel} data-copilot-tour="fusion-transcript"><SubjectRounded fontSize="small" /></IconButton>
        </Tooltip>
        <Tooltip title={props.blackboardLabel} arrow>
          <IconButton size="small" color={props.activePanel === "blackboard" ? "primary" : "default"} onClick={(event) => props.onOpenBlackboard(event.currentTarget)} aria-label={props.blackboardLabel} data-copilot-tour="fusion-blackboard"><FactCheckRounded fontSize="small" /></IconButton>
        </Tooltip>
        <Tooltip title={props.problemBankLabel} arrow>
          <IconButton size="small" color={props.activePanel === "problem-bank" ? "primary" : "default"} onClick={(event) => props.onOpenProblemBank(event.currentTarget)} aria-label={props.problemBankLabel} data-copilot-tour="fusion-problem-bank"><LibraryBooksOutlined fontSize="small" /></IconButton>
        </Tooltip>
        <span data-copilot-tour="fusion-language" style={{ display: "inline-flex" }}>{props.languageControl}</span>
        <Tooltip title={props.settingsLabel} arrow>
          <IconButton size="small" color={props.activePanel === "settings" ? "primary" : "default"} onClick={(event) => props.onOpenSettings(event.currentTarget)} aria-label={props.settingsLabel} data-copilot-tour="fusion-settings"><SettingsRounded fontSize="small" /></IconButton>
        </Tooltip>
        <InteractionModeButton mode="fusion" label={props.windowLabel} onToggle={props.onSwitchToWindow} />
      </Stack>
    </Paper>
  );
}
