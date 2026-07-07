import type { FunctionCallLocale } from "./functioncall-types";

export const GEOGEBRA_SEMANTIC_COLOR_PALETTE = [
  { name: "blue", zhName: "蓝色", hex: "#0072B2", rgb: [0, 114, 178] },
  { name: "sky blue", zhName: "天蓝色", hex: "#56B4E9", rgb: [86, 180, 233] },
  { name: "bluish green", zhName: "蓝绿色", hex: "#009E73", rgb: [0, 158, 115] },
  { name: "orange", zhName: "橙色", hex: "#E69F00", rgb: [230, 159, 0] },
  { name: "vermilion", zhName: "朱红色", hex: "#D55E00", rgb: [213, 94, 0] },
  { name: "reddish purple", zhName: "紫红色", hex: "#CC79A7", rgb: [204, 121, 167] },
  { name: "yellow", zhName: "黄色", hex: "#F0E442", rgb: [240, 228, 66] }
] as const;

export function geogebraSemanticColorPaletteGuidance(locale?: FunctionCallLocale | null) {
  if (locale === "en-US") {
    const palette = GEOGEBRA_SEMANTIC_COLOR_PALETTE
      .map((color) => `${color.name} ${color.hex}=SetColor(obj, ${color.rgb.join(", ")})`)
      .join("; ");
    return `Use this colorblind-safe semantic palette when an active skill or visual profile asks for color coding: ${palette}.`;
  }
  const palette = GEOGEBRA_SEMANTIC_COLOR_PALETTE
    .map((color) => `${color.zhName} ${color.hex}=SetColor(obj, ${color.rgb.join(", ")})`)
    .join("；");
  return `当已激活技能或 visual profile 要求语义配色时，使用这组色盲友好的语义配色：${palette}。`;
}

export function geogebraCanvasVisualGuidance(locale?: FunctionCallLocale | null) {
  if (locale === "en-US") {
    return [
      "Canvas visual style: keep ordinary 2D Graphics on GeoGebra defaults. Use semantic highlighting only when the user asks for appearance edits or an active skill/visual profile says the highlighting carries mathematical meaning; otherwise only adjust fit, label clarity, and overlap.",
      "When the user explicitly asks for appearance edits, use only GeoGebra-supported style commands on compatible objects.",
      "Scenario-specific style rules such as unit-circle color roles, 3D textbook layering, section highlighting, and palette choice belong to the selected skill or visual profile, not to every canvas command.",
      "Do not style ordinary 2D plots; preserve the clean mathematical grid/paper feel unless the task needs semantic emphasis."
    ].join(" ");
  }
  return [
    "画布视觉策略：普通 2D Graphics 默认保持 GeoGebra 视觉样式。只有当用户明确要求外观编辑，或已激活 skill/visual profile 明确说明高亮承载数学含义时，才使用语义高亮；否则只调整视野、标签清楚度和遮挡。",
    "当用户明确要求外观编辑时，只对兼容对象使用 GeoGebra 支持的样式命令。",
    "单位圆配色、3D 教材图层级、截面高亮、可行域填充等场景规则属于被选中的 skill 或 visual profile，不作为每道题的全局命令约束。",
    "不要美化普通 2D 图像；除非题目需要语义强调，否则保留干净的数学网格/纸面感。"
  ].join(" ");
}
