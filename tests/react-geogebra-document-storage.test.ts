import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import {
  deleteGeoGebraDocument,
  GeoGebraDocumentWorkspace,
  listGeoGebraDocuments,
  loadGeoGebraDocument,
  mergeGeoGebraDocumentPages,
  saveGeoGebraDocument,
} from "../src/renderer-react/src/features/geogebra/documentStorage";

describe("GeoGebra document storage client", () => {
  test("the product shell exposes the SQLite document panel instead of the vendor file menu", () => {
    const app = readFileSync(new URL("../src/renderer-react/src/App.tsx", import.meta.url), "utf8");
    const wrapper = readFileSync(new URL("../src/renderer-react/src/geogebra/ggbdeploy-wrapper.ts", import.meta.url), "utf8");
    expect(app).toContain("<GeoGebraDocumentPanel");
    expect(app).not.toContain("openGeoGebraNativeMenu");
    expect(wrapper).toContain("DEFAULT_GEOGEBRA_FILE_FEATURES_ENABLED = false");
    expect(wrapper).toContain("DEFAULT_GEOGEBRA_MENU_VISIBLE = false");
  });

  test("awaits the backend response before reporting a save", async () => {
    let resolveResponse!: (response: Response) => void;
    const request = () => new Promise<Response>((resolve) => { resolveResponse = resolve; });
    const pending = saveGeoGebraDocument("http://backend", "token", {
      id: "doc-1", title: "Doc", mimeType: "application/vnd.geogebra.file", contentKind: "binary", content: "c2F2ZWQ=",
    }, request as typeof fetch);
    let settled = false;
    void pending.then(() => { settled = true; });
    await Promise.resolve();
    expect(settled).toBe(false);
    resolveResponse(Response.json({ document: {
      id: "doc-1", title: "Doc", mimeType: "application/vnd.geogebra.file", contentKind: "binary", content: "c2F2ZWQ=",
      sizeBytes: 5, createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-01T00:00:00.000Z",
    } }, { status: 201 }));
    expect((await pending).content).toBe("c2F2ZWQ=");
  });

  test("uses authenticated document endpoints", async () => {
    const calls: Array<{ url: string; init?: RequestInit }> = [];
    const request = async (url: string | URL | Request, init?: RequestInit) => {
      calls.push({ url: String(url), init });
      if (init?.method === "DELETE") return new Response(null, { status: 204 });
      if (new URL(String(url)).pathname === "/v1/geogebra-documents") return Response.json({ documents: [] });
      return Response.json({ document: {
        id: "doc/a", title: "Doc", mimeType: "application/vnd.geogebra.file", contentKind: "binary", content: "eA==",
        sizeBytes: 1, createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-01T00:00:00.000Z",
      } });
    };
    await listGeoGebraDocuments("http://backend/", "secret", { limit: 100, offset: 0 }, request as typeof fetch);
    await loadGeoGebraDocument("http://backend/", "secret", "doc/a", request as typeof fetch);
    await deleteGeoGebraDocument("http://backend/", "secret", "doc/a", request as typeof fetch);
    expect(calls.map(({ url }) => url)).toEqual([
      "http://backend/v1/geogebra-documents?limit=100&offset=0",
      "http://backend/v1/geogebra-documents/doc%2Fa",
      "http://backend/v1/geogebra-documents/doc%2Fa",
    ]);
    expect(new Headers(calls[0]!.init?.headers).get("authorization")).toBe("Bearer secret");
  });

  test("saves through SQLite and a new workspace instance can list and reopen the document", async () => {
    const persisted = new Map<string, Record<string, unknown>>();
    let clock = 0;
    const request = async (urlValue: string | URL | Request, init?: RequestInit) => {
      const url = String(urlValue);
      const id = url.split("/v1/geogebra-documents/")[1];
      if (init?.method === "POST") {
        const input = JSON.parse(String(init.body)) as Record<string, string>;
        const now = new Date(Date.UTC(2026, 0, 1, 0, 0, clock++)).toISOString();
        const binaryBytes = Buffer.from(input.content, "base64");
        const document = {
          ...input,
          sizeBytes: binaryBytes.byteLength,
          createdAt: now,
          updatedAt: now,
        };
        persisted.set(input.id, document);
        return Response.json({ document }, { status: 201 });
      }
      if (id) {
        if (init?.method === "DELETE") {
          persisted.delete(decodeURIComponent(id));
          return new Response(null, { status: 204 });
        }
        const document = persisted.get(decodeURIComponent(id));
        return document ? Response.json({ document }) : Response.json({ message: "missing" }, { status: 404 });
      }
      return Response.json({ documents: [...persisted.values()].map(({ content: _content, ...metadata }) => metadata) });
    };
    const completeGgb = Buffer.from([0x50, 0x4b, 0x03, 0x04, 0x89, 0x50, 0x4e, 0x47]).toString("base64");
    const first = new GeoGebraDocumentWorkspace("http://backend", "token", {
      captureDocumentBase64: async () => completeGgb,
      restoreDocumentBase64: async () => undefined,
    }, request as typeof fetch);
    await first.save({ id: "proof", title: "Proof" });

    let restored = "";
    const reopened = new GeoGebraDocumentWorkspace("http://backend", "token", {
      captureDocumentBase64: async () => "",
      restoreDocumentBase64: async (base64) => { restored = base64; },
    }, request as typeof fetch);
    expect(await reopened.list({ limit: 100, offset: 0 })).toEqual([expect.objectContaining({ id: "proof", title: "Proof" })]);
    expect((await reopened.open("proof")).id).toBe("proof");
    expect(restored).toBe(completeGgb);
    await reopened.delete("proof");
    expect(await reopened.list({ limit: 100, offset: 0 })).toEqual([]);
  });

  test("reaches document 101 through stable paged listing", async () => {
    const updatedAt = "2026-01-01T00:00:00.000Z";
    const documents = Array.from({ length: 101 }, (_, index) => ({
      id: `doc-${String(index).padStart(3, "0")}`,
      title: `Document ${index}`,
      mimeType: "application/vnd.geogebra.file",
      contentKind: "binary" as const,
      sizeBytes: index,
      createdAt: updatedAt,
      updatedAt,
    }));
    const requestedOffsets: number[] = [];
    const request = async (urlValue: string | URL | Request) => {
      const url = new URL(String(urlValue));
      const limit = Number(url.searchParams.get("limit"));
      const offset = Number(url.searchParams.get("offset"));
      requestedOffsets.push(offset);
      return Response.json({ documents: documents.slice(offset, offset + limit) });
    };

    const first = await listGeoGebraDocuments(
      "http://backend",
      null,
      { limit: 100, offset: 0 },
      request as typeof fetch,
    );
    const second = await listGeoGebraDocuments(
      "http://backend",
      null,
      { limit: 100, offset: first.length },
      request as typeof fetch,
    );
    const merged = mergeGeoGebraDocumentPages(first, second);

    expect(requestedOffsets).toEqual([0, 100]);
    expect(merged).toHaveLength(101);
    expect(merged.map(({ id }) => id)).toEqual(documents.map(({ id }) => id));
    expect(merged.at(-1)?.id).toBe("doc-100");
  });

  test("does not report an open until the canvas restore completes", async () => {
    const request = async () => Response.json({ document: {
      id: "doc-1", title: "Doc", mimeType: "application/vnd.geogebra.file", contentKind: "binary",
      content: "UEsDBA==", sizeBytes: 4,
      createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-01T00:00:00.000Z",
    } });
    const workspace = new GeoGebraDocumentWorkspace("http://backend", null, {
      captureDocumentBase64: async () => "",
      restoreDocumentBase64: async () => { throw new Error("restore failed"); },
    }, request as typeof fetch);
    await expect(workspace.open("doc-1")).rejects.toThrow("restore failed");
  });
});
