import { auditProperties } from "./shared";
import type { FunctionCallInputJsonSchema } from "./types";

export const SKILL_FUNCTION_CALL_INPUT_JSON_SCHEMAS = {
  listSkills: {
    type: "object",
    additionalProperties: false,
    properties: {
      category: { type: "string", nullable: true, description: "可选。只列出某个技能分类，例如 high-school-solid-geometry。" },
      source: { type: "string", nullable: true, enum: ["built-in", "local", "remote"], description: "可选。按技能来源过滤。" },
      limit: { type: "number", nullable: true, minimum: 1, maximum: 80, description: "最多返回多少个技能摘要。" },
      ...auditProperties
    }
  },
  searchSkills: {
    type: "object",
    additionalProperties: false,
    required: ["query"],
    properties: {
      query: { type: "string", minLength: 1, description: "技能检索关键词，可来自题目主题、数学领域、构造目标或解释目标。" },
      category: { type: "string", nullable: true, description: "可选。优先限定到某个技能分类。" },
      tags: { type: "array", nullable: true, items: { type: "string" }, description: "可选。优先匹配这些技能标签。" },
      limit: { type: "number", nullable: true, minimum: 1, maximum: 20, description: "最多返回多少个匹配技能。" },
      ...auditProperties
    }
  },
  loadSkill: {
    type: "object",
    additionalProperties: false,
    required: ["name"],
    properties: {
      name: {
        type: "string",
        minLength: 1,
        description: "要加载的技能名称。必须来自 listSkills 或 searchSkills 返回的可用技能；不要传路径，也不要臆造不存在的技能名。"
      },
      ...auditProperties
    }
  },
  activateSkill: {
    type: "object",
    additionalProperties: false,
    required: ["name"],
    properties: {
      name: {
        type: "string",
        minLength: 1,
        description: "要激活的技能名称。必须来自系统提示列出的可用技能，技能可来自内置、本地目录或远程缓存；不要传路径，也不要臆造不存在的技能名。"
      },
      ...auditProperties
    }
  }
} as const satisfies Record<"listSkills" | "searchSkills" | "loadSkill" | "activateSkill", FunctionCallInputJsonSchema>;
