import { describe, expect, test } from "bun:test";
import { readFile } from "node:fs/promises";
import {
  benchmarkSuiteHash,
  evaluateBenchmarkCase,
  projectBenchmarkSuiteForModel,
  validateBenchmarkSuite,
  type BenchmarkSuite
} from "@geochat-ai/app";

function validSuite(): BenchmarkSuite {
  return {
    schemaVersion: 1,
    id: "geometry-smoke",
    version: "1.0.0",
    title: "Geometry smoke",
    cases: [
      {
        id: "circle-radius",
        version: "1.0.0",
        path: "cases/circle-radius.json",
        publicTask: {
          title: "Circle",
          prompt: "Draw a circle of radius 3 centered at the origin.",
          tags: ["circle", "construction"],
          difficulty: "smoke"
        },
        oracle: {
          answer: { kind: "normalized", expected: "circle complete" },
          requiredTools: ["executeGeoGebraCommands"]
        }
      }
    ]
  };
}

describe("benchmark contract", () => {
  test("projects only the public task allowlist and never leaks private fields", () => {
    const suite = validSuite();
    const hostile = suite.cases[0] as unknown as Record<string, unknown>;
    hostile.answer = "leak";
    hostile.analysis = "leak";
    hostile.rawPayload = { answer: "leak" };
    hostile.correct = true;
    (hostile.publicTask as Record<string, unknown>).oracle = { answer: "nested leak" };
    (hostile.publicTask as Record<string, unknown>).analysis = "nested leak";

    const projected = projectBenchmarkSuiteForModel(suite);
    const encoded = JSON.stringify(projected);
    for (const forbidden of ["answer", "analysis", "rawPayload", "correct", "oracle"]) {
      expect(encoded).not.toContain(`\"${forbidden}\"`);
    }
    expect(projected.cases[0]).toEqual({
      id: "circle-radius",
      version: "1.0.0",
      title: "Circle",
      prompt: "Draw a circle of radius 3 centered at the origin.",
      tags: ["circle", "construction"],
      difficulty: "smoke",
      assets: []
    });
  });

  test("rejects duplicate ids, unsafe and duplicate paths, and invalid versions", () => {
    const suite = validSuite();
    suite.cases.push({
      ...structuredClone(suite.cases[0]),
      path: "../circle-radius.json",
      version: "latest"
    });
    const issues = validateBenchmarkSuite(suite).issues.map((issue) => `${issue.path}:${issue.code}`);
    expect(issues).toContain("cases[1].id:duplicate_id");
    expect(issues).toContain("cases[1].path:invalid_path");
    expect(issues).toContain("cases[1].version:invalid_version");

    suite.cases[1]!.id = "circle-radius-copy";
    suite.cases[1]!.path = suite.cases[0]!.path;
    expect(validateBenchmarkSuite(suite).issues.map((issue) => issue.code)).toContain("duplicate_path");
  });

  test("rejects non-finite numeric values and ambiguous matcher shapes", () => {
    const suite = validSuite();
    suite.cases[0]!.oracle.answer = {
      kind: "numeric",
      expected: Number.NaN,
      absoluteTolerance: Number.POSITIVE_INFINITY
    };
    const numericIssues = validateBenchmarkSuite(suite).issues.map((issue) => issue.code);
    expect(numericIssues).toContain("non_finite_number");

    suite.cases[0]!.oracle.answer = {
      kind: "exact",
      expected: "A",
      alternatives: ["B"]
    } as never;
    expect(validateBenchmarkSuite(suite).issues.map((issue) => issue.code)).toContain("ambiguous_matcher");
  });

  test("rejects unknown oracle assertions and condition-free canvas matchers", () => {
    const suite = validSuite();
    (suite.cases[0]!.oracle as unknown as Record<string, unknown>).visualMagic = true;
    suite.cases[0]!.oracle.canvasObjects = [{ id: "circle" }];
    const issues = validateBenchmarkSuite(suite).issues.map((entry) => entry.code);
    expect(issues).toContain("unknown_assertion");
    expect(issues).toContain("ambiguous_matcher");
  });

  test("produces a canonical fixed hash independent of object key order", () => {
    const suite = validSuite();
    expect(benchmarkSuiteHash(suite)).toBe("fnv1a64:45980a4add8ca2ce");
    const reordered = JSON.parse(JSON.stringify(suite, Object.keys(suite).reverse())) as BenchmarkSuite;
    // JSON replacers can drop nested keys, so construct an equivalent top-level reorder explicitly.
    const equivalent: BenchmarkSuite = {
      title: suite.title,
      version: suite.version,
      id: suite.id,
      cases: structuredClone(suite.cases),
      schemaVersion: 1
    };
    expect(reordered).not.toEqual(suite);
    expect(benchmarkSuiteHash(equivalent)).toBe(benchmarkSuiteHash(suite));
  });

  test("ships a valid, fingerprinted core suite with at least twelve original smoke cases", async () => {
    const coreSuite = JSON.parse(await readFile("benchmarks/core-v1/suite.json", "utf8")) as BenchmarkSuite;
    const validation = validateBenchmarkSuite(coreSuite);
    expect(validation.issues).toEqual([]);
    expect(coreSuite.cases.length).toBeGreaterThanOrEqual(12);
    expect(new Set(coreSuite.cases.map((entry) => entry.id)).size).toBe(coreSuite.cases.length);
    expect(coreSuite.contentHash).toBe(benchmarkSuiteHash(coreSuite));
  });

  test("accepts a correct fixture and rejects an incorrect fixture for every core case", async () => {
    const coreSuite = JSON.parse(await readFile("benchmarks/core-v1/suite.json", "utf8")) as BenchmarkSuite;
    for (const benchmarkCase of coreSuite.cases) {
      const matcher = benchmarkCase.oracle.answer;
      const correctAnswer = matcher.expected;
      const wrongAnswer = matcher.kind === "numeric" ? matcher.expected + 1000 : `${matcher.expected}__wrong`;
      const tools = benchmarkCase.oracle.requiredTools ?? [];
      expect(evaluateBenchmarkCase(benchmarkCase, {
        status: "complete",
        answer: correctAnswer,
        tools
      }).outcome).toBe("passed");
      expect(evaluateBenchmarkCase(benchmarkCase, {
        status: "complete",
        answer: wrongAnswer,
        tools
      }).outcome).toBe("failed");
    }
  });
});
