import {
  LEGACY_CONVERSATION_IMPORT_SCHEMA_VERSION,
  type LegacyConversationImportRequest,
  type LegacyConversationImportResult,
} from "@geochat-ai/app/legacy-conversation-import";
import {
  LEGACY_CONVERSATIONS_KEY,
  markMissingLegacyAttachmentPayloads,
  parseLegacyConversationCache,
  type LegacyConversationRecord,
  type LegacyConversationStorage,
} from "./localStore";
import { importLegacyConversation } from "./api";

const JOURNAL_KEY = `${LEGACY_CONVERSATIONS_KEY}:migration-journal:v1`;
const QUARANTINE_KEY = `${LEGACY_CONVERSATIONS_KEY}:migration-quarantine:v1`;
const BACKUP_PREFIX = `${LEGACY_CONVERSATIONS_KEY}:backup:v1:`;

export type LegacyConversationMigrationStatus = "pending" | "migrated" | "skipped" | "conflicted" | "quarantined" | "failed";
export type LegacyConversationMigrationItem = {
  itemId: string;
  sourceFingerprint: string;
  conversationId: string | null;
  sourceIndex: number;
  status: LegacyConversationMigrationStatus;
  error?: string;
  conflictReason?: LegacyConversationImportResult["reason"];
};
export type LegacyConversationMigrationCounts = {
  migrated: number;
  skipped: number;
  conflicted: number;
  quarantined: number;
  failed: number;
};
export type LegacyConversationMigrationJournal = {
  schemaVersion: 1;
  sourceFingerprint: string;
  backupKey: string;
  startedAt: string;
  updatedAt: string;
  counts: LegacyConversationMigrationCounts;
  items: LegacyConversationMigrationItem[];
};
export type LegacyConversationQuarantineItem = {
  itemId: string;
  sourceFingerprint: string;
  conversationId: string | null;
  sourceIndex: number;
  reason: string;
  rawItem: unknown;
};
export type LegacyConversationMigrationResult = LegacyConversationMigrationJournal & { requiresUserAction: boolean };

export async function migrateLegacyConversationCache(input: {
  apiOrigin: string;
  token: string | null;
  storage?: LegacyConversationStorage;
  request?: typeof fetch;
  now?: () => string;
}): Promise<LegacyConversationMigrationResult> {
  const storage = input.storage ?? globalThis.localStorage;
  const request = input.request ?? fetch;
  const now = input.now ?? (() => new Date().toISOString());
  const existing = readLegacyConversationMigrationJournal(storage);
  const rawMain = storage.getItem(LEGACY_CONVERSATIONS_KEY);
  if (!rawMain) return resultFromJournal(existing ?? emptyJournal(now()));

  const sourceFingerprint = await sha256(rawMain);
  let journal = existing;
  if (journal && journal.sourceFingerprint !== sourceFingerprint) {
    throw new Error("Legacy conversation cache changed during migration; recovery export is required.");
  }
  if (!journal) {
    const backupKey = `${BACKUP_PREFIX}${now().replaceAll(":", "-")}:${sourceFingerprint.slice(0, 12)}`;
    storage.setItem(backupKey, rawMain);
    journal = await createJournal(rawMain, sourceFingerprint, backupKey, now());
    persistJournal(storage, journal);
    persistQuarantine(storage, collectInitialQuarantine(rawMain, journal));
  }

  const parsed = parseLegacyConversationCache(rawMain);
  const validByIndex = new Map(parsed.items.filter((item) => item.valid).map((item) => [item.index, item]));
  for (const current of journal.items) {
    if (current.status !== "pending" && current.status !== "failed") continue;
    const parsedItem = validByIndex.get(current.sourceIndex);
    if (!parsedItem?.valid) continue;
    try {
      const importResult = await importLegacyConversation(
        input.apiOrigin,
        input.token,
        toImportRequest(parsedItem.conversation, current.sourceFingerprint),
        request,
      );
      if (importResult.outcome === "conflict") {
        current.status = "conflicted";
        current.conflictReason = importResult.reason;
        upsertQuarantine(storage, {
          itemId: current.itemId,
          sourceFingerprint: current.sourceFingerprint,
          conversationId: current.conversationId,
          sourceIndex: current.sourceIndex,
          reason: importResult.reason ?? "conversation_content_conflict",
          rawItem: parsedItem.rawItem,
        });
      } else {
        current.status = importResult.outcome === "imported" ? "migrated" : "skipped";
        delete current.error;
      }
    } catch (error) {
      current.status = "failed";
      current.error = error instanceof Error && error.message.trim() ? error.message : String(error);
    }
    journal.updatedAt = now();
    journal.counts = countItems(journal.items, readQuarantine(storage));
    persistJournal(storage, journal);
  }

  journal.updatedAt = now();
  journal.counts = countItems(journal.items, readQuarantine(storage));
  persistJournal(storage, journal);
  const result = resultFromJournal(journal);
  if (!result.requiresUserAction) storage.removeItem(LEGACY_CONVERSATIONS_KEY);
  return result;
}

export function readLegacyConversationMigrationJournal(storage: LegacyConversationStorage = globalThis.localStorage) {
  const raw = storage.getItem(JOURNAL_KEY);
  if (!raw) return null;
  try {
    const value = JSON.parse(raw) as LegacyConversationMigrationJournal;
    return value?.schemaVersion === 1 && Array.isArray(value.items) ? value : null;
  } catch { return null; }
}

export function exportLegacyConversationRecovery(storage: LegacyConversationStorage = globalThis.localStorage) {
  const journal = readLegacyConversationMigrationJournal(storage);
  return JSON.stringify({
    schemaVersion: 1,
    exportedAt: new Date().toISOString(),
    journal,
    backup: journal ? { key: journal.backupKey, raw: storage.getItem(journal.backupKey) } : null,
    currentRaw: storage.getItem(LEGACY_CONVERSATIONS_KEY),
    quarantine: readQuarantine(storage),
  }, null, 2);
}

