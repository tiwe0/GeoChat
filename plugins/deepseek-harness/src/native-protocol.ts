import type { InvocationDescriptor, TypertRemoteContribution, TypertSchema } from "@deepseek-ai/dsh-typert-protocol";

export const NATIVE_CANVAS_PROTOCOL_VERSION = 1 as const;
export const NATIVE_CANVAS_MAX_RESULT_BYTES = 16 * 1024 * 1024;
// The Remote uplink inbox is 256 KiB. Keep every encoded frame well below it.
export const NATIVE_CANVAS_REPLY_CHUNK_BYTES = 45 * 1024;
export const NATIVE_CANVAS_PACKAGE = "dsh-geochat-plugin";
export const NATIVE_CANVAS_SERVICE = "geochatCanvasRemote";
export const NATIVE_CANVAS_NAMESPACE = "geochatCanvas";

export type NativeCanvasDownlink =
  | { readonly type: "hello"; readonly version: 1; readonly generation: string }
  | {
      readonly type: "execute";
      readonly generation: string;
      readonly id: string;
      readonly toolName: string;
      readonly args: Record<string, unknown>;
    }
  | { readonly type: "cancel"; readonly generation: string; readonly id: string }
  | {
      readonly type: "result-ack";
      readonly generation: string;
      readonly id: string;
      readonly nextIndex: number;
    };

export type NativeCanvasUplink =
  | { readonly type: "ready"; readonly version: 1; readonly generation: string }
  | { readonly type: "cancel-settled"; readonly generation: string; readonly id: string }
  | { readonly type: "close-request"; readonly generation: string }
  | { readonly type: "close-settled"; readonly generation: string }
  | {
      readonly type: "result-start";
      readonly generation: string;
      readonly id: string;
      readonly bytes: number;
      readonly chunks: number;
    }
  | {
      readonly type: "result-chunk";
      readonly generation: string;
      readonly id: string;
      readonly index: number;
      readonly data: string;
    }
  | { readonly type: "result-end"; readonly generation: string; readonly id: string };

export type NativeCanvasWireReply =
  | { readonly id: string; readonly ok: true; readonly result: unknown }
  | { readonly id: string; readonly ok: false; readonly error: string };

function record(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new TypeError(`${label} must be an object.`);
  return value as Record<string, unknown>;
}

function exactKeys(value: Record<string, unknown>, keys: readonly string[], label: string): void {
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  if (actual.length !== expected.length || actual.some((key, index) => key !== expected[index])) {
    throw new TypeError(`${label} contains unexpected fields.`);
  }
}

function stringField(value: Record<string, unknown>, key: string, max: number): string {
  const result = value[key];
  if (
    typeof result !== "string" ||
    result.length === 0 ||
    result.length > max ||
    /[\u0000-\u001f\u007f]/.test(result)
  ) {
    throw new TypeError(`Invalid ${key}.`);
  }
  return result;
}

function integerField(value: Record<string, unknown>, key: string, minimum: number, maximum: number): number {
  const result = value[key];
  if (!Number.isSafeInteger(result) || (result as number) < minimum || (result as number) > maximum) {
    throw new TypeError(`Invalid ${key}.`);
  }
  return result as number;
}

function parseSessionId(value: unknown): string {
  if (typeof value !== "string" || value.length === 0 || value.length > 256 || /[\u0000-\u001f\u007f]/.test(value)) {
    throw new TypeError("Invalid native canvas session id.");
  }
  return value;
}

export function parseNativeCanvasDownlink(value: unknown): NativeCanvasDownlink {
  const item = record(value, "Native canvas downlink");
  if (item.type === "hello") {
    exactKeys(item, ["type", "version", "generation"], "Native canvas hello");
    if (item.version !== NATIVE_CANVAS_PROTOCOL_VERSION)
      throw new TypeError("Unsupported native canvas protocol version.");
    return { type: "hello", version: 1, generation: stringField(item, "generation", 128) };
  }
  if (item.type === "execute") {
    exactKeys(item, ["type", "generation", "id", "toolName", "args"], "Native canvas execute");
    const args = record(item.args, "Native canvas args");
    const toolName = stringField(item, "toolName", 128);
    if (!/^[A-Za-z][A-Za-z0-9_]{0,127}$/.test(toolName)) throw new TypeError("Invalid toolName.");
    return {
      type: "execute",
      generation: stringField(item, "generation", 128),
      id: stringField(item, "id", 128),
      toolName,
      args
    };
  }
  if (item.type === "cancel") {
    exactKeys(item, ["type", "generation", "id"], "Native canvas cancel");
    return {
      type: "cancel",
      generation: stringField(item, "generation", 128),
      id: stringField(item, "id", 128)
    };
  }
  if (item.type === "result-ack") {
    exactKeys(item, ["type", "generation", "id", "nextIndex"], "Native canvas result acknowledgement");
    return {
      type: "result-ack",
      generation: stringField(item, "generation", 128),
      id: stringField(item, "id", 128),
      nextIndex: integerField(item, "nextIndex", 0, 1_000_000)
    };
  }
  throw new TypeError("Unknown native canvas downlink type.");
}

