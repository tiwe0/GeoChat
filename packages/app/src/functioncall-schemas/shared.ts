import { BLACKBOARD_CATEGORIES } from "../blackboard";
import { getConstructionRecipes } from "../construction-recipes";
import { geogebraCanvasVisualGuidance } from "../canvas-visual-guidance";
import { GEOGEBRA_COMMAND_SEARCH_SCOPES } from "../geogebra-command-reference";
import { ADVANCED_DRAWING_TOOL_NAMES } from "../advanced-drawing-tools";
import type { JsonSchemaProperty } from "./types";

export const constructionRecipeIdValues = getConstructionRecipes().map((recipe) => recipe.id);
export const advancedDrawingToolNameValues = [...ADVANCED_DRAWING_TOOL_NAMES];
export const blackboardCategoryValues = [...BLACKBOARD_CATEGORIES];
export const geogebraCommandSearchScopeValues = GEOGEBRA_COMMAND_SEARCH_SCOPES;
export const choiceLabelValues = ["A", "B", "C", "D"] as const;
export const choiceVerdictValues = ["true", "false", "unknown"] as const;
export const choiceDisplayModeValues = ["single_active_choice", "compare_choices", "text_only"] as const;

export const auditProperties = {
  reason: { type: "string", nullable: true, description: "必填。说明为什么此刻需要调用这个工具，写清本轮任务中的决策依据。" },
  intendedOutcome: { type: "string", nullable: true, description: "说明调用后希望得到的具体结果。" },
  nextExpectedAction: { type: "string", nullable: true, description: "说明工具完成后下一步预期动作。" }
} as const satisfies Record<string, JsonSchemaProperty>;

export const executeCommandsDescriptionZh = [
  "非空 GeoGebra 命令数组。命令必须按 GeoGebra 5 兼容性逐条可执行；不要使用只在 GeoGebra 6 或记忆中存在的命令/参数形态。如果使用符号参数或自由变量，例如 t、lambda、λ、mu、μ，必须先用单独命令声明参数值或滑块，再在后续命令中引用。不要用 Delete(...) 清理旧画布；开始新题或旧画布无关时必须先调用 resetCanvas。移除辅助对象默认应隐藏，不要删除依赖对象。",
  "复杂构造要分阶段执行：先提交核心对象、验证画布，再提交标签、隐藏辅助对象或语义样式。单批命令优先控制在 100 条以内；若需要更多命令，拆成多次 executeGeoGebraCommands，并在每次成功后先 getCanvasContext 或 getPNGBase64。",
  "不要给 GeoGebra 内置固定坐标轴对象 xAxis、yAxis、zAxis、x轴、y轴、z轴 或 xOyPlane 重新赋值，例如不要写 xAxis = ...、yAxis = ...、zAxis = ... 或 xAxis: ...；函数与坐标轴交点可以用 Intersect(f, xAxis) 或 Root(f, 起始x, 结束x)。需要可操作轴线时先创建 xRef: y = 0 或 yRef: x = 0。",
  "角度标注必须注意点序：GeoGebra 的 Angle(A, O, B) 以 O 为顶点并按点序形成角；具体方向约定由当前题型 skill 决定，不要把局部题型规则当作通用规则。",
  "GeoGebra 某些命令会返回多个对象。不要假设左侧赋值名就是可继续引用的真实对象名；必须先执行核心构造并验证 canvasContext 中实际生成的 label，再对真实 label 调用样式或标注后处理命令。",
  "如果已经创建滑块、动点或轨迹参数，并且动态播放能帮助用户观察变化关系，可以追加 StartAnimation(参数或动点, true) 打开动画；不要为纯静态图形强行播放。",
  geogebraCanvasVisualGuidance("zh-CN")
].join(" ");

export const executeCommandsDescriptionEn = [
  "Non-empty array of GeoGebra commands. Commands must be executable one by one under GeoGebra 5 compatibility; do not use command names or argument shapes that exist only in GeoGebra 6 or in memory. If symbolic parameters or free variables such as t, lambda, λ, mu, or μ are used, declare them first as values or sliders in separate commands before referencing them. Do not use Delete(...) to clear a stale canvas; call resetCanvas first when starting a new problem or when the old canvas is unrelated. Removing auxiliary objects should hide them by default, not delete dependency objects.",
  "Stage complex constructions: submit core objects first, verify the canvas, then submit labels, helper hiding, or semantic styling. Prefer at most 100 commands per batch. If more commands are needed, split them across multiple executeGeoGebraCommands calls and verify with getCanvasContext or getPNGBase64 after each successful batch.",
  "Do not assign values to GeoGebra built-in fixed axis objects xAxis, yAxis, zAxis, x轴, y轴, z轴, or xOyPlane; do not write xAxis = ..., yAxis = ..., zAxis = ..., or xAxis: .... Function-axis intersections may use Intersect(f, xAxis) or Root(f, startX, endX). If an editable axis line is needed, create xRef: y = 0 or yRef: x = 0 first.",
  "Angle labels are order-sensitive: GeoGebra Angle(A, O, B) uses O as vertex and the point order determines the displayed angle. Direction conventions belong to the active task skill; do not treat local task rules as universal rules.",
  "Some GeoGebra commands return multiple objects. Do not assume the left-hand assignment name is the real object label you can reference later. Execute the core construction first, verify actual labels in canvasContext, and only then call style or label post-processing on real labels.",
  "If you have created a slider, moving point, or locus parameter and playback helps users observe the changing relationship, you may append StartAnimation(parameter or moving point, true); do not force animation for purely static diagrams.",
  geogebraCanvasVisualGuidance("en-US")
].join(" ");

export const auxiliaryElementReviewDescriptionZh = "作图完成后的辅助元素审查结论。说明哪些辅助对象已经用 SetConditionToShowObject 隐藏；如果没有隐藏任何对象，说明哪些对象被判断为关键对象以及为什么无需隐藏。";
export const auxiliaryElementReviewDescriptionEn = "Post-construction helper-object review. State which auxiliary objects were hidden with SetConditionToShowObject; if nothing was hidden, explain which objects are key objects and why no helper object should be hidden.";
