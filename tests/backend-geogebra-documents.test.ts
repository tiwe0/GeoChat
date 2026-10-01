import { describe, expect, test } from "bun:test";
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

    const updated = await request("/v1/geogebra-documents", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ...input, title: "Updated", contentKind: "text", mimeType: "application/xml", content: "<xml/>" }),
    });
    expect(updated.status).toBe(200);
    expect(updated.json.document).toMatchObject({ title: "Updated", contentKind: "text", content: "<xml/>", sizeBytes: 6 });

    expect((await request(`/v1/geogebra-documents/${input.id}`, { method: "DELETE" })).status).toBe(204);
    expect((await request(`/v1/geogebra-documents/${input.id}`)).status).toBe(404);
  });

  test("isolates documents by authenticated data scope", async () => {
    const { context } = await createHttpHarness();
    const first = await context.repositories.geogebraDocuments.upsertDocument({
      id: "private-doc",
      title: "Private",
      mimeType: "text/plain",
      contentKind: "text",
      content: "secret",
    }, { ownerUserId: "user-a" });
    expect(first.id).toBe("private-doc");
    expect(await context.repositories.geogebraDocuments.getDocument("private-doc", { ownerUserId: "user-b" })).toBeUndefined();
    expect(await context.repositories.geogebraDocuments.listDocuments({ ownerUserId: "user-b" })).toEqual([]);
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
});
