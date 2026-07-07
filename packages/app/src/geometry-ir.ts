export type GeometryTaskType = "construct" | "solve" | "explain" | "animate" | "verify";

export type GeometryObjectKind = "point" | "line" | "segment" | "circle" | "conic" | "function" | "slider" | "intersection" | "label";
export type GeometryConicSubtype = "ellipse" | "parabola" | "hyperbola" | "circle";

export type GeometryObjectSpec = {
  id: string;
  kind: GeometryObjectKind;
  label?: string;
  role?: string;
  value?: unknown;
  subtype?: GeometryConicSubtype;
  expression?: string;
  dependsOn?: string[];
};

export type GeometryConstraint =
  | { kind: "object_exists"; object: string }
  | { kind: "object_type"; object: string; expected: GeometryObjectKind | GeometryConicSubtype }
  | { kind: "point_on"; point: string; object: string }
  | { kind: "focus"; object: string; focus: string }
  | { kind: "intersects"; output: string; left: string; right: string }
  | { kind: "vertex_of"; point: string; object: string };

export type ConstructionStep =
  | { id: string; kind: "create_point"; output: string; coordinates: [number, number]; label?: string }
  | { id: string; kind: "create_function_graph"; output: string; expression: string; label?: string }
  | { id: string; kind: "create_intersection"; output: string; left: string; right: string; label?: string }
  | { id: string; kind: "create_ellipse_from_foci_and_point"; output: string; focusA: string; focusB: string; point: string; label?: string }
  | { id: string; kind: "mark_parabola_vertex"; output: string; parabola: string; label?: string }
  | { id: string; kind: "set_caption"; object: string; caption: string };

export type VerificationTarget =
  | { kind: "object_exists"; object: string }
  | { kind: "object_type"; object: string; expected: GeometryObjectKind | GeometryConicSubtype }
  | { kind: "point_on"; point: string; object: string; tolerance?: number }
  | { kind: "dependency"; object: string; dependsOn: string[] }
  | { kind: "relation"; description: string; objects: string[] };

export type GeometryPlan = {
  planId: string;
  title: string;
  taskType: GeometryTaskType;
  objects: GeometryObjectSpec[];
  constraints: GeometryConstraint[];
  steps: ConstructionStep[];
  verificationTargets: VerificationTarget[];
  explanationGoals: string[];
};

export function createGeometryPlan(input: GeometryPlan): GeometryPlan {
  return input;
}

export function geometryPlanObjectIds(plan: Pick<GeometryPlan, "objects">) {
  return plan.objects.map((object) => object.id);
}

export function isGeometryPlan(value: unknown): value is GeometryPlan {
  if (!value || typeof value !== "object") return false;
  const payload = value as Record<string, unknown>;
  if (!isNonEmptyString(payload.planId)) return false;
  if (!isNonEmptyString(payload.title)) return false;
  if (!isGeometryTaskType(payload.taskType)) return false;
  if (!Array.isArray(payload.objects) || !payload.objects.every(isGeometryObjectSpec)) return false;
  if (!Array.isArray(payload.constraints) || !payload.constraints.every(isGeometryConstraint)) return false;
  if (!Array.isArray(payload.steps) || !payload.steps.every(isConstructionStep)) return false;
  if (!Array.isArray(payload.verificationTargets) || !payload.verificationTargets.every(isVerificationTarget)) return false;
  if (!Array.isArray(payload.explanationGoals) || !payload.explanationGoals.every(isNonEmptyString)) return false;
  const objectIds = new Set(payload.objects.map((object) => object.id));
  if (objectIds.size !== payload.objects.length) return false;
  if (!payload.steps.every((step) => constructionStepReferencesKnownObjects(step, objectIds))) return false;
  if (!payload.constraints.every((constraint) => geometryConstraintReferencesKnownObjects(constraint, objectIds))) return false;
  if (!payload.verificationTargets.every((target) => verificationTargetReferencesKnownObjects(target, objectIds))) return false;
  return true;
}

function isGeometryTaskType(value: unknown): value is GeometryTaskType {
  return typeof value === "string" && ["construct", "solve", "explain", "animate", "verify"].includes(value);
}

function isGeometryObjectKind(value: unknown): value is GeometryObjectKind {
  return typeof value === "string" && ["point", "line", "segment", "circle", "conic", "function", "slider", "intersection", "label"].includes(value);
}

function isGeometryConicSubtype(value: unknown): value is GeometryConicSubtype {
  return typeof value === "string" && ["ellipse", "parabola", "hyperbola", "circle"].includes(value);
}

function isGeometryObjectSpec(value: unknown): value is GeometryObjectSpec {
  if (!value || typeof value !== "object") return false;
  const payload = value as Record<string, unknown>;
  return (
    isGeometryIdentifier(payload.id) &&
    isGeometryObjectKind(payload.kind) &&
    isOptionalNonEmptyString(payload.label) &&
    isOptionalNonEmptyString(payload.role) &&
    (payload.subtype === undefined || isGeometryConicSubtype(payload.subtype)) &&
    isOptionalNonEmptyString(payload.expression) &&
    (payload.dependsOn === undefined || (Array.isArray(payload.dependsOn) && payload.dependsOn.every(isGeometryIdentifier)))
  );
}

