function record(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : undefined;
}

function string(value: unknown) {
  return typeof value === "string" ? value : "";
}

export function parseRawDesktopConfig(rawJson: string): Record<string, unknown> {
  const parsed = JSON.parse(rawJson) as unknown;
  const config = record(parsed);
  if (!config) throw new Error("Desktop config must be a JSON object");
  return config;
}

/** Rejects secret-bearing configuration at the native-config boundary. */
export function hasPlaintextCredentials(value: unknown): boolean {
  const rawConfig = record(value);
  if (!rawConfig) return false;
  const providerCredentials = record(rawConfig.providerCredentials);
  if (
    providerCredentials
    && Object.values(providerCredentials).some((entry) => string(record(entry)?.apiKey) !== "")
  ) {
    return true;
  }
  return [record(rawConfig.model), record(rawConfig.visionModel), record(rawConfig.customProvider)]
    .some((entry) => string(entry?.apiKey) !== "");
}
