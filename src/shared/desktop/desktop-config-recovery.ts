import { isAgentModelConfig } from "@geochat-ai/app/model-registry";
import {
  CONFIG_STORAGE_KEY,
  CREDENTIAL_MIGRATION_BACKUP_KEY,
  DESKTOP_CONFIG_SCHEMA_VERSION,
  DesktopCredentialMigrationRequiredError,
  VISUAL_PROFILE_NAMES,
  createDefaultDesktopConfig,
  normalizeDesktopConfig,
  normalizeModelStepTimeoutMs,
} from "./desktop-config";
import { hasLegacyPlaintextCredentials, parseRawDesktopConfig } from "./desktop-credentials";
import type { DesktopConfig, VisualProfileName } from "./workbench-types";

export const CONFIG_QUARANTINE_KEY_PREFIX = `${CONFIG_STORAGE_KEY}:quarantine:v1`;

export type DesktopConfigRecoveryReason = "malformed_json" | "invalid_fields";
export type DesktopConfigRecoveryNotice = Readonly<{
  reason: DesktopConfigRecoveryReason;
  quarantineKey: string;
  recoveredFields: readonly string[];
}>;

type ConfigRecoveryStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">;

let pendingConfigRecoveryNotice: DesktopConfigRecoveryNotice | null = null;

export class DesktopConfigUnsupportedVersionError extends Error {
  constructor() {
    super("Desktop config schema version is not supported by this application version");
    this.name = "DesktopConfigUnsupportedVersionError";
  }
}

export class DesktopConfigSensitiveDataRecoveryRequiredError extends Error {
  constructor() {
    super("Malformed desktop config may contain sensitive data and requires manual recovery");
    this.name = "DesktopConfigSensitiveDataRecoveryRequiredError";
  }
}

