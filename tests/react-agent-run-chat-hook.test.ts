import { describe, expect, test } from "bun:test";
import { join } from "node:path";

describe("useAgentRunChat mounted behavior", () => {
  test("passes the isolated hook lifecycle regression suite", () => {
    const fixture = join(import.meta.dir, "../test-fixtures/react-agent-run-chat-hook.mount.test.ts");
    const result = Bun.spawnSync({
      cmd: [process.execPath, "test", fixture],
      cwd: join(import.meta.dir, ".."),
      stdout: "pipe",
      stderr: "pipe",
    });
    const output = `${result.stdout.toString()}${result.stderr.toString()}`;

    expect(result.exitCode, output).toBe(0);
    expect(output).toContain("11 pass");
    expect(output).toContain("0 fail");
  });
});
