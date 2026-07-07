import type { Locale } from "../i18n";

export function formatIsoTime(value?: string | null, locale: Locale = "zh-CN") {
  if (!value) return "--";
  return new Intl.DateTimeFormat(locale, {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit"
  }).format(new Date(value));
}
