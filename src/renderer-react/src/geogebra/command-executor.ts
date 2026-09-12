import type { GeoGebraApi as GeoGebraApplet } from "./ggbdeploy-wrapper";

function callGeoGebraApplet(applet: GeoGebraApplet, method: string, ...args: unknown[]) {
  const fn = applet[method];
  if (typeof fn !== "function") throw new Error(`GeoGebra API ${method} 不可用。`);
  return Reflect.apply(fn, applet, args);
}

export const COMMAND_METHODS = ["asyncEvalCommandResult", "evalCommandResult", "evalCommand"] as const;

export type CommandResult = {
  command: string;
  success: boolean;
  label: string;
  error: string | null;
  lastError: string | null;
  method: string;
  resultAvailable: boolean;
  result?: unknown;
  durationMs?: number;
  totalDurationMs?: number;
  attemptCount: number;
  retried: boolean;
  retryable: boolean;
  errorCode: CommandErrorCode | null;
  attempts: CommandAttemptDiagnostic[];
};

export type CommandErrorCode = "APPLET_NOT_READY" | "BRIDGE_TIMEOUT" | "TEMPORARY_INVOCATION_FAILURE" | "COMMAND_REJECTED";

export type CommandAttemptDiagnostic = {
  attempt: number;
  method: string;
  success: boolean;
  durationMs: number;
  error: string | null;
  errorCode: CommandErrorCode | null;
  retryable: boolean;
};

export type EvaluateCommandOptions = {
  maxAttempts?: number;
  retryDelaysMs?: number[];
  sleep?: (ms: number) => Promise<void>;
};

type CommandInvocation = { payload: unknown; nativeError: string | null };
type NativeErrorCapture = { finish: (waitForError?: boolean) => Promise<string | null>; stop: () => void };

export async function evaluateCommand(applet: GeoGebraApplet, command: string, options: EvaluateCommandOptions = {}): Promise<CommandResult> {
  const maxAttempts = Math.max(1, Math.min(3, options.maxAttempts ?? 3));
  const retryDelaysMs = options.retryDelaysMs ?? [150, 400];
  const sleep = options.sleep ?? wait;
  const attempts: CommandAttemptDiagnostic[] = [];
  const startedAt = performance.now();

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const result = await evaluateCommandOnce(applet, command);
    const errorCode = result.success ? null : commandErrorCode(result.error);
    const retryable = errorCode !== null && errorCode !== "COMMAND_REJECTED";
    attempts.push({
      attempt,
      method: result.method,
      success: result.success,
      durationMs: result.durationMs ?? 0,
      error: result.error,
      errorCode,
      retryable,
    });
    const enriched = {
      ...result,
      totalDurationMs: Math.round(performance.now() - startedAt),
      attemptCount: attempt,
      retried: attempt > 1,
      retryable,
      errorCode,
      attempts: [...attempts],
    };
    if (result.success || !retryable || attempt === maxAttempts) return enriched;
    await sleep(Math.max(0, retryDelaysMs[attempt - 1] ?? retryDelaysMs.at(-1) ?? 0));
  }
  throw new Error("Command retry loop exited unexpectedly.");
}

async function evaluateCommandOnce(applet: GeoGebraApplet, command: string): Promise<Omit<CommandResult, "attemptCount" | "retried" | "retryable" | "errorCode" | "attempts">> {
  const nativeResult = evaluateNativeScriptingCommand(applet, command);
  if (nativeResult) return nativeResult;
  for (const method of COMMAND_METHODS) {
    if (typeof applet[method] !== "function") continue;
    const startedAt = performance.now();
    try {
      const invocation = await invokeCommand(applet, method, command);
      const result = normalizeCommandResult(command, invocation, method, Math.round(performance.now() - startedAt));
      return result;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return { command, success: false, label: "", error: message, lastError: message, method, resultAvailable: false, durationMs: Math.round(performance.now() - startedAt) };
    }
  }
  throw capability("The current GeoGebra applet does not expose a supported command API.");
}

function evaluateNativeScriptingCommand(applet: GeoGebraApplet, command: string): Omit<CommandResult, "attemptCount" | "retried" | "retryable" | "errorCode" | "attempts"> | undefined {
  const showLabel = command.match(/^\s*ShowLabel\s*\(\s*([A-Za-z][A-Za-z0-9_]*)\s*,\s*(true|false)\s*\)\s*$/i);
  if (showLabel && typeof applet.setLabelVisible === "function") {
    const label = showLabel[1]!;
    const visible = showLabel[2]!.toLowerCase() === "true";
    return invokeNativeScriptingCommand(applet, command, label, "setLabelVisible", [label, visible]);
  }

  const setCaption = command.match(/^\s*SetCaption\s*\(\s*([A-Za-z][A-Za-z0-9_]*)\s*,\s*"((?:\\.|[^"\\])*)"\s*\)\s*$/i);
  if (setCaption && typeof applet.setCaption === "function") {
    const caption = decodeGeoGebraString(setCaption[2]!);
    if (caption !== undefined) {
      const label = setCaption[1]!;
      return invokeNativeScriptingCommand(applet, command, label, "setCaption", [label, caption]);
    }
  }

  return undefined;
}

