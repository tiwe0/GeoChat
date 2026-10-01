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
import { createStructuredLogger } from "@geochat-ai/app/structured-logger";
import {
  AGENT_MODEL_REGISTRY,
  CUSTOM_AGENT_PROVIDER_ID,
  getAgentProviderDefinition,
  getAgentProviderOptions,
  type AgentModelProtocol,
} from "@geochat-ai/app/model-registry";

const logger = createStructuredLogger("desktop.model-settings");
import {
  acceptNativeDesktopConfigCommit,
  credentialsForProvider,
  normalizeCustomProviderConfig,
  normalizeDesktopConfigJson,
  readDesktopConfig,
  updateProviderCredentials,
  updateDesktopConfig,
} from "../../../../../shared/desktop/desktop-config";
import type { CustomProviderConfig, DesktopConfig } from "../../../../../shared/desktop/workbench-types";
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
  | { status: "invalid"; message: string }
  | {
    status: "cleanup-required";
    operationId: string;
    phase: CredentialCleanupPhase;
  };

export type PendingCredentialCleanupState =
  | { status: "loading" }
  | { status: "ready" }
  | { status: "pending"; operationId: string }
  | { status: "error" };

export function credentialCleanupBlocksSave(state: PendingCredentialCleanupState): boolean {
  return state.status !== "ready";
}

export function credentialCleanupCanRetry(state: PendingCredentialCleanupState): boolean {
  return state.status === "pending" || state.status === "error";
}

export type CredentialCleanupPhase = "uncommitted" | "replaced";

export class CredentialCleanupRequiredError extends Error {
  readonly operationId: string;
  readonly phase: CredentialCleanupPhase;

  constructor(operationId: string, phase: CredentialCleanupPhase, options?: ErrorOptions) {
    super("Credential cleanup must be retried before another credential can be saved.", options);
    this.name = "CredentialCleanupRequiredError";
    this.operationId = operationId;
    this.phase = phase;
  }
}

