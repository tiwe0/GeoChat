import { createGeometryPlan, isGeometryPlan, type GeometryPlan } from "./geometry-ir";
import type { FunctionCallLocale } from "./functioncalls";

export type ConstructionRecipeId = "function.parabola.vertex" | "function.intersections" | "conic.ellipse.foci-point";

export type ConstructionRecipeInputSpec = {
  name: string;
  label: string;
  kind: "point" | "expression" | "identifier";
  required: boolean;
};

export type ConstructionRecipe = {
  id: ConstructionRecipeId;
  title: string;
  intentPatterns: string[];
  inputSpecs: ConstructionRecipeInputSpec[];
  createPlan: (input: Record<string, unknown>, locale?: FunctionCallLocale | null) => GeometryPlan;
};

export const CONSTRUCTION_RECIPES = [
  {
    id: "function.parabola.vertex",
    title: "绘制抛物线并标出顶点",
    intentPatterns: ["抛物线", "parabola", "顶点", "vertex"],
    inputSpecs: [
      { name: "expression", label: "函数表达式", kind: "expression", required: true },
      { name: "functionName", label: "函数对象名", kind: "identifier", required: false },
      { name: "vertexName", label: "顶点对象名", kind: "identifier", required: false }
    ],
    createPlan: (input, locale) => {
      const functionName = stringInput(input.functionName, "f");
      const vertexName = stringInput(input.vertexName, "V");
      const expression = stringInput(input.expression, "x^2");
      return createGeometryPlan({
        planId: "plan-parabola-vertex",
        title: locale === "en-US"
          ? `Graph the parabola ${functionName}(x) = ${expression} and mark its vertex`
          : `绘制抛物线 ${functionName}(x) = ${expression} 并标出顶点`,
        taskType: "construct",
        objects: [
          { id: functionName, kind: "function", subtype: "parabola", expression, role: "parabola graph" },
          { id: vertexName, kind: "point", role: "parabola vertex", dependsOn: [functionName] }
        ],
        constraints: [
          { kind: "object_exists", object: functionName },
          { kind: "object_type", object: functionName, expected: "function" },
          { kind: "vertex_of", point: vertexName, object: functionName }
        ],
        steps: [
          { id: "step-create-parabola", kind: "create_function_graph", output: functionName, expression },
          { id: "step-mark-vertex", kind: "mark_parabola_vertex", output: vertexName, parabola: functionName },
          { id: "step-caption-vertex", kind: "set_caption", object: vertexName, caption: locale === "en-US" ? "Vertex" : "顶点" }
        ],
        verificationTargets: [
          { kind: "object_exists", object: functionName },
          { kind: "object_exists", object: vertexName },
          { kind: "dependency", object: vertexName, dependsOn: [functionName] }
        ],
        explanationGoals: [locale === "en-US" ? "Explain the parabola's opening direction, vertex, and axis of symmetry." : "说明抛物线的开口方向、顶点和对称轴。"]
      });
    }
  },
  {
    id: "function.intersections",
    title: "绘制两个函数并求交点",
    intentPatterns: ["交点", "intersect", "intersection", "函数"],
    inputSpecs: [
      { name: "leftExpression", label: "第一个函数表达式", kind: "expression", required: true },
      { name: "rightExpression", label: "第二个函数表达式", kind: "expression", required: true },
      { name: "leftName", label: "第一个函数名", kind: "identifier", required: false },
      { name: "rightName", label: "第二个函数名", kind: "identifier", required: false },
      { name: "intersectionName", label: "交点对象名", kind: "identifier", required: false }
    ],
    createPlan: (input, locale) => {
      const leftName = stringInput(input.leftName, "f");
      const rightName = stringInput(input.rightName, "g");
      const intersectionName = stringInput(input.intersectionName, "I");
      const leftExpression = stringInput(input.leftExpression, "x^2");
      const rightExpression = stringInput(input.rightExpression, "2x + 1");
      return createGeometryPlan({
        planId: "plan-function-intersections",
        title: locale === "en-US"
          ? `Find intersections of ${leftName}(x) = ${leftExpression} and ${rightName}(x) = ${rightExpression}`
          : `求 ${leftName}(x) = ${leftExpression} 与 ${rightName}(x) = ${rightExpression} 的交点`,
        taskType: "solve",
        objects: [
          { id: leftName, kind: "function", expression: leftExpression, role: "left function" },
          { id: rightName, kind: "function", expression: rightExpression, role: "right function" },
          { id: intersectionName, kind: "intersection", role: "function intersections", dependsOn: [leftName, rightName] }
        ],
        constraints: [
          { kind: "intersects", output: intersectionName, left: leftName, right: rightName },
          { kind: "object_exists", object: intersectionName }
        ],
        steps: [
          { id: "step-create-left-function", kind: "create_function_graph", output: leftName, expression: leftExpression },
          { id: "step-create-right-function", kind: "create_function_graph", output: rightName, expression: rightExpression },
          { id: "step-create-intersections", kind: "create_intersection", output: intersectionName, left: leftName, right: rightName }
        ],
        verificationTargets: [
          { kind: "object_exists", object: leftName },
          { kind: "object_exists", object: rightName },
          { kind: "dependency", object: intersectionName, dependsOn: [leftName, rightName] }
        ],
        explanationGoals: [locale === "en-US" ? "Explain that each intersection satisfies both function relations." : "解释交点同时满足两个函数关系。"]
      });
    }
  },
  {
    id: "conic.ellipse.foci-point",
    title: "由两个焦点和一点构造椭圆",
    intentPatterns: ["椭圆", "ellipse", "焦点", "foci"],
    inputSpecs: [
      { name: "focusA", label: "左焦点坐标", kind: "point", required: true },
      { name: "focusB", label: "右焦点坐标", kind: "point", required: true },
      { name: "point", label: "椭圆上一点坐标", kind: "point", required: true },
      { name: "focusAName", label: "左焦点对象名", kind: "identifier", required: false },
      { name: "focusBName", label: "右焦点对象名", kind: "identifier", required: false },
      { name: "pointName", label: "椭圆上一点对象名", kind: "identifier", required: false },
      { name: "ellipseName", label: "椭圆对象名", kind: "identifier", required: false }
    ],
    createPlan: (input, locale) => {
      const focusAName = stringInput(input.focusAName, "F");
      const focusBName = stringInput(input.focusBName, "G");
      const pointName = stringInput(input.pointName, "A");
      const ellipseName = stringInput(input.ellipseName, "c");
      const focusA = pointInput(input.focusA, [-2, 0]);
      const focusB = pointInput(input.focusB, [2, 0]);
      const point = pointInput(input.point, [0, 3]);
      return createGeometryPlan({
        planId: "plan-ellipse-foci-point",
        title: locale === "en-US"
          ? `Construct an ellipse from foci ${focusAName}, ${focusBName} and point ${pointName}`
          : `由焦点 ${focusAName}, ${focusBName} 和点 ${pointName} 构造椭圆`,
        taskType: "construct",
        objects: [
          { id: focusAName, kind: "point", value: focusA, role: "left focus" },
          { id: focusBName, kind: "point", value: focusB, role: "right focus" },
          { id: pointName, kind: "point", value: point, role: "point on ellipse" },
          { id: ellipseName, kind: "conic", subtype: "ellipse", role: "ellipse", dependsOn: [focusAName, focusBName, pointName] }
        ],
        constraints: [
          { kind: "focus", object: ellipseName, focus: focusAName },
          { kind: "focus", object: ellipseName, focus: focusBName },
          { kind: "point_on", point: pointName, object: ellipseName }
        ],
        steps: [
          { id: "step-create-focus-a", kind: "create_point", output: focusAName, coordinates: focusA, label: locale === "en-US" ? "Focus" : "焦点" },
          { id: "step-create-focus-b", kind: "create_point", output: focusBName, coordinates: focusB, label: locale === "en-US" ? "Focus" : "焦点" },
          { id: "step-create-point", kind: "create_point", output: pointName, coordinates: point, label: locale === "en-US" ? "Point on ellipse" : "椭圆上一点" },
          { id: "step-create-ellipse", kind: "create_ellipse_from_foci_and_point", output: ellipseName, focusA: focusAName, focusB: focusBName, point: pointName }
        ],
        verificationTargets: [
          { kind: "object_exists", object: ellipseName },
          { kind: "object_type", object: ellipseName, expected: "ellipse" },
          { kind: "dependency", object: ellipseName, dependsOn: [focusAName, focusBName, pointName] }
        ],
        explanationGoals: [locale === "en-US" ? "Explain the ellipse definition: the sum of distances to the two foci is constant." : "说明椭圆定义：到两个焦点的距离和为常数。"]
      });
    }
  }
] as const satisfies readonly ConstructionRecipe[];

