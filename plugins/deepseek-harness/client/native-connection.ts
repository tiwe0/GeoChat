import type { Context } from "@deepseek-ai/cordis";
import type {} from "@deepseek-ai/dsh-api-gateway/client";
import type { RemoteStreamHandle, TypertClientRemote } from "@deepseek-ai/dsh-typert-protocol";

import {
  NATIVE_CANVAS_NAMESPACE,
  NATIVE_CANVAS_PROTOCOL_VERSION,
  NATIVE_CANVAS_REMOTE_CONTRIBUTION,
  encodeNativeCanvasReply,
  parseNativeCanvasDownlink,
  type NativeCanvasDownlink,
  type NativeCanvasUplink,
  type NativeCanvasWireReply
} from "../src/native-protocol.ts";

const PAGE_CLIENT_ID = crypto.randomUUID();

export interface NativeCanvasRuntime {
  run(toolName: string, args: Record<string, unknown>, signal: AbortSignal): Promise<unknown>;
}

type NativeCanvasRemoteApi = TypertClientRemote & {
  readonly [NATIVE_CANVAS_NAMESPACE]: {
    connect(
      sessionId: string,
      clientId: string,
      signal?: AbortSignal
    ): RemoteStreamHandle<NativeCanvasDownlink, NativeCanvasUplink>;
    connectUi(
      sessionId: string,
      clientId: string,
      signal?: AbortSignal
    ): RemoteStreamHandle<NativeCanvasDownlink, NativeCanvasUplink>;
  };
};

export type NativeCanvasChannel = "connect" | "connectUi";

export interface NativeCanvasConnection {
  readonly done: Promise<void>;
  readonly hasHandshake: boolean;
  dispose(): void;
}

export async function mountNativeCanvasRemote(ctx: Pick<Context, "remote">): Promise<() => Promise<void>> {
  return await ctx.remote.$mount(NATIVE_CANVAS_REMOTE_CONTRIBUTION);
}

function safeError(error: unknown): string {
  const message = error instanceof Error ? error.message : "Native canvas operation failed.";
  return (
    message
      .replace(/[\u0000-\u001f\u007f]+/g, " ")
      .trim()
      .slice(0, 1_000) || "Native canvas operation failed."
  );
}

async function sendReply(
  stream: RemoteStreamHandle<NativeCanvasDownlink, NativeCanvasUplink>,
  generation: string,
  reply: NativeCanvasWireReply,
  sendAndWait: (frame: NativeCanvasUplink, nextIndex: number) => Promise<void>
): Promise<void> {
  let frames: readonly NativeCanvasUplink[];
  try {
    frames = encodeNativeCanvasReply(generation, reply);
  } catch (error) {
    frames = encodeNativeCanvasReply(generation, { id: reply.id, ok: false, error: safeError(error) });
  }
  for (const frame of frames) {
    if (frame.type === "result-start") await sendAndWait(frame, 0);
    else if (frame.type === "result-chunk") await sendAndWait(frame, frame.index + 1);
    else stream.send(frame);
  }
}

