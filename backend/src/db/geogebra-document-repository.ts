import { and, asc, desc, eq } from "drizzle-orm";
import { Buffer } from "node:buffer";
import type {
  GeoGebraDocument,
  GeoGebraDocumentMetadata,
  UpsertGeoGebraDocumentInput,
} from "@geochat-ai/app/geogebra-documents";
import { DEFAULT_GEOGEBRA_DOCUMENT_LIST_LIMIT } from "@geochat-ai/app/geogebra-documents";
import type { createDatabase } from "./client";
import { geogebraDocuments } from "./schema";

type SqliteDatabase = ReturnType<typeof createDatabase>;
type DocumentRow = typeof geogebraDocuments.$inferSelect;
type DocumentMetadataRow = Omit<DocumentRow, "content">;

export type GeoGebraDocumentDataScope = { ownerUserId?: string | null };
export type GeoGebraDocumentListOptions = { limit: number; offset: number };

export type GeoGebraDocumentRepository = {
  listDocuments(scope?: GeoGebraDocumentDataScope, options?: GeoGebraDocumentListOptions): Promise<GeoGebraDocumentMetadata[]>;
  getDocument(id: string, scope?: GeoGebraDocumentDataScope): Promise<GeoGebraDocument | undefined>;
  upsertDocument(input: UpsertGeoGebraDocumentInput, scope?: GeoGebraDocumentDataScope): Promise<GeoGebraDocument>;
  deleteDocument(id: string, scope?: GeoGebraDocumentDataScope): Promise<boolean>;
};

export function createGeoGebraDocumentRepository(db: SqliteDatabase): GeoGebraDocumentRepository {
  return {
    async listDocuments(scope, options = { limit: DEFAULT_GEOGEBRA_DOCUMENT_LIST_LIMIT, offset: 0 }) {
      return db.select({
        ownerScopeKey: geogebraDocuments.ownerScopeKey,
        ownerUserId: geogebraDocuments.ownerUserId,
        id: geogebraDocuments.id,
        title: geogebraDocuments.title,
        mimeType: geogebraDocuments.mimeType,
        contentKind: geogebraDocuments.contentKind,
        sizeBytes: geogebraDocuments.sizeBytes,
        createdAt: geogebraDocuments.createdAt,
        updatedAt: geogebraDocuments.updatedAt,
      }).from(geogebraDocuments)
        .where(eq(geogebraDocuments.ownerScopeKey, scopeKey(scope)))
        .orderBy(desc(geogebraDocuments.updatedAt), asc(geogebraDocuments.id))
        .limit(options.limit)
        .offset(options.offset)
        .all()
        .map(metadataFromRow);
    },
    async getDocument(id, scope) {
      const row = db.select().from(geogebraDocuments).where(and(
        eq(geogebraDocuments.ownerScopeKey, scopeKey(scope)),
        eq(geogebraDocuments.id, id),
      )).get();
      return row ? documentFromRow(row) : undefined;
    },
    async upsertDocument(input, scope) {
      const key = scopeKey(scope);
      const existing = db.select({ createdAt: geogebraDocuments.createdAt }).from(geogebraDocuments).where(and(
        eq(geogebraDocuments.ownerScopeKey, key),
        eq(geogebraDocuments.id, input.id),
      )).get();
      const now = new Date();
      const content = Buffer.from(input.content, "base64");
      db.insert(geogebraDocuments).values({
        ownerScopeKey: key,
        ownerUserId: scope?.ownerUserId ?? null,
        id: input.id,
        title: input.title,
        mimeType: input.mimeType,
        contentKind: input.contentKind,
        content,
        sizeBytes: content.byteLength,
        createdAt: existing?.createdAt ?? now,
        updatedAt: now,
      }).onConflictDoUpdate({
        target: [geogebraDocuments.ownerScopeKey, geogebraDocuments.id],
        set: {
          title: input.title,
          mimeType: input.mimeType,
          contentKind: input.contentKind,
          content,
          sizeBytes: content.byteLength,
          updatedAt: now,
        },
      }).run();
      const persisted = db.select().from(geogebraDocuments).where(and(
        eq(geogebraDocuments.ownerScopeKey, key),
        eq(geogebraDocuments.id, input.id),
      )).get();
      if (!persisted) throw new Error("GeoGebra document was not persisted.");
      return documentFromRow(persisted);
    },
    async deleteDocument(id, scope) {
      const condition = and(
        eq(geogebraDocuments.ownerScopeKey, scopeKey(scope)),
        eq(geogebraDocuments.id, id),
      );
      const existed = Boolean(db.select({ id: geogebraDocuments.id }).from(geogebraDocuments).where(condition).get());
      db.delete(geogebraDocuments).where(condition).run();
      return existed;
    },
  };
}

function scopeKey(scope?: GeoGebraDocumentDataScope) {
  return scope?.ownerUserId ? `user:${scope.ownerUserId}` : "offline";
}

function metadataFromRow(row: DocumentMetadataRow): GeoGebraDocumentMetadata {
  if (row.contentKind !== "binary") throw new Error("Stored GeoGebra document content kind is invalid.");
  return {
    id: row.id,
    title: row.title,
    mimeType: row.mimeType,
    contentKind: row.contentKind,
    sizeBytes: row.sizeBytes,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function documentFromRow(row: DocumentRow): GeoGebraDocument {
  return {
    ...metadataFromRow(row),
    content: row.content.toString("base64"),
  };
}
