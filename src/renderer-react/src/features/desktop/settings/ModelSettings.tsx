import { PlusIcon, Trash2Icon } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Button,
  Box,
  FormControlLabel,
  IconButton,
  MenuItem,
  Stack,
  Switch,
  TextField,
  Tooltip,
  Typography,
} from "@mui/material";
import { useTranslation } from "react-i18next";
import {
  AGENT_MODEL_REGISTRY,
  CUSTOM_AGENT_PROVIDER_ID,
  getAgentProviderDefinition,
  getAgentProviderOptions,
  type AgentModelProtocol,
} from "@geochat-ai/app/model-registry";
import {
  credentialsForProvider,
  normalizeCustomProviderConfig,
  persistDesktopConfig,
  readDesktopConfig,
  updateProviderCredentials,
} from "../../../../../shared/desktop/desktop-config";
import type { CustomProviderConfig } from "../../../../../shared/desktop/workbench-types";
import type {
  DesktopProviderCredentialMetadata,
  DesktopSaveProviderCredentialRequest,
  GeoChatDesktopApi,
} from "../../../../../shared/desktop-api";
import { installedDesktopApi } from "../../../../../shared/desktop/tauri-bridge";
import { discoverProviderModels } from "../../models/modelDiscovery";
import { backendAuthToken, backendOrigin } from "../runtime";
import { SettingsHint } from "./SettingsHint";

type CredentialSaveState =
  | { status: "idle" }
  | { status: "valid" }
  | { status: "invalid"; message: string };

type CustomValidationError =
  | "nameRequired"
  | "baseUrlInvalid"
  | "apiKeyRequired"
  | "modelRequired"
  | "modelFieldsRequired"
  | "duplicateCallName"
  | "builtinCallNameConflict"
  | null;

const CUSTOM_PROTOCOLS: readonly AgentModelProtocol[] = ["openai-compatible", "anthropic", "google"];
const BUILTIN_MODEL_IDS = new Set<string>(AGENT_MODEL_REGISTRY.map((model) => model.id));

/**
 * Provider credentials are configured here. The active model is deliberately
 * selected from the provider/model picker in chat. A custom provider is the
 * one exception: choosing it reveals the provider and model definitions that
 * will be added to that picker.
 */
