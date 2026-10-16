import type { Context } from "@deepseek-ai/cordis";
import type { Agent } from "@deepseek-ai/dsh-agent";
import { TypertRemoteService, type RemoteStream } from "@deepseek-ai/dsh-typert-protocol";
import type { TypertContribution } from "@deepseek-ai/dsh-typert-registry";
import type {} from "@deepseek-ai/dsh-typert-registry";

import { type NativeCanvasBroker, type NativeCanvasCommand } from "./native-broker.ts";
import type { CanvasOpener } from "./canvas-opener.ts";
import {
  NATIVE_CANVAS_DESCRIPTOR,
  NATIVE_CANVAS_UI_DESCRIPTOR,
  NATIVE_CANVAS_NAMESPACE,
  NATIVE_CANVAS_PACKAGE,
  NATIVE_CANVAS_PROTOCOL_VERSION,
  NATIVE_CANVAS_SERVICE,
  NativeCanvasReplyAssembler,
  type NativeCanvasDownlink,
  type NativeCanvasUplink,
  parseNativeCanvasUplink
} from "./native-protocol.ts";

declare module "@deepseek-ai/cordis" {
  interface Context {
    geochatCanvasRemote: NativeCanvasRemote;
  }
}

export const NATIVE_CANVAS_HOST_CONTRIBUTION: TypertContribution = {
  package: NATIVE_CANVAS_PACKAGE,
  face: "host",
  schemas: [],
  invocations: [NATIVE_CANVAS_DESCRIPTOR, NATIVE_CANVAS_UI_DESCRIPTOR],
  model: {
    services: [
      {
        key: NATIVE_CANVAS_SERVICE,
        exportName: "NativeCanvasRemote",
        summary: "Session-isolated native Remote bridge to the GeoChat canvas.",
        tags: [],
        members: [
          {
            kind: "method",
            name: "connect",
            signature:
              "connect(agent: Agent, clientId: string, signal: AbortSignal): RemoteStream<NativeCanvasDownlink, NativeCanvasUplink>"
          },
          {
            kind: "method",
            name: "connectUi",
            signature:
              "connectUi(agent: Agent, clientId: string, signal: AbortSignal): RemoteStream<NativeCanvasDownlink, NativeCanvasUplink>"
          }
        ],
        types: []
      }
    ],
    events: [],
    objects: []
  }
};

function withGeneration(command: NativeCanvasCommand, generation: string): NativeCanvasDownlink {
  return command.type === "execute" ? { ...command, generation } : { type: "cancel", generation, id: command.id };
}

class DownlinkQueue implements AsyncIterable<NativeCanvasDownlink>, AsyncIterator<NativeCanvasDownlink> {
  private readonly values: NativeCanvasDownlink[] = [];
  private readonly readers: Array<{
    resolve: (value: IteratorResult<NativeCanvasDownlink>) => void;
    reject: (reason: unknown) => void;
  }> = [];
  private ended = false;
  private failure: unknown;

  [Symbol.asyncIterator](): AsyncIterator<NativeCanvasDownlink> {
    return this;
  }

  next(): Promise<IteratorResult<NativeCanvasDownlink>> {
    const value = this.values.shift();
    if (value) return Promise.resolve({ done: false, value });
    if (this.failure) return Promise.reject(this.failure);
    if (this.ended) return Promise.resolve({ done: true, value: undefined });
    return new Promise((resolve, reject) => this.readers.push({ resolve, reject }));
  }

  push(value: NativeCanvasDownlink): void {
    if (this.ended || this.failure) return;
    const reader = this.readers.shift();
    if (reader) reader.resolve({ done: false, value });
    else this.values.push(value);
  }

  close(error?: unknown): void {
    if (this.ended || this.failure) return;
    if (error) this.failure = error;
    else this.ended = true;
    for (const reader of this.readers.splice(0)) {
      if (error) reader.reject(error);
      else reader.resolve({ done: true, value: undefined });
    }
  }
}

