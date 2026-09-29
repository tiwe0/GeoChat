import { Buffer } from "node:buffer";

export class ProviderResponseTooLargeError extends Error {
  constructor() {
    super("Provider response body is too large.");
    this.name = "ProviderResponseTooLargeError";
  }
}

export class ProviderResponseReadError extends Error {
  constructor(cause: unknown) {
    super("Failed to read the provider response body.", { cause });
    this.name = "ProviderResponseReadError";
  }
}

export async function readBoundedProviderResponseBody(
  response: Response,
  maxBytes: number,
  abortUpstream: () => void = () => undefined
): Promise<Buffer> {
  const contentLength = parseContentLength(response.headers.get("content-length"));
  if (contentLength !== undefined && contentLength > maxBytes) {
    const error = new ProviderResponseTooLargeError();
    abortUpstream();
    await cancelResponseBody(response.body, error);
    throw error;
  }

  if (!response.body) return Buffer.alloc(0);

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let byteLength = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!value) continue;

      byteLength += value.byteLength;
      if (byteLength > maxBytes) {
        const error = new ProviderResponseTooLargeError();
        abortUpstream();
        await cancelReader(reader, error);
        throw error;
      }
      chunks.push(value);
    }
  } catch (error) {
    if (error instanceof ProviderResponseTooLargeError) throw error;
    throw new ProviderResponseReadError(error);
  } finally {
    reader.releaseLock();
  }

  return Buffer.concat(chunks, byteLength);
}

function parseContentLength(value: string | null) {
  if (!value || !/^\d+$/.test(value)) return undefined;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) ? parsed : undefined;
}

async function cancelResponseBody(body: ReadableStream<Uint8Array> | null, reason: unknown) {
  if (!body) return;
  try {
    await body.cancel(reason);
  } catch {
    // Best effort: the abort controller still terminates the upstream request.
  }
}

async function cancelReader(reader: { cancel(reason?: unknown): Promise<void> }, reason: unknown) {
  try {
    await reader.cancel(reason);
  } catch {
    // Best effort: the abort controller still terminates the upstream request.
  }
}