function invokeNativeScriptingCommand(
  applet: GeoGebraApplet,
  command: string,
  label: string,
  method: string,
  args: unknown[],
): Omit<CommandResult, "attemptCount" | "retried" | "retryable" | "errorCode" | "attempts"> {
  const startedAt = performance.now();
  try {
    callGeoGebraApplet(applet, method, ...args);
    return {
      command,
      success: true,
      label,
      error: null,
      lastError: null,
      method,
      resultAvailable: true,
      result: { ok: true, result: label, labels: label, error: null },
      durationMs: Math.round(performance.now() - startedAt),
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      command,
      success: false,
      label: "",
      error: message,
      lastError: message,
      method,
      resultAvailable: false,
      durationMs: Math.round(performance.now() - startedAt),
    };
  }
}

function decodeGeoGebraString(value: string) {
  try {
    const decoded = JSON.parse(`"${value}"`) as unknown;
    return typeof decoded === "string" ? decoded : undefined;
  } catch {
    return undefined;
  }
}

export function normalizeCommandResult(command: string, invocation: CommandInvocation, method: string, durationMs: number): Omit<CommandResult, "attemptCount" | "retried" | "retryable" | "errorCode" | "attempts"> {
  const { payload, nativeError } = invocation;
  const parsed = typeof payload === "string" && payload.trim().startsWith("{") ? tryParseJson(payload) : payload;
  if (parsed && typeof parsed === "object" && "ok" in parsed) {
    const value = parsed as { ok?: boolean; result?: unknown; labels?: unknown; error?: unknown };
    const success = value.ok === true && !nativeError;
    const error = nativeError ?? (value.error == null || value.error === "" ? null : String(value.error));
    return {
      command,
      success,
      label: value.labels == null ? String(value.result ?? "") : String(value.labels),
      error: success ? null : error || String(value.result ?? `${method} failed`),
      lastError: success ? null : error || String(value.result ?? `${method} failed`),
      method,
      resultAvailable: value.result !== undefined || value.labels !== undefined || value.ok !== undefined,
      result: parsed,
      durationMs,
    };
  }
  const resultAvailable = payload !== undefined;
  const success = payload !== undefined && payload !== false && !nativeError;
  const fallbackError = nativeError ?? (payload === undefined ? "GeoGebra rejected the command without returning a result." : "GeoGebra command failed");
  return {
    command,
    success,
    label: payload == null || typeof payload === "boolean" ? "" : String(payload),
    error: success ? null : fallbackError,
    lastError: success ? null : fallbackError,
    method,
    resultAvailable,
    result: payload,
    durationMs,
  };
}

async function invokeCommand(applet: GeoGebraApplet, method: string, command: string): Promise<CommandInvocation> {
  const errorCapture = createNativeErrorCapture();
  try {
    const payload = await Promise.resolve(callGeoGebraApplet(applet, method, command));
    const mayHaveFailed = payload === false || payload === undefined || isPotentialFailurePayload(payload);
    return { payload, nativeError: await errorCapture.finish(mayHaveFailed) };
  } finally {
    errorCapture.stop();
  }
}

function createNativeErrorCapture(): NativeErrorCapture {
  const seen = new Set(readNativeErrorMessages());
  let detected: string | null = null;
  let stopped = false;
  const observer = typeof MutationObserver === "function" && typeof document !== "undefined" && document.documentElement
    ? new MutationObserver(() => scan())
    : undefined;
  observer?.observe(document.documentElement, { subtree: true, childList: true, characterData: true, attributes: true });

  function scan() {
    if (stopped || detected) return;
    detected = readNativeErrorMessages().find((message) => !seen.has(message)) ?? null;
  }

  return {
    async finish(waitForError = true) {
      scan();
      if (!waitForError || detected) return detected;
      for (const delay of [0, 35, 100, 180]) {
        if (detected) break;
        await wait(delay);
        scan();
      }
      return detected;
    },
    stop() {
      stopped = true;
      observer?.disconnect();
    },
  };
}

function isPotentialFailurePayload(payload: unknown) {
  if (!payload || typeof payload !== "object" || !("ok" in payload)) return false;
  const value = payload as { ok?: unknown; result?: unknown; labels?: unknown };
  return value.ok !== true || value.result == null || value.result === "" || value.labels == null || value.labels === "";
}

function readNativeErrorMessages(): string[] {
  if (typeof document === "undefined" || !document.body) return [];
  const lines = document.body.innerText.split(/\n+/).map((line) => line.trim()).filter(Boolean);
  const errorPattern = /unknown command|invalid input|illegal argument|undefined variable|undefined object|unknown variable|not defined|command not found|syntax error|malformed command|please check your input|one or more references are invalid|error\s*:/i;
  return [...new Set(lines.filter((line) => line.length <= 500 && errorPattern.test(line)))];
}

function tryParseJson(value: string) {
  try {
    return JSON.parse(value) as unknown;
  } catch {
    return value;
  }
}

function capability(message: string) {
  const error = new Error(message);
  error.name = "GeoGebraCapabilityError";
  return error;
}

function commandErrorCode(message: string | null): CommandErrorCode {
  const normalized = message?.toLowerCase() ?? "";
  if (/applet.*not ready|not ready.*applet|applet.*initializ|still loading/.test(normalized)) return "APPLET_NOT_READY";
  if (/bridge.*time(?:d out|out)|time(?:d out|out).*bridge/.test(normalized)) return "BRIDGE_TIMEOUT";
  if (/temporary|temporarily|try again|invocation.*(?:unavailable|failed)|connection.*(?:closed|reset)/.test(normalized)) {
    return "TEMPORARY_INVOCATION_FAILURE";
  }
  return "COMMAND_REJECTED";
}

function wait(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
