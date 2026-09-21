import type { DesktopLogLevel } from "../../../../shared/desktop-api";
import { installedDesktopApi } from "../../../../shared/desktop/tauri-bridge";

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
  const text = message instanceof Error
    ? `${message.name}: ${message.message}${message.stack ? `\n${message.stack}` : ""}`
    : typeof message === "string"
      ? message
      : String(message);
  return text.slice(0, MAX_RENDERER_LOG_CHARS);
}

function write(level: DesktopLogLevel, message: unknown) {
  const api = installedDesktopApi();
  if (!api) return;
  void api.writeAppLog(level, normalizeLogMessage(message)).catch((error) => {
    // The logging transport cannot report its own failure through itself.
    nativeConsole.error("[ERROR] Failed to write the desktop log entry", error);
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
    nativeConsole.log(...messages);
    write("info", messages.map(normalizeLogMessage).join(" "));
  };
  for (const level of ["error", "warn", "info", "debug", "trace"] as const) {
    console[level] = (...messages: unknown[]) => {
      nativeConsole[level](...messages);
      write(level, messages.map(normalizeLogMessage).join(" "));
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
