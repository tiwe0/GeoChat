/**
 * GeoGebra Classic 2D tool mode IDs.
 * Source: https://geogebra.github.io/docs/reference/en/Toolbar/
 *
 * Keep this catalog limited to documented Graphics View tools. Spreadsheet,
 * CAS, Notes and 3D-only modes intentionally stay out of the fusion toolbar.
 */
export type GeoGebraToolGroupIcon =
  | "movement"
  | "points"
  | "lines"
  | "circles"
  | "polygons"
  | "measure"
  | "transform"
  | "objects";

export interface GeoGebraToolDefinition {
  readonly mode: number;
  readonly label: {
    readonly en: string;
    readonly zhCN: string;
  };
}

export interface GeoGebraToolGroup {
  readonly id: GeoGebraToolGroupIcon;
  readonly icon: GeoGebraToolGroupIcon;
  readonly label: {
    readonly en: string;
    readonly zhCN: string;
  };
  readonly tools: readonly GeoGebraToolDefinition[];
}

const tool = (mode: number, en: string, zhCN: string): GeoGebraToolDefinition => ({
  mode,
  label: { en, zhCN },
});

export const GEOGEBRA_TOOL_GROUPS: readonly GeoGebraToolGroup[] = [
  {
    id: "movement",
    icon: "movement",
    label: { en: "Move and zoom", zhCN: "移动与缩放" },
    tools: [
      tool(0, "Move", "移动"),
      tool(39, "Move around point", "绕点转动"),
      tool(40, "Move graphics view", "移动绘图区"),
      tool(41, "Zoom in", "放大"),
      tool(42, "Zoom out", "缩小"),
      tool(77, "Select objects", "选择对象"),
    ],
  },
  {
    id: "points",
    icon: "points",
    label: { en: "Points", zhCN: "点" },
    tools: [
      tool(1, "Point", "点"),
      tool(501, "Point on object", "对象上的点"),
      tool(5, "Intersect", "交点"),
      tool(19, "Midpoint or center", "中点或中心"),
      tool(67, "Attach or detach point", "附着或脱离点"),
      tool(72, "Complex number", "复数"),
      tool(75, "Extremum", "极值点"),
      tool(76, "Roots", "零点"),
    ],
  },
  {
    id: "lines",
    icon: "lines",
    label: { en: "Lines", zhCN: "直线" },
    tools: [
      tool(2, "Line", "直线"),
      tool(15, "Segment", "线段"),
      tool(45, "Segment with given length", "定长线段"),
      tool(18, "Ray", "射线"),
      tool(7, "Vector", "向量"),
      tool(37, "Vector from point", "从点出发的向量"),
      tool(65, "Polyline", "折线"),
      tool(4, "Perpendicular line", "垂线"),
      tool(3, "Parallel line", "平行线"),
      tool(8, "Perpendicular bisector", "中垂线"),
      tool(9, "Angle bisector", "角平分线"),
      tool(13, "Tangents", "切线"),
      tool(44, "Polar or diameter line", "极线或径线"),
      tool(47, "Locus", "轨迹"),
      tool(58, "Best fit line", "拟合直线"),
    ],
  },
  {
    id: "circles",
    icon: "circles",
    label: { en: "Circles and conics", zhCN: "圆与圆锥曲线" },
    tools: [
      tool(10, "Circle with center through point", "圆心与圆周点决定的圆"),
      tool(34, "Circle with center and radius", "圆心与半径决定的圆"),
      tool(11, "Circle through three points", "过三点的圆"),
      tool(53, "Compass", "圆规"),
      tool(24, "Semicircle", "半圆"),
      tool(20, "Circular arc", "圆弧"),
      tool(22, "Circumcircular arc", "外接圆弧"),
      tool(21, "Circular sector", "圆扇形"),
      tool(23, "Circumcircular sector", "外接圆扇形"),
      tool(55, "Ellipse", "椭圆"),
      tool(56, "Hyperbola", "双曲线"),
      tool(57, "Parabola", "抛物线"),
      tool(12, "Conic through five points", "过五点的圆锥曲线"),
    ],
  },
  {
    id: "polygons",
    icon: "polygons",
    label: { en: "Polygons", zhCN: "多边形" },
    tools: [
      tool(16, "Polygon", "多边形"),
      tool(51, "Regular polygon", "正多边形"),
      tool(64, "Rigid polygon", "刚性多边形"),
      tool(70, "Vector polygon", "向量多边形"),
    ],
  },
  {
    id: "measure",
    icon: "measure",
    label: { en: "Measure and inspect", zhCN: "测量与检查" },
    tools: [
      tool(36, "Angle", "角度"),
      tool(46, "Angle with given size", "定值角"),
      tool(38, "Distance or length", "距离或长度"),
      tool(49, "Area", "面积"),
      tool(50, "Slope", "斜率"),
      tool(14, "Relation", "关系"),
      tool(71, "Create list", "创建列表"),
      tool(68, "Function inspector", "函数检查器"),
    ],
  },
  {
    id: "transform",
    icon: "transform",
    label: { en: "Transform", zhCN: "变换" },
    tools: [
      tool(30, "Reflect about line", "关于直线对称"),
      tool(29, "Reflect about point", "关于点对称"),
      tool(54, "Reflect about circle", "关于圆反演"),
      tool(32, "Rotate around point", "绕点旋转"),
      tool(31, "Translate by vector", "按向量平移"),
      tool(33, "Dilate from point", "以点为中心缩放"),
    ],
  },
  {
    id: "objects",
    icon: "objects",
    label: { en: "Objects and editing", zhCN: "对象与编辑" },
    tools: [
      tool(17, "Text", "文本"),
      tool(25, "Slider", "滑动条"),
      tool(26, "Image", "图像"),
      tool(52, "Check box", "复选框"),
      tool(60, "Button", "按钮"),
      tool(61, "Input box", "输入框"),
      tool(62, "Pen", "画笔"),
      tool(73, "Freehand shape", "手绘图形"),
      tool(74, "Freehand function", "手绘函数"),
      tool(27, "Show or hide object", "显示或隐藏对象"),
      tool(28, "Show or hide label", "显示或隐藏标签"),
      tool(35, "Copy visual style", "复制样式"),
      tool(6, "Delete", "删除"),
    ],
  },
] as const;

export function localizeGeoGebraLabel(label: GeoGebraToolDefinition["label"] | GeoGebraToolGroup["label"], language: string) {
  return language.toLowerCase().startsWith("zh") ? label.zhCN : label.en;
}
