import { describe, expect, test } from "bun:test";
import {
  GEOGEBRA_COMMAND_REFERENCE,
  GEOGEBRA_COMMAND_REFERENCE_METADATA,
  findGeoGebraCommandReferenceEntry,
  searchGeoGebraCommandReference
} from "../packages/app/src/geogebra-command-reference";

describe("GeoGebra command reference", () => {
  test("is generated from the exact vendored 5.2 runtime catalog", () => {
    expect(GEOGEBRA_COMMAND_REFERENCE_METADATA.runtimeVersion).toBe("5.2.871.0");
    expect(GEOGEBRA_COMMAND_REFERENCE_METADATA.commandCount).toBe(508);
    expect(GEOGEBRA_COMMAND_REFERENCE).toHaveLength(GEOGEBRA_COMMAND_REFERENCE_METADATA.commandCount);
    expect(new Set(GEOGEBRA_COMMAND_REFERENCE.map((entry) => entry.command)).size).toBe(GEOGEBRA_COMMAND_REFERENCE.length);
    expect(GEOGEBRA_COMMAND_REFERENCE.every((entry) => entry.syntax.length > 0 && entry.syntaxEn?.length)).toBe(true);
  });

  test("uses canonical executable English names rather than internal enum aliases", () => {
    expect(findGeoGebraCommandReferenceEntry("AngleBisector", "en-US")?.syntax).toBe(
      "AngleBisector( <Line>, <Line> ); AngleBisector( <Point>, <Point>, <Point> )"
    );
    expect(findGeoGebraCommandReferenceEntry("IsDefined", "en-US")?.syntax).toBe("IsDefined( <Object> )");
    expect(findGeoGebraCommandReferenceEntry("FitLine", "en-US")?.syntax).toBe("FitLine( <List of Points> )");
    expect(findGeoGebraCommandReferenceEntry("AngularBisector")).toBeUndefined();
  });

  test("preserves all 2D, 3D, and CAS overload parameters", () => {
    expect(findGeoGebraCommandReferenceEntry("Circle", "en-US")?.syntax).toContain("Circle( <Point>, <Radius>, <Direction> )");
    expect(findGeoGebraCommandReferenceEntry("Reflect", "en-US")?.syntax).toContain("Reflect( <Object>, <Plane> )");
    expect(findGeoGebraCommandReferenceEntry("Derivative", "en-US")?.syntax).toContain(
      "Derivative( <Expression>, <Variable>, <Number> )"
    );
  });

  test("returns an exact command match first with authoritative parameters", () => {
    const result = searchGeoGebraCommandReference("Circle", 3, "en-US");
    expect(result[0]?.command).toBe("Circle");
    expect(result[0]?.syntax).toContain("Circle( <Point>, <Radius Number> )");
    expect(searchGeoGebraCommandReference("perpendicular bisector plane", 3, "en-US", "geometry-3d")[0]?.command).toBe(
      "PlaneBisector"
    );
  });

  test("can retrieve every runtime command by its exact executable name without changing its parameters", () => {
    for (const entry of GEOGEBRA_COMMAND_REFERENCE) {
      expect(searchGeoGebraCommandReference(entry.command, 1, "en-US", "global")[0]).toMatchObject({
        command: entry.command,
        syntax: entry.syntaxEn
      });
    }
  });
});