export type ReplaceProviderCredentialResult = Readonly<{
  metadata: DesktopProviderCredentialMetadata;
  cleanup:
    | { status: "complete" }
    | { status: "retry-required"; operationId: string; phase: "replaced" };
}>;

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
  const [pendingCleanup, setPendingCleanup] = useState<PendingCredentialCleanupState>({ status: "loading" });

  const refreshPendingCredentialCleanup = useCallback(async (): Promise<PendingCredentialCleanupState> => {
    setPendingCleanup({ status: "loading" });
    const desktopApi = installedDesktopApi();
    if (!desktopApi) {
      const nextState: PendingCredentialCleanupState = { status: "error" };
      setPendingCleanup(nextState);
      return nextState;
    }
    try {
      const lifecycle = await desktopApi.reconcileProviderCredentials();
      acceptNativeDesktopConfigCommit(lifecycle.configJson);
      const nextState: PendingCredentialCleanupState = lifecycle.status === "ready"
        ? { status: "ready" }
        : { status: "pending", operationId: lifecycle.operationId };
      setPendingCleanup(nextState);
      return nextState;
    } catch {
      const nextState: PendingCredentialCleanupState = { status: "error" };
      setPendingCleanup(nextState);
      logger.warn("provider_credential_cleanup_list_failed", "MODEL_CREDENTIAL_CLEANUP_LIST_FAILED");
      return nextState;
    }
  }, []);

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
    void refreshPendingCredentialCleanup();
    if (activeProvider === CUSTOM_AGENT_PROVIDER_ID) {
      setCredentialRef(config.customProvider.credentialRef);
      return;
    }
    const credentials = credentialsForProvider(config.providerCredentials, activeProvider);
    setCredentialRef(credentials.credentialRef);
  }, [refreshPendingCredentialCleanup]);

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
    if (credentialCleanupBlocksSave(pendingCleanup)) {
      setCredentialSave({ status: "invalid", message: t("settings.credentialCleanupRequired") });
      return;
    }
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
          await updateDesktopConfig((current) => ({
            ...current,
            customProvider: normalizeCustomProviderConfig(customProvider),
          }));
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
      const replacement = await replaceProviderCredential({
        desktopApi,
        request: { provider, protocol, baseUrl, secret },
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
        buildNextConfig: (metadata, authoritativeConfig) => {
          if (isCustom) {
            return {
              ...authoritativeConfig,
              customProvider: normalizeCustomProviderConfig({
                ...customProvider,
                baseUrl: metadata.canonicalBaseUrl,
                protocol: metadata.protocol,
                credentialRef: metadata.credentialRef,
              }),
            };
          }
          return updateProviderCredentials(authoritativeConfig, provider, {
            credentialRef: metadata.credentialRef,
            baseUrl: metadata.canonicalBaseUrl,
            protocol: metadata.protocol,
          });
        },
      });
      const metadata = replacement.metadata;
      setCredentialRef(metadata.credentialRef);
      if (isCustom) setCustomProvider(readDesktopConfig().customProvider);
      if (replacement.cleanup.status === "retry-required") {
        await refreshPendingCredentialCleanup();
        setCredentialSave({
          status: "cleanup-required",
          operationId: replacement.cleanup.operationId,
          phase: replacement.cleanup.phase,
        });
        logger.warn("provider_credential_cleanup_required", "MODEL_CREDENTIAL_CLEANUP_REQUIRED", { provider });
      } else {
        setCredentialSave({ status: "valid" });
        setSaved(true);
        logger.info("provider_settings_saved", "MODEL_PROVIDER_SETTINGS_SAVED", { provider });
      }
    } catch (caughtError) {
      if (caughtError instanceof CredentialCleanupRequiredError) {
        await refreshPendingCredentialCleanup();
        setCredentialSave({
          status: "cleanup-required",
          operationId: caughtError.operationId,
          phase: caughtError.phase,
        });
        logger.warn("provider_credential_cleanup_required", "MODEL_CREDENTIAL_CLEANUP_REQUIRED", { provider });
        return;
      }
      const message = caughtError instanceof Error ? caughtError.message : String(caughtError);
      setCredentialSave({ status: "invalid", message });
      logger.warn("provider_credential_save_failed", "MODEL_PROVIDER_CREDENTIAL_SAVE_FAILED", { provider });
    } finally {
      setSaving(false);
    }
  }, [apiKey, customProvider, isCustom, pendingCleanup, provider, refreshPendingCredentialCleanup, saving, t]);

  const retryCredentialCleanup = useCallback(async () => {
    if (saving) return;
    const desktopApi = installedDesktopApi();
    if (!desktopApi) return;
    setSaving(true);
    try {
      const lifecycle = await refreshPendingCredentialCleanup();
      if (lifecycle.status !== "ready") {
        logger.warn("provider_credential_cleanup_retry_failed", "MODEL_CREDENTIAL_CLEANUP_RETRY_FAILED", { provider });
        return;
      }
      if (credentialSave.status === "cleanup-required") {
        if (credentialSave.phase === "replaced") {
          setCredentialSave({ status: "valid" });
          setSaved(true);
        } else {
          setCredentialSave({ status: "invalid", message: t("settings.credentialNotSaved") });
        }
      }
      logger.info("provider_credential_cleanup_completed", "MODEL_CREDENTIAL_CLEANUP_COMPLETED", { provider });
    } catch {
      await refreshPendingCredentialCleanup();
      logger.warn("provider_credential_cleanup_retry_failed", "MODEL_CREDENTIAL_CLEANUP_RETRY_FAILED", { provider });
    } finally {
      setSaving(false);
    }
  }, [credentialSave, provider, refreshPendingCredentialCleanup, saving, t]);

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
          onRetryCleanup={() => {
            if (credentialSave.status === "cleanup-required") {
              void retryCredentialCleanup();
            }
          }}
          onChange={(value) => {
            setApiKey(value);
            setSaved(false);
            resetCredentialSave();
          }}
        />

        {pendingCleanup.status === "error" ? (
          <Stack direction="row" spacing={1} sx={{ alignItems: "center" }}>
            <Typography variant="body2" color="error.main" sx={{ flex: 1 }}>
              {t("settings.credentialCleanupRequired")}
            </Typography>
            <Button
              disabled={saving}
              size="small"
              variant="outlined"
              onClick={() => void retryCredentialCleanup()}
            >
              {t("settings.retryCredentialCleanup")}
            </Button>
          </Stack>
        ) : pendingCleanup.status === "loading" ? (
          <Typography variant="body2" color="text.secondary">
            {t("settings.pendingCredentialCleanup")}
          </Typography>
        ) : pendingCleanup.status === "pending" ? (
          <Stack spacing={1} sx={{ p: 1.5, border: 1, borderColor: "error.main", borderRadius: 1.5 }}>
            <Typography variant="body2" color="error.main">
              {t("settings.pendingCredentialCleanup")}
            </Typography>
              <Stack direction="row" spacing={1} sx={{ alignItems: "center" }}>
                <Typography variant="caption" sx={{ flex: 1, fontFamily: "monospace", overflowWrap: "anywhere" }}>
                  {pendingCleanup.operationId}
                </Typography>
                <Button
                  disabled={saving}
                  size="small"
                  variant="outlined"
                  onClick={() => void retryCredentialCleanup()}
                >
                  {t("settings.retryCredentialCleanup")}
                </Button>
              </Stack>
          </Stack>
        ) : null}

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
          disabled={
            saving
            || saved
            || credentialSave.status === "cleanup-required"
            || credentialCleanupBlocksSave(pendingCleanup)
            || (!apiKey.trim() && !credentialRef)
            || (isCustom && customValidationError !== null)
          }
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
  onRetryCleanup: () => void;
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
                : props.credentialSave.status === "cleanup-required"
                  ? t("settings.credentialCleanupRequired")
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
                : props.credentialSave.status === "invalid" || props.credentialSave.status === "cleanup-required"
                  ? "error.main"
                  : "text.secondary",
            },
          },
        }}
      />
      {props.credentialSave.status === "cleanup-required" ? (
        <Button disabled={props.disabled} size="small" variant="outlined" onClick={props.onRetryCleanup}>
          {t("settings.retryCredentialCleanup")}
        </Button>
      ) : null}
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
  desktopApi: Pick<GeoChatDesktopApi, "beginProviderCredential" | "commitProviderCredential" | "abortProviderCredential" | "reconcileProviderCredentials">;
  request: DesktopSaveProviderCredentialRequest;
  onCredentialStored: () => void;
  validate: (credentialRef: string) => Promise<void>;
  buildNextConfig: (metadata: DesktopProviderCredentialMetadata, authoritativeConfig: DesktopConfig) => DesktopConfig;
  acceptCommittedConfig?: (rawJson: string) => void;
}): Promise<ReplaceProviderCredentialResult> {
  const begun = await input.desktopApi.beginProviderCredential(input.request);
  const metadata = begun.metadata;
  const acceptCommittedConfig = input.acceptCommittedConfig ?? acceptNativeDesktopConfigCommit;
  const authoritativeConfig = normalizeDesktopConfigJson(begun.configJson);
  acceptCommittedConfig(begun.configJson);
  input.onCredentialStored();

  let nextConfigJson: string;
  try {
    await input.validate(metadata.credentialRef);
    nextConfigJson = JSON.stringify(input.buildNextConfig(metadata, authoritativeConfig));
  } catch (error) {
    try {
      const lifecycle = await input.desktopApi.abortProviderCredential(begun.operationId);
      acceptCommittedConfig(lifecycle.configJson);
      if (lifecycle.status === "pending") {
        throw new CredentialCleanupRequiredError(lifecycle.operationId, "uncommitted", { cause: error });
      }
    } catch (cleanupError) {
      if (cleanupError instanceof CredentialCleanupRequiredError) throw cleanupError;
      throw new CredentialCleanupRequiredError(begun.operationId, "uncommitted", {
        cause: new AggregateError([error, cleanupError], "Credential validation and cleanup both failed."),
      });
    }
    throw error;
  }

  try {
    const lifecycle = await input.desktopApi.commitProviderCredential(begun.operationId, nextConfigJson);
    acceptCommittedConfig(lifecycle.configJson);
    if (!desktopConfigReferencesCredential(normalizeDesktopConfigJson(lifecycle.configJson), metadata.credentialRef)) {
      throw new Error("Native credential commit did not activate the new credential reference.");
    }
    return lifecycle.status === "ready"
      ? { metadata, cleanup: { status: "complete" } }
      : { metadata, cleanup: { status: "retry-required", operationId: lifecycle.operationId, phase: "replaced" } };
  } catch (commitError) {
    let lifecycle;
    try {
      lifecycle = await input.desktopApi.reconcileProviderCredentials();
      acceptCommittedConfig(lifecycle.configJson);
    } catch (reconcileError) {
      throw new CredentialCleanupRequiredError(begun.operationId, "replaced", {
        cause: new AggregateError([commitError, reconcileError], "Credential commit outcome could not be reconciled."),
      });
    }
    const reconciledConfig = normalizeDesktopConfigJson(lifecycle.configJson);
    if (desktopConfigReferencesCredential(reconciledConfig, metadata.credentialRef)) {
      return lifecycle.status === "ready"
        ? { metadata, cleanup: { status: "complete" } }
        : { metadata, cleanup: { status: "retry-required", operationId: lifecycle.operationId, phase: "replaced" } };
    }
    if (lifecycle.status === "pending") {
      throw new CredentialCleanupRequiredError(lifecycle.operationId, "uncommitted", { cause: commitError });
    }
    throw commitError;
  }
}

export function desktopConfigReferencesCredential(config: DesktopConfig, credentialRef: string): boolean {
  if (!credentialRef) return false;
  return config.model.credentialRef === credentialRef
    || config.visionModel.credentialRef === credentialRef
    || config.customProvider.credentialRef === credentialRef
    || Object.values(config.providerCredentials).some((entry) => entry.credentialRef === credentialRef);
}

function isValidRequiredBaseUrl(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return false;
  try {
    const url = new URL(trimmed);
    if (url.username || url.password) return false;
    if (url.protocol === "https:") return true;
    if (url.protocol !== "http:") return false;
    return url.hostname === "localhost"
      || url.hostname === "127.0.0.1"
      || url.hostname === "[::1]";
  } catch {
    logger.debug("provider_base_url_invalid", "MODEL_PROVIDER_BASE_URL_INVALID");
    return false;
  }
}

function protocolLabel(protocol: AgentModelProtocol, t: ReturnType<typeof useTranslation>["t"]) {
  if (protocol === "anthropic") return t("settings.customProtocols.anthropic");
  if (protocol === "google") return t("settings.customProtocols.google");
  return t("settings.customProtocols.openaiCompatible");
}
