import FolderOpenRounded from "@mui/icons-material/FolderOpenRounded";
import { Box, Stack, Typography, FormControlLabel, Switch, Button, IconButton, MenuItem, TextField, Tooltip } from "@mui/material";
import { useTranslation } from "react-i18next";
import type { DesktopLogLevel } from "../../../../../shared/desktop-api";
import { UpdateSection } from "../UpdateSection";
import type { McpController } from "../useMcpState";
import { useLoggingState } from "../useLoggingState";
import { ProblemBankCacheSettings } from "./ProblemBankCacheSettings";
import { SettingsDisclosure } from "./SettingsDisclosure";
import { SettingsSection } from "./SettingsSection";

const LOG_LEVELS: DesktopLogLevel[] = ["error", "warn", "info", "debug", "trace"];

/**
 * Everything that is about the installation rather than about a conversation:
 * what version is running, and whether the local MCP server is listening.
 */
export function GeneralSettings({ mcp, onRestartTour }: { mcp: McpController; onRestartTour: () => void }) {
  return (
    <Box className="settings-page settings-general-page">
      <TourSection onRestartTour={onRestartTour} />
      <UpdateSection />
      <LoggingSection />
      <ProblemBankCacheSettings />
      <McpSection mcp={mcp} />
    </Box>
  );
}

function LoggingSection() {
  const { t } = useTranslation();
  const logging = useLoggingState();
  const { status } = logging;
  const detail = !logging.available ? (
    <Typography variant="caption" color="text.secondary">{t("settings.loggingUnavailable")}</Typography>
  ) : logging.error ? (
    <Typography variant="caption" color="error.main">{logging.error}</Typography>
  ) : null;

  return (
    <SettingsSection title={t("settings.loggingTitle")} description={t("settings.loggingDescription")}>
      <FormControlLabel
        className="settings-toggle-row"
        labelPlacement="start"
        control={
          <Switch
            size="small"
            checked={status.enabled}
            disabled={!logging.available || logging.busy}
            onChange={(event) => void logging.setEnabled(event.target.checked)}
          />
        }
        label={
          <Typography variant="body2" sx={{ fontWeight: 600 }}>
            {status.enabled ? t("settings.loggingEnabled") : t("settings.loggingDisabled")}
          </Typography>
        }
      />
      <SettingsDisclosure open={status.enabled}>
        <Stack className="settings-inline-controls settings-disclosure-controls" direction="row" spacing={1.25}>
          <TextField
            select
            fullWidth
            size="small"
            label={t("settings.loggingLevel")}
            value={status.level}
            disabled={!logging.available || logging.busy}
            onChange={(event) => void logging.setLevel(event.target.value as DesktopLogLevel)}
          >
            {LOG_LEVELS.map((level) => (
              <MenuItem key={level} value={level}>
                {t(`settings.loggingLevels.${level}`)}
              </MenuItem>
            ))}
          </TextField>
          <Tooltip title={t("settings.openLogFolder")} arrow>
            <span className="settings-tooltip-action">
              <IconButton
                className="settings-icon-action"
                size="small"
                aria-label={t("settings.openLogFolder")}
                disabled={!logging.available}
                onClick={() => void logging.openDirectory()}
              >
                <FolderOpenRounded fontSize="small" />
              </IconButton>
            </span>
          </Tooltip>
        </Stack>
      </SettingsDisclosure>
      <SettingsDisclosure open={detail !== null}>
        <Box className="settings-inline-detail">{detail}</Box>
      </SettingsDisclosure>
    </SettingsSection>
  );
}

function TourSection({ onRestartTour }: { onRestartTour: () => void }) {
  const { t } = useTranslation();

  return (
    <SettingsSection title={t("settings.tourTitle")} description={t("settings.tourDescription")}>
      <Button className="settings-row-action" variant="outlined" size="small" onClick={onRestartTour}>
        {t("settings.restartTour")}
      </Button>
    </SettingsSection>
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
  const detail = status.error ? (
    <Typography variant="caption" color="error.main">{status.error}</Typography>
  ) : status.enabled && status.running && status.endpoint ? (
    <Typography variant="caption" color="text.secondary" noWrap title={status.endpoint} sx={{ display: "block", maxWidth: "100%" }}>
      {status.endpoint}
    </Typography>
  ) : status.enabled ? (
    <Typography variant="caption" color="text.secondary">{t("settings.mcpStarting")}</Typography>
  ) : null;

  return (
    <SettingsSection title={t("settings.mcpTitle")} description={t("settings.mcpDescription")}>
      <FormControlLabel
        className="settings-toggle-row"
        labelPlacement="start"
        control={
          <Switch
            size="small"
            checked={status.enabled}
            disabled={busy}
            onChange={(event) => void mcp.setEnabled(event.target.checked)}
          />
        }
        label={
          <Typography variant="body2" sx={{ fontWeight: 600 }}>
            {status.enabled ? t("settings.mcpEnabled") : t("settings.mcpDisabled")}
          </Typography>
        }
      />
      <SettingsDisclosure open={detail !== null}>
        <Box className="settings-inline-detail">{detail}</Box>
      </SettingsDisclosure>
    </SettingsSection>
  );
}