export async function* serveNativeCanvasStream(
  broker: NativeCanvasBroker,
  sessionId: string,
  uplink: AsyncIterable<NativeCanvasUplink>,
  signal: AbortSignal,
  onAttach?: () => () => void
): AsyncGenerator<NativeCanvasDownlink, void, void> {
  const lease = broker.attach(sessionId);
  const releaseOwner = onAttach?.();
  const assembler = new NativeCanvasReplyAssembler();
  const downlink = new DownlinkQueue();
  let ready = false;
  let awaitingCancelSettlement: string | undefined;
  let clientClosing = false;
  const iterator = uplink[Symbol.asyncIterator]();
  const onAbort = () => {
    lease.close("Native canvas Remote was cancelled.");
    downlink.close();
  };
  signal.addEventListener("abort", onAbort, { once: true });
  downlink.push({ type: "hello", version: NATIVE_CANVAS_PROTOCOL_VERSION, generation: lease.generation });

  const commands = (async () => {
    try {
      for await (const command of lease) {
        if (command.type === "cancel") awaitingCancelSettlement = command.id;
        downlink.push(withGeneration(command, lease.generation));
      }
      if (!awaitingCancelSettlement && !clientClosing) downlink.close();
    } catch (error) {
      downlink.close(error);
    }
  })();

  const pump = (async () => {
    try {
      while (!signal.aborted) {
        const next = await iterator.next();
        if (next.done) break;
        const frame = parseNativeCanvasUplink(next.value);
        if (frame.generation !== lease.generation) throw new TypeError("Native canvas generation mismatch.");
        if (!ready) {
          if (frame.type !== "ready") throw new TypeError("Native canvas did not complete its ready handshake.");
          ready = true;
          lease.setReady();
          continue;
        }
        if (frame.type === "ready") throw new TypeError("Duplicate native canvas ready frame.");
        if (frame.type === "close-request") {
          if (clientClosing) throw new TypeError("Unexpected native canvas close request.");
          clientClosing = true;
          lease.close("Native canvas client is closing.");
          continue;
        }
        if (frame.type === "close-settled") {
          if (!clientClosing) throw new TypeError("Unexpected native canvas close acknowledgement.");
          lease.closeSettled("Native canvas client closed after its operations settled.");
          downlink.close();
          continue;
        }
        if (frame.type === "cancel-settled") {
          if (frame.id !== awaitingCancelSettlement || !lease.acknowledgeCancel(frame.id)) {
            throw new TypeError("Unexpected native canvas cancellation acknowledgement.");
          }
          awaitingCancelSettlement = undefined;
          downlink.close();
          continue;
        }
        const reply = assembler.push(frame);
        if (frame.type === "result-start") {
          downlink.push({ type: "result-ack", generation: lease.generation, id: frame.id, nextIndex: 0 });
        } else if (frame.type === "result-chunk") {
          downlink.push({
            type: "result-ack",
            generation: lease.generation,
            id: frame.id,
            nextIndex: frame.index + 1
          });
        } else if (reply) {
          lease.reply(reply);
        }
      }
    } catch (error) {
      lease.close("Native canvas uplink failed.");
      downlink.close(error);
      throw error;
    } finally {
      if (!signal.aborted) lease.close("Native canvas uplink ended.");
    }
  })();

  try {
    for await (const item of downlink) yield item;
  } finally {
    signal.removeEventListener("abort", onAbort);
    lease.close("Native canvas Remote ended.");
    releaseOwner?.();
    await iterator.return?.();
    await Promise.allSettled([commands, pump]);
  }
}

export class NativeCanvasRemote extends TypertRemoteService {
  constructor(
    ctx: Context,
    private readonly broker: NativeCanvasBroker,
    private readonly opener: CanvasOpener
  ) {
    super(ctx, NATIVE_CANVAS_SERVICE, { namespace: NATIVE_CANVAS_NAMESPACE });
  }

  connect(agent: Agent, clientId: string, signal: AbortSignal): RemoteStream<NativeCanvasDownlink, NativeCanvasUplink> {
    const invocation = this.ctx.invocation;
    if (!invocation) throw new Error("Native canvas Remote requires an active invocation.");
    return serveNativeCanvasStream(this.broker, String(agent.id), invocation.uplink<NativeCanvasUplink>(), signal, () =>
      this.opener.registerCanvas(String(agent.id), clientId)
    ) as RemoteStream<NativeCanvasDownlink, NativeCanvasUplink>;
  }

  connectUi(
    agent: Agent,
    clientId: string,
    signal: AbortSignal
  ): RemoteStream<NativeCanvasDownlink, NativeCanvasUplink> {
    const invocation = this.ctx.invocation;
    if (!invocation) throw new Error("Native canvas UI Remote requires an active invocation.");
    const opener = this.opener;
    const uplink = invocation.uplink<NativeCanvasUplink>();
    return (async function* () {
      const client = opener.register(String(agent.id), clientId);
      try {
        yield* serveNativeCanvasStream(opener.requests, client.id, uplink, signal);
      } finally {
        client.dispose();
      }
    })() as RemoteStream<NativeCanvasDownlink, NativeCanvasUplink>;
  }
}

export function registerNativeCanvasRemote(
  ctx: Context,
  broker: NativeCanvasBroker,
  opener: CanvasOpener
): NativeCanvasRemote {
  const service = new NativeCanvasRemote(ctx, broker, opener);
  ctx.typert.register(NATIVE_CANVAS_HOST_CONTRIBUTION);
  return service;
}
