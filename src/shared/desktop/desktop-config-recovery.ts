import { isAgentModelConfig } from "@geochat-ai/app/model-registry";
import {
  CONFIG_STORAGE_KEY,
  DESKTOP_CONFIG_SCHEMA_VERSION,
  DesktopConfigPlaintextCredentialError,
  DesktopConfigUnsupportedVersionError,
  VISUAL_PROFILE_NAMES,
  createDefaultDesktopConfig,
  normalizeDesktopConfig,
  normalizeModelStepTimeoutMs,
} from "./desktop-config";
import { hasPlaintextCredentials, parseRawDesktopConfig } from "./desktop-credentials";
import type { DesktopConfig, VisualProfileName } from "./workbench-types";

export const CONFIG_QUARANTINE_KEY_PREFIX = `${CONFIG_STORAGE_KEY}:quarantine:v1`;

export type DesktopConfigRecoveryReason = "malformed_json" | "invalid_fields";
export type DesktopConfigRecoveryNotice = Readonly<{
  reason: DesktopConfigRecoveryReason;
  quarantineKey: string;
  recoveredFields: readonly string[];
}>;

export type ConfigRecoveryStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">;

let pendingConfigRecoveryNotice: DesktopConfigRecoveryNotice | null = null;

export { DesktopConfigUnsupportedVersionError } from "./desktop-config";

export class DesktopConfigSensitiveDataRecoveryRequiredError extends Error {
  constructor() {
    super("Malformed desktop config may contain sensitive data and requires manual recovery");
    this.name = "DesktopConfigSensitiveDataRecoveryRequiredError";
  }
}

export function isDesktopConfigStorageQuotaError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const candidate = error as { name?: unknown; code?: unknown };
  return candidate.name === "QuotaExceededError" || candidate.code === 22 || candidate.code === 1014;
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

async function quarantineAndRecover(
  storage: ConfigRecoveryStorage,
  rawJson: string,
  reason: DesktopConfigRecoveryReason,
  recovered: DesktopConfig,
  recoveredFields: readonly string[],
  createQuarantineId: () => string,
  flushWrites: () => Promise<void>,
) {
  const quarantineKey = `${CONFIG_QUARANTINE_KEY_PREFIX}:${createQuarantineId()}`;
  // The original config is replaced only after the exact bytes are durable in
  // quarantine. If this write fails, setItem for CONFIG_STORAGE_KEY is never run.
  storage.setItem(quarantineKey, rawJson);
  await flushWrites();
  storage.setItem(CONFIG_STORAGE_KEY, JSON.stringify(recovered));
  await flushWrites();
  const notice = Object.freeze({ reason, quarantineKey, recoveredFields: Object.freeze([...recoveredFields]) });
  pendingConfigRecoveryNotice = notice;
  return notice;
}

/**
 * Validates the current renderer config before any consumer reads it. Invalid
 * fields are recovered independently, but other schema versions are rejected.
 */
export async function recoverDesktopConfigBeforeLoad(
  storage: ConfigRecoveryStorage,
  options: Readonly<{
    createQuarantineId?: () => string;
    flushWrites?: () => Promise<void>;
  }> = {},
): Promise<DesktopConfigRecoveryNotice | null> {
  const flushWrites = options.flushWrites ?? (async () => {});
  const rawJson = storage.getItem(CONFIG_STORAGE_KEY);
  if (rawJson === null) {
    // A fresh profile already reads as the default config. Do not seed an
    // equivalent value during bootstrap; the first user change is the
    // persistence boundary.
    return null;
  }
  let rawConfig: Record<string, unknown>;
  try {
    rawConfig = parseRawDesktopConfig(rawJson);
  } catch {
    if (malformedConfigMayContainSensitiveData(rawJson)) {
      // Keep the only copy in place. Duplicating potentially secret-bearing
      // bytes into another key would expand the exposure surface.
      throw new DesktopConfigSensitiveDataRecoveryRequiredError();
    }
    return quarantineAndRecover(
      storage,
      rawJson,
      "malformed_json",
      createDefaultDesktopConfig(),
      ["$document"],
      options.createQuarantineId ?? defaultQuarantineId,
      flushWrites,
    );
  }
  if (rawConfig.schemaVersion !== DESKTOP_CONFIG_SCHEMA_VERSION) {
    throw new DesktopConfigUnsupportedVersionError();
  }
  if (hasPlaintextCredentials(rawConfig)) throw new DesktopConfigPlaintextCredentialError();
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
      flushWrites,
    );
  }
  return null;
}

/** Returns the startup recovery notice once; consuming it is equivalent to dismissal. */
export function consumeDesktopConfigRecoveryNotice(): DesktopConfigRecoveryNotice | null {
  const notice = pendingConfigRecoveryNotice;
  pendingConfigRecoveryNotice = null;
  return notice;
}
