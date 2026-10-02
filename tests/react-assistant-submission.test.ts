import { describe, expect, test } from "bun:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { useAssistantSubmission } from "../src/renderer-react/src/features/assistant-workspace/useAssistantSubmission";

type SubmissionInput = Parameters<typeof useAssistantSubmission>[0];

function submissionHarness(overrides: Partial<SubmissionInput> = {}) {
  const activated: unknown[] = [];
  const sent: unknown[] = [];
  const errors: unknown[] = [];
  const input: SubmissionInput = {
    controller: { activateForSubmit: (value: unknown) => activated.push(value) } as unknown as SubmissionInput["controller"],
    assistantThreadId: "thread-id",
    currentConversationId: "conversation-id",
    isStreaming: false,
    t: ((key: string) => key) as SubmissionInput["t"],
    send: async (payload, conversationId) => { sent.push({ payload, conversationId }); },
    retry: async () => true,
    setError: (value) => errors.push(value),
    ...overrides,
  };
  let submission!: ReturnType<typeof useAssistantSubmission>;
  function Harness() { submission = useAssistantSubmission(input); return null; }
  renderToStaticMarkup(createElement(Harness));
  return { submission, activated, sent, errors };
}

describe("assistant submission without canvas introduction", () => {
  test("activates the conversation and submits trimmed text without a UI callback", async () => {
    const harness = submissionHarness();
    expect(await harness.submission.submit({ text: "  Draw a circle  " })).toBe(true);
    expect(harness.activated).toEqual([{ conversationId: "conversation-id", title: undefined }]);
    expect(harness.sent).toEqual([{ payload: { text: "Draw a circle", files: [] }, conversationId: "conversation-id" }]);
    expect(harness.errors).toEqual([null]);
  });

  test("does not activate or submit an empty request or a request during streaming", async () => {
    const empty = submissionHarness();
    expect(await empty.submission.submit({ text: "  " })).toBe(false);
    const streaming = submissionHarness({ isStreaming: true });
    expect(await streaming.submission.submit({ text: "Draw" })).toBe(false);
    for (const harness of [empty, streaming]) {
      expect(harness.activated).toEqual([]);
      expect(harness.sent).toEqual([]);
    }
  });

  test("creates a compact title for a requested new conversation", async () => {
    const harness = submissionHarness();
    expect(await harness.submission.submitPrompt(" # Draw   a circle ", "new-conversation")).toBe(true);
    expect(harness.activated).toEqual([{ conversationId: "new-conversation", title: "Draw a circle" }]);
  });

  test("submits an image-only request with an attachment-derived title", async () => {
    const files = [{ type: "file" as const, filename: "circle.png", mediaType: "image/png", url: "data:image/png;base64,aGVsbG8=" }];
    const harness = submissionHarness();
    expect(await harness.submission.submit({ files }, "image-conversation")).toBe(true);
    expect(harness.activated).toEqual([{ conversationId: "image-conversation", title: "circle.png" }]);
    expect(harness.sent).toEqual([{ payload: { text: "", files }, conversationId: "image-conversation" }]);
  });

  test("rejects unsupported attachments before activating a conversation", async () => {
    const harness = submissionHarness();
    expect(await harness.submission.submit({ files: [{ type: "file", filename: "problem.pdf", mediaType: "application/pdf", url: "data:application/pdf;base64,aGVsbG8=" }] })).toBe(false);
    expect(harness.activated).toEqual([]);
    expect(harness.sent).toEqual([]);
    expect(harness.errors).toEqual(["composer.unsupportedFile"]);
  });

  test("retries a failed run without creating a new conversation", async () => {
    let retries = 0;
    const harness = submissionHarness({ retry: async () => { retries += 1; return true; } });
    expect(await harness.submission.retryFailedRun()).toBe(true);
    expect(retries).toBe(1);
    expect(harness.activated).toEqual([]);
    expect(harness.errors).toEqual([null]);
  });
});
