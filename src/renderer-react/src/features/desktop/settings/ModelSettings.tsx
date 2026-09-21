import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import AddRounded from "@mui/icons-material/AddRounded";
import DeleteOutlineRounded from "@mui/icons-material/DeleteOutlineRounded";
import NetworkCheckRounded from "@mui/icons-material/NetworkCheckRounded";
import {
  Button,
  CircularProgress,
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
import { discoverProviderModels } from "../../models/modelDiscovery";
import { backendAuthToken, backendOrigin } from "../runtime";

type KeyProbeState =
  | { status: "idle" }
  | { status: "probing" }
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
  const [customProvider, setCustomProvider] = useState<CustomProviderConfig>(() => readDesktopConfig().customProvider);
  const [saved, setSaved] = useState(false);
  const [keyProbe, setKeyProbe] = useState<KeyProbeState>({ status: "idle" });
  const probeRequest = useRef(0);

  const resetKeyProbe = useCallback(() => {
    probeRequest.current += 1;
    setKeyProbe({ status: "idle" });
  }, []);

  useEffect(() => {
    const config = readDesktopConfig();
    const activeProvider = config.model.provider === CUSTOM_AGENT_PROVIDER_ID
      ? CUSTOM_AGENT_PROVIDER_ID
      : config.model.provider;
    setProvider(activeProvider);
    setCustomProvider(config.customProvider);
    if (activeProvider === CUSTOM_AGENT_PROVIDER_ID) {
      setApiKey(config.customProvider.apiKey);
      return;
    }
    const credentials = credentialsForProvider(config.providerCredentials, activeProvider);
    setApiKey(credentials.apiKey);
  }, []);

  const selectProvider = useCallback((nextProvider: string) => {
    const config = readDesktopConfig();
    setProvider(nextProvider);
    if (nextProvider === CUSTOM_AGENT_PROVIDER_ID) {
      setCustomProvider(config.customProvider);
      setApiKey(config.customProvider.apiKey);
    } else {
      const credentials = credentialsForProvider(config.providerCredentials, nextProvider);
      setApiKey(credentials.apiKey);
    }
    setSaved(false);
    resetKeyProbe();
  }, [resetKeyProbe]);

  const isCustom = provider === CUSTOM_AGENT_PROVIDER_ID;
  const customValidationError = isCustom ? validateCustomProvider({ ...customProvider, apiKey }) : null;

  const updateCustomProvider = useCallback((next: CustomProviderConfig) => {
    setCustomProvider(next);
    setSaved(false);
    resetKeyProbe();
  }, [resetKeyProbe]);

  const probeApiKey = useCallback(async () => {
    const trimmedApiKey = apiKey.trim();
    if (!trimmedApiKey) return;

    const requestId = probeRequest.current + 1;
    probeRequest.current = requestId;
    setKeyProbe({ status: "probing" });
    console.debug(`[DEBUG] Probing API credentials for provider=${provider}`);

    const outcome = await discoverProviderModels({
      apiOrigin: backendOrigin(),
      authToken: backendAuthToken(),
      provider,
      apiKey: trimmedApiKey,
      customBaseUrl: isCustom ? customProvider.baseUrl : undefined,
      protocol: isCustom ? customProvider.protocol : undefined,
      force: true,
    });
    if (probeRequest.current !== requestId) return;

    if (outcome.status === "ok") {
      setKeyProbe({ status: "valid" });
      console.info(`[INFO] API credential probe succeeded for provider=${provider}`);
      return;
    }
    console.warn(`[WARN] API credential probe did not succeed for provider=${provider} status=${outcome.status}`);
    setKeyProbe({
      status: "invalid",
      message: outcome.status === "unsupported"
        ? t("settings.keyProbeUnsupported")
        : outcome.message,
    });
  }, [apiKey, customProvider.baseUrl, customProvider.protocol, isCustom, provider, t]);

  const save = useCallback(() => {
    const config = readDesktopConfig();
    if (isCustom) {
      persistDesktopConfig({
        ...config,
        customProvider: normalizeCustomProviderConfig({ ...customProvider, apiKey }),
      });
    } else {
      persistDesktopConfig(updateProviderCredentials(config, provider, {
        apiKey,
        customBaseUrl: "",
      }));
    }
    setSaved(true);
    console.info(`[INFO] Saved model provider settings for provider=${provider}`);
  }, [apiKey, customProvider, isCustom, provider]);

  const customValidationMessage = customValidationError
    ? t(`settings.customValidation.${customValidationError}`)
    : "";

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

      {isCustom ? (
        <>
          <TextField
            size="small"
            label={t("settings.customProviderName")}
            value={customProvider.name}
            error={customValidationError === "nameRequired"}
            onChange={(event) => updateCustomProvider({ ...customProvider, name: event.target.value })}
          />
          <TextField
            size="small"
            type="url"
            label={t("settings.customBaseUrl")}
            value={customProvider.baseUrl}
            placeholder="https://api.example.com/v1"
            error={customValidationError === "baseUrlInvalid"}
            helperText={customValidationError === "baseUrlInvalid" ? customValidationMessage : t("settings.customBaseUrlRequired")}
            onChange={(event) => updateCustomProvider({ ...customProvider, baseUrl: event.target.value })}
          />
        </>
      ) : null}

      <ApiKeyField
        apiKey={apiKey}
        keyProbe={keyProbe}
        probeDisabled={isCustom && !isValidRequiredBaseUrl(customProvider.baseUrl)}
        onChange={(value) => {
          setApiKey(value);
          setSaved(false);
          resetKeyProbe();
        }}
        onProbe={() => void probeApiKey()}
      />

      {isCustom ? (
        <>
          <TextField
            select
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

          <Stack spacing={1.25}>
            <Stack direction="row" spacing={1} sx={{ alignItems: "center", justifyContent: "space-between" }}>
              <Stack spacing={0.25}>
                <Typography variant="subtitle2">{t("settings.customModels")}</Typography>
                <Typography variant="caption" color="text.secondary">
                  {t("settings.customModelsDescription")}
                </Typography>
              </Stack>
              <Button
                size="small"
                variant="outlined"
                startIcon={<AddRounded />}
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
                  <Stack direction={{ xs: "column", sm: "row" }} spacing={1} sx={{ alignItems: { sm: "flex-start" } }}>
                    <TextField
                      fullWidth
                      size="small"
                      label={t("settings.customModelName")}
                      value={model.name}
                      error={customValidationError === "modelFieldsRequired" && !model.name.trim()}
                      onChange={(event) => updateCustomModel(customProvider, index, { name: event.target.value }, updateCustomProvider)}
                    />
                    <TextField
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
                        aria-label={t("settings.removeModel")}
                        color="error"
                        onClick={() => updateCustomProvider({
                          ...customProvider,
                          models: customProvider.models.filter((_, modelIndex) => modelIndex !== index),
                        })}
                      >
                        <DeleteOutlineRounded fontSize="small" />
                      </IconButton>
                    </Tooltip>
                  </Stack>
                  <FormControlLabel
                    control={(
                      <Switch
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

      <Button
        variant="contained"
        size="small"
        onClick={save}
        disabled={saved || (isCustom && customValidationError !== null)}
      >
        {saved ? t("settings.saved") : t("settings.save")}
      </Button>
    </Stack>
  );
}

function ApiKeyField(props: {
  apiKey: string;
  keyProbe: KeyProbeState;
  probeDisabled: boolean;
  onChange: (value: string) => void;
  onProbe: () => void;
}) {
  const { t } = useTranslation();
  return (
    <Stack direction="row" spacing={1} sx={{ alignItems: "flex-start" }}>
      <TextField
        fullWidth
        size="small"
        type="password"
        label={t("settings.apiKey")}
        value={props.apiKey}
        onChange={(event) => props.onChange(event.target.value)}
        helperText={
          props.keyProbe.status === "probing"
            ? t("settings.keyProbing")
            : props.keyProbe.status === "valid"
              ? t("settings.keyValid")
              : props.keyProbe.status === "invalid"
                ? t("settings.keyInvalid", { message: props.keyProbe.message })
                : props.apiKey.trim()
                  ? t("settings.keyUnverified")
                  : t("settings.keyMissing")
        }
        slotProps={{
          formHelperText: {
            sx: {
              color: props.keyProbe.status === "valid"
                ? "success.main"
                : props.keyProbe.status === "invalid"
                  ? "error.main"
                  : "text.secondary",
            },
          },
        }}
      />
      <Tooltip title={t("settings.probeKey")}>
        <span>
          <IconButton
            aria-label={t("settings.probeKey")}
            onClick={props.onProbe}
            disabled={!props.apiKey.trim() || props.probeDisabled || props.keyProbe.status === "probing"}
            color={props.keyProbe.status === "valid" ? "success" : props.keyProbe.status === "invalid" ? "error" : "primary"}
            sx={{ width: 40, height: 40, border: 1, borderColor: "divider", borderRadius: 1 }}
          >
            {props.keyProbe.status === "probing"
              ? <CircularProgress size={18} color="inherit" />
              : <NetworkCheckRounded fontSize="small" />}
          </IconButton>
        </span>
      </Tooltip>
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

function validateCustomProvider(value: CustomProviderConfig): CustomValidationError {
  if (!value.name.trim()) return "nameRequired";
  if (!isValidRequiredBaseUrl(value.baseUrl)) return "baseUrlInvalid";
  if (!value.apiKey.trim()) return "apiKeyRequired";
  if (!value.models.length) return "modelRequired";
  if (value.models.some((model) => !model.name.trim() || !model.callName.trim())) return "modelFieldsRequired";
  const callNames = value.models.map((model) => model.callName.trim());
  if (new Set(callNames).size !== callNames.length) return "duplicateCallName";
  if (callNames.some((callName) => BUILTIN_MODEL_IDS.has(callName))) return "builtinCallNameConflict";
  return null;
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
