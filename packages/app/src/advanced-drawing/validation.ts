import type { AdvancedDrawingToolName } from "./types";
import { isAdvancedDrawingToolName } from "./types";

export function normalizedArgs(input: Record<string, unknown> | null | undefined, allowedKeys: readonly string[], macroName: AdvancedDrawingToolName): Record<string, unknown> {
  if (input == null) return {};
  if (!isRecord(input)) throw new Error(`${macroName} args must be an object.`);
  const allowed = new Set(allowedKeys);
  const unknownKeys = Object.keys(input).filter((key) => !allowed.has(key));
  if (unknownKeys.length) throw new Error(`${macroName} received unsupported argument(s): ${unknownKeys.join(", ")}.`);
  return input;
}

export function pointLabels(value: unknown, fallback = ["A", "B", "C", "D"], macroName: AdvancedDrawingToolName) {
  if (value == null) return fallback;
  if (isDefaultAlias(value)) return fallback;
  if (!Array.isArray(value) || value.length !== fallback.length) {
    throw new Error(`${macroName}.pointLabels must contain exactly ${fallback.length} labels.`);
  }
  const labels = value.map((item, index) => identifierValue(item, fallback[index], macroName, `pointLabels[${index}]`));
  const duplicates = labels.filter((label, index) => labels.indexOf(label) !== index);
  if (duplicates.length) throw new Error(`${macroName}.pointLabels must be unique.`);
  return labels;
}

export function assertNoNestedAdvancedDrawingCommands(value: unknown, path = "args") {
  if (Array.isArray(value)) {
    value.forEach((item, index) => assertNoNestedAdvancedDrawingCommands(item, `${path}[${index}]`));
    return;
  }
  if (!isRecord(value)) return;
  if (value.kind === "advanced_command") {
    throw new Error(`Advanced drawing commands cannot be nested at ${path}.`);
  }
  if (typeof value.name === "string" && isAdvancedDrawingToolName(value.name) && "args" in value) {
    throw new Error(`Advanced drawing commands cannot be nested at ${path}.`);
  }
  for (const [key, item] of Object.entries(value)) {
    assertNoNestedAdvancedDrawingCommands(item, `${path}.${key}`);
  }
}

export function pointCoordinatesWithFallback(
  value: unknown,
  fallback: [number, number, number][],
  macroName: AdvancedDrawingToolName,
  fieldName: string
): [number, number, number][] {
  if (value == null) return fallback;
  if (isDefaultAlias(value)) return fallback;
  const expressionCoordinates = coordinateListExpression(value, fallback.length, macroName, fieldName);
  if (expressionCoordinates) return expressionCoordinates;
  if (!Array.isArray(value) || value.length !== fallback.length) {
    throw new Error(`${macroName}.${fieldName} must contain exactly ${fallback.length} 3D points.`);
  }
  return value.map((candidate, pointIndex) => {
    if (!Array.isArray(candidate) || candidate.length !== 3) {
      throw new Error(`${macroName}.${fieldName}[${pointIndex}] must be a 3D coordinate tuple.`);
    }
    const parsed = candidate.map((item, coordinateIndex) => {
      if (typeof item !== "number" || !Number.isFinite(item)) {
        throw new Error(`${macroName}.${fieldName}[${pointIndex}][${coordinateIndex}] must be a finite number.`);
      }
      return item;
    });
    return parsed as [number, number, number];
  });
}

export function identifierValue(value: unknown, fallback: string, macroName: AdvancedDrawingToolName, fieldName: string) {
  if (value == null) {
    if (!fallback) throw new Error(`${macroName}.${fieldName} is required.`);
    return fallback;
  }
  if (typeof value !== "string" || !value.trim()) throw new Error(`${macroName}.${fieldName} must be a GeoGebra identifier.`);
  const trimmed = value.trim();
  if (trimmed.length > 32) throw new Error(`${macroName}.${fieldName} must be at most 32 characters.`);
  if (!/^[\p{L}_][\p{L}\p{N}_]*$/u.test(trimmed)) {
    throw new Error(`${macroName}.${fieldName} must be a GeoGebra identifier using letters, numbers, or underscore and must not start with a number.`);
  }
  return trimmed;
}

