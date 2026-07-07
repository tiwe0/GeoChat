import { auditProperties, blackboardCategoryValues } from "./shared";
import type { FunctionCallInputJsonSchema } from "./types";

export const MEMORY_FUNCTION_CALL_INPUT_JSON_SCHEMAS = {
  readBlackboard: {
    type: "object",
    additionalProperties: false,
    properties: {
      categories: {
        type: "array",
        nullable: true,
        items: { type: "string", enum: blackboardCategoryValues },
        description: "只读取这些黑板分类；省略时读取全部 active 条目。"
      },
      includeArchived: { type: "boolean", nullable: true, default: false },
      limit: { type: "number", nullable: true, minimum: 1, maximum: 30 },
      ...auditProperties
    }
  },
  patchBlackboard: {
    type: "object",
    additionalProperties: false,
    required: ["ops"],
    properties: {
      ops: {
        type: "array",
        minItems: 1,
        items: {
          type: "object",
          required: ["op", "key"],
          additionalProperties: false,
          properties: {
            op: { type: "string", enum: ["upsert", "archive"], description: "upsert 写入或更新条目；archive 软归档条目。不能硬删除。" },
            key: { type: "string", minLength: 1, description: "稳定 key，例如 original_problem、main_goal、cube_construction_plan、failed_lambda_attempt。" },
            category: { type: "string", nullable: true, enum: blackboardCategoryValues, description: "条目分类。upsert 必填；canvas_state 由系统维护，不要手写。" },
            value: { type: "string", nullable: true, description: "要保存的关键内容。upsert 必填；只保存后续推理/绘图需要的事实，不保存聊天摘要。" },
            confidence: { type: "number", nullable: true, minimum: 0, maximum: 1, description: "0 到 1 的置信度。" },
            reason: { type: "string", nullable: true, description: "为什么这个信息值得保存或归档。" },
            sourceMessageId: { type: "string", nullable: true },
            sourceToolCallId: { type: "string", nullable: true },
            sourceRunId: { type: "string", nullable: true }
          }
        },
        description: "黑板 patch 操作。每次只写真正重要的长期上下文，例如原题、已知条件、目标、数学结论、构造计划、失败尝试和教学要点。"
      },
      ...auditProperties
    }
  }
} as const satisfies Record<"readBlackboard" | "patchBlackboard", FunctionCallInputJsonSchema>;
