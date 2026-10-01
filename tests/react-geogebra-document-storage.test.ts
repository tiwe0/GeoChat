import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import {
  deleteGeoGebraDocument,
  GeoGebraDocumentWorkspace,
  listGeoGebraDocuments,
  loadGeoGebraDocument,
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
      id: "doc-1", title: "Doc", mimeType: "text/plain", contentKind: "text", content: "saved",
    }, request as typeof fetch);
    let settled = false;
    void pending.then(() => { settled = true; });
    await Promise.resolve();
    expect(settled).toBe(false);
    resolveResponse(Response.json({ document: {
      id: "doc-1", title: "Doc", mimeType: "text/plain", contentKind: "text", content: "saved",
      sizeBytes: 5, createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-01T00:00:00.000Z",
    } }, { status: 201 }));
    expect((await pending).content).toBe("saved");
  });

  test("uses authenticated document endpoints", async () => {
    const calls: Array<{ url: string; init?: RequestInit }> = [];
    const request = async (url: string | URL | Request, init?: RequestInit) => {
      calls.push({ url: String(url), init });
      if (init?.method === "DELETE") return new Response(null, { status: 204 });
      if (String(url).endsWith("/v1/geogebra-documents")) return Response.json({ documents: [] });
      return Response.json({ document: {
        id: "doc/a", title: "Doc", mimeType: "text/plain", contentKind: "text", content: "x",
        sizeBytes: 1, createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-01T00:00:00.000Z",
      } });
    };
    await listGeoGebraDocuments("http://backend/", "secret", request as typeof fetch);
    await loadGeoGebraDocument("http://backend/", "secret", "doc/a", request as typeof fetch);
    await deleteGeoGebraDocument("http://backend/", "secret", "doc/a", request as typeof fetch);
    expect(calls.map(({ url }) => url)).toEqual([
      "http://backend/v1/geogebra-documents",
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
        const document = {
          ...input,
          sizeBytes: new TextEncoder().encode(input.content).byteLength,
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
    const first = new GeoGebraDocumentWorkspace("http://backend", "token", {
      captureXml: () => "<geogebra><construction/></geogebra>",
      restoreXml: async () => undefined,
    }, request as typeof fetch);
    await first.save({ id: "proof", title: "Proof" });

    let restored = "";
    const reopened = new GeoGebraDocumentWorkspace("http://backend", "token", {
      captureXml: () => undefined,
      restoreXml: async (xml) => { restored = xml; },
    }, request as typeof fetch);
    expect(await reopened.list()).toEqual([expect.objectContaining({ id: "proof", title: "Proof" })]);
    expect((await reopened.open("proof")).id).toBe("proof");
    expect(restored).toBe("<geogebra><construction/></geogebra>");
    await reopened.delete("proof");
    expect(await reopened.list()).toEqual([]);
  });

  test("does not report an open until the canvas restore completes", async () => {
    const request = async () => Response.json({ document: {
      id: "doc-1", title: "Doc", mimeType: "application/vnd.geogebra.xml", contentKind: "text",
      content: "<geogebra/>", sizeBytes: 11,
      createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-01T00:00:00.000Z",
    } });
    const workspace = new GeoGebraDocumentWorkspace("http://backend", null, {
      captureXml: () => undefined,
      restoreXml: async () => { throw new Error("restore failed"); },
    }, request as typeof fetch);
    await expect(workspace.open("doc-1")).rejects.toThrow("restore failed");
  });
});
