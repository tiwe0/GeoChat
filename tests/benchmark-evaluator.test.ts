import { describe, expect, test } from "bun:test";
import {
  evaluateBenchmarkCase,
  summarizeBenchmarkResults,
  type BenchmarkCase,
  type BenchmarkCaseResult
} from "@geochat-ai/app";

function benchmarkCase(answer: BenchmarkCase["oracle"]["answer"]): BenchmarkCase {
  return {
    id: "case-1",
    version: "1.0.0",
    path: "cases/case-1.json",
    publicTask: { title: "Case", prompt: "Solve it", tags: [], difficulty: "smoke" },
    oracle: { answer }
  };
}

describe("benchmark evaluator", () => {
  test("supports exact and normalized answer matching", () => {
    expect(evaluateBenchmarkCase(benchmarkCase({ kind: "exact", expected: "A" }), { answer: "A" }).outcome).toBe("passed");
    expect(evaluateBenchmarkCase(benchmarkCase({ kind: "exact", expected: "A" }), { answer: "a" }).outcome).toBe("failed");
    expect(evaluateBenchmarkCase(benchmarkCase({ kind: "normalized", expected: "The  answer", caseSensitive: false }), { answer: "  the\nanswer " }).outcome).toBe("passed");
  });

  test("applies absolute and relative numeric tolerance", () => {
    const absolute = benchmarkCase({ kind: "numeric", expected: 10, absoluteTolerance: 0.01 });
    expect(evaluateBenchmarkCase(absolute, { answer: "10.009" }).outcome).toBe("passed");
    expect(evaluateBenchmarkCase(absolute, { answer: "10.02" }).outcome).toBe("failed");

    const relative = benchmarkCase({ kind: "numeric", expected: 1_000, relativeTolerance: 0.001 });
    expect(evaluateBenchmarkCase(relative, { answer: "1001" }).outcome).toBe("passed");
  });

  test("treats NaN, infinity, missing, and multiple numeric candidates as invalid output", () => {
    const item = benchmarkCase({ kind: "numeric", expected: 3, extraction: "single-number" });
    for (const answer of ["NaN", "Infinity", "", "between 2 and 4"]) {
      expect(evaluateBenchmarkCase(item, { answer }).outcome).toBe("invalid-output");
    }
  });

  test("distinguishes normal, unsupported, review, and infrastructure outcomes", () => {
    const item = benchmarkCase({ kind: "exact", expected: "yes" });
    expect(evaluateBenchmarkCase(item, { answer: "yes" }).outcome).toBe("passed");
    expect(evaluateBenchmarkCase(item, { answer: "no" }).outcome).toBe("failed");
    expect(evaluateBenchmarkCase(item, { answer: null }).outcome).toBe("invalid-output");
    expect(evaluateBenchmarkCase(item, { status: "incomplete" }).outcome).toBe("incomplete");
    expect(evaluateBenchmarkCase(item, { status: "unsupported" }).outcome).toBe("unsupported");
    expect(evaluateBenchmarkCase(item, { status: "pending-review" }).outcome).toBe("pending-review");
    expect(evaluateBenchmarkCase(item, { status: "error", error: "provider failed" }).outcome).toBe("infrastructure-error");
  });

  test("checks required and forbidden tool evidence", () => {
    const item = benchmarkCase({ kind: "exact", expected: "done" });
    item.oracle.requiredTools = ["executeGeoGebraCommands", "getCanvasContext"];
    item.oracle.forbiddenTools = ["deleteAllObjects"];
    const missing = evaluateBenchmarkCase(item, { answer: "done", tools: ["executeGeoGebraCommands"] });
    expect(missing.outcome).toBe("failed");
    expect(missing.assertions.find((entry) => entry.id === "required-tools")?.passed).toBe(false);
    expect(evaluateBenchmarkCase(item, {
      answer: "done",
      tools: ["executeGeoGebraCommands", "getCanvasContext", "deleteAllObjects"]
    }).outcome).toBe("failed");
    expect(evaluateBenchmarkCase(item, {
      answer: "done",
      tools: ["executeGeoGebraCommands", "getCanvasContext"]
    }).outcome).toBe("passed");
  });

  test("never resolves an ambiguous semantic object match by selecting the first object", () => {
    const item = benchmarkCase({ kind: "exact", expected: "done" });
    item.oracle.canvasObjects = [{ id: "target-circle", type: "circle", cardinality: "exactly-one" }];
    const result = evaluateBenchmarkCase(item, {
      answer: "done",
      canvasObjects: [{ type: "circle", label: "c" }, { type: "circle", label: "d" }]
    });
    expect(result.outcome).toBe("pending-review");
    expect(result.assertions.find((entry) => entry.id === "canvas-object:target-circle")).toMatchObject({
      passed: false,
      ambiguous: true
    });
  });

  test("reports score and coverage without counting incomplete/error runs as evaluated", () => {
    const outcomes: BenchmarkCaseResult["outcome"][] = [
      "passed", "failed", "invalid-output", "incomplete", "evaluator-error"
    ];
    const results = outcomes.map((outcome, index): BenchmarkCaseResult => ({
      caseId: `case-${index}`,
      caseVersion: "1.0.0",
      outcome,
      assertions: [],
      durationMs: 1
    }));
    expect(summarizeBenchmarkResults(results, 6)).toEqual({
      totalCases: 6,
      attemptedCases: 5,
      evaluatedCases: 3,
      passedCases: 1,
      failedCases: 2,
      incompleteCases: 1,
      unsupportedCases: 0,
      pendingReviewCases: 0,
      infrastructureErrorCases: 0,
      evaluatorErrorCases: 1,
      coverage: 0.5,
      attemptCoverage: 5 / 6,
      score: 1 / 3
    });
  });
});
