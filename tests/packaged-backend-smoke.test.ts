import { describe, expect, test } from "bun:test";
import { verifyAuthenticationBoundary } from "../scripts/smoke-packaged-backend-runtime.mjs";

describe("packaged backend smoke", () => {
  test("proves missing, incorrect, and injected bearer-token behavior", async () => {
    const seenAuthorization: Array<string | null> = [];
    const token = "packaged-test-token";
    const server = Bun.serve({
      hostname: "127.0.0.1",
      port: 0,
      fetch(request) {
        const authorization = request.headers.get("authorization");
        seenAuthorization.push(authorization);
        if (authorization !== `Bearer ${token}`) {
          return Response.json({ error: "unauthorized" }, { status: 401 });
        }
        return Response.json({ conversations: [] });
      },
    });

    try {
      await expect(
        verifyAuthenticationBoundary(`http://${server.hostname}:${server.port}`, token),
      ).resolves.toBeUndefined();
      expect(seenAuthorization).toEqual([
        null,
        "Bearer incorrect-packaged-smoke-token",
        `Bearer ${token}`,
      ]);
    } finally {
      server.stop(true);
    }
  });

  test("fails when a protected packaged route accepts an unauthenticated request", async () => {
    const server = Bun.serve({
      hostname: "127.0.0.1",
      port: 0,
      fetch: () => Response.json({ conversations: [] }),
    });

    try {
      await expect(
        verifyAuthenticationBoundary(`http://${server.hostname}:${server.port}`, "token"),
      ).rejects.toThrow("without authentication");
    } finally {
      server.stop(true);
    }
  });
});
