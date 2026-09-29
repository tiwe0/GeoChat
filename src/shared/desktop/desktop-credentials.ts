import {
  getAgentProviderDefinition,
  isAgentModelProtocol,
  type AgentModelProtocol
} from "@geochat-ai/app/model-registry";
import type { DesktopCredentialMigrationJournal } from "../desktop-api";

export const DESKTOP_CREDENTIAL_MIGRATION_SCHEMA_VERSION = 1 as const;

export type CredentialMigrationPhase = "planned" | "secretStored" | "configSanitized" | "complete";
export type LegacyCredentialSourceKind = "providerCredentials" | "model" | "visionModel" | "customProvider";

export type LegacyCredentialIdentity = Readonly<{
  provider: string;
  secret: string;
  canonicalBaseUrl: string;
  protocol: AgentModelProtocol;
}>;

export type LegacyCredentialSource = Readonly<{
  kind: LegacyCredentialSourceKind;
  path: string;
}>;

export type LegacyCredentialMigrationItem = Readonly<LegacyCredentialIdentity & {
  credentialRef: string;
  sourceFingerprint: string;
  sources: readonly LegacyCredentialSource[];
}>;

export type CredentialMigrationJournal = DesktopCredentialMigrationJournal;
export type CredentialMigrationJournalEntry = CredentialMigrationJournal["entries"][number];

export type CredentialMigrationConflict = Readonly<{
  source: LegacyCredentialSource;
  reason: "invalid_provider" | "invalid_protocol" | "invalid_endpoint" | "missing_endpoint";
  message: string;
}>;

export type LegacyCredentialMigrationPlan = Readonly<{
  rawConfig: Readonly<Record<string, unknown>>;
  items: readonly LegacyCredentialMigrationItem[];
  conflicts: readonly CredentialMigrationConflict[];
  journal: CredentialMigrationJournal;
}>;

export type LegacyCredentialMigrationPlanner = Readonly<{
  createCredentialRef: (sourceFingerprint: string) => string;
  /** Must return an irreversible cryptographic digest and must not log its input. */
  fingerprint: (identity: LegacyCredentialIdentity) => string;
  previousJournal?: CredentialMigrationJournal;
}>;

export type AsyncLegacyCredentialMigrationPlanner = Readonly<{
  createCredentialRef: (sourceFingerprint: string) => string;
  fingerprint: (identity: LegacyCredentialIdentity) => Promise<string>;
  previousJournal?: CredentialMigrationJournal;
}>;

export type CredentialMigrationCallbacks = Readonly<{
  persistJournal: (journal: CredentialMigrationJournal) => void | Promise<void>;
  credentialExists: (credentialRef: string) => boolean | Promise<boolean>;
  storeCredential: (credential: Readonly<LegacyCredentialIdentity & { credentialRef: string }>) => void | Promise<void>;
  writeSanitizedConfig: (rawJson: string) => void | Promise<void>;
  readConfig: () => string | Promise<string>;
  deleteJournal: () => void | Promise<void>;
}>;

export type CredentialMigrationRollbackCallbacks = Readonly<{
  deleteCredential: (credentialRef: string) => void | Promise<void>;
  deleteJournal: () => void | Promise<void>;
}>;

type MutableSourceCandidate = LegacyCredentialIdentity & { source: LegacyCredentialSource };

const DEFAULT_PROTOCOL_BY_PROVIDER: Readonly<Record<string, AgentModelProtocol>> = {
  anthropic: "anthropic",
  google: "google"
};

function record(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : undefined;
}

function string(value: unknown) {
  return typeof value === "string" ? value : "";
}

function protocolFor(provider: string, value: unknown): AgentModelProtocol {
  return isAgentModelProtocol(value) ? value : DEFAULT_PROTOCOL_BY_PROVIDER[provider] ?? "openai-compatible";
}

function isLoopbackHost(hostname: string) {
  const normalized = hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (normalized === "localhost" || normalized === "::1") return true;
  const match = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(normalized);
  return Boolean(match && Number(match[1]) === 127 && match.slice(1).every((part) => Number(part) <= 255));
}

