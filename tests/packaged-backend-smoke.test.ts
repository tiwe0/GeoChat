import { describe, expect, test } from "bun:test";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  verifyAuthenticationBoundary,
  writePackagedBackendSmokeEvidence,
} from "../scripts/smoke-packaged-backend-runtime.mjs";

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
      ).resolves.toEqual({
        missingTokenStatus: 401,
        incorrectTokenStatus: 401,
        authorizedStatus: 200,
      });
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

  test("writes machine-readable evidence without claiming signing or notarization", () => {
    const root = mkdtempSync(join(tmpdir(), "geochat-package-smoke-test-"));
    const path = join(root, "nested", "backend.json");
    const evidence = {
      kind: "geochat-packaged-backend-smoke-evidence",
      status: "complete",
      checks: [{ authentication: { missingTokenStatus: 401, incorrectTokenStatus: 401, authorizedStatus: 200 } }],
    };

    try {
      writePackagedBackendSmokeEvidence(path, evidence);
      const written = JSON.parse(readFileSync(path, "utf8"));
      expect(written).toEqual(evidence);
      expect(written.signing).toBeUndefined();
      expect(written.notarization).toBeUndefined();
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
