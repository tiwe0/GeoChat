import type { CanvasObjectSummary, CanvasSummary } from "./geogebra-types";

function attr(tag: string, name: string): string | undefined {
  return (tag.match(new RegExp(`${name}=\\"([^\\"]+)\\"`)) || [])[1];
}

function canvasObjectSubtype(type: string, definition?: string) {
  if (type !== "conic" || !definition) return undefined;
  const command = definition.match(/^\s*([A-Za-z][A-Za-z0-9_]*)\s*\(/)?.[1]?.toLowerCase();
  if (command === "ellipse" || command === "parabola" || command === "hyperbola" || command === "circle") return command;
  return undefined;
}

export function canvasSummary(xml: string, selectedObjects: string[], includeXml = false): CanvasSummary {
  const elements = [...String(xml || "").matchAll(/<element\s+[^>]*>/g)]
    .map((match) => ({
      label: attr(match[0], "label"),
      type: attr(match[0], "type") || "unknown"
    }))
    .filter((item): item is { label: string; type: string } => Boolean(item.label));
  const expressionRecords = [...String(xml || "").matchAll(/<expression\s+[^>]*>/g)]
    .map((match) => ({
      label: attr(match[0], "label"),
      definition: attr(match[0], "exp")
    }))
    .filter((item): item is { label: string; definition: string | undefined } => Boolean(item.label));
  const expressions = expressionRecords.map((item) => item.label);
  const expressionByLabel = new Map(expressionRecords.map((item) => [item.label, item.definition] as const));
  const objects: CanvasObjectSummary[] = elements.map((item) => {
    const definition = expressionByLabel.get(item.label);
    const subtype = canvasObjectSubtype(item.type, definition);
    return {
      name: item.label,
      label: item.label,
      type: item.type,
      ...(subtype ? { subtype } : {}),
      ...(definition ? { definition } : {})
    };
  });
  const objectLabels = new Set(objects.map((item) => item.label));
  for (const expression of expressionRecords) {
    if (objectLabels.has(expression.label)) continue;
    objects.push({
      name: expression.label,
      label: expression.label,
      type: "expression",
      ...(expression.definition ? { definition: expression.definition } : {})
    });
  }
  const objectIndex = elements.reduce<Record<string, string[]>>((accumulator, item) => {
    (accumulator[item.type] ||= []).push(item.label);
    return accumulator;
  }, {});

  return {
    ready: true,
    element_count: elements.length,
    expression_count: expressions.length,
    selectedObjects: [...selectedObjects],
    objects,
    object_index: Object.fromEntries(Object.entries(objectIndex).sort(([left], [right]) => left.localeCompare(right))),
    expressions,
    source: "geogebra-applet",
    ...(includeXml ? { xml } : {})
  };
}

export function canvasToml(summary: CanvasSummary) {
  const lines = [
    "ready = true",
    `element_count = ${summary.element_count}`,
    `expression_count = ${summary.expression_count}`,
    `selected_objects = [${summary.selectedObjects.map((item) => JSON.stringify(item)).join(", ")}]`,
    "",
    "[object_index]"
  ];
  for (const [type, labels] of Object.entries(summary.object_index)) {
    lines.push(`${type} = [${labels.map((item) => JSON.stringify(item)).join(", ")}]`);
  }
  return lines.join("\n");
}

export function canvasObjectNames(canvasContext: unknown) {
  const names = new Set<string>();
  if (!canvasContext || typeof canvasContext !== "object") return names;
  const context = canvasContext as { object_index?: unknown; expressions?: unknown };
  if (context.object_index && typeof context.object_index === "object") {
    for (const labels of Object.values(context.object_index)) {
      if (!Array.isArray(labels)) continue;
      for (const label of labels) {
        if (typeof label === "string" && label) names.add(label);
      }
    }
  }
  if (Array.isArray(context.expressions)) {
    for (const label of context.expressions) {
      if (typeof label === "string" && label) names.add(label);
    }
  }
  return names;
}

export function canvasHasThreeDimensionalObjects(canvasContext: unknown) {
  if (!canvasContext || typeof canvasContext !== "object") return false;
  const context = canvasContext as { object_index?: unknown };
  if (!context.object_index || typeof context.object_index !== "object") return false;
  return Object.keys(context.object_index).some((type) => /3d|polyhedron|quadric|surface|plane/i.test(type));
}
