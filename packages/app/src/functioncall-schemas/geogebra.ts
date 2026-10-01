import {
  advancedDrawingToolNameValues,
  auditProperties,
  constructionRecipeIdValues,
  executeCommandsDescriptionZh,
  geogebraCommandTagMatchValues
} from "./shared";
import type { FunctionCallInputJsonSchema } from "./types";
import { GENERATED_GEOGEBRA_COMMAND_TAGS } from "../geogebra-command-reference-data";

export const GEOGEBRA_FUNCTION_CALL_INPUT_JSON_SCHEMAS = {
  searchGeoGebraCommands: {
    type: "object",
    additionalProperties: false,
    required: ["query"],
    properties: {
      query: {
        type: "string",
        minLength: 1,
        description: "GeoGebra 命令搜索关键词，优先使用中文构造意图；不传 tags 时在全部命令中进行文本检索。"
      },
      tags: {
        type: "array",
        nullable: true,
        minItems: 1,
        items: { type: "string", minLength: 1, enum: GENERATED_GEOGEBRA_COMMAND_TAGS },
        description: "可选的精确标签筛选。领域标签使用 category:*，功能标签使用 capability:*，风险标签使用 risk:*；例如 category:geometry、category:3d、capability:create、capability:measure、capability:relation、capability:transform、capability:label、capability:position、capability:style。原生标签偏移没有对应命令或 capability:label-position 标签。省略 tags 时执行全局文本检索。"
      },
      tagMatch: {
        type: "string",
        nullable: true,
        enum: geogebraCommandTagMatchValues,
        default: "any",
        description: "多标签匹配方式：any 表示包含任一标签，all 要求命令包含全部标签；默认 any。"
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
  configureGeoGebraAnimation: {
    type: "object",
    additionalProperties: false,
    required: ["object", "from", "to"],
    properties: {
      object: {
        type: "string",
        minLength: 1,
        description: "要连续驱动的自由数值、角度或滑块对象名。对象必须已经存在且可通过 GeoGebra Applet API setValue 更新。"
      },
      from: { type: "number", description: "起始值。continuous 模式从此值持续递增或递减。" },
      to: { type: "number", description: "参考终值，必须与 from 不同。continuous 模式不会在此处停止，而是用 to - from 定义一个时间跨度内的增量。" },
      durationMs: {
        type: "number",
        nullable: true,
        minimum: 2_000,
        maximum: 120_000,
        default: 20_000,
        description: "从 from 运行到 to 的参考时长（毫秒）。continuous 模式会在每个该时长内继续增加一个 to - from，而不会回到起点。教学观察默认 20000；复杂轨迹通常使用 12000 到 30000，避免过快。"
      },
      mode: {
        type: "string",
        nullable: true,
        enum: ["once", "loop", "ping_pong", "continuous"],
        default: "once",
        description: "播放方式：once 单次到终点停止；loop 到终点后从起点继续；ping_pong 在两端之间往返；continuous 越过 to 后仍按相同速率持续增长，适合时钟、天体公转和长期仿真。"
      },
      easing: {
        type: "string",
        nullable: true,
        enum: ["linear", "ease_in_out"],
        default: "linear",
        description: "插值方式。周期运动和匀速参数优先 linear；强调起止观察时可用 ease_in_out。continuous 为保持单调和匀速会固定使用 linear。"
      },
      autoplay: {
        type: "boolean",
        nullable: true,
        default: true,
        description: "配置完成后是否立即播放。默认 true；只有用户明确要求先观察初始状态或手动启动时才设为 false。"
      },
      ...auditProperties
    }
  },
  controlGeoGebraAnimation: {
    type: "object",
    additionalProperties: false,
    required: ["action", "objects"],
    properties: {
      action: {
        type: "string",
        enum: ["play", "pause", "stop", "reset"],
        description: "play 从当前进度播放/继续；pause 保留当前进度；stop 停止并保留当前值；reset 停止并回到 from。"
      },
      objects: {
        type: "array",
        minItems: 1,
        maxItems: 16,
        items: { type: "string", minLength: 1 },
        description: "已通过 configureGeoGebraAnimation 配置的对象名。"
      },
      ...auditProperties
    }
  },
  inspectGeoGebraObjects: {
    type: "object",
    additionalProperties: false,
    required: ["objects"],
    properties: {
      objects: {
        type: "array",
        minItems: 1,
        maxItems: 20,
        items: { type: "string", minLength: 1 },
        description: "要通过稳定 Applet API 检查的对象名；返回存在性、类型、定义、值、坐标、可见性和动画状态等可用字段。"
      },
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
      confirmed: { type: "boolean", nullable: true, description: "手动或远程破坏性请求必须显式确认；模型内部工作流请求不需要填写。" },
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
    required: ["mode"],
    properties: {
      mode: {
        type: "string",
        description: [
          "GeoGebra SetPerspective text, code, layout, or toggle.",
          "View letters: A=Algebra, B=Probability Calculator, C=CAS, D=Graphics 2, G=Graphics, L=Construction Protocol, P=Properties, R=Data Analysis, S=Spreadsheet, T=3D Graphics.",
          "Use T for 3D Graphics.",
          "Examples: G, AG, AGS, S/G, S/(GA), +D, -D, +T, -T, +Tools, +Table, 1, 2, 3, 4, 5, 6."
        ].join(" ")
      },
      ...auditProperties
    }
  }
} as const satisfies Record<
  | "searchGeoGebraCommands"
  | "createGeometryPlan"
  | "executeAdvancedDrawingCommand"
  | "executeGeoGebraCommands"
  | "configureGeoGebraAnimation"
  | "controlGeoGebraAnimation"
  | "inspectGeoGebraObjects"
  | "resetCanvas"
  | "getCanvasContext"
  | "getPNGBase64"
  | "setPerspective",
  FunctionCallInputJsonSchema
>;
