/**
 * The model preference, kept from the web build's auth storage module. The
 * account and token keys it also held have no desktop equivalent.
 *
 * `browser.storage.local` is mapped onto localStorage by platform-web.ts.
 */
const MODEL_KEY = "geochatSelectedModel";

export async function saveStoredModel(model: string) {
  await browser.storage.local.set({ [MODEL_KEY]: model });
}

export async function loadStoredModel(): Promise<string | null> {
  const stored = await browser.storage.local.get(MODEL_KEY);
  const value = stored[MODEL_KEY];
  return typeof value === "string" && value.trim() ? value : null;
}
