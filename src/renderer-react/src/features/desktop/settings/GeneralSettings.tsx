import { Stack, Typography, FormControlLabel, Switch } from "@mui/material";
import { useTranslation } from "react-i18next";
import { UpdateSection } from "../UpdateSection";
import type { McpController } from "../useMcpState";

/**
 * Everything that is about the installation rather than about a conversation:
 * what version is running, and whether the local MCP server is listening.
 */
export function GeneralSettings({ mcp }: { mcp: McpController }) {
  return (
    <Stack spacing={3}>
      <UpdateSection />
      <McpSection mcp={mcp} />
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