export function getConstructionRecipes() {
  return [...CONSTRUCTION_RECIPES];
}

export function getConstructionRecipe(id: string) {
  return CONSTRUCTION_RECIPES.find((recipe) => recipe.id === id);
}

export function isConstructionRecipeId(value: unknown): value is ConstructionRecipeId {
  return typeof value === "string" && CONSTRUCTION_RECIPES.some((recipe) => recipe.id === value);
}

export function findConstructionRecipesForIntent(prompt: string) {
  const normalized = prompt.toLowerCase();
  return CONSTRUCTION_RECIPES.filter((recipe) => matchesConstructionRecipeIntent(recipe.id, normalized));
}

function matchesConstructionRecipeIntent(recipeId: ConstructionRecipeId, normalizedPrompt: string) {
  if (recipeId === "function.parabola.vertex") {
    return (
      normalizedPrompt.includes("抛物线") ||
      normalizedPrompt.includes("parabola") ||
      (/\by\s*=\s*x\^?2\b/u.test(normalizedPrompt) && (normalizedPrompt.includes("顶点") || normalizedPrompt.includes("对称轴") || normalizedPrompt.includes("vertex")))
    );
  }
  if (recipeId === "function.intersections") {
    return normalizedPrompt.includes("交点") || normalizedPrompt.includes("相交") || normalizedPrompt.includes("intersect") || normalizedPrompt.includes("intersection");
  }
  if (recipeId === "conic.ellipse.foci-point") {
    if (normalizedPrompt.includes("双曲线") || normalizedPrompt.includes("hyperbola")) return false;
    if (!normalizedPrompt.includes("椭圆") && !normalizedPrompt.includes("ellipse")) return false;
    const looksLikeStandardEquation = /x\^?\{?2\}?\\?\/|y\^?\{?2\}?\\?\//u.test(normalizedPrompt);
    if (looksLikeStandardEquation) return false;
    if (normalizedPrompt.includes("焦点") || normalizedPrompt.includes("foci") || normalizedPrompt.includes("focus")) return true;
    return !looksLikeStandardEquation && (normalizedPrompt.includes("构造") || normalizedPrompt.includes("construct"));
  }
  return false;
}

export function createGeometryPlanFromRecipe(id: ConstructionRecipeId, input: Record<string, unknown>, locale?: FunctionCallLocale | null) {
  const recipe = getConstructionRecipe(id);
  if (!recipe) throw new Error(`Unknown construction recipe: ${id}`);
  const plan = recipe.createPlan(input, locale);
  if (!isGeometryPlan(plan)) throw new Error(`Construction recipe produced an invalid geometry plan: ${id}`);
  return plan;
}

function stringInput(value: unknown, fallback: string) {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function pointInput(value: unknown, fallback: [number, number]): [number, number] {
  return Array.isArray(value) && value.length === 2 && value.every((item) => typeof item === "number" && Number.isFinite(item))
    ? [value[0], value[1]]
    : fallback;
}