export function ModelSettings() {
  const { t } = useTranslation();
  const providers = useMemo(() => [
    ...getAgentProviderOptions(),
    { value: CUSTOM_AGENT_PROVIDER_ID, label: t("settings.customModel") },
  ], [t]);
  const [provider, setProvider] = useState("deepseek");
  const [apiKey, setApiKey] = useState("");
  const [credentialRef, setCredentialRef] = useState("");
  const [customProvider, setCustomProvider] = useState<CustomProviderConfig>(() => readDesktopConfig().customProvider);
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);
  const [credentialSave, setCredentialSave] = useState<CredentialSaveState>({ status: "idle" });

  const resetCredentialSave = useCallback(() => {
    setCredentialSave({ status: "idle" });
  }, []);

  useEffect(() => {
    const config = readDesktopConfig();
    const activeProvider = config.model.provider === CUSTOM_AGENT_PROVIDER_ID
      ? CUSTOM_AGENT_PROVIDER_ID
      : config.model.provider;
    setProvider(activeProvider);
    setCustomProvider(config.customProvider);
    if (activeProvider === CUSTOM_AGENT_PROVIDER_ID) {
      setCredentialRef(config.customProvider.credentialRef);
      return;
    }
    const credentials = credentialsForProvider(config.providerCredentials, activeProvider);
    setCredentialRef(credentials.credentialRef);
  }, []);

  const selectProvider = useCallback((nextProvider: string) => {
    const config = readDesktopConfig();
    setProvider(nextProvider);
    if (nextProvider === CUSTOM_AGENT_PROVIDER_ID) {
      setCustomProvider(config.customProvider);
      setCredentialRef(config.customProvider.credentialRef);
    } else {
      const credentials = credentialsForProvider(config.providerCredentials, nextProvider);
      setCredentialRef(credentials.credentialRef);
    }
    setApiKey("");
    setSaved(false);
    resetCredentialSave();
  }, [resetCredentialSave]);

  const isCustom = provider === CUSTOM_AGENT_PROVIDER_ID;
  const customValidationError = isCustom
    ? validateCustomProvider(customProvider, apiKey, readDesktopConfig().customProvider)
    : null;

  const updateCustomProvider = useCallback((next: CustomProviderConfig) => {
    setCustomProvider(next);
    setSaved(false);
    resetCredentialSave();
  }, [resetCredentialSave]);

  const save = useCallback(async () => {
    if (saving) return;
    const desktopApi = installedDesktopApi();
    if (!desktopApi) {
      setCredentialSave({ status: "invalid", message: "Native credential storage is unavailable." });
      return;
    }
    setSaving(true);
    setSaved(false);
    setCredentialSave({ status: "idle" });
    try {
      const config = readDesktopConfig();
      const secret = apiKey.trim();
      if (!secret) {
        if (isCustom && customProvider.credentialRef) {
          persistDesktopConfig({
            ...config,
            customProvider: normalizeCustomProviderConfig(customProvider),
          });
        }
        setSaved(true);
        return;
      }
      const existing = isCustom
        ? config.customProvider
        : credentialsForProvider(config.providerCredentials, provider);
      const protocol = isCustom ? customProvider.protocol : existing.protocol;
      const baseUrl = isCustom
        ? customProvider.baseUrl
        : existing.baseUrl || getAgentProviderDefinition(provider)?.defaultBaseUrl || "";
      const metadata = await replaceProviderCredential({
        desktopApi,
        request: { provider, protocol, baseUrl, secret },
        previousCredentialRef: existing.credentialRef,
        onCredentialStored: () => setApiKey(""),
        validate: async (nextCredentialRef) => {
          const outcome = await discoverProviderModels({
            apiOrigin: backendOrigin(),
            authToken: backendAuthToken(),
            credentialRef: nextCredentialRef,
            force: true,
          });
          if (outcome.status === "ok") return;
          throw new Error(outcome.status === "unsupported"
            ? t("settings.keyProbeUnsupported")
            : outcome.message);
        },
        commit: (metadata) => {
          const latestConfig = readDesktopConfig();
          if (isCustom) {
            persistDesktopConfig({
              ...latestConfig,
              customProvider: normalizeCustomProviderConfig({
                ...customProvider,
                baseUrl: metadata.canonicalBaseUrl,
                protocol: metadata.protocol,
                credentialRef: metadata.credentialRef,
              }),
            });
          } else {
            persistDesktopConfig(updateProviderCredentials(latestConfig, provider, {
              credentialRef: metadata.credentialRef,
              baseUrl: metadata.canonicalBaseUrl,
              protocol: metadata.protocol,
            }));
          }
        },
      });
      setCredentialRef(metadata.credentialRef);
      if (isCustom) setCustomProvider(readDesktopConfig().customProvider);
      setCredentialSave({ status: "valid" });
      setSaved(true);
      console.info(`[INFO] Saved model provider settings for provider=${provider}`);
    } catch (caughtError) {
      const message = caughtError instanceof Error ? caughtError.message : String(caughtError);
      setCredentialSave({ status: "invalid", message });
      console.warn(`[WARN] Model provider credential save failed for provider=${provider}: ${message}`);
    } finally {
      setSaving(false);
    }
  }, [apiKey, customProvider, isCustom, provider, saving, t]);

  const customValidationMessage = customValidationError
    ? t(`settings.customValidation.${customValidationError}`)
    : "";

  return (
    <Box className="settings-page settings-model-page">
      <Stack className="settings-model-form" spacing={2.25}>
        <TextField
          select
          disabled={saving}
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

        {isCustom ? (
          <>
            <TextField
              disabled={saving}
              size="small"
              label={t("settings.customProviderName")}
              value={customProvider.name}
              error={customValidationError === "nameRequired"}
              onChange={(event) => updateCustomProvider({ ...customProvider, name: event.target.value })}
            />
            <TextField
              disabled={saving}
              size="small"
              type="url"
              label={t("settings.customBaseUrl")}
              value={customProvider.baseUrl}
              placeholder="https://api.example.com/v1"
              error={customValidationError === "baseUrlInvalid"}
              helperText={customValidationError === "baseUrlInvalid" ? customValidationMessage : undefined}
              onChange={(event) => updateCustomProvider({ ...customProvider, baseUrl: event.target.value })}
            />
          </>
        ) : null}

        <ApiKeyField
          apiKey={apiKey}
          configured={Boolean(credentialRef)}
          credentialSave={credentialSave}
          disabled={saving}
          onChange={(value) => {
            setApiKey(value);
            setSaved(false);
            resetCredentialSave();
          }}
        />

        {isCustom ? (
          <>
            <TextField
              select
              disabled={saving}
              size="small"
              label={t("settings.customProtocol")}
              value={customProvider.protocol}
              onChange={(event) => updateCustomProvider({
                ...customProvider,
                protocol: event.target.value as AgentModelProtocol,
              })}
            >
              {CUSTOM_PROTOCOLS.map((protocol) => (
                <MenuItem key={protocol} value={protocol}>
                  {protocolLabel(protocol, t)}
                </MenuItem>
              ))}
            </TextField>

            <Stack spacing={1.25} sx={{ pt: 2, borderTop: 1, borderColor: "divider" }}>
              <Stack className="settings-custom-model-heading" direction="row" spacing={1}>
                <Stack spacing={0.25}>
                  <SettingsHint text={t("settings.customModelsDescription")}>
                    <Typography component="span" variant="subtitle2">{t("settings.customModels")}</Typography>
                  </SettingsHint>
                </Stack>
                <Button
                  disabled={saving}
                  size="small"
                  variant="outlined"
                  startIcon={<PlusIcon />}
                  onClick={() => updateCustomProvider({
                    ...customProvider,
                    models: [...customProvider.models, { name: "", callName: "", supportsImages: false }],
                  })}
                >
                  {t("settings.addModel")}
                </Button>
              </Stack>

              {customProvider.models.map((model, index) => {
                const duplicateCallName = model.callName.trim() !== "" && customProvider.models.some(
                  (candidate, candidateIndex) => candidateIndex !== index && candidate.callName.trim() === model.callName.trim(),
                );
                const builtinConflict = BUILTIN_MODEL_IDS.has(model.callName.trim());
                return (
                  <Stack
                    key={index}
                    spacing={1}
                    sx={{ p: 1.5, border: 1, borderColor: "divider", borderRadius: 1.5 }}
                  >
                    <Stack className="settings-custom-model-fields" direction="row" spacing={1}>
                      <TextField
                        disabled={saving}
                        fullWidth
                        size="small"
                        label={t("settings.customModelName")}
                        value={model.name}
                        error={customValidationError === "modelFieldsRequired" && !model.name.trim()}
                        onChange={(event) => updateCustomModel(customProvider, index, { name: event.target.value }, updateCustomProvider)}
                      />
                      <TextField
                        disabled={saving}
                        fullWidth
                        size="small"
                        label={t("settings.customModelCallName")}
                        value={model.callName}
                        error={duplicateCallName || builtinConflict || (customValidationError === "modelFieldsRequired" && !model.callName.trim())}
                        helperText={builtinConflict
                          ? t("settings.customModelCallNameConflict")
                          : duplicateCallName
                            ? t("settings.customValidation.duplicateCallName")
                            : undefined}
                        onChange={(event) => updateCustomModel(customProvider, index, { callName: event.target.value }, updateCustomProvider)}
                      />
                      <Tooltip title={t("settings.removeModel")}>
                        <IconButton
                          disabled={saving}
                          aria-label={t("settings.removeModel")}
                          color="error"
                          onClick={() => updateCustomProvider({
                            ...customProvider,
                            models: customProvider.models.filter((_, modelIndex) => modelIndex !== index),
                          })}
                        >
                          <Trash2Icon size={18} />
                        </IconButton>
                      </Tooltip>
                    </Stack>
                    <FormControlLabel
                      control={(
                        <Switch
                          disabled={saving}
                          size="small"
                          checked={model.supportsImages}
                          onChange={(event) => updateCustomModel(
                            customProvider,
                            index,
                            { supportsImages: event.target.checked },
                            updateCustomProvider,
                          )}
                        />
                      )}
                      label={t("settings.customModelSupportsImages")}
                    />
                  </Stack>
                );
              })}

              {customValidationError ? (
                <Typography variant="caption" color="error.main">
                  {customValidationMessage}
                </Typography>
              ) : null}
            </Stack>
          </>
        ) : null}
      </Stack>

      <Box className="settings-model-actions">
        <Button
          variant="contained"
          size="small"
          onClick={() => void save()}
          disabled={saving || saved || (!apiKey.trim() && !credentialRef) || (isCustom && customValidationError !== null)}
          sx={{ minWidth: 120 }}
        >
          {saved ? t("settings.saved") : t("settings.save")}
        </Button>
      </Box>
    </Box>
  );
}

