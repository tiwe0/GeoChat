import {
  auditProperties,
  auxiliaryElementReviewDescriptionZh,
  choiceDisplayModeValues,
  choiceLabelValues,
  choiceVerdictValues
} from "./shared";
import type { FunctionCallInputJsonSchema } from "./types";

export const CARD_FUNCTION_CALL_INPUT_JSON_SCHEMAS = {
  showSolutionSteps: {
    type: "object",
    additionalProperties: false,
    required: ["title", "answer", "steps"],
    properties: {
      title: { type: "string" },
      answer: { type: "string" },
      summary: { type: "string", nullable: true },
      auxiliaryElementReview: { type: "string", nullable: true, description: auxiliaryElementReviewDescriptionZh },
      steps: {
        type: "array",
        items: {
          type: "object",
          required: ["label", "body"],
          additionalProperties: false,
          properties: {
            label: { type: "string" },
            body: { type: "string" }
          }
        }
      },
      ...auditProperties
    }
  },
  showTeachingHint: {
    type: "object",
    additionalProperties: false,
    required: ["title", "summary"],
    properties: {
      title: { type: "string" },
      summary: { type: "string" },
      items: { type: "array", nullable: true, items: { type: "string" } },
      auxiliaryElementReview: { type: "string", nullable: true, description: auxiliaryElementReviewDescriptionZh },
      ...auditProperties
    }
  },
  showAnimationGuide: {
    type: "object",
    additionalProperties: false,
    required: ["title", "summary"],
    properties: {
      title: { type: "string" },
      summary: { type: "string" },
      controls: { type: "array", nullable: true, items: { type: "string" } },
      observations: { type: "array", nullable: true, items: { type: "string" } },
      auxiliaryElementReview: { type: "string", nullable: true, description: auxiliaryElementReviewDescriptionZh },
      ...auditProperties
    }
  },
  showChoiceAnalysis: {
    type: "object",
    additionalProperties: false,
    required: ["title", "summary", "choices"],
    properties: {
      title: { type: "string", description: "选项分析卡片标题。标题尽量用纯文本；如必须包含公式，使用 `$...$`，并在 JSON 字符串中双写 LaTeX 反斜杠，例如 `$\\\\frac{5i}{1-2i}$`。" },
      summary: { type: "string", description: "先概括题干给出的公共条件，以及这些条件如何作为所有选项的共同底图。公式只用 `$...$` 或 `$$...$$`，不要使用 `\\[...\\]`、`\\(...\\)`、裸 `\\begin{aligned}` 或 `\\\\[4pt]` 间距控制。" },
      answer: { type: "string", nullable: true, description: "最终选项答案，例如 A、BD、ACD；无法确定时说明原因。" },
      baseConditions: {
        type: "array",
        nullable: true,
        items: { type: "string" },
        description: "题干中所有选项共享的基础条件。不要放入某个选项专属结论。公式只用 `$...$`，并按 JSON 规则双写 LaTeX 反斜杠，避免 `\\f`、`\\t` 等被解析成控制字符。"
      },
      displayMode: {
        type: "string",
        nullable: true,
        enum: choiceDisplayModeValues,
        default: "single_active_choice",
        description: "推荐展示方式。选择题/多选题默认使用 single_active_choice；不要用 text_only 逃避选项级画板场景。single_active_choice 表示主画布一次聚焦一个选项；compare_choices 表示文字或小预览对比；text_only 只允许确实无需画布切换的非可视化卡片。"
      },
      choices: {
        type: "array",
        minItems: 2,
        description: "按 A、B、C、D 分别分析选项，不要把多个选项的构造、理由或结论混在同一项里。",
        items: {
          type: "object",
          required: ["label", "statement", "verdict", "explanation"],
          additionalProperties: false,
          properties: {
            label: { type: "string", enum: choiceLabelValues, description: "选项标签。" },
            statement: { type: "string", description: "该选项的原始结论或命题。公式只用 `$...$`，并按 JSON 规则双写 LaTeX 反斜杠。" },
            verdict: { type: "string", enum: choiceVerdictValues, description: "true=正确，false=错误，unknown=当前信息或画布无法直接确认。" },
            explanation: { type: "string", description: "只针对该选项的判断理由，说明它如何由公共条件推出或被反例否定。避免复杂多行 LaTeX；如需推导，优先用短句分步写。不要使用 `\\[...\\]`、`\\(...\\)`、裸 `\\begin{aligned}` 或 `\\\\[4pt]` 间距控制。" },
            constructionFocus: { type: "string", nullable: true, description: "该选项在画布上应额外突出或切换展示的辅助构造，例如 A_aux1、B_mark1；选择题/多选题必须非空。" },
            evidence: { type: "array", nullable: true, items: { type: "string" }, description: "支持该判断的关键数学事实、画布对象或验证结果。" },
            commands: { type: "array", nullable: true, items: { type: "string" }, description: "从题干公共底图出发、仅属于该选项场景的可执行 GeoGebra 命令；选择题/多选题必须非空。点击选项时前端会恢复公共底图再执行这些命令；不要放入其他选项的命令，也不要引用其他选项的专属对象。参数类选项优先画参数域截面、等值线、特殊值/反例线、极值截面或验证对象。" }
          }
        }
      },
      auxiliaryElementReview: { type: "string", nullable: true, description: auxiliaryElementReviewDescriptionZh },
      ...auditProperties
    }
  },
  showSelectedElements: {
    type: "object",
    additionalProperties: false,
    required: ["title", "summary", "elements"],
    properties: {
      title: { type: "string", description: "选中元素卡片标题。" },
      summary: { type: "string", description: "概括用户当前选中了哪些画板对象，以及后续追问会默认指向这些对象。" },
      elements: {
        type: "array",
        minItems: 1,
        description: "用户当前在 GeoGebra 画板中选中的对象列表。label 必须使用真实 GeoGebra 对象名，例如 A、lineAB、poly1。",
        items: {
          type: "object",
          required: ["label"],
          additionalProperties: false,
          properties: {
            label: { type: "string", minLength: 1, description: "GeoGebra 对象名。" },
            type: { type: "string", nullable: true, description: "对象类型，例如 point、line、segment、polygon、circle、function。" },
            description: { type: "string", nullable: true, description: "该对象在当前题目或画布中的含义。" },
            role: { type: "string", nullable: true, description: "后续追问中建议如何引用它，例如 要移动的点、要修改的线段、待验证对象。" }
          }
        }
      },
      nextActionHint: { type: "string", nullable: true, description: "提示用户可以继续说要移动、删除、重命名或围绕这些对象构造什么。" },
      ...auditProperties
    }
  }
} as const satisfies Record<
  "showSolutionSteps" | "showTeachingHint" | "showAnimationGuide" | "showChoiceAnalysis" | "showSelectedElements",
  FunctionCallInputJsonSchema
>;
