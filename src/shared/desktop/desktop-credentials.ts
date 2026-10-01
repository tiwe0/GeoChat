function record(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : undefined;
}

export function parseRawDesktopConfig(rawJson: string): Record<string, unknown> {
  const parsed = JSON.parse(rawJson) as unknown;
  const config = record(parsed);
  if (!config) throw new Error("Desktop config must be a JSON object");
  return config;
}

/** Rejects secret-bearing configuration at the native-config boundary. */
export function hasPlaintextCredentials(value: unknown): boolean {
  const visited = new WeakSet<object>();
  const containsSecret = (candidate: unknown): boolean => {
    if (!candidate || typeof candidate !== "object") return false;
    if (visited.has(candidate)) return false;
    visited.add(candidate);
    if (Array.isArray(candidate)) return candidate.some(containsSecret);
    return Object.entries(candidate).some(([key, nested]) => (
      isSensitiveCredentialKey(key) || containsSecret(nested)
    ));
  };
  return containsSecret(value);
}

const SENSITIVE_CREDENTIAL_KEYS = new Set([
  "apikey",
  "secret",
  "clientsecret",
  "token",
  "accesstoken",
  "refreshtoken",
  "bearertoken",
  "authorization",
  "password",
  "privatekey",
  "accesskey",
  "cookie",
]);

function isSensitiveCredentialKey(key: string) {
  return SENSITIVE_CREDENTIAL_KEYS.has(key.toLowerCase().replace(/[^a-z0-9]/g, ""));
}