function ApiKeyField(props: {
  apiKey: string;
  configured: boolean;
  credentialSave: CredentialSaveState;
  disabled?: boolean;
  onChange: (value: string) => void;
}) {
  const { t } = useTranslation();
  return (
    <Stack direction="row" spacing={1} sx={{ alignItems: "flex-start" }}>
      <TextField
        fullWidth
        size="small"
        type="password"
        disabled={props.disabled}
        label={t("settings.apiKey")}
        value={props.apiKey}
        onChange={(event) => props.onChange(event.target.value)}
        helperText={
          props.credentialSave.status === "valid"
              ? t("settings.keyValid")
              : props.credentialSave.status === "invalid"
                ? t("settings.keyInvalid", { message: props.credentialSave.message })
                : props.apiKey
                  ? t("settings.keyUnverified")
                  : props.configured
                    ? t("settings.saved")
                    : t("settings.keyMissing")
        }
        slotProps={{
          formHelperText: {
            sx: {
              color: props.credentialSave.status === "valid" || (props.configured && !props.apiKey)
                ? "success.main"
                : props.credentialSave.status === "invalid"
                  ? "error.main"
                  : "text.secondary",
            },
          },
        }}
      />
    </Stack>
  );
}

function updateCustomModel(
  provider: CustomProviderConfig,
  index: number,
  patch: Partial<CustomProviderConfig["models"][number]>,
  update: (next: CustomProviderConfig) => void,
) {
  update({
    ...provider,
    models: provider.models.map((model, modelIndex) => modelIndex === index ? { ...model, ...patch } : model),
  });
}

