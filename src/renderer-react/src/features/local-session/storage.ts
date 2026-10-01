import { nativePreferences } from "../../lib/nativePreferences";

const MODEL_KEY = "geochatSelectedModel";

export async function saveStoredModel(model: string) {
  await nativePreferences().set(MODEL_KEY, model);
}

export async function loadStoredModel(): Promise<string | null> {
  const value = nativePreferences().get(MODEL_KEY);
  return typeof value === "string" && value.trim() ? value : null;
}