const SENSITIVE_CONFIG_KEY = /(?:["']\s*[^"']*(?:api[_-]?key|secret|token|authorization|password|private[_-]?key|access[_-]?key|cookie)[^"']*["']|(?:^|[,{]\s*)(?:api[_-]?key|secret|token|authorization|password|private[_-]?key|access[_-]?key|cookie))\s*:/i;

function malformedConfigMayContainSensitiveData(rawJson: string) {
  const decodedKeyEscapes = rawJson.replace(/\\u([\da-f]{4})/gi, (_match, hex: string) =>
    String.fromCharCode(Number.parseInt(hex, 16)));
  return SENSITIVE_CONFIG_KEY.test(decodedKeyEscapes);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function configFieldIssues(value: Record<string, unknown>) {
  const issues: string[] = [];
  const expectRecord = (field: string) => {
    if (!isRecord(value[field])) issues.push(field);
  };
  for (const field of ["model", "visionModel", "providerCredentials", "customProvider", "skills", "interaction", "debug"]) {
    expectRecord(field);
  }
  if (value.locale !== "zh-CN" && value.locale !== "en-US") issues.push("locale");

  for (const field of ["model", "visionModel"] as const) {
    const model = value[field];
    if (!isRecord(model)) continue;
    if (!isAgentModelConfig(model)) issues.push(field);
    if (typeof model.provider !== "string" || !model.provider.trim()) issues.push(`${field}.provider`);
    if (typeof model.model !== "string" || !model.model.trim()) issues.push(`${field}.model`);
    if (typeof model.credentialRef !== "string") issues.push(`${field}.credentialRef`);
  }

  const credentials = value.providerCredentials;
  if (isRecord(credentials)) {
    for (const [provider, credential] of Object.entries(credentials)) {
      if (!isRecord(credential)) {
        issues.push(`providerCredentials.${provider}`);
        continue;
      }
      if (typeof credential.credentialRef !== "string") issues.push(`providerCredentials.${provider}.credentialRef`);
      if (typeof credential.baseUrl !== "string") issues.push(`providerCredentials.${provider}.baseUrl`);
      if (!["openai-compatible", "anthropic", "google"].includes(String(credential.protocol))) {
        issues.push(`providerCredentials.${provider}.protocol`);
      }
    }
  }

  const interaction = value.interaction;
  if (isRecord(interaction) && interaction.mode !== "fusion" && interaction.mode !== "window") {
    issues.push("interaction.mode");
  }
  const debug = value.debug;
  if (isRecord(debug) && normalizeModelStepTimeoutMs(debug.modelStepTimeoutMs) !== debug.modelStepTimeoutMs) {
    issues.push("debug.modelStepTimeoutMs");
  }
  const skills = value.skills;
  if (isRecord(skills)) {
    if (typeof skills.enabled !== "boolean") issues.push("skills.enabled");
    if (typeof skills.autoActivate !== "boolean") issues.push("skills.autoActivate");
    if (!Array.isArray(skills.enabledSkillNames) || skills.enabledSkillNames.some((entry) => typeof entry !== "string")) {
      issues.push("skills.enabledSkillNames");
    }
    if (!VISUAL_PROFILE_NAMES.includes(skills.visualProfile as VisualProfileName)) issues.push("skills.visualProfile");
  }
  const customProvider = value.customProvider;
  if (isRecord(customProvider)) {
    for (const field of ["name", "baseUrl", "credentialRef"] as const) {
      if (typeof customProvider[field] !== "string") issues.push(`customProvider.${field}`);
    }
    if (!["openai-compatible", "anthropic", "google"].includes(String(customProvider.protocol))) {
      issues.push("customProvider.protocol");
    }
    if (!Array.isArray(customProvider.models)) {
      issues.push("customProvider.models");
    } else {
      customProvider.models.forEach((model, index) => {
        if (
          !isRecord(model)
          || typeof model.name !== "string"
          || !model.name.trim()
          || typeof model.callName !== "string"
          || !model.callName.trim()
          || (model.supportsImages !== undefined && typeof model.supportsImages !== "boolean")
        ) {
          issues.push(`customProvider.models.${index}`);
        }
      });
    }
  }
  return Array.from(new Set(issues)).sort();
}

function defaultQuarantineId() {
  const suffix = typeof globalThis.crypto?.randomUUID === "function" ? globalThis.crypto.randomUUID() : String(Date.now());
  return `${Date.now()}-${suffix}`;
}

function quarantineAndRecover(
  storage: ConfigRecoveryStorage,
  rawJson: string,
  reason: DesktopConfigRecoveryReason,
  recovered: DesktopConfig,
  recoveredFields: readonly string[],
  createQuarantineId: () => string,
) {
  const quarantineKey = `${CONFIG_QUARANTINE_KEY_PREFIX}:${createQuarantineId()}`;
  // The original config is replaced only after the exact bytes are durable in
  // quarantine. If this write fails, setItem for CONFIG_STORAGE_KEY is never run.
  storage.setItem(quarantineKey, rawJson);
  storage.setItem(CONFIG_STORAGE_KEY, JSON.stringify(recovered));
  const notice = Object.freeze({ reason, quarantineKey, recoveredFields: Object.freeze([...recoveredFields]) });
  pendingConfigRecoveryNotice = notice;
  return notice;
}

/**
 * Validates and upgrades the versioned renderer config before any consumer
 * reads it. Invalid fields are normalized independently; whole-document
 * fallback is reserved for malformed JSON and unsupported schema versions.
 */
export function recoverDesktopConfigBeforeLoad(
  storage: ConfigRecoveryStorage = globalThis.localStorage,
  options: Readonly<{ createQuarantineId?: () => string }> = {},
): DesktopConfigRecoveryNotice | null {
  const rawJson = storage?.getItem(CONFIG_STORAGE_KEY) ?? null;
  if (storage?.getItem(CREDENTIAL_MIGRATION_BACKUP_KEY) !== null) {
    throw new DesktopCredentialMigrationRequiredError();
  }
  if (rawJson === null) {
    storage?.setItem(CONFIG_STORAGE_KEY, JSON.stringify(createDefaultDesktopConfig()));
    return null;
  }
  let rawConfig: Record<string, unknown>;
  try {
    rawConfig = parseRawDesktopConfig(rawJson);
  } catch {
    if (malformedConfigMayContainSensitiveData(rawJson)) {
      // Keep the only copy in place. Duplicating potentially secret-bearing
      // bytes into another localStorage key would expand the exposure surface.
      throw new DesktopConfigSensitiveDataRecoveryRequiredError();
    }
    return quarantineAndRecover(
      storage,
      rawJson,
      "malformed_json",
      createDefaultDesktopConfig(),
      ["$document"],
      options.createQuarantineId ?? defaultQuarantineId,
    );
  }
  if (rawConfig.schemaVersion !== undefined && rawConfig.schemaVersion !== DESKTOP_CONFIG_SCHEMA_VERSION) {
    // A newer application may own fields and credential locations unknown to
    // this build. Preserve its bytes in place and refuse downgrade recovery.
    throw new DesktopConfigUnsupportedVersionError();
  }
  if (hasLegacyPlaintextCredentials(rawConfig)) throw new DesktopCredentialMigrationRequiredError();
  const recoveredFields = configFieldIssues(rawConfig);
  const recovered = normalizeDesktopConfig(rawConfig as Partial<DesktopConfig>);
  if (recoveredFields.length) {
    return quarantineAndRecover(
      storage,
      rawJson,
      "invalid_fields",
      recovered,
      recoveredFields,
      options.createQuarantineId ?? defaultQuarantineId,
    );
  }
  if (rawConfig.schemaVersion !== DESKTOP_CONFIG_SCHEMA_VERSION) {
    storage.setItem(CONFIG_STORAGE_KEY, JSON.stringify(recovered));
  }
  return null;
}

/** Returns the startup recovery notice once; consuming it is equivalent to dismissal. */
export function consumeDesktopConfigRecoveryNotice(): DesktopConfigRecoveryNotice | null {
  const notice = pendingConfigRecoveryNotice;
  pendingConfigRecoveryNotice = null;
  return notice;
}
