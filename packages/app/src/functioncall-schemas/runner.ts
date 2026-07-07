import { auditProperties } from "./shared";
import type { FunctionCallInputJsonSchema } from "./types";

export const RUNNER_FUNCTION_CALL_INPUT_JSON_SCHEMAS = {
  setFinished: {
    type: "object",
    additionalProperties: false,
    required: ["summary"],
    properties: {
      summary: {
        type: "string",
        minLength: 1,
        description: "本轮已经完成时给用户展示的最终简短说明。只有画布构造、验证和必要说明都完成后才调用。"
      },
      ...auditProperties
    }
  }
} as const satisfies Record<"setFinished", FunctionCallInputJsonSchema>;
