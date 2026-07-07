import type { GeometryPlan, VerificationTarget } from "./geometry-ir";
import { isGeometryPlan } from "./geometry-ir";
import type { AgentRunToolRecord } from "./run-ledger";

export type GeometryVerificationStatus = "passed" | "failed" | "unknown";

export type GeometryVerificationResult = {
  target: VerificationTarget;
  status: GeometryVerificationStatus;
  message: string;
};

export type GeometryVerificationReport = {
  passed: boolean;
  results: GeometryVerificationResult[];
};

type CanvasObjectLike = {
  id?: unknown;
  name?: unknown;
  label?: unknown;
  type?: unknown;
  kind?: unknown;
  subtype?: unknown;
  dependsOn?: unknown;
  definition?: unknown;
};

export function verifyGeometryPlanAgainstCanvas(plan: GeometryPlan, canvasContext: unknown): GeometryVerificationReport {
  const objects = canvasObjectsByName(canvasContext);
  const results = plan.verificationTargets.map((target) => verifyTarget(target, objects));
  return {
    passed: results.every((result) => result.status === "passed"),
    results
  };
}

export function geometryPlanFromToolResult(value: unknown): GeometryPlan | undefined {
  if (!value || typeof value !== "object") return undefined;
  const payload = value as Record<string, unknown>;
  const directPlan = payload.plan;
  if (isGeometryPlan(directPlan)) return directPlan;
  const nestedResult = payload.result;
  if (nestedResult && typeof nestedResult === "object" && isGeometryPlan((nestedResult as Record<string, unknown>).plan)) {
    return (nestedResult as Record<string, unknown>).plan as GeometryPlan;
  }
  return undefined;
}

export function verifyGeometryPlanToolResultAgainstCanvas(toolResult: unknown, canvasContext: unknown): GeometryVerificationReport | undefined {
  const plan = geometryPlanFromToolResult(toolResult);
  return plan ? verifyGeometryPlanAgainstCanvas(plan, canvasContext) : undefined;
}

export function enrichCanvasReadToolWithGeometryVerification(
  priorTools: readonly AgentRunToolRecord[],
  tool: AgentRunToolRecord
): AgentRunToolRecord {
  if (tool.toolName !== "getCanvasContext" || tool.status !== "succeeded") return tool;
  const canvasContext = canvasContextFromToolRecord(tool);
  if (canvasContext === undefined) return tool;
  const planTool = latestGeometryPlanToolBefore(priorTools, tool);
  if (!planTool) return tool;
  const report = verifyGeometryPlanToolResultAgainstCanvas(planTool.result, canvasContext);
  if (!report) return tool;
  return {
    ...tool,
    result: attachGeometryVerificationToToolResult(tool.result, report)
  };
}

export function geometryVerificationReportFromToolResult(value: unknown): GeometryVerificationReport | undefined {
  if (!value || typeof value !== "object") return undefined;
  const payload = value as Record<string, unknown>;
  const direct = payload.geometryVerification;
  if (isGeometryVerificationReport(direct)) return direct;
  const clientMeta = payload.clientMeta;
  if (clientMeta && typeof clientMeta === "object" && isGeometryVerificationReport((clientMeta as Record<string, unknown>).geometryVerification)) {
    return (clientMeta as Record<string, unknown>).geometryVerification as GeometryVerificationReport;
  }
  return undefined;
}

function latestGeometryPlanToolBefore(priorTools: readonly AgentRunToolRecord[], tool: AgentRunToolRecord) {
  const currentTimestamp = timestampForTool(tool);
  return [...priorTools]
    .filter(
      (item) =>
        item.toolName === "createGeometryPlan" &&
        item.status === "succeeded" &&
        timestampForTool(item) <= currentTimestamp &&
        Boolean(geometryPlanFromToolResult(item.result))
    )
    .sort((left, right) => timestampForTool(right) - timestampForTool(left))[0];
}

function canvasContextFromToolRecord(tool: AgentRunToolRecord) {
  if (tool.canvasAfter !== undefined) return tool.canvasAfter;
  const result = tool.result;
  if (result && typeof result === "object" && "canvasContext" in result) return (result as { canvasContext?: unknown }).canvasContext;
  if (result && typeof result === "object" && "result" in result) {
    const nested = (result as { result?: unknown }).result;
    if (nested && typeof nested === "object" && "canvasContext" in nested) return (nested as { canvasContext?: unknown }).canvasContext;
  }
  return undefined;
}

function attachGeometryVerificationToToolResult(toolResult: unknown, report: GeometryVerificationReport) {
  if (!toolResult || typeof toolResult !== "object" || Array.isArray(toolResult)) {
    return {
      result: toolResult ?? null,
      geometryVerification: report,
      clientMeta: {
        geometryVerification: report
      }
    };
  }
  const payload = toolResult as Record<string, unknown>;
  const clientMeta = payload.clientMeta && typeof payload.clientMeta === "object" && !Array.isArray(payload.clientMeta) ? payload.clientMeta as Record<string, unknown> : {};
  return {
    ...payload,
    geometryVerification: report,
    clientMeta: {
      ...clientMeta,
      geometryVerification: report
    }
  };
}