export function finiteNumber(value: unknown, fallback: number, macroName: AdvancedDrawingToolName, fieldName: string) {
  if (value == null) return fallback;
  if (typeof value !== "number" || !Number.isFinite(value)) throw new Error(`${macroName}.${fieldName} must be a finite number.`);
  return value;
}

export function positiveNumber(value: unknown, fallback: number, macroName: AdvancedDrawingToolName, fieldName: string) {
  const parsed = finiteNumber(value, fallback, macroName, fieldName);
  if (parsed <= 0) throw new Error(`${macroName}.${fieldName} must be positive.`);
  return parsed;
}

export function numberAtLeast(value: unknown, min: number, fallback: number, macroName: AdvancedDrawingToolName, fieldName: string) {
  const parsed = finiteNumber(value, fallback, macroName, fieldName);
  if (parsed < min) throw new Error(`${macroName}.${fieldName} must be at least ${min}.`);
  return parsed;
}

export function nonZeroNumber(value: unknown, fallback: number, macroName: AdvancedDrawingToolName, fieldName: string) {
  const parsed = finiteNumber(value, fallback, macroName, fieldName);
  if (Math.abs(parsed) <= 1e-10) throw new Error(`${macroName}.${fieldName} must be non-zero.`);
  return parsed;
}

export function integerBetween(value: unknown, min: number, max: number, fallback: number, macroName: AdvancedDrawingToolName, fieldName: string) {
  if (value == null) return fallback;
  if (typeof value !== "number" || !Number.isFinite(value) || !Number.isInteger(value)) {
    throw new Error(`${macroName}.${fieldName} must be an integer.`);
  }
  if (value < min || value > max) throw new Error(`${macroName}.${fieldName} must be between ${min} and ${max}.`);
  return value;
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isDefaultAlias(value: unknown) {
  if (typeof value !== "string") return false;
  return ["standard", "default", "auto"].includes(value.trim().toLowerCase());
}

function coordinateListExpression(
  value: unknown,
  expectedLength: number,
  macroName: AdvancedDrawingToolName,
  fieldName: string
): [number, number, number][] | undefined {
  if (!isRecord(value) || value.kind !== "ggb_expr") return undefined;
  if (value.evaluation != null && value.evaluation !== "snapshot") {
    throw new Error(`${macroName}.${fieldName}.evaluation must be snapshot for coordinate lists.`);
  }
  if (typeof value.expr !== "string") {
    throw new Error(`${macroName}.${fieldName}.expr must be a coordinate list expression.`);
  }
  const coordinates = parseCoordinateListExpression(value.expr);
  if (!coordinates || coordinates.length !== expectedLength) {
    throw new Error(`${macroName}.${fieldName} must contain exactly ${expectedLength} 3D points.`);
  }
  return coordinates.map((candidate, pointIndex) => {
    if (candidate.length !== 3) {
      throw new Error(`${macroName}.${fieldName}[${pointIndex}] must be a 3D coordinate tuple.`);
    }
    return candidate as [number, number, number];
  });
}

function parseCoordinateListExpression(expr: string): number[][] | undefined {
  const trimmed = expr.trim();
  if (!trimmed || /[;\n\r]/u.test(trimmed)) return undefined;
  const matches = [...trimmed.matchAll(/\(\s*([+-]?(?:\d+(?:\.\d+)?|\.\d+))\s*,\s*([+-]?(?:\d+(?:\.\d+)?|\.\d+))\s*,\s*([+-]?(?:\d+(?:\.\d+)?|\.\d+))\s*\)/gu)];
  if (!matches.length) return undefined;
  const withoutTuples = trimmed.replace(/\(\s*[+-]?(?:\d+(?:\.\d+)?|\.\d+)\s*,\s*[+-]?(?:\d+(?:\.\d+)?|\.\d+)\s*,\s*[+-]?(?:\d+(?:\.\d+)?|\.\d+)\s*\)/gu, "");
  if (!/^[\s,[\]]*$/u.test(withoutTuples)) return undefined;
  return matches.map((match) => [Number(match[1]), Number(match[2]), Number(match[3])]);
}
