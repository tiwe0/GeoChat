import type { ExecuteGeoGebraCommandsArgs, FunctionCallLocale } from "./functioncalls";
import type { ConstructionStep, GeometryObjectSpec, GeometryPlan } from "./geometry-ir";

export type GeoGebraCompilation = {
  commands: string[];
  warnings: string[];
};

export function compileGeometryPlanToGeoGebra(plan: GeometryPlan): GeoGebraCompilation {
  const warnings: string[] = [];
  const commands = plan.steps.flatMap((step) => compileConstructionStep(step, warnings));
  commands.push(...compilePresentationCommands(plan, commands));
  return { commands, warnings };
}

export function compileGeometryPlanToExecuteArgs(plan: GeometryPlan, locale?: FunctionCallLocale | null): ExecuteGeoGebraCommandsArgs {
  const compilation = compileGeometryPlanToGeoGebra(plan);
  const english = locale === "en-US";
  return {
    commands: compilation.commands,
    restoreOnError: true,
    reason: english ? `Execute construction plan: ${plan.title}` : `执行构造计划：${plan.title}`,
    intendedOutcome:
      plan.verificationTargets.map((target) => verificationTargetSummary(target, locale)).join(english ? "; " : "；") ||
      (english ? "Complete the GeoGebra construction plan." : "完成 GeoGebra 构造计划。"),
    nextExpectedAction: "getCanvasContext"
  };
}

function compileConstructionStep(step: ConstructionStep, warnings: string[]) {
  if (step.kind === "create_point") {
    return [`${step.output} = (${formatNumber(step.coordinates[0])}, ${formatNumber(step.coordinates[1])})`, ...captionCommands(step.output, step.label)];
  }
  if (step.kind === "create_function_graph") {
    return [`${step.output}(x) = ${step.expression}`, ...captionCommands(step.output, step.label)];
  }
  if (step.kind === "create_intersection") {
    return [`${step.output} = Intersect(${step.left}, ${step.right})`, ...captionCommands(step.output, step.label)];
  }
  if (step.kind === "create_ellipse_from_foci_and_point") {
    return [`${step.output} = Ellipse(${step.focusA}, ${step.focusB}, ${step.point})`, ...captionCommands(step.output, step.label)];
  }
  if (step.kind === "mark_parabola_vertex") {
    warnings.push("Parabola vertex compilation uses Extremum; non-polynomial inputs may need a recipe-specific verifier.");
    return [`${step.output} = Extremum(${step.parabola})`, ...captionCommands(step.output, step.label)];
  }
  if (step.kind === "set_caption") {
    return captionCommands(step.object, step.caption);
  }
  return [];
}

function captionCommands(objectName: string, caption: string | undefined) {
  return caption ? [`SetCaption(${objectName}, "${escapeGeoGebraString(caption)}")`, `ShowLabel(${objectName}, true)`] : [];
}

function compilePresentationCommands(plan: GeometryPlan, existingCommands: string[]) {
  const existing = new Set(existingCommands);
  const commands: string[] = [];
  for (const object of plan.objects) {
    for (const command of presentationCommandsForObject(object)) {
      if (existing.has(command)) continue;
      existing.add(command);
      commands.push(command);
    }
  }
  return commands;
}

function presentationCommandsForObject(object: GeometryObjectSpec) {
  const commands: string[] = [];
  if (object.label) {
    commands.push(`SetCaption(${object.id}, "${escapeGeoGebraString(object.label)}")`);
    commands.push(`ShowLabel(${object.id}, true)`);
  }
  if (object.kind === "point") {
    commands.push(`ShowLabel(${object.id}, true)`);
  }
  return commands;
}

function formatNumber(value: number) {
  return Number.isInteger(value) ? String(value) : String(Number(value.toFixed(8)));
}

function escapeGeoGebraString(value: string) {
  return value.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

function verificationTargetSummary(target: GeometryPlan["verificationTargets"][number], locale?: FunctionCallLocale | null) {
  if (locale === "en-US") {
    if (target.kind === "object_exists") return `Confirm ${target.object} was created`;
    if (target.kind === "object_type") return `Confirm ${target.object} has type ${target.expected}`;
    if (target.kind === "dependency") return `Confirm ${target.object} depends on ${target.dependsOn.join(", ")}`;
    if (target.kind === "point_on") return `Confirm ${target.point} lies on ${target.object}`;
    return target.description;
  }
  if (target.kind === "object_exists") return `确认 ${target.object} 已创建`;
  if (target.kind === "object_type") return `确认 ${target.object} 类型为 ${target.expected}`;
  if (target.kind === "dependency") return `确认 ${target.object} 依赖 ${target.dependsOn.join(", ")}`;
  if (target.kind === "point_on") return `确认 ${target.point} 在 ${target.object} 上`;
  return target.description;
}
