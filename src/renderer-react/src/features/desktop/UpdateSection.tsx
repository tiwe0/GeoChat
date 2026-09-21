import RefreshRounded from "@mui/icons-material/RefreshRounded";
import { Box, CircularProgress, IconButton, LinearProgress, Tooltip, Typography } from "@mui/material";
import { useTranslation } from "react-i18next";
import { useUpdateState } from "./useUpdateState";
import type { DesktopUpdateRecommendation } from "../../../../shared/desktop-api";
import { SettingsDisclosure } from "./settings/SettingsDisclosure";

const RECOMMENDATION_KEYS: Record<DesktopUpdateRecommendation, string> = {
  none: "settings.updateRecommendations.none",
  shell: "settings.updateRecommendations.shell",
  app_bundle: "settings.updateRecommendations.appBundle",
  both_shell_first: "settings.updateRecommendations.bothShellFirst",
  shell_required_for_app_bundle: "settings.updateRecommendations.shellRequiredForAppBundle",
  error: "settings.updateRecommendations.error"
};

/**
 * The update surface, kept to one compact status and a refresh action.
 * Installation and download policy stays in the desktop updater; Settings only
 * reports the resolved state and lets the user request a fresh check.
 */
export function UpdateSection() {
  const { t } = useTranslation();
  const update = useUpdateState();
  const { shell, appBundle, unified, supported, actionBusy } = update;

  if (!supported) {
    return (
      <Box component="section" className="settings-section">
        <Box className="settings-section-copy">
          <Typography variant="subtitle2" sx={{ fontWeight: 750 }}>{t("settings.updateTitle")}</Typography>
        </Box>
        <Box className="settings-section-controls">
          <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5, lineHeight: 1.55 }}>
            {t("settings.updateUnsupported")}
          </Typography>
        </Box>
      </Box>
    );
  }

  const downloading = shell.status === "downloading";
  const percent = shell.downloadPercent;
  const failed = unified.status === "error";
  const currentVersion = shell.currentVersion || "—";
  const latestVersion = shell.updateVersion ?? appBundle.bundleVersion ?? currentVersion;
  const isLatest = unified.recommendation === "none" && !failed;
  const detail = failed ? unified.error ?? unified.message : null;

  return (
    <Box component="section" className="settings-section">
      <Box className="settings-section-copy">
        <Typography variant="subtitle2" sx={{ fontWeight: 750 }}>{t("settings.updateTitle")}</Typography>
      </Box>

      <Box className="settings-section-controls settings-update-control">
        <Box className="settings-update-copy">
          <Typography variant="body2" color={failed ? "error.main" : "text.primary"} sx={{ fontWeight: 600, lineHeight: 1.45 }}>
            {isLatest
              ? t("settings.updateLatest", { version: currentVersion })
              : t(RECOMMENDATION_KEYS[unified.recommendation])}
          </Typography>
          <SettingsDisclosure open={!isLatest || downloading}>
            <Box className="settings-update-detail">
              {!isLatest && !failed ? (
                <Typography variant="caption" color="text.secondary">
                  {t("settings.updateVersionComparison", { latestVersion, currentVersion })}
                </Typography>
              ) : detail ? (
                <Typography variant="caption" color="error.main">{detail}</Typography>
              ) : null}

              {downloading ? (
                <Box className="settings-update-progress">
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
            </Box>
          </SettingsDisclosure>
        </Box>

        <Tooltip title={actionBusy ? t("settings.updateChecking") : t("settings.updateCheck")} arrow>
          <span className="settings-row-action settings-tooltip-action">
            <IconButton
              className="settings-icon-action"
              size="small"
              aria-label={t("settings.updateCheck")}
              disabled={actionBusy}
              onClick={() => void update.check()}
            >
              {actionBusy ? <CircularProgress size={18} thickness={4.5} /> : <RefreshRounded fontSize="small" />}
            </IconButton>
          </span>
        </Tooltip>
      </Box>
    </Box>
  );
}