export function parseNativeCanvasUplink(value: unknown): NativeCanvasUplink {
  const item = record(value, "Native canvas uplink");
  const generation = stringField(item, "generation", 128);
  if (item.type === "ready") {
    exactKeys(item, ["type", "version", "generation"], "Native canvas ready");
    if (item.version !== NATIVE_CANVAS_PROTOCOL_VERSION)
      throw new TypeError("Unsupported native canvas protocol version.");
    return { type: "ready", version: 1, generation };
  }
  if (item.type === "close-request" || item.type === "close-settled") {
    exactKeys(item, ["type", "generation"], `Native canvas ${item.type}`);
    return { type: item.type, generation };
  }
  const id = stringField(item, "id", 128);
  if (item.type === "cancel-settled") {
    exactKeys(item, ["type", "generation", "id"], "Native canvas cancellation acknowledgement");
    return { type: "cancel-settled", generation, id };
  }
  if (item.type === "result-start") {
    exactKeys(item, ["type", "generation", "id", "bytes", "chunks"], "Native canvas result start");
    return {
      type: "result-start",
      generation,
      id,
      bytes: integerField(item, "bytes", 1, NATIVE_CANVAS_MAX_RESULT_BYTES),
      chunks: integerField(
        item,
        "chunks",
        1,
        Math.ceil(NATIVE_CANVAS_MAX_RESULT_BYTES / NATIVE_CANVAS_REPLY_CHUNK_BYTES)
      )
    };
  }
  if (item.type === "result-chunk") {
    exactKeys(item, ["type", "generation", "id", "index", "data"], "Native canvas result chunk");
    const data = item.data;
    if (typeof data !== "string" || data.length === 0 || data.length > 64 * 1024) {
      throw new TypeError("Invalid result chunk data.");
    }
    return { type: "result-chunk", generation, id, index: integerField(item, "index", 0, 1_000_000), data };
  }
  if (item.type === "result-end") {
    exactKeys(item, ["type", "generation", "id"], "Native canvas result end");
    return { type: "result-end", generation, id };
  }
  throw new TypeError("Unknown native canvas uplink type.");
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  for (let offset = 0; offset < bytes.length; offset += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000));
  }
  return btoa(binary);
}

function base64ToBytes(value: string): Uint8Array {
  if (!/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(value)) {
    throw new TypeError("Invalid result chunk encoding.");
  }
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes;
}

export function encodeNativeCanvasReply(
  generation: string,
  reply: NativeCanvasWireReply
): readonly NativeCanvasUplink[] {
  const safeGeneration = parseSessionId(generation);
  const safeId = parseSessionId(reply.id);
  let json: string | undefined;
  try {
    json = JSON.stringify(reply);
  } catch {
    throw new TypeError("Native canvas reply is not JSON serializable.");
  }
  if (json === undefined) throw new TypeError("Native canvas reply is not JSON serializable.");
  const bytes = new TextEncoder().encode(json);
  if (bytes.length === 0 || bytes.length > NATIVE_CANVAS_MAX_RESULT_BYTES) {
    throw new RangeError(`Native canvas reply exceeds ${NATIVE_CANVAS_MAX_RESULT_BYTES} bytes.`);
  }
  const chunks = Math.ceil(bytes.length / NATIVE_CANVAS_REPLY_CHUNK_BYTES);
  const frames: NativeCanvasUplink[] = [
    { type: "result-start", generation: safeGeneration, id: safeId, bytes: bytes.length, chunks }
  ];
  for (let index = 0; index < chunks; index += 1) {
    const start = index * NATIVE_CANVAS_REPLY_CHUNK_BYTES;
    frames.push({
      type: "result-chunk",
      generation: safeGeneration,
      id: safeId,
      index,
      data: bytesToBase64(bytes.subarray(start, start + NATIVE_CANVAS_REPLY_CHUNK_BYTES))
    });
  }
  frames.push({ type: "result-end", generation: safeGeneration, id: safeId });
  return frames;
}

export class NativeCanvasReplyAssembler {
  private current?: { id: string; bytes: number; chunks: number; parts: Uint8Array[]; received: number };