/** Canonical trusted endpoint shape used by both migration dedupe and keychain envelopes. */
export function canonicalizeCredentialEndpoint(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) throw new Error("Credential endpoint is required");
  const withScheme = /^[a-z][a-z\d+.-]*:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  let endpoint: URL;
  try {
    endpoint = new URL(withScheme);
  } catch {
    throw new Error("Credential endpoint is not a valid URL");
  }
  if (endpoint.username || endpoint.password) throw new Error("Credential endpoint must not contain URL credentials");
  if (withScheme.includes("?")) throw new Error("Credential endpoint must not contain a query");
  if (withScheme.includes("#")) throw new Error("Credential endpoint must not contain a fragment");
  if (endpoint.protocol !== "https:" && !(endpoint.protocol === "http:" && isLoopbackHost(endpoint.hostname))) {
    throw new Error("Credential endpoint must use HTTPS; HTTP is allowed only for loopback hosts");
  }
  const path = endpoint.pathname.replace(/\/{2,}/g, "/").replace(/\/+$/, "");
  return `${endpoint.origin}${path === "/" ? "" : path}`;
}

function defaultEndpoint(provider: string) {
  return getAgentProviderDefinition(provider)?.defaultBaseUrl ?? "";
}

function collectCandidate(
  candidates: MutableSourceCandidate[],
  conflicts: CredentialMigrationConflict[],
  input: {
    kind: LegacyCredentialSourceKind;
    path: string;
    provider: unknown;
    secret: unknown;
    endpoint: unknown;
    protocol: unknown;
  }
) {
  const secret = string(input.secret);
  if (!secret) return;
  const provider = string(input.provider).trim();
  const source = { kind: input.kind, path: input.path } as const;
  if (!provider || !/^[a-zA-Z0-9._-]+$/.test(provider)) {
    conflicts.push({ source, reason: "invalid_provider", message: "Credential provider is invalid" });
    return;
  }
  if (input.protocol !== undefined && input.protocol !== "" && !isAgentModelProtocol(input.protocol)) {
    conflicts.push({ source, reason: "invalid_protocol", message: "Credential protocol is invalid" });
    return;
  }
  const endpoint = string(input.endpoint).trim() || defaultEndpoint(provider);
  if (!endpoint) {
    conflicts.push({ source, reason: "missing_endpoint", message: `No endpoint is available for provider ${provider || "<empty>"}` });
    return;
  }
  try {
    candidates.push({
      provider,
      secret,
      canonicalBaseUrl: canonicalizeCredentialEndpoint(endpoint),
      protocol: protocolFor(provider, input.protocol),
      source
    });
  } catch (error) {
    conflicts.push({
      source,
      reason: "invalid_endpoint",
      message: error instanceof Error ? error.message : "Credential endpoint is invalid"
    });
  }
}

function collectLegacyCredentialCandidates(rawConfig: Record<string, unknown>) {
  const candidates: MutableSourceCandidate[] = [];
  const conflicts: CredentialMigrationConflict[] = [];
  const providerCredentials = record(rawConfig.providerCredentials);
  if (providerCredentials) {
    for (const provider of Object.keys(providerCredentials).sort()) {
      const entry = record(providerCredentials[provider]);
      if (!entry) continue;
      collectCandidate(candidates, conflicts, {
        kind: "providerCredentials",
        path: `providerCredentials.${provider}`,
        provider,
        secret: entry.apiKey,
        endpoint: entry.customBaseUrl ?? entry.baseUrl,
        protocol: entry.protocol
      });
    }
  }
  for (const kind of ["model", "visionModel"] as const) {
    const model = record(rawConfig[kind]);
    if (!model) continue;
    collectCandidate(candidates, conflicts, {
      kind,
      path: kind,
      provider: model.provider,
      secret: model.apiKey,
      endpoint: model.customBaseUrl,
      protocol: model.protocol
    });
  }
  const customProvider = record(rawConfig.customProvider);
  if (customProvider) {
    collectCandidate(candidates, conflicts, {
      kind: "customProvider",
      path: "customProvider",
      provider: "custom",
      secret: customProvider.apiKey,
      endpoint: customProvider.baseUrl,
      protocol: customProvider.protocol
    });
  }
  return { candidates, conflicts };
}

function dedupeKey(candidate: LegacyCredentialIdentity) {
  return JSON.stringify([candidate.provider, candidate.secret, candidate.canonicalBaseUrl, candidate.protocol]);
}

export function parseRawDesktopConfig(rawJson: string): Record<string, unknown> {
  const parsed = JSON.parse(rawJson) as unknown;
  const config = record(parsed);
  if (!config) throw new Error("Desktop config must be a JSON object");
  return config;
}

export function hasLegacyPlaintextCredentials(value: unknown): boolean {
  const rawConfig = record(value);
  if (!rawConfig) return false;
  const providerCredentials = record(rawConfig.providerCredentials);
  if (providerCredentials && Object.values(providerCredentials).some((entry) => string(record(entry)?.apiKey) !== "")) return true;
  return [record(rawConfig.model), record(rawConfig.visionModel), record(rawConfig.customProvider)]
    .some((entry) => string(entry?.apiKey) !== "");
}

