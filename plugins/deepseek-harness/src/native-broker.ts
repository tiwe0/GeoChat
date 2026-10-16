import { randomUUID } from "node:crypto";

export type NativeCanvasCommand =
  | {
      type: "execute";
      id: string;
      toolName: string;
      args: Record<string, unknown>;
    }
  | { type: "cancel"; id: string };

export type NativeCanvasReply = { id: string; ok: true; result: unknown } | { id: string; ok: false; error: string };

export interface NativeCanvasStatus {
  connected: boolean;
  ready: boolean;
  busy: boolean;
  queued: number;
}

export interface NativeCanvasBrokerOptions {
  timeoutMs?: number;
  maxQueue?: number;
  maxRequestBytes?: number;
  maxResultBytes?: number;
}

export interface NativeCanvasLease extends AsyncIterableIterator<NativeCanvasCommand> {
  readonly sessionId: string;
  readonly generation: string;
  setReady(): void;
  reply(reply: NativeCanvasReply): boolean;
  acknowledgeCancel(id: string): boolean;
  close(reason?: string): void;
  closeSettled(reason?: string): void;
}

type PendingCall = {
  id: string;
  toolName: string;
  args: Record<string, unknown>;
  state: "queued" | "dispatched" | "settled";
  resolve: (value: unknown) => void;
  reject: (reason: Error) => void;
  timer: NodeJS.Timeout;
  removeAbort?: () => void;
};

type SessionState = {
  lease: Lease;
  queue: PendingCall[];
  active?: PendingCall;
  draining: boolean;
  drainingCancellationId?: string;
};

const DEFAULT_TIMEOUT_MS = 30_000;
const DEFAULT_MAX_QUEUE = 16;
const DEFAULT_MAX_REQUEST_BYTES = 1024 * 1024;
const DEFAULT_MAX_RESULT_BYTES = 16 * 1024 * 1024;
const UNKNOWN_STATE_MESSAGE =
  "GeoChat canvas operation was interrupted after dispatch; state unknown. Inspect the canvas before retrying.";

function positiveInteger(value: number, name: string): number {
  if (!Number.isSafeInteger(value) || value <= 0) throw new Error(`${name} must be a positive integer.`);
  return value;
}

function jsonSize(value: unknown, label: string): { size: number; json: string } {
  let json: string | undefined;
  try {
    json = JSON.stringify(value);
  } catch {
    throw new Error(`GeoChat native canvas ${label} is not JSON serializable.`);
  }
  if (json === undefined) throw new Error(`GeoChat native canvas ${label} is not JSON serializable.`);
  return { size: Buffer.byteLength(json), json };
}

function cloneArgs(args: Record<string, unknown>, maxBytes: number): Record<string, unknown> {
  const encoded = jsonSize(args, "request");
  if (encoded.size > maxBytes) throw new Error(`GeoChat native canvas request exceeds ${maxBytes} bytes.`);
  const clone: unknown = JSON.parse(encoded.json);
  if (!clone || typeof clone !== "object" || Array.isArray(clone))
    throw new Error("GeoChat native canvas request must be an object.");
  return clone as Record<string, unknown>;
}

function safeClientError(value: string): string {
  const normalized = value
    .replace(/[\u0000-\u001f\u007f]+/g, " ")
    .trim()
    .slice(0, 1_000);
  return normalized || "The native canvas rejected the operation.";
}

function validateSessionId(sessionId: string): void {
  if (!sessionId || sessionId.length > 256 || /[\u0000-\u001f\u007f]/.test(sessionId))
    throw new Error("Invalid native canvas session id.");
}

function validateToolName(toolName: string): void {
  if (!/^[A-Za-z][A-Za-z0-9_]{0,127}$/.test(toolName)) throw new Error("Invalid native canvas tool name.");
}

class Lease implements NativeCanvasLease {
  readonly generation = randomUUID();
  private ready = false;
  private closed = false;
  private drainThenClose = false;
  private readonly outbound: NativeCanvasCommand[] = [];
  private readonly readers: Array<{
    resolve: (value: IteratorResult<NativeCanvasCommand>) => void;
  }> = [];

  constructor(
    readonly sessionId: string,
    private readonly broker: NativeCanvasBroker
  ) {}

  [Symbol.asyncIterator](): NativeCanvasLease {
    return this;
  }

  next(): Promise<IteratorResult<NativeCanvasCommand>> {
    const command = this.outbound.shift();
    if (command) return Promise.resolve({ done: false, value: command });
    if (this.closed || this.drainThenClose) {
      this.closed = true;
      return Promise.resolve({ done: true, value: undefined });
    }
    return new Promise((resolve) => this.readers.push({ resolve }));
  }

  return(): Promise<IteratorResult<NativeCanvasCommand>> {
    this.close("Native canvas stream ended.");
    return Promise.resolve({ done: true, value: undefined });
  }

  setReady(): void {
    if (this.closed || this.drainThenClose) throw new Error("Native canvas lease is closed.");
    if (!this.ready) {
      this.ready = true;
      this.broker.markReady(this);
    }
  }

