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
} from "../../../../shared/desktop/desktop-config";
import type { ModelConfig } from "../../../../shared/desktop/workbench-types";

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
export function SettingsPanel(props: { onClose: () => void }) {
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
      <Typography variant="subtitle1" fontWeight={600}>
        {t("settings.title", "模型设置")}
      </Typography>

      <TextField
        select
        size="small"
        label={t("settings.provider", "供应商")}
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
        label={t("settings.model", "模型")}
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
        label={t("settings.apiKey", "API 密钥")}
        value={model.apiKey}
        onChange={(event) => update({ apiKey: event.target.value })}
        // The verdict sits under the field that decides it, rather than in a
        // separate status card above it.
        helperText={
          ready
            ? t("settings.keyReady", "已配置 · 可以开始作图")
            : t("settings.keyMissing", "密钥只保存在本机，不会上传")
        }
        FormHelperTextProps={{ sx: { color: ready ? "success.main" : "text.secondary" } }}
      />

      <Box sx={{ display: "flex", gap: 1, alignItems: "center" }}>
        <Button variant="contained" size="small" onClick={save} disabled={saved}>
          {saved ? t("settings.saved", "已保存") : t("settings.save", "保存")}
        </Button>
        <Button size="small" onClick={props.onClose}>
          {t("settings.back", "返回")}
        </Button>
      </Box>
    </Stack>
  );
}
