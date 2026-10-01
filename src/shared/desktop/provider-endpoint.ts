function hasExplicitUrlScheme(value: string): boolean {
  const schemeEnd = value.indexOf("://");
  if (schemeEnd < 1) return false;
  return /^[A-Za-z][A-Za-z0-9+.-]*$/.test(value.slice(0, schemeEnd));
}

function isLoopbackHostname(hostname: string): boolean {
  return hostname.toLowerCase() === "localhost"
    || /^127(?:\.\d{1,3}){3}$/.test(hostname)
    || hostname === "[::1]";
}

/**
 * Mirrors the native credential endpoint acceptance policy. Canonicalization
 * remains native-owned; this only prevents the renderer from offering inputs
 * that the credential vault will reject.
 */
export function isValidProviderEndpoint(value: string): boolean {
  const trimmed = value.trim();
  if (!trimmed || trimmed.includes("?") || trimmed.includes("#")) return false;

  const candidate = hasExplicitUrlScheme(trimmed) ? trimmed : `https://${trimmed}`;
  try {
    const url = new URL(candidate);
    if (url.username || url.password || !url.hostname) return false;
    if (url.protocol === "https:") return true;
    return url.protocol === "http:" && isLoopbackHostname(url.hostname);
  } catch {
    return false;
  }
}
