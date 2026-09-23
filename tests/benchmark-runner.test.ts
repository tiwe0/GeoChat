import { describe, expect, test } from "bun:test";
import { canvasObjectEvidence, finalAssistantAnswer, persistentResultStatus } from "../tools/run-benchmark-suite";

describe("benchmark desktop runner evidence", () => {
  test("uses the latest non-empty assistant response", () => {
    expect(finalAssistantAnswer([
      { role: "assistant", content: " 3 " },
      { role: "user", content: "again" },
      { role: "assistant", content: "  4\n" }
    ])).toBe("4");
    expect(finalAssistantAnswer([{ role: "user", content: "hello" }])).toBeNull();
  });

  test("normalizes renderer canvas context without inventing object types", () => {
    expect(canvasObjectEvidence({ objects: [
      { type: "point", label: "A", definition: "(0,0)" },
      { objectType: "circle", command: "Circle(A, 3)" },
      { label: "missing-type" }
    ] })).toEqual([
      { type: "point", label: "A", definition: "(0,0)" },
      { type: "circle", definition: "Circle(A, 3)" }
    ]);
  });

  test("maps evaluator outcomes to the persisted run contract", () => {
    expect(persistentResultStatus("passed")).toBe("passed");
    expect(persistentResultStatus("invalid-output")).toBe("failed");
    expect(persistentResultStatus("pending-review")).toBe("skipped");
    expect(persistentResultStatus("infrastructure-error")).toBe("error");
  });
});
