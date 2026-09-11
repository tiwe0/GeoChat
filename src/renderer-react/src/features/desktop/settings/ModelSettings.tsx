import { useCallback, useEffect, useMemo, useState } from "react";
import { Box, Button, MenuItem, Stack, TextField, Typography } from "@mui/material";
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
} from "../../../../../shared/desktop/desktop-config";
import type { ModelConfig } from "../../../../../shared/desktop/workbench-types";

export function ModelSettings() {
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
    <Stack spacing={2.5}>
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
      </Box>
    </Stack>
  );
}
