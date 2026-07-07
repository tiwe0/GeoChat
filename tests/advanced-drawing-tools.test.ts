import { describe, expect, test } from "bun:test";

import {
  ADVANCED_DRAWING_TOOL_NAMES,
  compileAdvancedDrawingCommand,
  getAdvancedDrawingToolDefinitions,
  type AdvancedDrawingCommandArgs
} from "../packages/app/src/advanced-drawing-tools";

function commandsFor(input: AdvancedDrawingCommandArgs) {
  return compileAdvancedDrawingCommand(input).executeArgs.commands as string[];
}

function commandNames(commands: readonly string[]) {
  const names = new Set<string>();
  for (const command of commands) {
    const match = /^([\p{L}_][\p{L}\p{N}_]*)(?:\(x\))?\s*(?:=|:)/u.exec(command);
    if (match) names.add(match[1]);
  }
  return names;
}

describe("advanced drawing command compiler", () => {
  test("defines every macro with a complete mathematical contract", () => {
    const definitions = getAdvancedDrawingToolDefinitions();
    expect(definitions.map((definition) => definition.name)).toEqual([...ADVANCED_DRAWING_TOOL_NAMES]);
    for (const definition of definitions) {
      expect(definition.description.length).toBeGreaterThan(10);
      expect(definition.requiredSkills.length).toBeGreaterThan(0);
      expect(definition.assumptions.length).toBeGreaterThan(0);
      expect(definition.parameters.length).toBeGreaterThan(0);
      expect(definition.invariants.length).toBeGreaterThan(0);
      for (const parameter of definition.parameters) {
        expect(parameter.name).toMatch(/^[a-zA-Z][a-zA-Z0-9]*$/);
        expect(parameter.description.length).toBeGreaterThan(5);
      }
    }
  });

  test("emits bounded GeoGebra batches whose expected objects are created explicitly", () => {
    for (const name of ADVANCED_DRAWING_TOOL_NAMES) {
      const compilation = compileAdvancedDrawingCommand({ name });
      const commands = compilation.executeArgs.commands as string[];
      const created = commandNames(commands);
      expect(commands.length).toBeGreaterThan(0);
      expect(commands.length).toBeLessThanOrEqual(100);
      expect(compilation.expectedObjects.length).toBeGreaterThan(0);
      for (const command of commands) {
        expect(command).not.toContain("undefined");
        expect(command).not.toContain("NaN");
        expect(command).not.toContain("Infinity");
      }
      for (const objectName of compilation.expectedObjects) {
        expect(created.has(objectName)).toBe(true);
      }
    }
  });

  test("computes custom prism, pyramid, circumsphere, and insphere geometry from caller data", () => {
    expect(commandsFor({
      name: "drawTriangularPrismSkeleton",
      args: {
        pointLabels: ["P", "Q", "R", "P1", "Q1", "R1"],
        coordinates: [[0, 0, 0], [3, 0, 0], [0, 2, 0], [0, 0, 4], [3, 0, 4], [0, 2, 4]]
      }
    })).toEqual(expect.arrayContaining([
      "P = (0, 0, 0)",
      "Q1 = (3, 0, 4)",
      "baseFace = Polygon(P, Q, R)"
    ]));

    expect(commandsFor({
      name: "drawSquarePyramidSkeleton",
      args: {
        pointLabels: ["P", "Q", "R", "W", "S"],
        coordinates: [[0, 0, 0], [2, 0, 0], [2, 2, 0], [0, 2, 0], [1, 1, 3]],
        centerName: "M",
        heightName: "SM"
      }
    })).toEqual(expect.arrayContaining([
      "M = (1, 1, 0)",
      "baseSquare = Polygon(P, Q, R, W)",
      "SM = Segment(S, M)"
    ]));

    expect(commandsFor({
      name: "drawTetrahedronCircumsphere",
      args: {
        coordinates: [[0, 0, 0], [2, 0, 0], [0, 4, 0], [0, 0, 6]],
        centerName: "Oc"
      }
    })).toEqual(expect.arrayContaining([
      "Oc = (1, 2, 3)",
      "r = Distance(Oc, A)"
    ]));

    expect(commandsFor({
      name: "drawTetrahedronInsphere",
      args: {
        coordinates: [[0, 0, 0], [2, 0, 0], [0, 4, 0], [0, 0, 6]],
        centerName: "Ic",
        tangentPointName: "Tc"
      }
    })).toEqual(expect.arrayContaining([
      "Ic = (0.6667, 0.6667, 0.6667)",
      "Tc = (0.6667, 0.6667, 0)",
      "rin = Distance(Ic, Tc)"
    ]));
  });

  test("preserves explicit dynamic versus snapshot GeoGebra expression semantics", () => {
    expect(commandsFor({
      name: "drawUnitCircleTrigProjection",
      args: {
        angleName: "thetaDyn",
        angleDegrees: { kind: "ggb_expr", expr: "theta", evaluation: "dynamic" }
      }
    })).toEqual(expect.arrayContaining([
      "thetaDyn = theta",
      "P = (1 * cos(thetaDyn), 1 * sin(thetaDyn))"
    ]));

    expect(commandsFor({
      name: "drawUnitCircleTrigProjection",
      args: {
        angleName: "thetaSnap",
        angleDegrees: { kind: "ggb_expr", expr: "theta", evaluation: "snapshot" }
      }
    })).toEqual(expect.arrayContaining([
      "thetaSnap = CopyFreeObject(theta)",
      "P = (1 * cos(thetaSnap), 1 * sin(thetaSnap))"
    ]));

    expect(commandsFor({
      name: "drawUnitCircleTrigProjection",
      args: {
        angleName: "thetaRef",
        angleDegrees: { kind: "object_ref", name: "alpha" }
      }
    })).toContain("thetaRef = alpha");
  });

  test("accepts stable semantic aliases for common advanced drawing defaults", () => {
    const prismCommands = commandsFor({
      name: "drawTriangularPrismSkeleton",
      args: {
        pointLabels: "standard",
        coordinates: {
          kind: "ggb_expr",
          expr: "[ (0,0,0), (4,0,0), (1,3,0), (0,0,3), (4,0,3), (1,3,3) ]",
          evaluation: "snapshot"
        }
      }
    });
    expect(prismCommands).toContain("A = (0, 0, 0)");
    expect(prismCommands).toContain("C1 = (1, 3, 3)");
  });

  test("rejects unsupported arguments, invalid labels, malformed coordinates, and nested macros", () => {
    const invalidCalls: Array<{ input: AdvancedDrawingCommandArgs; message: string }> = [
      { input: { name: "drawQuadraticVertexDiagram", args: { unknown: 1 } }, message: "unsupported argument" },
      { input: { name: "drawTriangularPrismSkeleton", args: { pointLabels: ["A"] } }, message: "exactly 6 labels" },
      { input: { name: "drawTriangularPrismSkeleton", args: { pointLabels: ["A", "B", "C", "A", "B1", "C1"] } }, message: "unique" },
      { input: { name: "drawSquarePyramidSkeleton", args: { centerName: "1bad" } }, message: "GeoGebra identifier" },
      { input: { name: "drawTetrahedronCircumsphere", args: { coordinates: [[0, 0, 0]] } }, message: "exactly 4 3D points" },
      { input: { name: "drawTetrahedronCircumsphere", args: { coordinates: [[0, 0, 0], [1, 0, 0], [0, Number.NaN, 0], [0, 0, 1]] } }, message: "finite number" },
      { input: { name: "drawTetrahedronCircumsphere", args: { centerCoordinates: [0, 0, 0] } }, message: "unsupported argument" },
      {
        input: {
          name: "drawQuadraticVertexDiagram",
          args: { helper: { kind: "advanced_command", name: "drawUnitCircleTrigProjection" } }
        },
        message: "cannot be nested"
      }
    ];
    for (const item of invalidCalls) {
      expect(() => compileAdvancedDrawingCommand(item.input)).toThrow(item.message);
    }
  });

  test("rejects geometry outside each macro domain instead of silently falling back", () => {
    const invalidGeometry: Array<{ input: AdvancedDrawingCommandArgs; message: string }> = [
      {
        input: {
          name: "drawTriangularPrismSkeleton",
          args: { coordinates: [[0, 0, 0], [1, 0, 0], [0, 1, 0], [0, 0, 1], [1, 0, 2], [0, 1, 1]] }
        },
        message: "top triangle to be a translation"
      },
      {
        input: {
          name: "drawTriangularPrismSkeleton",
          args: { coordinates: [[0, 0, 0], [1, 0, 0], [0, 1, 0], [1, 0, 0], [2, 0, 0], [1, 1, 0]] }
        },
        message: "positive prism volume"
      },
      {
        input: {
          name: "drawSquarePyramidSkeleton",
          args: { coordinates: [[0, 0, 0], [3, 0, 0], [3, 2, 0], [0, 2, 0], [1.5, 1, 3]] }
        },
        message: "equal side lengths"
      },
      {
        input: {
          name: "drawSquarePyramidSkeleton",
          args: { coordinates: [[0, 0, 0], [2, 0, 0], [2, 2, 0], [0, 2, 0], [1.2, 1, 3]] }
        },
        message: "project to the square base center"
      },
      {
        input: {
          name: "drawTetrahedronCircumsphere",
          args: { coordinates: [[0, 0, 0], [1, 0, 0], [0, 1, 0], [1, 1, 0]] }
        },
        message: "non-coplanar"
      }
    ];
    for (const item of invalidGeometry) {
      expect(() => compileAdvancedDrawingCommand(item.input)).toThrow(item.message);
    }
  });

  test("rejects invalid numeric domains and expression wrappers", () => {
    const invalidCalls: Array<{ input: AdvancedDrawingCommandArgs; message: string }> = [
      { input: { name: "drawUnitCircleTrigProjection", args: { radius: 0 } }, message: "radius must be positive" },
      { input: { name: "drawUnitCircleTrigProjection", args: { angleDegrees: { kind: "ggb_expr", expr: "theta; Delete(A)" } } }, message: "single GeoGebra expression" },
      { input: { name: "drawUnitCircleTrigProjection", args: { angleDegrees: { kind: "ggb_expr", expr: "theta", evaluation: "later" } } }, message: "dynamic or snapshot" },
      { input: { name: "drawUnitCircleTrigProjection", args: { angleDegrees: { kind: "object_ref", name: "1theta" } } }, message: "GeoGebra identifier" },
      { input: { name: "drawParabolaFocusDirectrix", args: { p: 0 } }, message: "p must be at least 0.25" },
      { input: { name: "drawQuadraticVertexDiagram", args: { a: 0 } }, message: "a must be non-zero" },
      { input: { name: "drawClassicalProbabilityGrid", args: { sides: 4.5 } }, message: "sides must be an integer" },
      { input: { name: "drawClassicalProbabilityGrid", args: { sides: 4, targetSum: 9 } }, message: "targetSum must be between 2 and 8" }
    ];
    for (const item of invalidCalls) {
      expect(() => compileAdvancedDrawingCommand(item.input)).toThrow(item.message);
    }
  });

  test("localizes compiled tool metadata without changing the emitted construction", () => {
    const zh = compileAdvancedDrawingCommand({ name: "drawQuadraticVertexDiagram" }, "zh-CN");
    const en = compileAdvancedDrawingCommand({ name: "drawQuadraticVertexDiagram" }, "en-US");
    expect(zh.title).toBe("绘制二次函数顶点图");
    expect(en.title).toBe("Draw quadratic vertex diagram");
    expect(en.executeArgs.reason).toContain("Run the compiled high-level construction");
    expect(en.executeArgs.commands).toEqual(zh.executeArgs.commands);
    expect(en.assumptions).toEqual(zh.assumptions);
    expect(en.invariants).toEqual(zh.invariants);
  });
});
