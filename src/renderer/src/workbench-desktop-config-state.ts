import { createMemo, createSignal } from "solid-js";
import { rendererI18n, type Locale } from "./i18n";
import {
  normalizeDesktopConfig,
  persistDesktopConfig,
  readDesktopConfig
} from "./desktop-config";
import type { DesktopConfig } from "./workbench-types";

export function createDesktopConfigState() {
  const initial = readDesktopConfig();
  const [config, setConfig] = createSignal(initial);
  const copy = createMemo(() => rendererI18n(config().locale));
  const locale = createMemo(() => config().locale);
  const [minimized, setMinimized] = createSignal(false);

  function commit(next: DesktopConfig) {
    const normalized = normalizeDesktopConfig(next);
    setConfig(normalized);
    persistDesktopConfig(normalized);
  }

  function updateLocale(nextLocale: Locale) {
    if (locale() === nextLocale) return;
    commit({ ...config(), locale: nextLocale });
  }

  function updateMinimized(next: boolean) {
    setMinimized(next);
  }

  return {
    initial,
    config,
    copy,
    locale,
    minimized,
    commit,
    updateLocale,
    updateMinimized
  };
}
