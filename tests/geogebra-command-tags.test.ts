import { describe, expect, test } from "bun:test";
import {
  GEOGEBRA_COMMAND_REFERENCE,
  GEOGEBRA_COMMAND_TAGS,
  findGeoGebraCommandReferenceEntry,
  searchGeoGebraCommandReference
} from "../packages/app/src/geogebra-command-reference";

function tagsOf(command: string) {
  const entry = findGeoGebraCommandReferenceEntry(command);
  expect(entry, `missing command reference for ${command}`).toBeDefined();
  return entry?.tags ?? [];
}

describe("GeoGebra command tags", () => {
  test("covers every official GeoGebra command category with a representative command", () => {
    const representatives = {
      "category:3d": "Angle",
      "category:algebra": "AreEqual",
      "category:chart": "BarChart",
      "category:conic": "Axes",
      "category:discrete-math": "ConvexHull",
      "category:financial": "FutureValue",
      "category:functions-and-calculus": "Asymptote",
      "category:geometry": "AffineRatio",
      "category:geogebra": "AxisStepX",
      "category:list": "Append",
      "category:logic": "CountIf",
      "category:optimization": "Maximize",
      "category:probability": "Bernoulli",
      "category:scripting": "AttachCopyToView",
      "category:spreadsheet": "Cell",
      "category:statistics": "ANOVA",
      "category:text": "ContingencyTable",
      "category:transformation": "Dilate",
      "category:vector-and-matrix": "ApplyMatrix"
    } as const;

    for (const [category, command] of Object.entries(representatives)) {
      expect(tagsOf(command), `${command} should be classified as ${category}`).toContain(category);
    }
    expect(GEOGEBRA_COMMAND_TAGS.filter((tag) => tag.startsWith("category:")).sort()).toEqual(
      Object.keys(representatives).sort()
    );
  });

  test("assigns at least one category tag to every runtime command", () => {
    const uncategorized = GEOGEBRA_COMMAND_REFERENCE
      .filter((entry) => !(entry.tags ?? []).some((tag) => tag.startsWith("category:")))
      .map((entry) => entry.command);

    expect(uncategorized).toEqual([]);
    expect(GEOGEBRA_COMMAND_TAGS.some((tag) => tag.startsWith("category:"))).toBe(true);
  });

  test("uses the tag-first taxonomy namespaces instead of legacy kind tags", () => {
    const allowedNamespaces = new Set(["category", "capability", "risk"]);
    const invalidTags = GEOGEBRA_COMMAND_REFERENCE.flatMap((entry) =>
      (entry.tags ?? [])
        .filter((tag) => !allowedNamespaces.has(tag.split(":", 1)[0] ?? ""))
        .map((tag) => `${entry.command}:${tag}`)
    );

    expect(invalidTags).toEqual([]);
    expect(GEOGEBRA_COMMAND_TAGS.some((tag) => tag.startsWith("kind:"))).toBe(false);
  });

  test("corrects known false-positive classifications", () => {
    expect(tagsOf("ConvexHull")).toEqual(expect.arrayContaining(["category:discrete-math"]));
    expect(tagsOf("ConvexHull")).not.toContain("kind:animation");
    expect(tagsOf("ConvexHull")).not.toContain("kind:coordinate");

    expect(tagsOf("HyperGeometric")).toEqual(expect.arrayContaining(["category:probability", "capability:cas-supported"]));
    expect(tagsOf("HyperGeometric")).not.toContain("kind:3d");

    expect(tagsOf("SetColor")).toEqual(
      expect.arrayContaining(["category:scripting", "capability:style", "capability:script"])
    );
    expect(tagsOf("SetColor")).not.toContain("kind:function");

    expect(tagsOf("UpdateConstruction")).toEqual(
      expect.arrayContaining([
        "category:scripting",
        "capability:construction-control",
        "capability:script",
        "risk:bulk-mutation"
      ])
    );
    expect(tagsOf("UpdateConstruction")).not.toContain("kind:data_stats");

    expect(tagsOf("FormulaText")).toContain("category:text");
  });

  test("keeps CAS support separate from CAS-only execution", () => {
    expect(tagsOf("HyperGeometric")).toContain("capability:cas-supported");
    expect(tagsOf("HyperGeometric")).not.toContain("capability:cas-only");
    expect(tagsOf("Solve")).toEqual(
      expect.arrayContaining(["category:algebra", "capability:cas-supported", "capability:cas-only"])
    );
  });

  test("keeps every CAS-only command within the CAS-supported capability", () => {
    const casOnly = GEOGEBRA_COMMAND_REFERENCE.filter((entry) =>
      (entry.tags ?? []).includes("capability:cas-only")
    );

    expect(casOnly.length).toBeGreaterThan(0);
    expect(
      casOnly
        .filter((entry) => !(entry.tags ?? []).includes("capability:cas-supported"))
        .map((entry) => entry.command)
    ).toEqual([]);
    for (const command of ["TrigCombine", "TrigExpand", "TrigSimplify"]) {
      expect(tagsOf(command)).toEqual(
        expect.arrayContaining(["capability:cas-only", "capability:cas-supported"])
      );
    }
  });

  test("describes label and position commands with precise functional tags", () => {
    expect(tagsOf("SetCaption")).toEqual(
      expect.arrayContaining(["category:scripting", "capability:label", "capability:label-content", "capability:script"])
    );
    expect(tagsOf("SetLabelMode")).toEqual(
      expect.arrayContaining(["category:scripting", "capability:label", "capability:label-mode", "capability:script"])
    );
    expect(tagsOf("ShowLabel")).toEqual(
      expect.arrayContaining([
        "category:scripting",
        "capability:label",
        "capability:label-visibility",
        "capability:visibility",
        "capability:script"
      ])
    );
    expect(tagsOf("SetCoords")).toEqual(
      expect.arrayContaining(["category:scripting", "capability:position", "capability:script"])
    );
    expect(tagsOf("SetCoords")).not.toContain("capability:label-position");
    expect(tagsOf("Text")).toEqual(
      expect.arrayContaining(["category:text", "capability:position", "capability:text-position", "capability:alignment"])
    );
    expect(tagsOf("Text")).not.toContain("capability:label-position");
    expect(
      searchGeoGebraCommandReference("", 12, "en-US", {
        tags: ["capability:position"],
        tagMatch: "all"
      }).map((entry) => entry.command)
    ).toContain("SetCoords");
  });

  test("supports cross-category functional retrieval without prefix inference", () => {
    expect(tagsOf("Circle")).toEqual(expect.arrayContaining(["capability:create"]));
    expect(tagsOf("Area")).toEqual(expect.arrayContaining(["capability:measure"]));
    expect(tagsOf("Area")).not.toContain("capability:create");
    expect(tagsOf("AreParallel")).toEqual(expect.arrayContaining(["capability:relation"]));
    expect(tagsOf("ApplyMatrix")).toEqual(expect.arrayContaining(["capability:transform"]));
    expect(tagsOf("ConstructionStep")).toEqual(expect.arrayContaining(["capability:query"]));
    expect(tagsOf("SetSeed")).not.toContain("capability:style");
    expect(tagsOf("SetViewDirection")).toContain("capability:animation");
    expect(tagsOf("VerticalText")).toEqual(
      expect.arrayContaining(["capability:position", "capability:text-position", "capability:style"])
    );

    expect(
      searchGeoGebraCommandReference("parallel", 12, "en-US", {
        tags: ["capability:relation"],
        tagMatch: "all"
      }).map((entry) => entry.command)
    ).toContain("AreParallel");
    expect(
      searchGeoGebraCommandReference("matrix", 12, "en-US", {
        tags: ["capability:transform"],
        tagMatch: "all"
      }).map((entry) => entry.command)
    ).toContain("ApplyMatrix");
  });

  test("supports any-tag search across multiple functional intents", () => {
    const results = searchGeoGebraCommandReference("", 12, "en-US", {
      tags: ["capability:label-content", "capability:label-mode"],
      tagMatch: "any"
    });

    expect(results.map((entry) => entry.command)).toEqual(expect.arrayContaining(["SetCaption", "SetLabelMode"]));
    expect(
      results.every((entry) =>
        (entry.tags ?? []).some((tag) => tag === "capability:label-content" || tag === "capability:label-mode")
      )
    ).toBe(true);
  });

  test("supports all-tag search and rejects exact-name matches outside the filter", () => {
    expect(
      searchGeoGebraCommandReference("SetColor", 3, "en-US", {
        tags: ["category:scripting", "capability:style"],
        tagMatch: "all"
      }).map((entry) => entry.command)
    ).toContain("SetColor");

    expect(
      searchGeoGebraCommandReference("SetCaption", 3, "en-US", {
        tags: ["capability:label-content", "capability:label-mode"],
        tagMatch: "all"
      })
    ).toEqual([]);
  });
});