export function formatLegacyConversationMigrationSummary(result: LegacyConversationMigrationResult) {
  const { counts } = result;
  return `Legacy conversation migration needs attention: migrated=${counts.migrated}, skipped=${counts.skipped}, conflicted=${counts.conflicted}, quarantined=${counts.quarantined}, failed=${counts.failed}. Export recovery data before resolving conflicts.`;
}

async function createJournal(raw: string, sourceFingerprint: string, backupKey: string, timestamp: string) {
  const parsed = parseLegacyConversationCache(raw);
  const sources = parsed.envelopeValid
    ? parsed.items.map((item) => ({ index: item.index, rawItem: item.rawItem, conversationId: item.valid ? item.conversation.summary.id : null, valid: item.valid }))
    : [{ index: 0, rawItem: raw, conversationId: null, valid: false }];
  const items: LegacyConversationMigrationItem[] = [];
  for (const source of sources) {
    const fingerprint = await sha256(canonicalJson(source.rawItem));
    items.push({
      itemId: `legacy-v1:${fingerprint}`,
      sourceFingerprint: fingerprint,
      conversationId: source.conversationId,
      sourceIndex: source.index,
      status: source.valid ? "pending" : "quarantined",
      ...(!source.valid ? { error: parsed.envelopeError ?? "invalid_v1_conversation" } : {}),
    });
  }
  return {
    schemaVersion: 1 as const,
    sourceFingerprint,
    backupKey,
    startedAt: timestamp,
    updatedAt: timestamp,
    counts: countItems(items, []),
    items,
  };
}

function collectInitialQuarantine(raw: string, journal: LegacyConversationMigrationJournal) {
  const parsed = parseLegacyConversationCache(raw);
  if (!parsed.envelopeValid) {
    const item = journal.items[0]!;
    return [{ itemId: item.itemId, sourceFingerprint: item.sourceFingerprint, conversationId: null, sourceIndex: 0, reason: parsed.envelopeError ?? "invalid_v1_envelope", rawItem: raw }];
  }
  return parsed.items.flatMap((parsedItem) => {
    if (parsedItem.valid) return [];
    const item = journal.items.find((candidate) => candidate.sourceIndex === parsedItem.index)!;
    return [{ itemId: item.itemId, sourceFingerprint: item.sourceFingerprint, conversationId: null, sourceIndex: parsedItem.index, reason: parsedItem.error, rawItem: parsedItem.rawItem }];
  });
}

function toImportRequest(source: LegacyConversationRecord, sourceFingerprint: string): LegacyConversationImportRequest {
  return {
    schemaVersion: LEGACY_CONVERSATION_IMPORT_SCHEMA_VERSION,
    sourceFingerprint,
    conversation: {
      id: source.summary.id,
      model: source.summary.model,
      title: source.summary.title,
      createdAt: source.summary.createdAt,
      updatedAt: source.summary.updatedAt,
      messages: source.messages.map((message) => ({ ...message, parts: markMissingLegacyAttachmentPayloads(message.parts) as unknown[] })),
    },
  };
}

function countItems(items: LegacyConversationMigrationItem[], quarantine: LegacyConversationQuarantineItem[]): LegacyConversationMigrationCounts {
  return {
    migrated: items.filter((item) => item.status === "migrated").length,
    skipped: items.filter((item) => item.status === "skipped").length,
    conflicted: items.filter((item) => item.status === "conflicted").length,
    quarantined: quarantine.length,
    failed: items.filter((item) => item.status === "failed").length,
  };
}
function resultFromJournal(journal: LegacyConversationMigrationJournal): LegacyConversationMigrationResult {
  return { ...journal, requiresUserAction: journal.counts.conflicted > 0 || journal.counts.quarantined > 0 || journal.counts.failed > 0 };
}
function emptyJournal(timestamp: string): LegacyConversationMigrationJournal {
  return { schemaVersion: 1, sourceFingerprint: "", backupKey: "", startedAt: timestamp, updatedAt: timestamp, counts: { migrated: 0, skipped: 0, conflicted: 0, quarantined: 0, failed: 0 }, items: [] };
}
function persistJournal(storage: LegacyConversationStorage, journal: LegacyConversationMigrationJournal) {
  storage.setItem(JOURNAL_KEY, JSON.stringify(journal));
}
function readQuarantine(storage: LegacyConversationStorage): LegacyConversationQuarantineItem[] {
  const raw = storage.getItem(QUARANTINE_KEY);
  if (!raw) return [];
  try { const value = JSON.parse(raw); return Array.isArray(value) ? value : []; } catch { return []; }
}
function persistQuarantine(storage: LegacyConversationStorage, items: LegacyConversationQuarantineItem[]) {
  if (items.length) storage.setItem(QUARANTINE_KEY, JSON.stringify(items));
}
function upsertQuarantine(storage: LegacyConversationStorage, item: LegacyConversationQuarantineItem) {
  const current = readQuarantine(storage);
  const index = current.findIndex((candidate) => candidate.itemId === item.itemId);
  if (index >= 0) current[index] = item; else current.push(item);
  persistQuarantine(storage, current);
}
function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value && typeof value === "object") return `{${Object.entries(value as Record<string, unknown>).sort(([left], [right]) => left.localeCompare(right)).map(([key, child]) => `${JSON.stringify(key)}:${canonicalJson(child)}`).join(",")}}`;
  return JSON.stringify(value) ?? "null";
}
async function sha256(value: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}
