import { useCallback, useEffect, useMemo, useState } from "react";
import { Button, MenuItem, Stack, TextField } from "@mui/material";
import { useTranslation } from "react-i18next";
import { getAgentProviderOptions } from "@geochat-ai/app/model-registry";
import {
  credentialsForProvider,
  persistDesktopConfig,
  readDesktopConfig,
} from "../../../../../shared/desktop/desktop-config";

/**
 * Provider credentials are configured here. The active model is deliberately
 * not part of Settings; it is selected from the provider/model picker in chat.
 */
export function ModelSettings() {
  const { t } = useTranslation();
  const providers = useMemo(() => getAgentProviderOptions(), []);
  const [provider, setProvider] = useState("deepseek");
  const [apiKey, setApiKey] = useState("");
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    const config = readDesktopConfig();
    const activeProvider = config.model.provider;
    setProvider(activeProvider);
    setApiKey(credentialsForProvider(config.providerCredentials, activeProvider).apiKey);
  }, []);

  const selectProvider = useCallback((nextProvider: string) => {
    const config = readDesktopConfig();
    setProvider(nextProvider);
    setApiKey(credentialsForProvider(config.providerCredentials, nextProvider).apiKey);
    setSaved(false);
  }, []);

  const save = useCallback(() => {
    const config = readDesktopConfig();
    const currentCredentials = credentialsForProvider(config.providerCredentials, provider);
    persistDesktopConfig({
      ...config,
      providerCredentials: {
        ...config.providerCredentials,
        [provider]: {
          ...currentCredentials,
          apiKey,
        },
      },
    });
    setSaved(true);
  }, [apiKey, provider]);

  return (
    <Stack spacing={2.5}>
      <TextField
        select
        size="small"
        label={t("settings.provider")}
        value={provider}
        onChange={(event) => selectProvider(event.target.value)}
      >
        {providers.map((entry) => (
          <MenuItem key={entry.value} value={entry.value}>
            {entry.label}
          </MenuItem>
        ))}
      </TextField>

      <TextField
        size="small"
        type="password"
        label={t("settings.apiKey")}
        value={apiKey}
        onChange={(event) => {
          setApiKey(event.target.value);
          setSaved(false);
        }}
        helperText={apiKey.trim() ? t("settings.keyReady") : t("settings.keyMissing")}
        slotProps={{ formHelperText: { sx: { color: apiKey.trim() ? "success.main" : "text.secondary" } } }}
      />

      <Button variant="contained" size="small" onClick={save} disabled={saved}>
        {saved ? t("settings.saved") : t("settings.save")}
      </Button>
    </Stack>
  );
}
