import type { GeoChatAssistantSubmission } from "./runtimeAdapter";

export async function submitGeoChatAssistantTurn(options: {
  submission: GeoChatAssistantSubmission;
  prepareTurn?: () => string;
  submit: (submission: GeoChatAssistantSubmission) => Promise<boolean>;
  failTurn: (turnId: string) => void;
}) {
  const turnId = options.prepareTurn?.();
  try {
    const accepted = await options.submit(options.submission);
    if (!accepted) {
      throw new Error("GeoChat did not accept the assistant-ui submission.");
    }
  } catch (error) {
    if (turnId) options.failTurn(turnId);
    throw error;
  }
}

export async function cancelGeoChatAssistantTurn(options: {
  stop: () => Promise<void>;
  completeTurn: () => void;
}) {
  await options.stop();
  options.completeTurn();
}
