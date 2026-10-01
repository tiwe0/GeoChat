import {
  decodeGeoGebraDocumentListResponse,
  decodeGeoGebraDocumentResponse,
  GEOGEBRA_FILE_MIME_TYPE,
  type GeoGebraDocument,
  type GeoGebraDocumentMetadata,
  type UpsertGeoGebraDocumentInput,
} from "@geochat-ai/app/geogebra-documents";

function endpoint(apiOrigin: string, id?: string) {
  const collection = `${apiOrigin.replace(/\/$/, "")}/v1/geogebra-documents`;
  return id === undefined ? collection : `${collection}/${encodeURIComponent(id)}`;
}

export type GeoGebraDocumentListOptions = {
  limit: number;
  offset: number;
};

function headers(token: string | null, json = false) {
  const result: Record<string, string> = { "x-client-channel": "desktop-workbench" };
  if (token) result.Authorization = `Bearer ${token}`;
  if (json) result["content-type"] = "application/json";
  return result;
}

export async function saveGeoGebraDocument(
  apiOrigin: string,
  token: string | null,
  input: UpsertGeoGebraDocumentInput,
  request: typeof fetch = fetch,
): Promise<GeoGebraDocument> {
  const response = await request(endpoint(apiOrigin), {
    method: "POST",
    headers: headers(token, true),
    body: JSON.stringify(input),
  });
  const data = await readJson(response, "GeoGebra document save returned invalid JSON.");
  if (!response.ok) throw new Error(responseMessage(data, `Unable to save GeoGebra document (${response.status}).`));
  const decoded = decodeGeoGebraDocumentResponse(data);
  if (!decoded.ok) throw new Error("GeoGebra document save response did not match the runtime contract.");
  return decoded.value.document;
}

export async function loadGeoGebraDocument(
  apiOrigin: string,
  token: string | null,
  id: string,
  request: typeof fetch = fetch,
  signal?: AbortSignal,
): Promise<GeoGebraDocument> {
  const response = await request(endpoint(apiOrigin, id), { headers: headers(token), cache: "no-store", signal });
  const data = await readJson(response, "GeoGebra document load returned invalid JSON.");
  if (!response.ok) throw new Error(responseMessage(data, `Unable to load GeoGebra document (${response.status}).`));
  const decoded = decodeGeoGebraDocumentResponse(data);
  if (!decoded.ok) throw new Error("GeoGebra document load response did not match the runtime contract.");
  return decoded.value.document;
}

export async function listGeoGebraDocuments(
  apiOrigin: string,
  token: string | null,
  options: GeoGebraDocumentListOptions,
  request: typeof fetch = fetch,
): Promise<GeoGebraDocumentMetadata[]> {
  const url = new URL(endpoint(apiOrigin));
  url.searchParams.set("limit", String(options.limit));
  url.searchParams.set("offset", String(options.offset));
  const response = await request(url, { headers: headers(token), cache: "no-store" });
  const data = await readJson(response, "GeoGebra document list returned invalid JSON.");
  if (!response.ok) throw new Error(responseMessage(data, `Unable to list GeoGebra documents (${response.status}).`));
  const decoded = decodeGeoGebraDocumentListResponse(data);
  if (!decoded.ok) throw new Error("GeoGebra document list response did not match the runtime contract.");
  return decoded.value.documents;
}

export async function deleteGeoGebraDocument(
  apiOrigin: string,
  token: string | null,
  id: string,
  request: typeof fetch = fetch,
): Promise<void> {
  const response = await request(endpoint(apiOrigin, id), { method: "DELETE", headers: headers(token) });
  if (response.status === 204 || response.status === 404) return;
  const data = await readJson(response, "GeoGebra document delete returned invalid JSON.");
  throw new Error(responseMessage(data, `Unable to delete GeoGebra document (${response.status}).`));
}

export type GeoGebraDocumentCanvas = {
  captureDocumentBase64(): Promise<string>;
  restoreDocumentBase64(base64: string): Promise<void>;
};

/**
 * Product-facing document workflow.
 *
 * The canvas remains an in-memory editor. Durable documents always cross the
 * authenticated backend boundary and are stored by the SQLite repository.
 */
export class GeoGebraDocumentWorkspace {
  private openGeneration = 0;
  private openAbort: AbortController | null = null;

  constructor(
    private readonly apiOrigin: string,
    private readonly token: string | null,
    private readonly canvas: GeoGebraDocumentCanvas,
    private readonly request: typeof fetch = fetch,
  ) {}

  list(options: GeoGebraDocumentListOptions) {
    return listGeoGebraDocuments(this.apiOrigin, this.token, options, this.request);
  }

  async save(input: { id: string; title: string }) {
    const content = await this.canvas.captureDocumentBase64();
    if (!content) throw new Error("The GeoGebra canvas did not provide a document snapshot.");
    return saveGeoGebraDocument(this.apiOrigin, this.token, {
      id: input.id,
      title: input.title,
      mimeType: GEOGEBRA_FILE_MIME_TYPE,
      contentKind: "binary",
      content,
    }, this.request);
  }

  async open(id: string) {
    const generation = ++this.openGeneration;
    this.openAbort?.abort();
    const abort = new AbortController();
    this.openAbort = abort;
    const assertCurrent = () => {
      if (abort.signal.aborted || generation !== this.openGeneration) {
        throw new DOMException("GeoGebra document open was superseded.", "AbortError");
      }
    };
    const document = await loadGeoGebraDocument(this.apiOrigin, this.token, id, this.request, abort.signal);
    assertCurrent();
    if (document.contentKind !== "binary" || document.mimeType !== GEOGEBRA_FILE_MIME_TYPE) {
      throw new Error("The stored document is not a complete GeoGebra file.");
    }
    await this.canvas.restoreDocumentBase64(document.content);
    assertCurrent();
    return document;
  }

  delete(id: string) {
    return deleteGeoGebraDocument(this.apiOrigin, this.token, id, this.request);
  }
}

export function mergeGeoGebraDocumentPages(
  current: GeoGebraDocumentMetadata[],
  next: GeoGebraDocumentMetadata[],
) {
  const byId = new Map(current.map((document) => [document.id, document]));
  for (const document of next) byId.set(document.id, document);
  return [...byId.values()].sort((left, right) => {
    const byUpdatedAt = right.updatedAt.localeCompare(left.updatedAt);
    return byUpdatedAt || left.id.localeCompare(right.id);
  });
}

async function readJson(response: Response, message: string): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    throw new Error(message);
  }
}

function responseMessage(data: unknown, fallback: string) {
  return data && typeof data === "object" && "message" in data && typeof data.message === "string"
    ? data.message
    : fallback;
}
