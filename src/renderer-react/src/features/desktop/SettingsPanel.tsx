import { useCallback, useEffect, useMemo, useState } from "react";
import { Box, Button, Divider, FormControlLabel, MenuItem, Stack, Switch, TextField, Typography } from "@mui/material";
import { useTranslation } from "react-i18next";
import {
  getAgentModelOptions,
  getAgentProviderOptions
} from "@geochat-ai/app/model-registry";
import {
  DEFAULT_MODEL_CONFIG,
  hasConfiguredApiKey,
  persistDesktopConfig,
  readDesktopConfig
} from "../../../../shared/desktop/desktop-config";
import type { ModelConfig } from "../../../../shared/desktop/workbench-types";
import { UpdateSection } from "./UpdateSection";
import type { McpController } from "./useMcpState";

/**
 * Desktop settings, deliberately small.
 *
 * A UX audit of the SolidJS renderer found its eight-tab settings dialog to be
 * the worst surface in the app: two tabs empty, a 4278px skills page whose own
 * copy said to leave it alone, and three red capability failures shown above
 * the field that fixes them. None of that is rebuilt here.
 *
 * What a local-first desktop build actually needs is one screen: which
 * provider, which model, and the key. Everything else follows from those.
 */
export function SettingsPanel(props: { mcp: McpController; onClose: () => void }) {
  const { t } = useTranslation();
  const [model, setModel] = useState<ModelConfig>(DEFAULT_MODEL_CONFIG);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    setModel(readDesktopConfig().model);
  }, []);

  const providers = useMemo(() => getAgentProviderOptions(), []);
  const models = useMemo(() => getAgentModelOptions(model.provider), [model.provider]);

  const update = useCallback((patch: Partial<ModelConfig>) => {
    setSaved(false);
    setModel((current) => {
      const next = { ...current, ...patch };
      // Switching provider invalidates the model, so fall to that provider's
      // first entry rather than leaving a selection that cannot run.
      if (patch.provider && patch.provider !== current.provider) {
        next.model = getAgentModelOptions(patch.provider)[0]?.value ?? "";
      }
      return next;
    });
  }, []);

  const save = useCallback(() => {
    const config = readDesktopConfig();
    persistDesktopConfig({ ...config, model });
    setSaved(true);
  }, [model]);

  const ready = hasConfiguredApiKey(model);

  return (
    <Stack spacing={2.5} sx={{ flex: 1, overflowY: "auto", p: 2.5 }}>
      <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>
        {t("settings.title")}
      </Typography>

      <TextField
        select
        size="small"
        label={t("settings.provider")}
        value={model.provider}
        onChange={(event) => update({ provider: event.target.value })}
      >
        {providers.map((provider) => (
          <MenuItem key={provider.value} value={provider.value}>
            {provider.label}
          </MenuItem>
        ))}
      </TextField>

      <TextField
        select
        size="small"
        label={t("settings.model")}
        value={models.some((option) => option.value === model.model) ? model.model : ""}
        onChange={(event) => update({ model: event.target.value })}
      >
        {models.map((option) => (
          <MenuItem key={option.value} value={option.value}>
            {option.label}
          </MenuItem>
        ))}
      </TextField>

      <TextField
        size="small"
        type="password"
        label={t("settings.apiKey")}
        value={model.apiKey}
        onChange={(event) => update({ apiKey: event.target.value })}
        // The verdict sits under the field that decides it, rather than in a
        // separate status card above it.
        helperText={
          ready
            ? t("settings.keyReady")
            : t("settings.keyMissing")
        }
        slotProps={{ formHelperText: { sx: { color: ready ? "success.main" : "text.secondary" } } }}
      />

      <Box sx={{ display: "flex", gap: 1, alignItems: "center" }}>
        <Button variant="contained" size="small" onClick={save} disabled={saved}>
          {saved ? t("settings.saved") : t("settings.save")}
        </Button>
        <Button size="small" onClick={props.onClose}>
          {t("settings.back")}
        </Button>
      </Box>

      <Divider flexItem />

      <UpdateSection />

      <Divider flexItem />

      <McpSection mcp={props.mcp} />
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