export function planLegacyDesktopCredentialMigration(
  rawJson: string,
  planner: LegacyCredentialMigrationPlanner
): LegacyCredentialMigrationPlan {
  const grouped = groupLegacyCredentialCandidates(rawJson);
  return createLegacyCredentialMigrationPlan(
    grouped,
    grouped.groups.map(({ identity }) => planner.fingerprint(identity)),
    planner
  );
}

export async function planLegacyDesktopCredentialMigrationAsync(
  rawJson: string,
  planner: AsyncLegacyCredentialMigrationPlanner
): Promise<LegacyCredentialMigrationPlan> {
  const grouped = groupLegacyCredentialCandidates(rawJson);
  const fingerprints = await Promise.all(
    grouped.groups.map(({ identity }) => planner.fingerprint(identity))
  );
  return createLegacyCredentialMigrationPlan(grouped, fingerprints, planner);
}

function groupLegacyCredentialCandidates(rawJson: string) {
  const rawConfig = parseRawDesktopConfig(rawJson);
  const { candidates, conflicts } = collectLegacyCredentialCandidates(rawConfig);
  const groups = new Map<string, { identity: LegacyCredentialIdentity; sources: LegacyCredentialSource[] }>();
  for (const candidate of candidates) {
    const { source, ...identity } = candidate;
    const key = dedupeKey(identity);
    const existing = groups.get(key);
    if (existing) existing.sources.push(source);
    else groups.set(key, { identity, sources: [source] });
  }
  return { rawConfig, conflicts, groups: Array.from(groups.values()) };
}

function createLegacyCredentialMigrationPlan(
  grouped: ReturnType<typeof groupLegacyCredentialCandidates>,
  fingerprints: readonly string[],
  planner: Pick<LegacyCredentialMigrationPlanner, "createCredentialRef" | "previousJournal">
): LegacyCredentialMigrationPlan {
  const { rawConfig, conflicts, groups } = grouped;
  const previousByFingerprint = new Map(
    planner.previousJournal?.entries.map((entry) => [entry.sourceFingerprint, entry]) ?? []
  );
  const items = groups.map(({ identity, sources }, index) => {
    const sourceFingerprint = fingerprints[index];
    if (!sourceFingerprint) throw new Error("Credential source fingerprint is required");
    const previous = previousByFingerprint.get(sourceFingerprint);
    return Object.freeze({
      ...identity,
      credentialRef: previous?.credentialRef ?? planner.createCredentialRef(sourceFingerprint),
      sourceFingerprint,
      sources: Object.freeze([...sources])
    });
  });
  const itemFingerprints = new Set(items.map((item) => item.sourceFingerprint));
  const recoveredEntries = planner.previousJournal?.entries.filter(
    (entry) => !itemFingerprints.has(entry.sourceFingerprint)
  ) ?? [];
  const journal: CredentialMigrationJournal = Object.freeze({
    schemaVersion: DESKTOP_CREDENTIAL_MIGRATION_SCHEMA_VERSION,
    entries: Object.freeze([...items.map((item) => {
      const previous = previousByFingerprint.get(item.sourceFingerprint);
      return Object.freeze({
        schemaVersion: DESKTOP_CREDENTIAL_MIGRATION_SCHEMA_VERSION,
        provider: item.provider,
        protocol: item.protocol,
        canonicalBaseUrl: item.canonicalBaseUrl,
        credentialRef: item.credentialRef,
        sourceFingerprint: item.sourceFingerprint,
        phase: previous?.phase ?? "planned"
      });
    }), ...recoveredEntries])
  });
  return Object.freeze({
    rawConfig: Object.freeze(structuredClone(rawConfig)),
    items: Object.freeze(items),
    conflicts: Object.freeze(conflicts),
    journal
  });
}

function sourceItem(plan: LegacyCredentialMigrationPlan, kind: LegacyCredentialSourceKind, path: string) {
  return plan.items.find((item) => item.sources.some((source) => source.kind === kind && source.path === path));
}

