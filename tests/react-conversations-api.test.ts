import { describe, expect, test } from "bun:test";
import { deleteConversation } from "../src/renderer-react/src/features/conversations/api";

describe("conversation deletion", () => {
  test("treats an already-missing conversation as a successful delete", async () => {
    await expect(deleteConversation("http://api.test", "token", "local-only", async () => new Response(null, { status: 404 }))).resolves.toBeUndefined();
  });

  test("still reports unexpected delete failures", async () => {
    await expect(deleteConversation(
      "http://api.test",
      "token",
      "conversation-1",
      async () => new Response(JSON.stringify({ error: "backend unavailable" }), {
        status: 500,
        headers: { "Content-Type": "application/json" },
      }),
    )).rejects.toThrow("backend unavailable");
  });
});