export function createNativeCanvasConnection(options: {
  readonly remote: TypertClientRemote;
  readonly sessionId: string;
  readonly runtime: NativeCanvasRuntime;
  readonly signal?: AbortSignal;
  readonly channel?: NativeCanvasChannel;
}): NativeCanvasConnection {
  const controller = new AbortController();
  const active = new Map<string, { controller: AbortController; settled: Promise<void> }>();
  const acknowledgements = new Map<
    string,
    { readonly nextIndex: number; resolve(): void; reject(reason: unknown): void }
  >();
  const remote = options.remote as NativeCanvasRemoteApi;
  const channel = options.channel ?? "connect";
  const stream = remote[NATIVE_CANVAS_NAMESPACE][channel](options.sessionId, PAGE_CLIENT_ID, controller.signal);
  let generation: string | undefined;
  let closing = false;
  let terminated = false;

  const rejectAcknowledgements = (reason: Error): void => {
    for (const acknowledgement of acknowledgements.values()) acknowledgement.reject(reason);
    acknowledgements.clear();
  };

  const abortActive = (reason: string): readonly Promise<void>[] => {
    const operations = [...active.values()];
    for (const operation of operations) operation.controller.abort(reason);
    return operations.map((operation) => operation.settled);
  };

  const closeGracefully = (): void => {
    if (closing || terminated) return;
    closing = true;
    if (!generation) {
      terminated = true;
      controller.abort("Native canvas connection disposed before handshake.");
      stream.dispose();
      return;
    }
    const closeGeneration = generation;
    try {
      stream.send({ type: "close-request", generation: closeGeneration });
    } catch {
      terminated = true;
      controller.abort("Native canvas connection close request failed.");
      stream.dispose();
      return;
    }
    rejectAcknowledgements(new Error("Native canvas connection is closing."));
    const settlements = abortActive("Native canvas connection disposed.");
    void Promise.allSettled(settlements).then(() => {
      if (terminated) return;
      try {
        stream.send({ type: "close-settled", generation: closeGeneration });
      } catch {
        terminated = true;
        controller.abort("Native canvas connection close acknowledgement failed.");
        stream.dispose();
      }
    });
  };

  const sendAndWait = (frame: NativeCanvasUplink, nextIndex: number): Promise<void> => {
    if (frame.type !== "result-start" && frame.type !== "result-chunk") {
      throw new TypeError("Only chunked reply frames require acknowledgement.");
    }
    if (acknowledgements.has(frame.id)) throw new TypeError("A native canvas acknowledgement is already pending.");
    return new Promise<void>((resolve, reject) => {
      acknowledgements.set(frame.id, { nextIndex, resolve, reject });
      try {
        stream.send(frame);
      } catch (error) {
        acknowledgements.delete(frame.id);
        reject(error);
      }
    });
  };

  const onOuterAbort = () => {
    closeGracefully();
  };
  if (options.signal) {
    if (options.signal.aborted) onOuterAbort();
    else options.signal.addEventListener("abort", onOuterAbort, { once: true });
  }

  const execute = (command: Extract<NativeCanvasDownlink, { type: "execute" }>): void => {
    if (active.has(command.id)) throw new TypeError("Duplicate native canvas command id.");
    const commandController = new AbortController();
    const onConnectionAbort = () => commandController.abort(controller.signal.reason);
    controller.signal.addEventListener("abort", onConnectionAbort, { once: true });
    const settled = (async () => {
      let reply: NativeCanvasWireReply;
      try {
        const result = await options.runtime.run(command.toolName, command.args, commandController.signal);
        reply = { id: command.id, ok: true, result };
      } catch (error) {
        reply = { id: command.id, ok: false, error: safeError(error) };
      } finally {
        controller.signal.removeEventListener("abort", onConnectionAbort);
      }
      if (!terminated && !commandController.signal.aborted) {
        await sendReply(stream, command.generation, reply, sendAndWait);
      }
    })().finally(() => active.delete(command.id));
    active.set(command.id, { controller: commandController, settled });
  };

  const done = (async () => {
    try {
      for await (const raw of stream) {
        const command = parseNativeCanvasDownlink(raw);
        if (command.type === "hello") {
          if (generation) throw new TypeError("Duplicate native canvas hello frame.");
          generation = command.generation;
          stream.send({
            type: "ready",
            version: NATIVE_CANVAS_PROTOCOL_VERSION,
            generation
          });
          continue;
        }
        if (!generation || command.generation !== generation) throw new TypeError("Native canvas generation mismatch.");
        if (command.type === "result-ack") {
          const acknowledgement = acknowledgements.get(command.id);
          if (closing && !acknowledgement) continue;
          if (!acknowledgement || acknowledgement.nextIndex !== command.nextIndex) {
            throw new TypeError("Unexpected native canvas result acknowledgement.");
          }
          acknowledgements.delete(command.id);
          acknowledgement.resolve();
        } else if (command.type === "execute") {
          if (closing) continue;
          execute(command);
        } else {
          const operation = active.get(command.id);
          if (closing && !operation) {
            stream.send({ type: "cancel-settled", generation, id: command.id });
            continue;
          }
          if (!operation) throw new TypeError("Native canvas cancellation has no matching operation.");
          operation.controller.abort("Native canvas command cancelled.");
          await operation.settled;
          stream.send({ type: "cancel-settled", generation, id: command.id });
        }
      }
    } finally {
      terminated = true;
      controller.abort("Native canvas Remote disconnected.");
      rejectAcknowledgements(new Error("Native canvas Remote disconnected before acknowledging the reply."));
      await Promise.allSettled(abortActive("Native canvas Remote disconnected."));
      options.signal?.removeEventListener("abort", onOuterAbort);
    }
  })();

  return {
    done,
    get hasHandshake() {
      return generation !== undefined;
    },
    dispose() {
      closeGracefully();
    }
  };
}