function verifyTarget(target: VerificationTarget, objects: Map<string, CanvasObjectLike>): GeometryVerificationResult {
  if (target.kind === "object_exists") {
    return objects.has(target.object)
      ? passed(target, `${target.object} exists on the canvas.`)
      : failed(target, `${target.object} is missing from the canvas.`);
  }
  if (target.kind === "object_type") {
    const object = objects.get(target.object);
    if (!object) return failed(target, `${target.object} is missing from the canvas.`);
    const actual = stringValue(object.subtype) ?? stringValue(object.kind) ?? stringValue(object.type);
    if (!actual) return unknown(target, `${target.object} exists, but its canvas type is unavailable.`);
    return actual.toLowerCase().includes(target.expected.toLowerCase())
      ? passed(target, `${target.object} has expected type ${target.expected}.`)
      : failed(target, `${target.object} type is ${actual}, expected ${target.expected}.`);
  }
  if (target.kind === "dependency") {
    const object = objects.get(target.object);
    if (!object) return failed(target, `${target.object} is missing from the canvas.`);
    const dependsOn = dependencyList(object);
    if (!dependsOn.length) return unknown(target, `${target.object} exists, but dependency metadata is unavailable.`);
    const missing = target.dependsOn.filter((item) => !dependsOn.includes(item));
    return missing.length
      ? failed(target, `${target.object} does not report dependencies: ${missing.join(", ")}.`)
      : passed(target, `${target.object} depends on ${target.dependsOn.join(", ")}.`);
  }
  if (target.kind === "point_on") {
    const point = objects.get(target.point);
    const object = objects.get(target.object);
    if (!point || !object) return failed(target, `${target.point} or ${target.object} is missing from the canvas.`);
    return unknown(target, `Canvas context does not expose a numeric point-on relation check for ${target.point} and ${target.object}.`);
  }
  const missing = target.objects.filter((objectName) => !objects.has(objectName));
  return missing.length ? failed(target, `Missing relation objects: ${missing.join(", ")}.`) : unknown(target, target.description);
}

function canvasObjectsByName(canvasContext: unknown) {
  const map = new Map<string, CanvasObjectLike>();
  for (const object of extractCanvasObjects(canvasContext)) {
    const name = stringValue(object.name) ?? stringValue(object.id) ?? stringValue(object.label);
    if (name) map.set(name, object);
  }
  return map;
}

function extractCanvasObjects(value: unknown): CanvasObjectLike[] {
  if (!value || typeof value !== "object") return [];
  const payload = value as Record<string, unknown>;
  const candidates = [payload.objects, payload.elements, payload.items];
  for (const candidate of candidates) {
    if (Array.isArray(candidate)) return candidate.filter((item): item is CanvasObjectLike => Boolean(item && typeof item === "object"));
  }
  return canvasObjectsFromObjectIndex(payload);
}

function canvasObjectsFromObjectIndex(payload: Record<string, unknown>): CanvasObjectLike[] {
  if (!payload.object_index || typeof payload.object_index !== "object") return [];
  const objects: CanvasObjectLike[] = [];
  const seen = new Set<string>();
  for (const [type, labels] of Object.entries(payload.object_index as Record<string, unknown>)) {
    if (!Array.isArray(labels)) continue;
    for (const label of labels) {
      if (typeof label !== "string" || label.length === 0 || seen.has(label)) continue;
      seen.add(label);
      objects.push({ name: label, label, type });
    }
  }
  if (Array.isArray(payload.expressions)) {
    for (const label of payload.expressions) {
      if (typeof label !== "string" || label.length === 0 || seen.has(label)) continue;
      seen.add(label);
      objects.push({ name: label, label, type: "expression" });
    }
  }
  return objects;
}

function dependencyList(object: CanvasObjectLike) {
  if (Array.isArray(object.dependsOn)) return object.dependsOn.filter((item): item is string => typeof item === "string" && item.length > 0);
  const definition = stringValue(object.definition);
  if (!definition) return [];
  return [...definition.matchAll(/\b[A-Za-z][A-Za-z0-9_]*\b/g)].map((match) => match[0]);
}

function isGeometryVerificationReport(value: unknown): value is GeometryVerificationReport {
  if (!value || typeof value !== "object") return false;
  const payload = value as Record<string, unknown>;
  return (
    typeof payload.passed === "boolean" &&
    Array.isArray(payload.results) &&
    payload.results.every((item) => {
      if (!item || typeof item !== "object") return false;
      const result = item as Record<string, unknown>;
      return (
        (result.status === "passed" || result.status === "failed" || result.status === "unknown") &&
        typeof result.message === "string" &&
        result.target !== undefined
      );
    })
  );
}

function timestampForTool(tool: AgentRunToolRecord) {
  return new Date(tool.completedAt ?? tool.startedAt).getTime();
}

function stringValue(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function passed(target: VerificationTarget, message: string): GeometryVerificationResult {
  return { target, status: "passed", message };
}

function failed(target: VerificationTarget, message: string): GeometryVerificationResult {
  return { target, status: "failed", message };
}

function unknown(target: VerificationTarget, message: string): GeometryVerificationResult {
  return { target, status: "unknown", message };
}
