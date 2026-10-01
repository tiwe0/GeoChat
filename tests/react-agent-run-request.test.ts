import { describe, expect, test } from "bun:test";
import { createDefaultDesktopConfig } from "../src/shared/desktop/desktop-config";
import {
  nativeChatRequestBody,
  nativeRunHeaders,
  prepareNativeRunSubmission,
  uploadImageAttachments,
  type NativeRunRequestSnapshot,
} from "../src/renderer-react/src/features/agent-run/nativeRunRequest";

describe("native agent run request boundary", () => {
  test("prepares the first text submission from an immutable model/config snapshot", () => {
    const config = createDefaultDesktopConfig("zh-CN");
    const draft = prepareNativeRunSubmission(
      { text: "  画一个圆。  " },
      {
        getAuthToken: () => null,
        getModelConfig: () => ({
          provider: "deepseek",
          model: "deepseek-chat",
          credentialRef: "credential-1",
          maxToolSteps: 8,
        }),
        locale: "zh-CN",
        getThinking: () => false,
        getThinkingEffort: () => "standard",
      },
      config,
    );

    expect(draft).toMatchObject({
      prompt: "画一个圆。",
      text: "画一个圆。",
      files: [],
      localAttachments: [],
      snapshot: {
        model: { provider: "deepseek", model: "deepseek-chat" },
        thinking: false,
        thinkingEffort: "standard",
      },
    });
  });

  test("uses the image prompt for attachment-only submissions and rejects unsupported files", () => {
    const input = {
      getAuthToken: () => null,
      getModelConfig: () => ({
        provider: "deepseek",
        model: "deepseek-chat",
        credentialRef: "credential-1",
        maxToolSteps: 8,
      }),
      locale: "en-US" as const,
      getThinking: () => false,
      getThinkingEffort: () => "standard" as const,
    };
    const config = createDefaultDesktopConfig("en-US");
    const image = {
      type: "file" as const,
      mediaType: "image/png",
      filename: "diagram.png",
      url: "data:image/png;base64,aW1hZ2U=",
    };

    expect(prepareNativeRunSubmission({ files: [image] }, input, config)).toMatchObject({
      prompt: "Analyze the attached image and help with the GeoGebra task.",
      localAttachments: [{ name: "diagram.png", mediaType: "image/png", dataUrl: image.url }],
    });
    expect(() => prepareNativeRunSubmission({
      files: [{ ...image, mediaType: "application/pdf", filename: "worksheet.pdf" }],
    }, input, config)).toThrow("Unsupported agent attachment: worksheet.pdf");
  });

  test("builds authenticated and guest request headers without exposing credentials in the guest path", async () => {
    expect(await nativeRunHeaders(
      { getAuthToken: () => "desktop-token" },
      { current: "installation-unused" },
      "run-1",
    )).toEqual({
      Authorization: "Bearer desktop-token",
      "x-client-channel": "desktop-workbench",
      "x-correlation-id": "run-1",
    });

    expect(await nativeRunHeaders(
      { getAuthToken: () => null },
      { current: "installation-1" },
      "run-2",
    )).toEqual({
      "x-client-channel": "web-workbench",
      "x-correlation-id": "run-2",
      "x-guest-session-id": "frontend_guest_installation-1",
    });
  });

  test("builds the transport body while keeping provider policy out of visible history", () => {
    const config = createDefaultDesktopConfig("zh-CN");
    config.skills.enabled = true;
    const snapshot: NativeRunRequestSnapshot = {
      model: {
        provider: "deepseek",
        model: "deepseek-chat",
        credentialRef: "credential-1",
        maxToolSteps: 8,
      },
      locale: "zh-CN",
      thinking: false,
      thinkingEffort: "standard",
      desktopConfig: config,
    };
    const message = {
      id: "user-1",
      role: "user" as const,
      parts: [{ type: "text" as const, text: "画一个三角形。" }],
    };

    const body = nativeChatRequestBody(
      [message],
      { runId: "run-1", conversationId: "conversation-1" },
      snapshot,
    );

    expect(body).toMatchObject({
      runId: "run-1",
      conversationId: "conversation-1",
      model: { provider: "deepseek", model: "deepseek-chat" },
      locale: "zh-CN",
      thinking: false,
      thinkingEffort: "standard",
    });
    expect(body.messages).toEqual([message]);
    expect(body.providerMessages[0]?.parts[0]).toMatchObject({
      type: "text",
      text: expect.stringContaining("【Agent Skill 策略】"),
    });
    expect(JSON.stringify(body.messages)).not.toContain("Agent Skill 策略");
  });

  test("uploads authenticated images and returns the broker URL", async () => {
    const calls: Array<{ url: string; init?: RequestInit }> = [];
    const request = async (input: URL | RequestInfo, init?: RequestInit) => {
      calls.push({ url: String(input), init });
      if (calls.length === 1) return new Response(new Blob(["image"], { type: "image/png" }));
      return Response.json({ url: "https://cdn.example/image.png" });
    };

    const uploaded = await uploadImageAttachments(
      "http://127.0.0.1:17369",
      "desktop-token",
      [{ name: "diagram.png", mediaType: "image/png", dataUrl: "data:image/png;base64,aW1hZ2U=" }],
      "run-upload-1",
      request as typeof fetch,
      () => undefined,
    );

    expect(uploaded).toEqual([{
      name: "diagram.png",
      mediaType: "image/png",
      dataUrl: "https://cdn.example/image.png",
    }]);
    expect(calls.map((call) => call.url)).toEqual([
      "data:image/png;base64,aW1hZ2U=",
      "http://127.0.0.1:17369/api/media/images",
    ]);
    expect(new Headers(calls[1]?.init?.headers).get("authorization")).toBe("Bearer desktop-token");
    expect(new Headers(calls[1]?.init?.headers).get("x-correlation-id")).toBe("run-upload-1");
    expect(calls[1]?.init?.body).toBeInstanceOf(FormData);
  });

  test("preserves the original image and logs only safe correlation metadata when upload fails", async () => {
    const attachment = {
      name: "private-worksheet-name.png",
      mediaType: "image/png",
      dataUrl: "data:image/png;base64,cHJpdmF0ZS1pbWFnZQ==",
    };
    const logs: string[] = [];
    const originalWarn = console.warn;
    console.warn = (...values) => logs.push(values.map(String).join(" "));
    let uploaded;
    try {
      uploaded = await uploadImageAttachments(
        "http://127.0.0.1:17369",
        "desktop-token",
        [attachment],
        "run-upload-failure",
        (async () => {
          throw new TypeError(`network unavailable for ${attachment.name} ${attachment.dataUrl}`);
        }) as typeof fetch,
        () => undefined,
      );
    } finally {
      console.warn = originalWarn;
    }

    expect(uploaded).toEqual([attachment]);
    expect(logs).toHaveLength(1);
    const record = JSON.parse(logs[0]!);
    expect(record).toMatchObject({
      module: "agent-run.request",
      event: "attachment_upload_failed",
      severity: "warn",
      errorCode: "AGENT_ATTACHMENT_UPLOAD_FAILED",
      context: {
        correlationId: "run-upload-failure",
        failureKind: "source_fetch_network_error",
        attachmentCount: 1,
      },
    });
    const serialized = JSON.stringify(record);
    expect(serialized).not.toContain(attachment.name);
    expect(serialized).not.toContain(attachment.dataUrl);
    expect(serialized).not.toContain("network unavailable");
  });
});
