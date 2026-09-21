import FolderOpenRounded from "@mui/icons-material/FolderOpenRounded";
import { Stack, Typography, FormControlLabel, Switch, Button, MenuItem, TextField } from "@mui/material";
import { useTranslation } from "react-i18next";
import type { DesktopLogLevel } from "../../../../../shared/desktop-api";
import { UpdateSection } from "../UpdateSection";
import type { McpController } from "../useMcpState";
import { useLoggingState } from "../useLoggingState";

const LOG_LEVELS: DesktopLogLevel[] = ["error", "warn", "info", "debug", "trace"];

/**
 * Everything that is about the installation rather than about a conversation:
 * what version is running, and whether the local MCP server is listening.
 */
export function GeneralSettings({ mcp, onRestartTour }: { mcp: McpController; onRestartTour: () => void }) {
  return (
    <Stack spacing={3}>
      <TourSection onRestartTour={onRestartTour} />
      <UpdateSection />
      <LoggingSection />
      <McpSection mcp={mcp} />
    </Stack>
  );
}

function LoggingSection() {
  const { t } = useTranslation();
  const logging = useLoggingState();
  const { status } = logging;

  return (
    <Stack spacing={0.75}>
      <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>
        {t("settings.loggingTitle")}
      </Typography>
      <Typography variant="body2" color="text.secondary">
        {t("settings.loggingDescription")}
      </Typography>
      <FormControlLabel
        control={
          <Switch
            size="small"
            checked={status.enabled}
            disabled={!logging.available || logging.busy}
            onChange={(event) => void logging.setEnabled(event.target.checked)}
          />
        }
        label={
          <Typography variant="body2">
            {status.enabled ? t("settings.loggingEnabled") : t("settings.loggingDisabled")}
          </Typography>
        }
      />
      <TextField
        select
        size="small"
        label={t("settings.loggingLevel")}
        value={status.level}
        disabled={!logging.available || !status.enabled || logging.busy}
        onChange={(event) => void logging.setLevel(event.target.value as DesktopLogLevel)}
        sx={{ maxWidth: 220 }}
      >
        {LOG_LEVELS.map((level) => (
          <MenuItem key={level} value={level}>
            {t(`settings.loggingLevels.${level}`)}
          </MenuItem>
        ))}
      </TextField>
      <Button
        variant="outlined"
        size="small"
        startIcon={<FolderOpenRounded />}
        disabled={!logging.available}
        onClick={() => void logging.openDirectory()}
        sx={{ alignSelf: "flex-start", mt: 0.5 }}
      >
        {t("settings.openLogFolder")}
      </Button>
      {!logging.available ? (
        <Typography variant="caption" color="text.secondary">
          {t("settings.loggingUnavailable")}
        </Typography>
      ) : logging.error ? (
        <Typography variant="caption" color="error.main">{logging.error}</Typography>
      ) : status.logDirectory ? (
        <Typography variant="caption" color="text.secondary" sx={{ wordBreak: "break-all" }}>
          {status.logDirectory}
        </Typography>
      ) : null}
    </Stack>
  );
}

function TourSection({ onRestartTour }: { onRestartTour: () => void }) {
  const { t } = useTranslation();

  return (
    <Stack spacing={0.75}>
      <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>
        {t("settings.tourTitle")}
      </Typography>
      <Typography variant="body2" color="text.secondary">
        {t("settings.tourDescription")}
      </Typography>
      <Button variant="outlined" size="small" onClick={onRestartTour} sx={{ alignSelf: "flex-start", mt: 0.5 }}>
        {t("settings.restartTour")}
      </Button>
    </Stack>
  );
}

/**
 * The local MCP server, off by default.
 *
 * It lets an external client drive this canvas, which is a developer tool
 * rather than a drawing feature, so it sits at the foot of Settings and states
 * its endpoint only once something is actually listening.
 */
function McpSection({ mcp }: { mcp: McpController }) {
  const { t } = useTranslation();
  const { status, busy } = mcp;

  return (
    <Stack spacing={0.75}>
      <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>
        {t("settings.mcpTitle")}
      </Typography>
      <Typography variant="body2" color="text.secondary">
        {t("settings.mcpDescription")}
      </Typography>
      <FormControlLabel
        control={
          <Switch
            size="small"
            checked={status.enabled}
            disabled={busy}
            onChange={(event) => void mcp.setEnabled(event.target.checked)}
          />
        }
        label={
          <Typography variant="body2">
            {status.enabled ? t("settings.mcpEnabled") : t("settings.mcpDisabled")}
          </Typography>
        }
      />
      {status.error ? (
        <Typography variant="caption" color="error.main">{status.error}</Typography>
      ) : status.enabled && status.running && status.endpoint ? (
        <Typography variant="caption" color="text.secondary" sx={{ wordBreak: "break-all" }}>
          {status.endpoint}
        </Typography>
      ) : status.enabled ? (
        <Typography variant="caption" color="text.secondary">{t("settings.mcpStarting")}</Typography>
      ) : null}
    </Stack>
  );
}
