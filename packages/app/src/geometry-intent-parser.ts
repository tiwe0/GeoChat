import { getConstructionRecipe, isConstructionRecipeId, type ConstructionRecipeId } from "./construction-recipes";

export type GeometryIntentParseResult = {
  recipeId: ConstructionRecipeId;
  inputs: Record<string, unknown>;
  extractedFields: string[];
  missingRequiredInputs: string[];
};

export function normalizeConstructionRecipeInputs(input: {
  recipeId: string;
  inputs?: Record<string, unknown> | null;
  sourceText?: string | null;
}): GeometryIntentParseResult {
  if (!isConstructionRecipeId(input.recipeId)) {
    throw new Error(`Unknown construction recipe: ${input.recipeId}`);
  }
  const recipe = getConstructionRecipe(input.recipeId);
  if (!recipe) {
    throw new Error(`Unknown construction recipe: ${input.recipeId}`);
  }
  const explicitInputs = cleanInputRecord(input.inputs);
  const parsedInputs = parseConstructionRecipeInputs(input.recipeId, input.sourceText ?? "");
  const inputs = {
    ...parsedInputs,
    ...explicitInputs
  };
  const extractedFields = Object.keys(parsedInputs).filter((field) => !(field in explicitInputs) && inputs[field] !== undefined);
  const missingRequiredInputs = recipe.inputSpecs.filter((spec) => spec.required && inputs[spec.name] === undefined).map((spec) => spec.name);
  return {
    recipeId: input.recipeId,
    inputs,
    extractedFields,
    missingRequiredInputs
  };
}

export function parseConstructionRecipeInputs(recipeId: ConstructionRecipeId, sourceText: string): Record<string, unknown> {
  if (!sourceText.trim()) return {};
  if (recipeId === "function.parabola.vertex") {
    const expression = firstFunctionExpression(sourceText);
    return expression ? { expression } : {};
  }
  if (recipeId === "function.intersections") {
    const expressions = functionExpressions(sourceText);
    if (expressions.length >= 2) {
      return {
        leftExpression: expressions[0],
        rightExpression: expressions[1]
      };
    }
    return {};
  }
  if (recipeId === "conic.ellipse.foci-point") {
    const points = coordinatePairs(sourceText);
    if (points.length >= 3) {
      return {
        focusA: points[0],
        focusB: points[1],
        point: points[2]
      };
    }
    return {};
  }
  return {};
}

function cleanInputRecord(value: Record<string, unknown> | null | undefined) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return Object.fromEntries(Object.entries(value).filter(([, item]) => item !== undefined && item !== null && item !== ""));
}

function firstFunctionExpression(sourceText: string) {
  return functionExpressions(sourceText)[0];
}

function functionExpressions(sourceText: string) {
  const expressions: string[] = [];
  const patterns = [
    /(?:y|[a-zA-Z]\s*\(\s*x\s*\))\s*=\s*(.+?)(?=(?:\s*(?:和|与|及)\s*(?:y|[a-zA-Z]\s*\(\s*x\s*\))\s*=)|[,，。；;\n]|$)/g,
    /(?:函数|曲线)\s*([^,，。；;\n]*?x[^,，。；;\n]*)/g
  ];
  for (const pattern of patterns) {
    for (const match of sourceText.matchAll(pattern)) {
      const expression = normalizeExpression(match[1]);
      if (expression && !expressions.includes(expression)) expressions.push(expression);
    }
  }
  return expressions;
}

function coordinatePairs(sourceText: string): Array<[number, number]> {
  const points: Array<[number, number]> = [];
  const patterns = [
    /\(\s*([+-]?\d+(?:\.\d+)?)\s*[,，]\s*([+-]?\d+(?:\.\d+)?)\s*\)/g,
    /（\s*([+-]?\d+(?:\.\d+)?)\s*[,，]\s*([+-]?\d+(?:\.\d+)?)\s*）/g
  ];
  for (const pattern of patterns) {
    for (const match of sourceText.matchAll(pattern)) {
      points.push([Number(match[1]), Number(match[2])]);
    }
  }
  return points;
}

function normalizeExpression(value: string | undefined) {
  if (!value) return undefined;
  const expression = value
    .trim()
    .replace(/\s*(?:的)?(?:交点|图像|曲线|函数|顶点|焦点|椭圆|抛物线).*$/g, "")
    .replace(/[。；;，,]+$/g, "")
    .replace(/\s+/g, " ")
    .replace(/\^2\b/g, "^2");
  return expression || undefined;
}
