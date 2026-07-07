import type { FunctionCallToolName } from "../functioncall-types";

export type JsonSchemaProperty = {
  type: "string" | "number" | "boolean" | "array" | "object";
  nullable?: boolean;
  enum?: readonly string[];
  minLength?: number;
  minimum?: number;
  maximum?: number;
  minItems?: number;
  default?: unknown;
  description?: string;
  items?: JsonSchemaProperty;
  required?: string[];
  additionalProperties?: boolean;
  properties?: Record<string, JsonSchemaProperty>;
};

export type FunctionCallInputJsonSchema = {
  type: "object";
  additionalProperties: false;
  required?: string[];
  properties: Record<string, JsonSchemaProperty>;
};

export type FunctionCallInputJsonSchemaOptions = {
  requireReason?: boolean;
};

export type FunctionCallInputJsonSchemaMap = {
  [TToolName in FunctionCallToolName]: FunctionCallInputJsonSchema;
};
