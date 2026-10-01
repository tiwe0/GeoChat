import { nativePreferences } from "../../lib/nativePreferences";

const INSTALLATION_ID_KEY = "geogebraCopilotInstallationId";

export async function getInstallationId(
  ref: { current: string | null },
) {
  if (ref.current) return ref.current;
  const stored = nativePreferences().get(INSTALLATION_ID_KEY);
  let installationId = typeof stored === "string" ? stored : "";
  if (!installationId) {
    installationId = crypto.randomUUID();
    await nativePreferences().set(INSTALLATION_ID_KEY, installationId);
  }
  ref.current = installationId;
  return installationId;
}