function isGeometryConstraint(value: unknown): value is GeometryConstraint {
  if (!value || typeof value !== "object") return false;
  const payload = value as Record<string, unknown>;
  if (payload.kind === "object_exists") return isGeometryIdentifier(payload.object);
  if (payload.kind === "object_type") return isGeometryIdentifier(payload.object) && (isGeometryObjectKind(payload.expected) || isGeometryConicSubtype(payload.expected));
  if (payload.kind === "point_on") return isGeometryIdentifier(payload.point) && isGeometryIdentifier(payload.object);
  if (payload.kind === "focus") return isGeometryIdentifier(payload.object) && isGeometryIdentifier(payload.focus);
  if (payload.kind === "intersects") return isGeometryIdentifier(payload.output) && isGeometryIdentifier(payload.left) && isGeometryIdentifier(payload.right);
  if (payload.kind === "vertex_of") return isGeometryIdentifier(payload.point) && isGeometryIdentifier(payload.object);
  return false;
}

function isConstructionStep(value: unknown): value is ConstructionStep {
  if (!value || typeof value !== "object") return false;
  const payload = value as Record<string, unknown>;
  if (!isNonEmptyString(payload.id)) return false;
  if (payload.kind === "create_point") return isGeometryIdentifier(payload.output) && isCoordinatePair(payload.coordinates) && isOptionalNonEmptyString(payload.label);
  if (payload.kind === "create_function_graph") return isGeometryIdentifier(payload.output) && isNonEmptyString(payload.expression) && isOptionalNonEmptyString(payload.label);
  if (payload.kind === "create_intersection") return isGeometryIdentifier(payload.output) && isGeometryIdentifier(payload.left) && isGeometryIdentifier(payload.right) && isOptionalNonEmptyString(payload.label);
  if (payload.kind === "create_ellipse_from_foci_and_point") {
    return isGeometryIdentifier(payload.output) && isGeometryIdentifier(payload.focusA) && isGeometryIdentifier(payload.focusB) && isGeometryIdentifier(payload.point) && isOptionalNonEmptyString(payload.label);
  }
  if (payload.kind === "mark_parabola_vertex") return isGeometryIdentifier(payload.output) && isGeometryIdentifier(payload.parabola) && isOptionalNonEmptyString(payload.label);
  if (payload.kind === "set_caption") return isGeometryIdentifier(payload.object) && isNonEmptyString(payload.caption);
  return false;
}

function isVerificationTarget(value: unknown): value is VerificationTarget {
  if (!value || typeof value !== "object") return false;
  const payload = value as Record<string, unknown>;
  if (payload.kind === "object_exists") return isGeometryIdentifier(payload.object);
  if (payload.kind === "object_type") return isGeometryIdentifier(payload.object) && (isGeometryObjectKind(payload.expected) || isGeometryConicSubtype(payload.expected));
  if (payload.kind === "point_on") return isGeometryIdentifier(payload.point) && isGeometryIdentifier(payload.object) && isOptionalNonNegativeNumber(payload.tolerance);
  if (payload.kind === "dependency") return isGeometryIdentifier(payload.object) && Array.isArray(payload.dependsOn) && payload.dependsOn.every(isGeometryIdentifier);
  if (payload.kind === "relation") return isNonEmptyString(payload.description) && Array.isArray(payload.objects) && payload.objects.every(isGeometryIdentifier);
  return false;
}

function constructionStepReferencesKnownObjects(step: ConstructionStep, objectIds: Set<string>) {
  if (!objectIds.has("output" in step ? step.output : step.object)) return false;
  if (step.kind === "create_intersection") return objectIds.has(step.left) && objectIds.has(step.right);
  if (step.kind === "create_ellipse_from_foci_and_point") return objectIds.has(step.focusA) && objectIds.has(step.focusB) && objectIds.has(step.point);
  if (step.kind === "mark_parabola_vertex") return objectIds.has(step.parabola);
  return true;
}

function geometryConstraintReferencesKnownObjects(constraint: GeometryConstraint, objectIds: Set<string>) {
  if (constraint.kind === "object_exists" || constraint.kind === "object_type") return objectIds.has(constraint.object);
  if (constraint.kind === "point_on") return objectIds.has(constraint.point) && objectIds.has(constraint.object);
  if (constraint.kind === "focus") return objectIds.has(constraint.object) && objectIds.has(constraint.focus);
  if (constraint.kind === "intersects") return objectIds.has(constraint.output) && objectIds.has(constraint.left) && objectIds.has(constraint.right);
  if (constraint.kind === "vertex_of") return objectIds.has(constraint.point) && objectIds.has(constraint.object);
  return false;
}

function verificationTargetReferencesKnownObjects(target: VerificationTarget, objectIds: Set<string>) {
  if (target.kind === "object_exists" || target.kind === "object_type") return objectIds.has(target.object);
  if (target.kind === "point_on") return objectIds.has(target.point) && objectIds.has(target.object);
  if (target.kind === "dependency") return objectIds.has(target.object) && target.dependsOn.every((item) => objectIds.has(item));
  if (target.kind === "relation") return target.objects.every((item) => objectIds.has(item));
  return false;
}

export function isGeometryIdentifier(value: unknown): value is string {
  return typeof value === "string" && /^[A-Za-z][A-Za-z0-9_]*$/.test(value);
}

function isCoordinatePair(value: unknown): value is [number, number] {
  return Array.isArray(value) && value.length === 2 && value.every((item) => typeof item === "number" && Number.isFinite(item));
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function isOptionalNonEmptyString(value: unknown) {
  return value === undefined || isNonEmptyString(value);
}

function isOptionalNonNegativeNumber(value: unknown) {
  return value === undefined || (typeof value === "number" && Number.isFinite(value) && value >= 0);
}
