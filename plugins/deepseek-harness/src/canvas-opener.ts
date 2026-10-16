import { randomUUID } from "node:crypto";
import { setTimeout as delay } from "node:timers/promises";
import { NativeCanvasBroker, type NativeCanvasStatus } from "./native-broker.ts";

/** UI subscriptions exist before an Applet is mounted, and never carry drawing commands. */
export class CanvasOpener {
  readonly requests: NativeCanvasBroker;
  private readonly clients = new Map<string, Set<{ id: string; clientId: string }>>();
  private readonly canvasOwners = new Map<string, { clientId: string }>();
  private readonly lifetime = new AbortController();

  constructor(
    private readonly canvas: NativeCanvasBroker,
    private readonly timeoutMs = 30_000
  ) {
    this.requests = new NativeCanvasBroker({ timeoutMs, maxQueue: 4 });
  }

  register(sessionId: string, clientId: string): { readonly id: string; dispose(): void } {
    this.assertLive();
    // A stream identity, not invocation.peer: Harness uses one operator peer for all windows.
    const id = randomUUID();
    const clients = this.clients.get(sessionId) ?? new Set<{ id: string; clientId: string }>();
    const client = { id, clientId };
    clients.add(client);
    this.clients.set(sessionId, clients);
    return {
      id,
      dispose: () => {
        clients.delete(client);
        if (clients.size === 0 && this.clients.get(sessionId) === clients) this.clients.delete(sessionId);
      }
    };
  }

  registerCanvas(sessionId: string, clientId: string): () => void {
    const owner = { clientId };
    this.canvasOwners.set(sessionId, owner);
    return () => {
      if (this.canvasOwners.get(sessionId) === owner) this.canvasOwners.delete(sessionId);
    };
  }

  async open(sessionId: string, signal?: AbortSignal): Promise<NativeCanvasStatus & { opened: true }> {
    this.assertLive();
    signal?.throwIfAborted();
    const deadline = AbortSignal.timeout(this.timeoutMs);
    const combined = AbortSignal.any([this.lifetime.signal, deadline, ...(signal ? [signal] : [])]);
    const client = this.target(sessionId);
    const check = () => {
      combined.throwIfAborted();
      if (this.target(sessionId) !== client || !this.requests.status(client.id).connected) {
        throw new Error("GeoChat UI disconnected or session changed while opening the canvas.");
      }
    };
    try {
      // Subscription hello and tool invocation can arrive in adjacent event-loop turns.
      while (!this.requests.status(client.id).ready) {
        check();
        await delay(20, undefined, { signal: combined });
      }
      if (this.canvas.status(sessionId).connected && this.canvasOwners.get(sessionId)?.clientId !== client.clientId) {
        throw new Error("This session's canvas belongs to another window. Close that canvas before opening it here.");
      }
      const acknowledgement = await this.requests.run(client.id, "openCanvas", {}, combined);
      if (
        !acknowledgement ||
        typeof acknowledgement !== "object" ||
        (acknowledgement as { opened?: unknown }).opened !== true
      ) {
        throw new Error("GeoChat UI did not confirm opening the canvas.");
      }
      for (;;) {
        check();
        const status = this.canvas.status(sessionId);
        if (status.ready) {
          if (this.canvasOwners.get(sessionId)?.clientId !== client.clientId) {
            throw new Error(
              "This session's canvas belongs to another window. Close that canvas before opening it here."
            );
          }
          return { opened: true, ...status };
        }
        await delay(20, undefined, { signal: combined });
      }
    } catch (error) {
      if (deadline.aborted && !signal?.aborted && !this.lifetime.signal.aborted) {
        throw new Error("GeoChat canvas was not ready before the opening deadline. Check the canvas loading state.");
      }
      throw error;
    }
  }

  dispose(): void {
    if (this.lifetime.signal.aborted) return;
    this.lifetime.abort(new Error("GeoChat canvas opener is disposed."));
    this.requests.dispose();
    this.clients.clear();
    this.canvasOwners.clear();
  }

  private assertLive(): void {
    if (this.lifetime.signal.aborted) throw new Error("GeoChat canvas opener is disposed.");
  }

  private target(sessionId: string): { id: string; clientId: string } {
    const clients = this.clients.get(sessionId);
    if (!clients?.size) {
      throw new Error("This Harness session is not displayed in a connected GeoChat UI. Open this conversation first.");
    }
    if (clients.size !== 1) {
      throw new Error(
        "This Harness session is displayed in multiple windows. Keep it open in one window before opening the canvas."
      );
    }
    return clients.values().next().value as { id: string; clientId: string };
  }
}
