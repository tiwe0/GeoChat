import { formatNumber } from "./formatting";
import type { AdvancedDrawingExpressionEvaluation, AdvancedDrawingToolName } from "./types";
import { identifierValue, isRecord } from "./validation";

export function angleExpression(value: unknown, fallbackExpression: string, macroName: AdvancedDrawingToolName, fieldName: string) {
  const tagged = geogebraExpressionArg(value, macroName, fieldName);
  if (tagged) return tagged;
  const objectRef = objectReferenceArg(value, macroName, fieldName);
  if (objectRef) return { expression: objectRef.name, evaluation: "dynamic" as const };
  if (typeof value === "number" && Number.isFinite(value)) {
    return { expression: `${formatNumber(value)}°`, evaluation: "literal" as const };
  }
  if (value != null) throw new Error(`${macroName}.${fieldName} must be a finite number, object_ref, or ggb_expr.`);
  return { expression: fallbackExpression, evaluation: "literal" as const };
}

function geogebraExpressionArg(value: unknown, macroName: AdvancedDrawingToolName, fieldName: string): { expression: string; evaluation: AdvancedDrawingExpressionEvaluation } | null {
  if (!isRecord(value) || value.kind !== "ggb_expr") return null;
  const expr = sanitizeGeoGebraExpression(value.expr);
  if (!expr) throw new Error(`${macroName}.${fieldName}.expr must be a non-empty single GeoGebra expression.`);
  if (value.evaluation != null && value.evaluation !== "snapshot" && value.evaluation !== "dynamic") {
    throw new Error(`${macroName}.${fieldName}.evaluation must be dynamic or snapshot.`);
  }
  const evaluation = value.evaluation === "snapshot" ? "snapshot" : "dynamic";
  return {
    expression: evaluation === "snapshot" ? `CopyFreeObject(${expr})` : expr,
    evaluation
  };
}

function objectReferenceArg(value: unknown, macroName: AdvancedDrawingToolName, fieldName: string): { name: string } | null {
  if (!isRecord(value) || value.kind !== "object_ref") return null;
  return { name: identifierValue(value.name, "", macroName, `${fieldName}.name`) };
}

function sanitizeGeoGebraExpression(value: unknown) {
  if (typeof value !== "string") return "";
  const trimmed = value.trim().slice(0, 160);
  if (!trimmed) return "";
  if (/[;\n\r]/.test(trimmed)) return "";
  return trimmed;
}