function validateCustomProvider(
  value: CustomProviderConfig,
  newSecret: string,
  persisted: CustomProviderConfig,
): CustomValidationError {
  if (!value.name.trim()) return "nameRequired";
  if (!isValidRequiredBaseUrl(value.baseUrl)) return "baseUrlInvalid";
  const bindingChanged = value.credentialRef.trim() !== "" && (
    value.baseUrl.trim() !== persisted.baseUrl.trim()
    || value.protocol !== persisted.protocol
  );
  if ((!value.credentialRef.trim() || bindingChanged) && !newSecret.trim()) return "apiKeyRequired";
  if (!value.models.length) return "modelRequired";
  if (value.models.some((model) => !model.name.trim() || !model.callName.trim())) return "modelFieldsRequired";
  const callNames = value.models.map((model) => model.callName.trim());
  if (new Set(callNames).size !== callNames.length) return "duplicateCallName";
  if (callNames.some((callName) => BUILTIN_MODEL_IDS.has(callName))) return "builtinCallNameConflict";
  return null;
}

export async function replaceProviderCredential(input: {
  desktopApi: Pick<GeoChatDesktopApi, "saveProviderCredential" | "deleteProviderCredential">;
  request: DesktopSaveProviderCredentialRequest;
  previousCredentialRef: string;
  onCredentialStored: () => void;
  validate: (credentialRef: string) => Promise<void>;
  commit: (metadata: DesktopProviderCredentialMetadata) => void;
}) {
  const metadata = await input.desktopApi.saveProviderCredential(input.request);
  input.onCredentialStored();
  try {
    await input.validate(metadata.credentialRef);
    input.commit(metadata);
  } catch (error) {
    await input.desktopApi.deleteProviderCredential(metadata.credentialRef).catch((deleteError) => {
      console.error("[ERROR] Failed to delete an uncommitted provider credential", deleteError);
    });
    throw error;
  }
  if (input.previousCredentialRef && input.previousCredentialRef !== metadata.credentialRef) {
    await input.desktopApi.deleteProviderCredential(input.previousCredentialRef).catch((error) => {
      console.error("[ERROR] Failed to delete the replaced provider credential", error);
    });
  }
  return metadata;
}

function isValidRequiredBaseUrl(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return false;
  try {
    const url = new URL(trimmed);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch (caughtError) {
    console.error("[ERROR] Caught exception at src/renderer-react/src/features/desktop/settings/ModelSettings.tsx:432", caughtError);
    return false;
  }
}

function protocolLabel(protocol: AgentModelProtocol, t: ReturnType<typeof useTranslation>["t"]) {
  if (protocol === "anthropic") return t("settings.customProtocols.anthropic");
  if (protocol === "google") return t("settings.customProtocols.google");
  return t("settings.customProtocols.openaiCompatible");
}