  push(frame: NativeCanvasUplink): NativeCanvasWireReply | undefined {
    if (
      frame.type === "ready" ||
      frame.type === "cancel-settled" ||
      frame.type === "close-request" ||
      frame.type === "close-settled"
    ) {
      throw new TypeError("Unexpected native canvas control frame.");
    }
    if (frame.type === "result-start") {
      if (this.current) throw new TypeError("A native canvas reply is already in progress.");
      this.current = { id: frame.id, bytes: frame.bytes, chunks: frame.chunks, parts: [], received: 0 };
      return undefined;
    }
    const current = this.current;
    if (!current || current.id !== frame.id) throw new TypeError("Native canvas reply frame has no matching start.");
    if (frame.type === "result-chunk") {
      if (frame.index !== current.parts.length || frame.index >= current.chunks) {
        throw new TypeError("Native canvas reply chunks are out of order.");
      }
      const part = base64ToBytes(frame.data);
      if (part.length === 0 || part.length > NATIVE_CANVAS_REPLY_CHUNK_BYTES) {
        throw new TypeError("Native canvas reply chunk is oversized.");
      }
      current.received += part.length;
      if (current.received > current.bytes || current.received > NATIVE_CANVAS_MAX_RESULT_BYTES) {
        throw new TypeError("Native canvas reply exceeds its declared size.");
      }
      current.parts.push(part);
      return undefined;
    }
    if (current.parts.length !== current.chunks || current.received !== current.bytes) {
      throw new TypeError("Native canvas reply is incomplete.");
    }
    this.current = undefined;
    const joined = new Uint8Array(current.bytes);
    let offset = 0;
    for (const part of current.parts) {
      joined.set(part, offset);
      offset += part.length;
    }
    let decoded: unknown;
    try {
      decoded = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(joined));
    } catch {
      throw new TypeError("Native canvas reply is not valid UTF-8 JSON.");
    }
    const reply = record(decoded, "Native canvas reply");
    if (reply.id !== current.id || typeof reply.ok !== "boolean") throw new TypeError("Invalid native canvas reply.");
    if (reply.ok) {
      exactKeys(reply, ["id", "ok", "result"], "Native canvas reply");
      return { id: current.id, ok: true, result: reply.result };
    }
    exactKeys(reply, ["id", "ok", "error"], "Native canvas reply");
    if (typeof reply.error !== "string" || reply.error.length === 0 || reply.error.length > 1_000) {
      throw new TypeError("Invalid native canvas error reply.");
    }
    return { id: current.id, ok: false, error: reply.error };
  }
}

const schema = <T>(parse: (value: unknown) => T): TypertSchema<T> => ({ parse });

export const NATIVE_CANVAS_DESCRIPTOR: InvocationDescriptor = {
  id: `${NATIVE_CANVAS_PACKAGE}#${NATIVE_CANVAS_NAMESPACE}/connect`,
  service: NATIVE_CANVAS_SERVICE,
  namespace: NATIVE_CANVAS_NAMESPACE,
  method: "connect",
  mode: "stream",
  invocation: { kind: "direct" },
  scope: { context: "agent", wire: "agentId" },
  parameters: [
    {
      name: "agent",
      wire: "agentId",
      source: "lookup",
      lookup: "agent",
      codec: {
        mode: "strict",
        typeSymbol: "@deepseek-ai/dsh-session/types#SessionId",
        create: () => schema(parseSessionId)
      }
    },
    {
      name: "clientId",
      wire: "clientId",
      source: "json",
      codec: { mode: "strict", typeSymbol: "string", create: () => schema(parseSessionId) }
    }
  ],
  uplink: {
    codec: {
      mode: "strict",
      typeSymbol: `${NATIVE_CANVAS_PACKAGE}#NativeCanvasUplink`,
      create: () => schema(parseNativeCanvasUplink)
    }
  },
  cancellation: { parameter: "signal" },
  result: {
    mode: "strict",
    typeSymbol: `${NATIVE_CANVAS_PACKAGE}#NativeCanvasDownlink`,
    create: () => schema(parseNativeCanvasDownlink)
  }
};

export const NATIVE_CANVAS_UI_DESCRIPTOR: InvocationDescriptor = {
  ...NATIVE_CANVAS_DESCRIPTOR,
  id: `${NATIVE_CANVAS_PACKAGE}#${NATIVE_CANVAS_NAMESPACE}/connectUi`,
  method: "connectUi"
};

export const NATIVE_CANVAS_REMOTE_CONTRIBUTION: TypertRemoteContribution = {
  package: NATIVE_CANVAS_PACKAGE,
  descriptors: [NATIVE_CANVAS_DESCRIPTOR, NATIVE_CANVAS_UI_DESCRIPTOR]
};
