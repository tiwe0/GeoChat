import { describe, expect, test } from "bun:test";
import { normalizeGeoGebraFreeParameterCommands } from "@geochat-ai/app";

/** The normalizer is the reason these rules no longer live in the system prompt. */
function normalize(command: string) {
  return normalizeGeoGebraFreeParameterCommands([command], {
    declaredNames: ["f", "A", "O", "poly"]
  });
}

describe("GeoGebra command canonicalization", () => {
  test("rewrites hallucinated commands regardless of casing", () => {
    expect(normalize("extrema(f)")).toEqual(["Extremum(f)"]);
    expect(normalize("E = extrema(f)")).toEqual(["E = Extremum(f)"]);
    expect(normalize("maximum(f)")).toEqual(["Extremum(f)"]);
    expect(normalize("hidelabel(A)")).toEqual(["ShowLabel(A, false)"]);
    expect(normalize("setopacity(poly, 0.3)")).toEqual(["SetFilling(poly, 0.3)"]);
  });

  test("canonicalizes casing on valid commands without otherwise changing them", () => {
    expect(normalize("circle(O, A)")).toEqual(["Circle(O, A)"]);
    expect(normalize("Extremum(f)")).toEqual(["Extremum(f)"]);
  });

  test("keeps a lowercase coordinate assignment from becoming a vector", () => {
    expect(normalize("p = (1, 2)")).toEqual(["p = Point((1, 2))"]);
  });

  test("declares free parameters before the command that uses them", () => {
    expect(normalizeGeoGebraFreeParameterCommands(["g: y = k * x"], { declaredNames: [] })).toEqual([
      "k = 0.5",
      "g: y = k * x"
    ]);
  });
});
