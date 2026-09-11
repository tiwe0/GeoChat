import { useCallback, useEffect, useMemo, useState } from "react";
import { Box, Button, CircularProgress, MenuItem, Stack, TextField, Typography } from "@mui/material";
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
import { mergeDiscoveredAgentModels } from "@geochat-ai/app/model-discovery";
import { discoverProviderModels } from "../../models/modelDiscovery";
import { backendOrigin } from "../runtime";

export function ModelSettings() {
  const { t } = useTranslation();
  const [model, setModel] = useState<ModelConfig>(DEFAULT_MODEL_CONFIG);
  const [saved, setSaved] = useState(false);

  const providers = useMemo(() => getAgentProviderOptions(), []);
  const registered = useMemo(() => getAgentModelOptions(model.provider), [model.provider]);

  // What the provider says it serves today. The registry stays authoritative
  // for capability — these endpoints do not report whether a model can call
  // tools — so this only answers "still offered?" and "anything new?".
  const [discovered, setDiscovered] = useState<string[] | null>(null);
  const [discovering, setDiscovering] = useState(false);
  const [discoveryError, setDiscoveryError] = useState<string | null>(null);

  const runDiscovery = useCallback(async (config: ModelConfig, force: boolean) => {
    if (!config.apiKey.trim()) {
      setDiscovered(null);
      setDiscoveryError(null);
      return;
    }
    setDiscovering(true);
    setDiscoveryError(null);
    const outcome = await discoverProviderModels({
      apiOrigin: backendOrigin(),
      provider: config.provider,
      apiKey: config.apiKey,
      customBaseUrl: config.customBaseUrl,
      force
    });
    setDiscovering(false);
    if (outcome.status === "ok") {
      setDiscovered(outcome.ids);
      return;
    }
    // A lookup that did not happen must not be reported as an empty catalog:
    // null means "unknown", and the merge leaves every entry alone.
    setDiscovered(null);
    if (outcome.status === "failed") setDiscoveryError(outcome.message);
  }, []);

  useEffect(() => {
    const stored = readDesktopConfig().model;
    setModel(stored);
    // Reads the cache first, so opening Settings is not a provider round trip.
    void runDiscovery(stored, false);
  }, [runDiscovery]);

  const catalog = useMemo(
    () => mergeDiscoveredAgentModels({
      provider: model.provider,
      registered: registered.map((option) => ({ id: option.value, label: option.label })),
      discoveredIds: discovered
    }),
    [discovered, model.provider, registered]
  );

  const update = useCallback((patch: Partial<ModelConfig>) => {
    setSaved(false);
    if (patch.provider || patch.apiKey !== undefined || patch.customBaseUrl !== undefined) {
      setDiscovered(null);
      setDiscoveryError(null);
    }
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
        value={catalog.some((entry) => entry.id === model.model) ? model.model : ""}
        onChange={(event) => update({ model: event.target.value })}
        helperText={
          discoveryError
            ? t("settings.modelCheckFailed", { message: discoveryError })
            : discovered
              ? t("settings.modelCheckedAgainstProvider")
              : t("settings.modelFromRegistry")
        }
      >
        {catalog.map((entry) => (
          <MenuItem key={entry.id} value={entry.id}>
            {entry.label}
            {entry.availability !== "registered" ? (
              <Typography component="span" variant="caption" sx={{ ml: 1, color: entry.availability === "retired" ? "warning.main" : "text.secondary" }}>
                {t(entry.availability === "retired" ? "settings.modelRetired" : "settings.modelUnverified")}
              </Typography>
            ) : null}
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
        <Button
          size="small"
          disabled={discovering || !ready}
          onClick={() => void runDiscovery(model, true)}
          startIcon={discovering ? <CircularProgress size={14} /> : undefined}
        >
          {t("settings.refreshModels")}
        </Button>
      </Box>
    </Stack>
  );
}