export function applyLegacyDesktopCredentialMigrationPlan(plan: LegacyCredentialMigrationPlan): Record<string, unknown> {
  if (plan.conflicts.length) throw new Error("Legacy credential migration has unresolved conflicts");
  const config = structuredClone(plan.rawConfig) as Record<string, unknown>;
  const providerCredentials = record(config.providerCredentials);
  if (providerCredentials) {
    for (const [provider, value] of Object.entries(providerCredentials)) {
      const entry = record(value);
      if (!entry) continue;
      const item = sourceItem(plan, "providerCredentials", `providerCredentials.${provider}`);
      delete entry.apiKey;
      delete entry.customBaseUrl;
      if (item) {
        entry.credentialRef = item.credentialRef;
        entry.baseUrl = item.canonicalBaseUrl;
        entry.protocol = item.protocol;
      }
    }
  }
  for (const kind of ["model", "visionModel"] as const) {
    const model = record(config[kind]);
    if (!model) continue;
    const item = sourceItem(plan, kind, kind);
    delete model.apiKey;
    delete model.customBaseUrl;
    if (item) model.credentialRef = item.credentialRef;
  }
  const customProvider = record(config.customProvider);
  if (customProvider) {
    const item = sourceItem(plan, "customProvider", "customProvider");
    delete customProvider.apiKey;
    if (item) {
      customProvider.credentialRef = item.credentialRef;
      customProvider.baseUrl = item.canonicalBaseUrl;
      customProvider.protocol = item.protocol;
    }
  }
  return config;
}

function journalWithPhase(
  journal: CredentialMigrationJournal,
  predicate: (entry: CredentialMigrationJournalEntry) => boolean,
  phase: CredentialMigrationPhase
): CredentialMigrationJournal {
  return Object.freeze({
    ...journal,
    entries: Object.freeze(journal.entries.map((entry) => predicate(entry) ? Object.freeze({ ...entry, phase }) : entry))
  });
}

/**
 * Crash-safe coordinator for native persistence callbacks. A crash after the
 * keychain write but before the journal update is recovered through `exists`.
 */
export async function runLegacyDesktopCredentialMigration(
  plan: LegacyCredentialMigrationPlan,
  callbacks: CredentialMigrationCallbacks
): Promise<CredentialMigrationJournal> {
  if (plan.conflicts.length) throw new Error("Legacy credential migration has unresolved conflicts");
  let journal = plan.journal;
  await callbacks.persistJournal(journal);
  for (const item of plan.items) {
    const entry = journal.entries.find((candidate) => candidate.sourceFingerprint === item.sourceFingerprint);
    if (!entry || entry.phase !== "planned") continue;
    if (!await callbacks.credentialExists(item.credentialRef)) {
      await callbacks.storeCredential({
        credentialRef: item.credentialRef,
        provider: item.provider,
        secret: item.secret,
        canonicalBaseUrl: item.canonicalBaseUrl,
        protocol: item.protocol
      });
    }
    journal = journalWithPhase(journal, (candidate) => candidate.sourceFingerprint === item.sourceFingerprint, "secretStored");
    await callbacks.persistJournal(journal);
  }
  const sanitized = JSON.stringify(applyLegacyDesktopCredentialMigrationPlan(plan));
  await callbacks.writeSanitizedConfig(sanitized);
  const reread = parseRawDesktopConfig(await callbacks.readConfig());
  if (hasLegacyPlaintextCredentials(reread)) throw new Error("Sanitized desktop config still contains plaintext credentials");
  journal = journalWithPhase(journal, (entry) => entry.phase === "secretStored", "configSanitized");
  await callbacks.persistJournal(journal);
  journal = journalWithPhase(journal, (entry) => entry.phase === "configSanitized", "complete");
  await callbacks.persistJournal(journal);
  await callbacks.deleteJournal();
  return journal;
}

function configuredCredentialRefs(rawConfig: Record<string, unknown>) {
  const references = new Set<string>();
  const add = (value: unknown) => {
    const credentialRef = string(record(value)?.credentialRef).trim();
    if (credentialRef) references.add(credentialRef);
  };
  add(rawConfig.model);
  add(rawConfig.visionModel);
  add(rawConfig.customProvider);
  const providerCredentials = record(rawConfig.providerCredentials);
  if (providerCredentials) Object.values(providerCredentials).forEach(add);
  return references;
}

/** Remove only migration-created entries that the current config does not reference. */
export async function rollbackLegacyDesktopCredentialMigration(
  journal: CredentialMigrationJournal,
  currentRawJson: string,
  callbacks: CredentialMigrationRollbackCallbacks
) {
  const referenced = configuredCredentialRefs(parseRawDesktopConfig(currentRawJson));
  const orphaned = Array.from(new Set(
    journal.entries
      .map((entry) => entry.credentialRef)
      .filter((credentialRef) => !referenced.has(credentialRef))
  ));
  for (const credentialRef of orphaned) await callbacks.deleteCredential(credentialRef);
  await callbacks.deleteJournal();
  return orphaned;
}
