import {
  advancedDrawingToolNameValues,
  auditProperties,
  constructionRecipeIdValues,
  executeCommandsDescriptionZh,
  geogebraCommandSearchScopeValues
} from "./shared";
import type { FunctionCallInputJsonSchema } from "./types";

export const GEOGEBRA_FUNCTION_CALL_INPUT_JSON_SCHEMAS = {
  searchGeoGebraCommands: {
    type: "object",
    additionalProperties: false,
    required: ["query", "scope"],
    properties: {
      query: { type: "string", minLength: 1, description: "GeoGebra 命令搜索关键词，优先使用中文构造意图。" },
      scope: {
        type: "string",
        enum: geogebraCommandSearchScopeValues,
        default: "global",
        description: "必填检索范围。即使想查全局命令也必须显式传 global；更具体的范围会让命令参考更准确。"
      },
      topN: { type: "number", nullable: true, minimum: 1, maximum: 12 },
      ...auditProperties
    }
  },
  createGeometryPlan: {
    type: "object",
    additionalProperties: false,
    required: ["recipeId"],
    properties: {
      recipeId: {
        type: "string",
        minLength: 1,
        enum: constructionRecipeIdValues,
        description: "构造 recipe ID，例如 function.parabola.vertex、function.intersections、conic.ellipse.foci-point。"
      },
      inputs: {
        type: "object",
        nullable: true,
        additionalProperties: false,
        properties: {
          expression: { type: "string" },
          functionName: { type: "string" },
          vertexName: { type: "string" },
          leftExpression: { type: "string" },
          rightExpression: { type: "string" },
          leftName: { type: "string" },
          rightName: { type: "string" },
          intersectionName: { type: "string" },
          focusA: { type: "array", minItems: 2, items: { type: "number" } },
          focusB: { type: "array", minItems: 2, items: { type: "number" } },
          point: { type: "array", minItems: 2, items: { type: "number" } },
          focusAName: { type: "string" },
          focusBName: { type: "string" },
          pointName: { type: "string" },
          ellipseName: { type: "string" }
        },
        description: "传给 recipe 的结构化参数，例如表达式、焦点坐标、对象名。"
      },
      sourceText: {
        type: "string",
        nullable: true,
        description: "原始题干或局部题意文本；后端会从中保守抽取表达式、坐标等 recipe 参数。"
      },
      ...auditProperties
    }
  },
  executeAdvancedDrawingCommand: {
    type: "object",
    additionalProperties: false,
    required: ["name"],
    properties: {
      name: {
        type: "string",
        minLength: 1,
        enum: advancedDrawingToolNameValues,
        description: "要调用的高级绘图命令名。只能选择本轮已加载技能解锁并由系统提示列出的命令。"
      },
      args: {
        type: "object",
        nullable: true,
        additionalProperties: true,
        properties: {},
        description: [
          "传给高级绘图命令的结构化参数。省略时使用该命令的教材风格默认构造。",
          "参数语义：number 是后端编译期字面值；对象名字段是 GeoGebra 符号名；表达式必须显式写成 { kind: \"ggb_expr\", expr: \"...\", evaluation: \"dynamic\" | \"snapshot\" }。",
          "dynamic 表示 GeoGebra 执行期保留依赖；snapshot 表示执行期用 CopyFreeObject(expr) 尝试复制为自由对象。禁止在 args 中嵌套其它高级绘图命令。"
        ].join(" ")
      },
      ...auditProperties
    }
  },
  executeGeoGebraCommands: {
    type: "object",
    additionalProperties: false,
    required: ["commands"],
    properties: {
      commands: {
        type: "array",
        minItems: 1,
        items: { type: "string", minLength: 1 },
        description: executeCommandsDescriptionZh
      },
      perspective: { type: "string", nullable: true, default: "G" },
      resetBefore: { type: "boolean", nullable: true },
      restoreOnError: { type: "boolean", nullable: true },
      ...auditProperties
    }
  },
  resetCanvas: {
    type: "object",
    additionalProperties: false,
    properties: {
      perspective: {
        type: "string",
        nullable: true,
        default: "G",
        description: "重置后可选切换到的 GeoGebra SetPerspective 视图或布局。默认使用 G 画板视图；3D Graphics 使用 T。"
      },
      ...auditProperties
    }
  },
  getCanvasContext: {
    type: "object",
    additionalProperties: false,
    properties: {
      includeXml: { type: "boolean", nullable: true },
      ...auditProperties
    }
  },
  getPNGBase64: {
    type: "object",
    additionalProperties: false,
    properties: {
      exportScale: { type: "number", nullable: true, minimum: 0.25, maximum: 4, default: 1 },
      transparent: { type: "boolean", nullable: true, default: true },
      dpi: { type: "number", nullable: true, minimum: 1, maximum: 600 },
      ...auditProperties
    }
  },
  setPerspective: {
    type: "object",
    additionalProperties: false,
    properties: {
      mode: {
        type: "string",
        nullable: true,
        description: [
          "GeoGebra SetPerspective text, code, layout, toggle, or supported alias.",
          "View letters: A=Algebra, B=Probability Calculator, C=CAS, D=Graphics 2, G=Graphics, L=Construction Protocol, P=Properties, R=Data Analysis, S=Spreadsheet, T=3D Graphics.",
          "Use T for 3D Graphics; do not pass 3D unless relying on alias normalization.",
          "Examples: G, AG, AGS, S/G, S/(GA), +D, -D, +T, -T, +Tools, +Table, 1, 2, 3, 4, 5, 6.",
          "Chinese aliases such as 画板, 代数, 三维视图 are accepted and normalized before execution."
        ].join(" ")
      },
      perspective: {
        type: "string",
        nullable: true,
        description: "Alias of mode for compatibility. Prefer mode for new calls and follow the same GeoGebra SetPerspective usage rules."
      },
      ...auditProperties
    }
  }
} as const satisfies Record<
  | "searchGeoGebraCommands"
  | "createGeometryPlan"
  | "executeAdvancedDrawingCommand"
  | "executeGeoGebraCommands"
  | "resetCanvas"
  | "getCanvasContext"
  | "getPNGBase64"
  | "setPerspective",
  FunctionCallInputJsonSchema
>;
