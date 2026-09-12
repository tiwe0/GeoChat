import type { GeoChatDesktopApi } from "../../shared/desktop-api";

export type WorkbenchDesktopRuntime = {
  desktopApi: () => GeoChatDesktopApi | undefined;
  setInterval: typeof window.setInterval;
  clearInterval: typeof window.clearInterval;
  setTimeout: typeof window.setTimeout;
  clearTimeout: typeof window.clearTimeout;
};

export function createDefaultWorkbenchDesktopRuntime(): WorkbenchDesktopRuntime {
  const browserWindow = typeof window === "undefined" ? undefined : window;
  return {
    desktopApi: () => browserWindow?.geochatDesktop,
    setInterval: (
      browserWindow?.setInterval.bind(browserWindow) ??
      globalThis.setInterval.bind(globalThis)
    ) as typeof window.setInterval,
    clearInterval: (
      browserWindow?.clearInterval.bind(browserWindow) ??
      globalThis.clearInterval.bind(globalThis)
    ) as typeof window.clearInterval,
    setTimeout: (
      browserWindow?.setTimeout.bind(browserWindow) ??
      globalThis.setTimeout.bind(globalThis)
    ) as typeof window.setTimeout,
    clearTimeout: (
      browserWindow?.clearTimeout.bind(browserWindow) ??
      globalThis.clearTimeout.bind(globalThis)
    ) as typeof window.clearTimeout
  };
}

export function resolveWorkbenchDesktopRuntime(runtime?: Partial<WorkbenchDesktopRuntime>): WorkbenchDesktopRuntime {
  let defaultRuntime: WorkbenchDesktopRuntime | undefined;
  const getDefaultRuntime = () => {
    defaultRuntime ??= createDefaultWorkbenchDesktopRuntime();
    return defaultRuntime;
  };
  const lazySetInterval = ((handler: TimerHandler, timeout?: number, ...args: unknown[]) =>
    getDefaultRuntime().setInterval(handler, timeout, ...args)) as typeof window.setInterval;
  const lazyClearInterval = ((id?: number) => getDefaultRuntime().clearInterval(id)) as typeof window.clearInterval;
  const lazySetTimeout = ((handler: TimerHandler, timeout?: number, ...args: unknown[]) =>
    getDefaultRuntime().setTimeout(handler, timeout, ...args)) as typeof window.setTimeout;
  const lazyClearTimeout = ((id?: number) => getDefaultRuntime().clearTimeout(id)) as typeof window.clearTimeout;
  return {
    desktopApi: runtime?.desktopApi ?? (() => getDefaultRuntime().desktopApi()),
    setInterval: runtime?.setInterval ?? lazySetInterval,
    clearInterval: runtime?.clearInterval ?? lazyClearInterval,
    setTimeout: runtime?.setTimeout ?? lazySetTimeout,
    clearTimeout: runtime?.clearTimeout ?? lazyClearTimeout
  };
}
