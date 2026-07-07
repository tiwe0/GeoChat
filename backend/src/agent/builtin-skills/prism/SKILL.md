---
name: prism
description: 棱柱、长方体、正方体相关的顶点、棱、面、截面和展开关系技能。
category: high-school-solid-geometry
maturity: default
tags: [棱柱, 长方体, 正方体, 截面, 面角, 体积]
tools: [searchGeoGebraCommands, executeGeoGebraCommands, showSolutionSteps, showTeachingHint, setPerspective]
---

# 棱柱

优先用坐标化处理：把底面放在 z=0，侧棱沿 z 方向，顶面由底面平移得到。

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
