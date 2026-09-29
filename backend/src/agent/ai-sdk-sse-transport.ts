import type { AgentRunLedgerRecord } from "@geochat-ai/app/agent-run";
import { sanitizeProviderError } from "./provider-error";

export type NativeChatTerminalPersistence = Pick<AgentRunLedgerRecord, "status" | "error">;

export function gateNativeChatTerminalEvents(
  response: Response,
  terminalPersistence: Promise<NativeChatTerminalPersistence>,
) {
  if (!response.body) return response;
  const reader = response.body.pipeThrough(new TextDecoderStream()).getReader();
  const encoder = new TextEncoder();
  let buffer = "";
  let terminalEvents = "";
  const flushTerminal = async (controller: ReadableStreamDefaultController<Uint8Array>) => {
    if (!terminalEvents) return;
    try {
      const terminal = await terminalPersistence;
      if (terminal.status === "failed") {
        const errorText = terminal.error ?? "Agent run failed.";
        controller.enqueue(encoder.encode(errorEvent(errorText)));
      } else {
        controller.enqueue(encoder.encode(terminalEvents));
      }
    } catch (error) {
      controller.enqueue(encoder.encode(errorEvent(
        sanitizeProviderError(error) || "Failed to persist the completed agent run.",
      )));
    }
    terminalEvents = "";
  };
  const body = new ReadableStream<Uint8Array>({
    async pull(controller) {
      while (true) {
        const { value, done } = await reader.read();
        if (done) {
          if (buffer && isTerminalSseEvent(buffer)) terminalEvents += buffer;
          else if (buffer) controller.enqueue(encoder.encode(buffer));
          await flushTerminal(controller);
          controller.close();
          return;
        }
        buffer += value;
        let boundary = nextSseBoundary(buffer);
        while (boundary) {
          const event = buffer.slice(0, boundary.index + boundary.length);
          buffer = buffer.slice(boundary.index + boundary.length);
          if (isTerminalSseEvent(event)) {
            terminalEvents += event;
            if (sseDataValues(event).includes("[DONE]")) await flushTerminal(controller);
          } else {
            controller.enqueue(encoder.encode(event));
          }
          boundary = nextSseBoundary(buffer);
        }
        if (controller.desiredSize !== null && controller.desiredSize <= 0) return;
      }
    },
    cancel(reason) {
      return reader.cancel(reason);
    },
  });
  return new Response(body, {
    status: response.status,
    statusText: response.statusText,
    headers: response.headers,
  });
}

function errorEvent(errorText: string) {
  return `data: ${JSON.stringify({ type: "error", errorText })}\n\ndata: [DONE]\n\n`;
}

function nextSseBoundary(value: string) {
  const match = /\r?\n\r?\n/.exec(value);
  return match ? { index: match.index, length: match[0].length } : null;
}

function sseDataValues(event: string) {
  return event.split(/\r?\n/).flatMap((line) => {
    if (!line.startsWith("data:")) return [];
    return [line.slice(5).trimStart()];
  });
}

function isTerminalSseEvent(event: string) {
  return sseDataValues(event).some((data) => {
    if (data === "[DONE]") return true;
    try {
      const parsed = JSON.parse(data) as { type?: unknown };
      return parsed.type === "finish";
    } catch {
      return false;
    }
  });
}
