import { Box, Button, LinearProgress, Stack, Typography } from "@mui/material";
import { useTranslation } from "react-i18next";
import { useUpdateState } from "./useUpdateState";
import type { DesktopUpdateRecommendation } from "../../../../shared/desktop-api";

const RECOMMENDATION_KEYS: Record<DesktopUpdateRecommendation, string> = {
  none: "settings.updateRecommendations.none",
  shell: "settings.updateRecommendations.shell",
  app_bundle: "settings.updateRecommendations.appBundle",
  both_shell_first: "settings.updateRecommendations.bothShellFirst",
  shell_required_for_app_bundle: "settings.updateRecommendations.shellRequiredForAppBundle",
  error: "settings.updateRecommendations.error"
};

const ACTION_KEYS = {
  install_shell: "settings.updateInstall",
  download_shell: "settings.updateDownload",
  install_app_bundle: "settings.updateInstallAppBundle",
  check: "settings.updateCheck"
} as const;

/**
 * The update surface, kept to one line of status and one button.
 *
 * Which action is correct is decided in shared/desktop/update-state, because
 * getting it wrong is not cosmetic: an app bundle installed before the shell
 * it needs is rejected. This renders that decision rather than re-deriving it.
 */
export function UpdateSection() {
  const { t } = useTranslation();
  const update = useUpdateState();
  const { shell, unified, supported, action, actionBusy } = update;

  if (!supported) {
    return (
      <Typography variant="body2" color="text.secondary">
        {t("settings.updateUnsupported")}
      </Typography>
    );
  }

  const downloading = shell.status === "downloading";
  const percent = shell.downloadPercent;
  const failed = unified.status === "error";
  const detail = failed ? unified.error ?? unified.message : unified.message;

  return (
    <Stack spacing={1.25}>
      <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>
        {t("settings.updateTitle")}
      </Typography>

      <Typography variant="body2" color={failed ? "error.main" : "text.secondary"}>
        {t(RECOMMENDATION_KEYS[unified.recommendation])}
      </Typography>

      {/* The shell's own message names the version; the recommendation above
          only names the kind of update. */}
      {detail && detail !== t(RECOMMENDATION_KEYS[unified.recommendation]) ? (
        <Typography variant="caption" color={failed ? "error.main" : "text.secondary"}>
          {detail}
        </Typography>
      ) : null}

      {downloading ? (
        <Box>
          <LinearProgress
            variant={typeof percent === "number" ? "determinate" : "indeterminate"}
            value={typeof percent === "number" ? percent : undefined}
          />
          {typeof percent === "number" ? (
            <Typography variant="caption" color="text.secondary">
              {t("settings.updateDownloading", { percent: Math.round(percent) })}
            </Typography>
          ) : null}
        </Box>
      ) : null}

      <Box sx={{ display: "flex", gap: 1.5, alignItems: "center", flexWrap: "wrap" }}>
        <Button
          size="small"
          variant={action === "check" ? "outlined" : "contained"}
          disabled={actionBusy}
          onClick={() => void update.runPrimaryAction()}
        >
          {actionBusy ? t("settings.updateChecking") : t(ACTION_KEYS[action])}
        </Button>
        <Typography variant="caption" color="text.secondary">
          {t("settings.updateCurrentVersion")} {shell.currentVersion || "—"}
          {" · "}
          {shell.checkedAt
            ? t("settings.updateLastChecked", { when: formatCheckedAt(shell.checkedAt) })
            : t("settings.updateNeverChecked")}
        </Typography>
      </Box>
    </Stack>
  );
}

function formatCheckedAt(value: string) {
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? new Date(parsed).toLocaleString() : value;
}