  reply(reply: NativeCanvasReply): boolean {
    if (this.closed || this.drainThenClose) return false;
    return this.broker.acceptReply(this, reply);
  }

  acknowledgeCancel(id: string): boolean {
    return this.broker.acknowledgeCancel(this, id);
  }

  close(reason?: string): void {
    if (this.closed && !this.drainThenClose) return;
    this.closed = true;
    this.drainThenClose = false;
    this.ready = false;
    this.outbound.length = 0;
    this.finishReaders();
    this.broker.detach(this, reason);
  }

  closeSettled(reason?: string): void {
    this.closed = true;
    this.drainThenClose = false;
    this.ready = false;
    this.outbound.length = 0;
    this.finishReaders();
    this.broker.detachSettled(this, reason);
  }

  isReady(): boolean {
    return this.ready && !this.closed && !this.drainThenClose;
  }

  isOpen(): boolean {
    return !this.closed && !this.drainThenClose;
  }

  send(command: NativeCanvasCommand): boolean {
    if (!this.isOpen()) return false;
    const reader = this.readers.shift();
    if (reader) reader.resolve({ done: false, value: command });
    else this.outbound.push(command);
    return true;
  }

  failClosedWithCancel(id: string): void {
    if (!this.isOpen()) return;
    this.ready = false;
    this.drainThenClose = true;
    const cancel: NativeCanvasCommand = { type: "cancel", id };
    const reader = this.readers.shift();
    if (reader) reader.resolve({ done: false, value: cancel });
    else this.outbound.push(cancel);
    // A Remote consumer is expected to have exactly one outstanding read. End
    // any accidental extra readers instead of allowing them to hang forever.
    this.finishReaders();
  }

  forceClosed(): void {
    this.ready = false;
    this.closed = true;
    this.drainThenClose = false;
    this.outbound.length = 0;
    this.finishReaders();
  }

  private finishReaders(): void {
    for (const reader of this.readers.splice(0)) reader.resolve({ done: true, value: undefined });
  }
}

export class NativeCanvasBroker {
  private readonly timeoutMs: number;
  private readonly maxQueue: number;
  private readonly maxRequestBytes: number;
  private readonly maxResultBytes: number;
  private readonly sessions = new Map<string, SessionState>();
  private disposed = false;

  constructor(options: NativeCanvasBrokerOptions = {}) {
    this.timeoutMs = positiveInteger(options.timeoutMs ?? DEFAULT_TIMEOUT_MS, "timeoutMs");
    this.maxQueue = positiveInteger(options.maxQueue ?? DEFAULT_MAX_QUEUE, "maxQueue");
    this.maxRequestBytes = positiveInteger(options.maxRequestBytes ?? DEFAULT_MAX_REQUEST_BYTES, "maxRequestBytes");
    this.maxResultBytes = positiveInteger(options.maxResultBytes ?? DEFAULT_MAX_RESULT_BYTES, "maxResultBytes");
  }

  attach(sessionId: string): NativeCanvasLease {
    this.assertLive();
    validateSessionId(sessionId);
    if (this.sessions.has(sessionId)) throw new Error("A native canvas is already attached to this session.");
    const lease = new Lease(sessionId, this);
    this.sessions.set(sessionId, { lease, queue: [], draining: false });
    return lease;
  }

  status(sessionId: string): NativeCanvasStatus {
    const state = this.sessions.get(sessionId);
    if (!state) return { connected: false, ready: false, busy: false, queued: 0 };
    return {
      connected: state.lease.isOpen(),
      ready: state.lease.isReady(),
      busy: state.active !== undefined,
      queued: state.queue.length
    };
  }

  async run(
    sessionId: string,
    toolName: string,
    args: Record<string, unknown>,
    signal?: AbortSignal
  ): Promise<unknown> {
    this.assertLive();
    validateSessionId(sessionId);
    validateToolName(toolName);
    const state = this.sessions.get(sessionId);
    if (!state?.lease.isOpen()) throw new Error("GeoChat native canvas is not connected.");
    if (!state.lease.isReady()) throw new Error("GeoChat native canvas is not ready.");
    if (signal?.aborted) throw new Error("GeoChat native canvas request aborted before dispatch; it was not executed.");
    if (this.pendingCount(state) >= this.maxQueue) throw new Error("GeoChat native canvas queue is full.");
    const safeArgs = cloneArgs(args, this.maxRequestBytes);

    return await new Promise<unknown>((resolve, reject) => {
      const call: PendingCall = {
        id: randomUUID(),
        toolName,
        args: safeArgs,
        state: "queued",
        resolve,
        reject,
        timer: setTimeout(() => this.cancelCall(state, call, "timeout"), this.timeoutMs)
      };
      if (signal) {
        const onAbort = () => this.cancelCall(state, call, "abort");
        signal.addEventListener("abort", onAbort, { once: true });
        call.removeAbort = () => signal.removeEventListener("abort", onAbort);
      }
      state.queue.push(call);
      this.pump(state);
    });
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    for (const state of [...this.sessions.values()]) {
      this.rejectState(state, new Error("GeoChat native canvas broker is disposed."), false);
      state.lease.forceClosed();
    }
    this.sessions.clear();
  }

