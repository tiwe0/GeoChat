export type Platform = "macos" | "windows" | "linux" | "unknown";

/**
 * Best-effort platform detection for highlighting the right download card.
 * It only ever changes emphasis: every platform stays reachable regardless of
 * what this returns, so a wrong guess costs the visitor nothing.
 */
export function detectPlatform(): Platform {
  if (typeof navigator === "undefined") return "unknown";

  // userAgentData is the non-deprecated path where it exists.
  const data = (
    navigator as Navigator & { userAgentData?: { platform?: string } }
  ).userAgentData;
  const hint = (data?.platform ?? "").toLowerCase();
  if (hint.includes("mac")) return "macos";
  if (hint.includes("win")) return "windows";
  if (hint.includes("linux") || hint.includes("chrome os")) return "linux";

  const ua = navigator.userAgent.toLowerCase();
  // iPadOS reports as Macintosh; it is not a desktop target either way, so the
  // touch check keeps tablets out of the "you are on macOS" claim.
  const isTouchMac = ua.includes("mac") && navigator.maxTouchPoints > 2;
  if (isTouchMac) return "unknown";
  if (ua.includes("mac")) return "macos";
  if (ua.includes("win")) return "windows";
  if (ua.includes("linux") || ua.includes("cros")) return "linux";
  return "unknown";
}

export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return "";
  const mb = bytes / 1024 / 1024;
  if (mb >= 1024) return `${(mb / 1024).toFixed(1)} GB`;
  return `${mb.toFixed(1)} MB`;
}
