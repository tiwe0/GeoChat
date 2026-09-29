import type { DesktopLogLevel } from "../../../../shared/desktop-api";
import { installedDesktopApi } from "../../../../shared/desktop/tauri-bridge";
import { sanitizeLogContext } from "@geochat-ai/app/structured-logger";

const MAX_RENDERER_LOG_CHARS = 16 * 1024;
const nativeConsole = {
  log: console.log.bind(console),
  error: console.error.bind(console),
  warn: console.warn.bind(console),
  info: console.info.bind(console),
  debug: console.debug.bind(console),
  trace: console.trace.bind(console),
};

function normalizeLogMessage(message: unknown) {
  const sanitized = sanitizeLogContext({ message }).message;
  const text = typeof sanitized === "string" ? sanitized : JSON.stringify(sanitized) ?? String(sanitized);
  return text.slice(0, MAX_RENDERER_LOG_CHARS);
}

function write(level: DesktopLogLevel, message: unknown) {
  const api = installedDesktopApi();
  if (!api) return;
  void api.writeAppLog(level, normalizeLogMessage(message)).catch(() => {
    // The logging transport cannot report its own failure through itself.
    nativeConsole.error(JSON.stringify({
      module: "desktop.logging",
      event: "transport_failed",
      severity: "error",
      errorCode: "DESKTOP_LOG_TRANSPORT_FAILED",
    }));
  });
}

export const desktopLogger = {
  error: (message: unknown) => write("error", message),
  warn: (message: unknown) => write("warn", message),
  info: (message: unknown) => write("info", message),
  debug: (message: unknown) => write("debug", message),
  trace: (message: unknown) => write("trace", message),
};

let globalHandlersInstalled = false;

export function installDesktopLogging() {
  if (!installedDesktopApi() || globalHandlersInstalled) return;
  globalHandlersInstalled = true;
  console.log = (...messages: unknown[]) => {
    const normalized = messages.map(normalizeLogMessage);
    nativeConsole.log(...normalized);
    write("info", normalized.join(" "));
  };
  for (const level of ["error", "warn", "info", "debug", "trace"] as const) {
    console[level] = (...messages: unknown[]) => {
      const normalized = messages.map(normalizeLogMessage);
      nativeConsole[level](...normalized);
      write(level, normalized.join(" "));
    };
  }
  window.addEventListener("error", (event) => {
    desktopLogger.error(event.error ?? event.message);
  });
  window.addEventListener("unhandledrejection", (event) => {
    desktopLogger.error(event.reason ?? "Unhandled promise rejection");
  });
  desktopLogger.info("Renderer started");
}