  markReady(lease: Lease): void {
    const state = this.currentState(lease);
    if (state) this.pump(state);
  }

  acceptReply(lease: Lease, reply: NativeCanvasReply): boolean {
    const state = this.currentState(lease);
    const call = state?.active;
    if (!state || !call || call.state !== "dispatched" || call.id !== reply.id) return false;

    if (reply.ok) {
      let encoded: { size: number; json: string };
      try {
        encoded = jsonSize(reply.result, "result");
      } catch (error) {
        this.failProtocol(state, call, error as Error);
        return false;
      }
      if (encoded.size > this.maxResultBytes) {
        this.failProtocol(state, call, new Error(`GeoChat native canvas result exceeds ${this.maxResultBytes} bytes.`));
        return false;
      }
      this.settle(call, () => call.resolve(JSON.parse(encoded.json)));
    } else {
      this.settle(call, () =>
        call.reject(new Error(`GeoChat canvas operation failed. ${safeClientError(reply.error)}`))
      );
    }
    state.active = undefined;
    this.pump(state);
    return true;
  }

  acknowledgeCancel(lease: Lease, id: string): boolean {
    const state = this.currentState(lease);
    if (!state || state.drainingCancellationId !== id) return false;
    state.draining = false;
    state.drainingCancellationId = undefined;
    this.sessions.delete(lease.sessionId);
    lease.forceClosed();
    return true;
  }

  detach(lease: Lease, _reason?: string): void {
    const state = this.currentState(lease);
    if (!state) return;
    if (state.draining || state.active) {
      state.draining = true;
      this.rejectState(state, new Error("GeoChat native canvas connection closed."), true);
      lease.forceClosed();
      return;
    }
    this.sessions.delete(lease.sessionId);
    this.rejectState(state, new Error("GeoChat native canvas connection closed."), true);
  }

  detachSettled(lease: Lease, _reason?: string): void {
    const state = this.currentState(lease);
    if (!state) return;
    this.sessions.delete(lease.sessionId);
    this.rejectState(state, new Error("GeoChat native canvas connection closed."), true);
  }

  private pump(state: SessionState): void {
    if (state.active || !state.lease.isReady()) return;
    const call = state.queue.shift();
    if (!call) return;
    call.state = "dispatched";
    state.active = call;
    if (
      !state.lease.send({
        type: "execute",
        id: call.id,
        toolName: call.toolName,
        args: call.args
      })
    ) {
      state.active = undefined;
      this.settle(call, () => call.reject(new Error("GeoChat native canvas connection closed before dispatch.")));
      this.failLease(state, undefined);
    }
  }

  private cancelCall(state: SessionState, call: PendingCall, cause: "abort" | "timeout"): void {
    if (call.state === "settled") return;
    if (call.state === "queued") {
      const index = state.queue.indexOf(call);
      if (index >= 0) state.queue.splice(index, 1);
      this.settle(call, () =>
        call.reject(
          new Error(
            cause === "timeout"
              ? "GeoChat native canvas request timed out before dispatch; it was not executed."
              : "GeoChat native canvas request aborted before dispatch; it was not executed."
          )
        )
      );
      return;
    }
    if (state.active !== call) return;
    this.settle(call, () => call.reject(new Error(UNKNOWN_STATE_MESSAGE)));
    state.active = undefined;
    state.draining = true;
    state.drainingCancellationId = call.id;
    state.lease.failClosedWithCancel(call.id);
    this.rejectQueued(state, new Error("GeoChat native canvas connection closed."));
  }

  private failProtocol(state: SessionState, call: PendingCall, error: Error): void {
    this.settle(call, () => call.reject(error));
    state.active = undefined;
    this.failLease(state, new Error("GeoChat native canvas connection closed."));
  }

  private failLease(state: SessionState, queuedError: Error | undefined): void {
    this.sessions.delete(state.lease.sessionId);
    if (queuedError) this.rejectQueued(state, queuedError);
    state.lease.forceClosed();
  }

  private rejectState(state: SessionState, error: Error, activeUnknown: boolean): void {
    if (state.active) {
      const active = state.active;
      state.active = undefined;
      this.settle(active, () => active.reject(new Error(activeUnknown ? UNKNOWN_STATE_MESSAGE : error.message)));
    }
    this.rejectQueued(state, error);
  }

  private rejectQueued(state: SessionState, error: Error): void {
    for (const call of state.queue.splice(0)) this.settle(call, () => call.reject(new Error(error.message)));
  }

  private settle(call: PendingCall, finish: () => void): void {
    if (call.state === "settled") return;
    call.state = "settled";
    clearTimeout(call.timer);
    call.removeAbort?.();
    finish();
  }

  private pendingCount(state: SessionState): number {
    return state.queue.length + (state.active ? 1 : 0);
  }

  private currentState(lease: Lease): SessionState | undefined {
    const state = this.sessions.get(lease.sessionId);
    return state?.lease === lease ? state : undefined;
  }

  private assertLive(): void {
    if (this.disposed) throw new Error("GeoChat native canvas broker is disposed.");
  }
}
