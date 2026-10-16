// Validate the deliberately small JSON Schema subset used by this plugin.
// Raw DSH ToolDefinition does not validate arguments on our behalf.
export interface InputSchema extends Record<string, unknown> {
  type: string;
  properties?: Record<string, InputSchema>;
  required?: readonly string[];
  additionalProperties?: boolean;
  items?: InputSchema;
  enum?: readonly unknown[];
  minLength?: number;
  maxLength?: number;
  minItems?: number;
  maxItems?: number;
  minimum?: number;
  maximum?: number;
}

export function validateInput(value: unknown, schema: InputSchema, path = "arguments"): void {
  const invalid = () => {
    throw new Error(`Invalid GeoChat ${path}.`);
  };
  if (schema.type === "object") {
    if (value === null || typeof value !== "object" || Array.isArray(value)) return invalid();
    const input = value as Record<string, unknown>;
    for (const key of schema.required ?? []) if (!Object.hasOwn(input, key)) invalid();
    for (const key of Object.keys(input)) {
      const child = Object.hasOwn(schema.properties ?? {}, key) ? schema.properties?.[key] : undefined;
      if (!child) {
        if (schema.additionalProperties === false) invalid();
      } else validateInput(input[key], child, `${path}.${key}`);
    }
  } else if (schema.type === "array") {
    if (!Array.isArray(value) || value.length < (schema.minItems ?? 0) || value.length > (schema.maxItems ?? Infinity))
      return invalid();
    for (const item of value) if (schema.items) validateInput(item, schema.items, `${path}[]`);
  } else if (schema.type === "string") {
    if (
      typeof value !== "string" ||
      value.length < (schema.minLength ?? 0) ||
      value.length > (schema.maxLength ?? Infinity)
    )
      invalid();
  } else if (schema.type === "number" || schema.type === "integer") {
    if (
      typeof value !== "number" ||
      !Number.isFinite(value) ||
      (schema.type === "integer" && !Number.isInteger(value)) ||
      value < (schema.minimum ?? -Infinity) ||
      value > (schema.maximum ?? Infinity)
    )
      invalid();
  } else if (schema.type === "boolean") {
    if (typeof value !== "boolean") invalid();
  } else invalid();
  if (schema.enum && !schema.enum.includes(value)) invalid();
}
