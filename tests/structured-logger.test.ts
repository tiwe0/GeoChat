import { describe, expect, test } from "bun:test";
import {
  createStructuredLogger,
  type StructuredLogRecord,
} from "../packages/app/src/structured-logger";

describe("structured logger", () => {
  test("emits stable structured fields through an injected sink", () => {
    const records: StructuredLogRecord[] = [];
    const logger = createStructuredLogger("agent.native-chat", {
      now: () => new Date("2026-09-29T00:00:00.000Z"),
      sink: (record) => records.push(record),
    });

    logger.error("stream_failed", "AGENT_STREAM_FAILED", {
      runId: "run-1",
      conversationId: "conversation-1",
      requestId: "request-1",
    });

    expect(records).toEqual([{
      timestamp: "2026-09-29T00:00:00.000Z",
      module: "agent.native-chat",
      event: "stream_failed",
      severity: "error",
      errorCode: "AGENT_STREAM_FAILED",
      context: {
        runId: "run-1",
        conversationId: "conversation-1",
        requestId: "request-1",
      },
    }]);
  });

  test("redacts secrets recursively and never emits error stacks", () => {
    const records: StructuredLogRecord[] = [];
    const logger = createStructuredLogger("provider.proxy", { sink: (record) => records.push(record) });
    const error = new Error("request failed Authorization: Bearer top-secret");
    error.stack = "sensitive stack";

    logger.error("request_failed", "PROVIDER_REQUEST_FAILED", {
      error,
      headers: { authorization: "Bearer top-secret", cookie: "session=secret" },
      apiKey: "sk-secret",
      token: "plain-token",
      sessionToken: "session-token",
      authorizationToken: "authorization-token",
      inputTokens: 42,
      url: "https://example.test/?access_token=secret-value",
    });

    const serialized = JSON.stringify(records[0]);
    expect(serialized).not.toContain("top-secret");
    expect(serialized).not.toContain("sk-secret");
    expect(serialized).not.toContain("secret-value");
    expect(serialized).not.toContain("plain-token");
    expect(serialized).not.toContain("session-token");
    expect(serialized).not.toContain("authorization-token");
    expect(serialized).not.toContain("sensitive stack");
    expect(records[0]?.context).toMatchObject({
      apiKey: "[REDACTED]",
      token: "[REDACTED]",
      sessionToken: "[REDACTED]",
      authorizationToken: "[REDACTED]",
      inputTokens: 42,
      headers: { authorization: "[REDACTED]", cookie: "[REDACTED]" },
    });
  });

  test("supports non-error severity for expected fail-open paths", () => {
    const records: StructuredLogRecord[] = [];
    const logger = createStructuredLogger("canvas.context", { sink: (record) => records.push(record) });

    logger.debug("xml_parser_unavailable", "CANVAS_CONTEXT_PARSER_UNAVAILABLE");

    expect(records[0]?.severity).toBe("debug");
  });

  test("redacts provider credentials and signed URL parameters before truncating messages", () => {
    const records: StructuredLogRecord[] = [];
    const logger = createStructuredLogger("problem-bank.cache", { sink: (record) => records.push(record) });
    const signedUrl = "https://user:password@example.test/problem.json?X-Amz-Credential=AKIAIOSFODNN7EXAMPLE%2Fscope&X-Amz-Signature=aws-signature&X-Amz-Security-Token=session-secret";
    const providerKeys = "sk-proj-1234567890abcdef AIzaSyA1234567890abcdefghijklmnop AKIAIOSFODNN7EXAMPLE";

    logger.warn("download_failed", "PROBLEM_BANK_DOWNLOAD_FAILED", {
      url: signedUrl,
      error: new Error(`Basic dXNlcjpwYXNzd29yZA== x-api-key: provider-secret ${providerKeys} ${"x".repeat(800)}`),
    });

    const serialized = JSON.stringify(records[0]);
    for (const secret of [
      "user:password",
      "AKIAIOSFODNN7EXAMPLE",
      "aws-signature",
      "session-secret",
      "dXNlcjpwYXNzd29yZA==",
      "provider-secret",
      "sk-proj-1234567890abcdef",
      "AIzaSyA1234567890abcdefghijklmnop",
    ]) expect(serialized).not.toContain(secret);
    expect(serialized).toContain("[REDACTED]");
    expect((records[0]?.context?.error as { message: string }).message.length).toBe(600);
  });

  test("redacts OSS and Tencent signed URL credentials in fields and errors", () => {
    const records: StructuredLogRecord[] = [];
    const logger = createStructuredLogger("problem-bank.cache", { sink: (record) => records.push(record) });

    logger.warn("download_failed", "PROBLEM_BANK_DOWNLOAD_FAILED", {
      url: "https://bucket.example.test/catalog.json?OSSAccessKeyId=LTAI5tSensitiveKey&Signature=oss-secret-signature&security-token=oss-session-token",
      error: new Error("https://cos.example.test/catalog.json?SecretId=AKID1234567890SENSITIVE&q-signature=tencent-secret&q-ak=AKID1234567890SENSITIVE"),
    });

    const serialized = JSON.stringify(records[0]);
    for (const secret of [
      "LTAI5tSensitiveKey",
      "oss-secret-signature",
      "oss-session-token",
      "AKID1234567890SENSITIVE",
      "tencent-secret",
    ]) expect(serialized).not.toContain(secret);
    expect(serialized.match(/\[REDACTED\]/g)?.length).toBeGreaterThanOrEqual(6);
  });

  test("does not throw when context serialization or an injected sink fails", () => {
    const logger = createStructuredLogger("resilient.logger", {
      sink: () => { throw new Error("sink unavailable"); },
    });
    const context = Object.defineProperty({}, "secret", {
      enumerable: true,
      get: () => { throw new Error("getter failed"); },
    });

    expect(() => logger.warn("best_effort_failed", "BEST_EFFORT_FAILED", context)).not.toThrow();
  });
});
