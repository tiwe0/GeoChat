import { describe, expect, test } from "bun:test";
import { cloudProblemSummaryToProblemSummary } from "@geochat-ai/app";

describe("desktop problem-bank cloud contract", () => {
  test("maps cloud tags into desktop year and paper filters", () => {
    const problem = cloudProblemSummaryToProblemSummary({
      id: "gaokao-full-math-ii-mcq-2010-001",
      releaseId: "2026-06-12.2",
      datasetId: "OpenLMLab/GAOKAO-Bench",
      datasetSlug: "openlmlab-gaokao-bench",
      construction: "multiple_choice",
      modality: "text",
      subject: "math",
      grade: "gaokao",
      difficulty: "easy",
      language: "zh",
      license: "apache-2.0",
      reusePolicy: "allowed",
      hasMedia: false,
      mediaCount: 0,
      choiceCount: 4,
      promptPreview: "Known GAOKAO problem.",
      answerPreview: "D",
      knowledge: ["set-logic"],
      tags: ["gaokao", "mcq", "year-2010", "math_ii"],
      problemApiPath: "/problem-bank/v1/problems/gaokao-full-math-ii-mcq-2010-001"
    });

    expect(problem.year).toBe("2010");
    expect(problem.paper).toBe("math_ii");
    expect(problem.questionType).toBe("mcq");
  });
});
