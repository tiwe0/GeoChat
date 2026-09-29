import type { SqliteMigration } from "./types";
import { addColumnIfMissing } from "./utils";

export const conversationOwnershipMigration: SqliteMigration = {
  version: 2,
  name: "conversation_ownership_and_legacy_imports",
  up(sqlite) {
    addColumnIfMissing(sqlite, "messages", "owner_user_id", "owner_user_id TEXT");
    addColumnIfMissing(sqlite, "conversations", "source_title", "source_title TEXT");
    addColumnIfMissing(sqlite, "conversations", "model", "model TEXT");
    addColumnIfMissing(sqlite, "conversations", "owner_user_id", "owner_user_id TEXT");
    sqlite.run("CREATE INDEX IF NOT EXISTS messages_owner_created_at_idx ON messages (owner_user_id, created_at)");
    sqlite.run("CREATE INDEX IF NOT EXISTS conversations_owner_updated_at_idx ON conversations (owner_user_id, updated_at)");
    sqlite.run(`
      CREATE TABLE IF NOT EXISTS legacy_conversation_import_receipts (
        id TEXT PRIMARY KEY,
        owner_scope_key TEXT NOT NULL,
        owner_user_id TEXT,
        source_fingerprint TEXT NOT NULL,
        content_fingerprint TEXT NOT NULL,
        conversation_id TEXT NOT NULL,
        outcome TEXT NOT NULL CHECK (outcome IN ('imported', 'skipped', 'conflict')),
        reason TEXT CHECK (reason IS NULL OR reason IN ('conversation_content_conflict', 'message_id_conflict', 'source_fingerprint_mismatch')),
        created_at INTEGER NOT NULL
      )
    `);
    sqlite.run("CREATE UNIQUE INDEX IF NOT EXISTS legacy_conversation_import_receipts_scope_source_uidx ON legacy_conversation_import_receipts (owner_scope_key, source_fingerprint)");
    sqlite.run("CREATE INDEX IF NOT EXISTS legacy_conversation_import_receipts_conversation_idx ON legacy_conversation_import_receipts (conversation_id)");
  }
};
