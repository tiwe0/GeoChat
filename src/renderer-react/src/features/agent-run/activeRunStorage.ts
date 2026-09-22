const INSTALLATION_ID_KEY = "geogebraCopilotInstallationId";
const ACTIVE_NATIVE_RUN_KEY = "geochatActiveNativeRun";

export type StoredActiveNativeRun = {
  runId: string;
  conversationId: string;
  modelProvider: string;
  modelId: string;
  prompt: string;
  thinking: boolean;
  thinkingEffort: "light" | "standard" | "extended" | null;
};

export async function getInstallationId(ref: { current: string | null }) {
  if (ref.current) return ref.current;
  const stored = await browser.storage.local.get(INSTALLATION_ID_KEY);
  let installationId = typeof stored[INSTALLATION_ID_KEY] === "string" ? stored[INSTALLATION_ID_KEY] : "";
  if (!installationId) {
    installationId = crypto.randomUUID();
    await browser.storage.local.set({ [INSTALLATION_ID_KEY]: installationId });
  }
  ref.current = installationId;
  return installationId;
}

export async function readActiveNativeRun(): Promise<StoredActiveNativeRun | null> {
  const stored = await browser.storage.local.get(ACTIVE_NATIVE_RUN_KEY);
  return parseStoredActiveNativeRun(stored[ACTIVE_NATIVE_RUN_KEY]);
}

export async function saveActiveNativeRun(run: StoredActiveNativeRun) {
  await browser.storage.local.set({ [ACTIVE_NATIVE_RUN_KEY]: run });
}

export async function clearActiveNativeRun(runId?: string) {
  if (runId) {
    const current = await readActiveNativeRun();
    if (current?.runId !== runId) return;
  }
  await browser.storage.local.remove(ACTIVE_NATIVE_RUN_KEY);
}

export function parseStoredActiveNativeRun(value: unknown): StoredActiveNativeRun | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const run = value as Record<string, unknown>;
  const effort = run.thinkingEffort;
  if (
    typeof run.runId !== "string" || !run.runId.trim()
    || typeof run.conversationId !== "string" || !run.conversationId.trim()
    || (run.modelProvider !== undefined && (typeof run.modelProvider !== "string" || !run.modelProvider.trim()))
    || typeof run.modelId !== "string" || !run.modelId.trim()
    || typeof run.prompt !== "string"
    || typeof run.thinking !== "boolean"
    || (effort !== undefined && effort !== null && effort !== "light" && effort !== "standard" && effort !== "extended")
  ) return null;
  return {
    runId: run.runId,
    conversationId: run.conversationId,
    modelProvider: typeof run.modelProvider === "string" ? run.modelProvider : "deepseek",
    modelId: run.modelId,
    prompt: run.prompt,
    thinking: run.thinking,
    thinkingEffort: effort === undefined ? null : effort,
  };
}
