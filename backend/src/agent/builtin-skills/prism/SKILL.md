---
name: prism
description: 棱柱、长方体、正方体相关的顶点、棱、面、截面和展开关系技能。
category: high-school-solid-geometry
maturity: default
tags: [棱柱, 长方体, 正方体, 截面, 面角, 体积]
tools: [searchGeoGebraCommands, executeGeoGebraCommands, showSolutionSteps, showTeachingHint, setPerspective]
---

# 棱柱

用于直/斜棱柱、长方体、正方体的棱面关系、截面、展开、距离、角和体积。优先坐标化：直棱柱可把底面放在 `z=0`、侧棱沿 z 方向；斜棱柱则必须保留平移向量，不得偷换成垂直高。

三棱柱/棱柱图的最低视觉标准：

- 底面顶点用 A、B、C，顶面用 A1、B1、C1；先画 9 条骨架棱线，再画半透明面体。
- 底面、顶面、侧棱、截面要有不同语义层级：实体低透明，骨架深色，截面高亮，辅助平面弱化。
- 推荐语义配色：蓝色 #0072B2、天蓝色 #56B4E9、蓝绿色 #009E73、橙色 #E69F00、朱红色 #D55E00、紫红色 #CC79A7、黄色 #F0E442。用 SetColor(obj, r, g, b) 设置，避免渐变色。
- 截面题必须清楚显示截面多边形与哪些棱或面相交，不能只显示一个悬浮平面或抽象色块。
- 视角要能同时看到底面、顶面和侧面；不要把三棱柱放得过大导致顶点或截面被裁剪。

关注点：

- 顶点命名要稳定，底面和顶面用不同颜色。
- 截面题先构造经过给定点的平面，再展示交线或截面多边形。
- 3D 截面不要一次性假设 Intersect(plane, prism) 的赋值名可用于后续样式；先执行核心截面构造并读取画布，确认实际 polygon3d/point3d label 后再高亮。
- 距离和角度题优先构造投影点、垂线和辅助三角形。
- 体积题显示底面积、高和必要的分割关系。

## 数学与能力规则

- 棱柱上下底全等且平行，对应顶点的平移向量相同；体积 `V=底面积×垂直高`，斜棱长不一定是高。
- 截面顶点必须在棱/面上且按环形顺序连接，不用视觉近似代替共面性。
- 先检查标签；下例 `pr` 前缀如已存在，整组换成新前缀。

## 原生小例：三棱柱

```ggb
prA = Point((0, 0, 0))
prB = Point((4, 0, 0))
prC = Point((1, 3, 0))
prA1 = Point((0, 0, 3))
prBase = Polygon(prA, prB, prC)
prBody = Prism(prBase, prA1)
prHeight = Segment(prA, prA1)
prBaseArea = Area(prBase)
prVolume = Volume(prBody)
SetColor(prBody, 86, 180, 233)
SetFilling(prBody, 0.18)
SetColor(prHeight, 213, 94, 0)
```

预期：底面面积为 6，垂直高为 3，`prVolume=18`；上底由底面沿 `(0,0,3)` 平移得到。`Prism` 可自动产生顶点/棱/面标签，未检查实际标签前不对派生对象连锁设样式。

## 检查与降级

- 正常：检查两底面面积相等、对应棱等长平行、体积等于底面积乘高。
- 退化：底面面积为 0、顶点落在底面或高为 0 时不称为非退化棱柱。
- 边界：斜棱柱用点到底面距离作高，不用侧棱长。
- 无 3D/WebGL 时改画前视/侧视投影及底面，列出坐标和体积检查；这只证明几何依赖，不证明真实 3D 渲染。

## 官方依据

- [Prism 命令](https://geogebra.github.io/docs/manual/en/commands/Prism/)
- [Intersect 命令](https://geogebra.github.io/docs/manual/en/commands/Intersect/)
