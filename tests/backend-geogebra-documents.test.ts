import { describe, expect, test } from "bun:test";
import { Buffer } from "node:buffer";
import { geogebraDocuments } from "../backend/src/db/schema";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  MAX_GEOGEBRA_DOCUMENT_BYTES,
  MAX_GEOGEBRA_DOCUMENT_REQUEST_BYTES,
  decodeUpsertGeoGebraDocumentInput,
} from "@geochat-ai/app/geogebra-documents";
import { createHttpHarness } from "./agent-harness-http-utils";

describe("GeoGebra document HTTP persistence", () => {
  test("upserts, lists, reads, updates, and deletes documents in SQLite", async () => {
    const { request } = await createHttpHarness();
    const input = {
      id: "worksheet-1",
      title: "Triangle",
      mimeType: "application/vnd.geogebra.file",
      contentKind: "binary",
      content: btoa("ggb-content"),
    };

    const created = await request("/v1/geogebra-documents", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(input),
    });
    expect(created.status).toBe(201);
    expect(created.json.document).toMatchObject({ ...input, sizeBytes: 11 });

    const listed = await request("/v1/geogebra-documents");
    expect(listed.status).toBe(200);
    expect(listed.json.documents).toEqual([
      expect.objectContaining({ id: input.id, title: input.title, sizeBytes: 11 }),
    ]);
    expect(listed.json.documents[0]).not.toHaveProperty("content");

    const read = await request(`/v1/geogebra-documents/${input.id}`);
    expect(read.status).toBe(200);
    expect(read.json.document).toMatchObject(input);

    const updatedContent = btoa("updated-ggb-content");
    const updated = await request("/v1/geogebra-documents", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ...input, title: "Updated", content: updatedContent }),
    });
    expect(updated.status).toBe(200);
    expect(updated.json.document).toMatchObject({ title: "Updated", contentKind: "binary", content: updatedContent, sizeBytes: 19 });

    expect((await request(`/v1/geogebra-documents/${input.id}`, { method: "DELETE" })).status).toBe(204);
    expect((await request(`/v1/geogebra-documents/${input.id}`)).status).toBe(404);
  });

  test("isolates documents by authenticated data scope", async () => {
    const { context } = await createHttpHarness();
    const first = await context.repositories.geogebraDocuments.upsertDocument({
      id: "private-doc",
      title: "Private",
      mimeType: "application/vnd.geogebra.file",
      contentKind: "binary",
      content: btoa("secret"),
    }, { ownerUserId: "user-a" });
    expect(first.id).toBe("private-doc");
    expect(await context.repositories.geogebraDocuments.getDocument("private-doc", { ownerUserId: "user-b" })).toBeUndefined();
    expect(await context.repositories.geogebraDocuments.listDocuments({ ownerUserId: "user-b" })).toEqual([]);
  });

  test("roundtrips complete binary files and Unicode metadata after SQLite restart", async () => {
    const databasePath = join(tmpdir(), `geochat-geogebra-${crypto.randomUUID()}.sqlite`);
    const embeddedImageBytes = Buffer.from([
      0x50, 0x4b, 0x03, 0x04,
      0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
      ...Buffer.from("图像/image.png", "utf8"),
    ]);
    const input = {
      id: "几何/worksheet-图像",
      title: "圆与三角形 🧭",
      mimeType: "application/vnd.geogebra.file",
      contentKind: "binary" as const,
      content: embeddedImageBytes.toString("base64"),
    };
    const first = await createHttpHarness({ databasePath });
    expect((await first.request("/v1/geogebra-documents", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(input),
    })).status).toBe(201);
    first.close();

    const reopened = await createHttpHarness({ databasePath });
    const listed = await reopened.request("/v1/geogebra-documents?limit=1&offset=0");
    expect(listed.json.documents).toEqual([
      expect.objectContaining({ id: input.id, title: input.title, sizeBytes: embeddedImageBytes.byteLength }),
    ]);
    expect(listed.json.documents[0]).not.toHaveProperty("content");
    const read = await reopened.request(`/v1/geogebra-documents/${encodeURIComponent(input.id)}`);
    expect(read.status).toBe(200);
    expect(Buffer.from(read.json.document.content, "base64")).toEqual(embeddedImageBytes);
    reopened.close();
  });

  test("paginates metadata within a bounded list size", async () => {
    const { request, context } = await createHttpHarness();
    for (let index = 0; index < 3; index += 1) {
      await context.repositories.geogebraDocuments.upsertDocument({
        id: `doc-${index}`,
        title: `Document ${index}`,
        mimeType: "application/vnd.geogebra.file",
        contentKind: "binary",
        content: Buffer.from(`file-${index}`).toString("base64"),
      });
    }
    const firstPage = await request("/v1/geogebra-documents?limit=2&offset=0");
    const secondPage = await request("/v1/geogebra-documents?limit=2&offset=2");
    expect(firstPage.json.documents).toHaveLength(2);
    expect(secondPage.json.documents).toHaveLength(1);
    expect((await request("/v1/geogebra-documents?limit=201")).status).toBe(400);
    expect((await request("/v1/geogebra-documents?offset=-1")).status).toBe(400);
  });

  test("uses a stable id tiebreaker across 101 documents with the same update timestamp", async () => {
    const { request, context } = await createHttpHarness();
    const timestamp = new Date("2026-01-01T00:00:00.000Z");
    context.database.insert(geogebraDocuments).values(Array.from({ length: 101 }, (_, index) => {
      const id = `doc-${String(index).padStart(3, "0")}`;
      return {
        ownerScopeKey: "offline",
        ownerUserId: null,
        id,
        title: id,
        mimeType: "application/vnd.geogebra.file",
        contentKind: "binary" as const,
        content: Buffer.from(id),
        sizeBytes: Buffer.byteLength(id),
        createdAt: timestamp,
        updatedAt: timestamp,
      };
    })).run();

    const firstPage = await request("/v1/geogebra-documents?limit=100&offset=0");
    const secondPage = await request("/v1/geogebra-documents?limit=100&offset=100");
    const ids = [...firstPage.json.documents, ...secondPage.json.documents]
      .map((document: { id: string }) => document.id);

    expect(ids).toHaveLength(101);
    expect(new Set(ids).size).toBe(101);
    expect(ids).toEqual(Array.from({ length: 101 }, (_, index) => `doc-${String(index).padStart(3, "0")}`));
  });

  test("rejects oversized bodies before parsing JSON", async () => {
    const { handleRequest } = await createHttpHarness();
    const declaredOversize = await handleRequest(new Request("http://127.0.0.1:17365/v1/geogebra-documents", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "content-length": String(MAX_GEOGEBRA_DOCUMENT_REQUEST_BYTES + 1),
      },
      body: "{}",
    }));
    expect(declaredOversize.status).toBe(413);
    expect(await declaredOversize.json()).toMatchObject({ error: "payload_too_large" });

    const streamedOversize = await handleRequest(new Request("http://127.0.0.1:17365/v1/geogebra-documents", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: new Blob([new Uint8Array(MAX_GEOGEBRA_DOCUMENT_REQUEST_BYTES + 1)]).stream(),
    }));
    expect(streamedOversize.status).toBe(413);
    expect(await streamedOversize.json()).toMatchObject({ error: "payload_too_large" });
  });

  test("accepts the exact binary size boundary and rejects one byte over", () => {
    const atLimit = Buffer.alloc(MAX_GEOGEBRA_DOCUMENT_BYTES).toString("base64");
    const overLimit = Buffer.alloc(MAX_GEOGEBRA_DOCUMENT_BYTES + 1).toString("base64");
    const identity = { id: "boundary", title: "Boundary", mimeType: "application/vnd.geogebra.file", contentKind: "binary" };
    expect(decodeUpsertGeoGebraDocumentInput({ ...identity, content: atLimit }).ok).toBe(true);
    expect(decodeUpsertGeoGebraDocumentInput({ ...identity, content: overLimit }).ok).toBe(false);
  });

  test("rejects malformed binary payloads", async () => {
    const { request } = await createHttpHarness();
    const response = await request("/v1/geogebra-documents", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ id: "bad", title: "Bad", mimeType: "application/octet-stream", contentKind: "binary", content: "not-base64" }),
    });
    expect(response.status).toBe(400);
  });

  test("rejects XML snapshots and non-GeoGebra MIME types", async () => {
    const { request } = await createHttpHarness();
    const response = await request("/v1/geogebra-documents", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        id: "xml-snapshot",
        title: "Incomplete",
        mimeType: "application/vnd.geogebra.xml",
        contentKind: "text",
        content: "<geogebra/>",
      }),
    });
    expect(response.status).toBe(400);
  });
});
