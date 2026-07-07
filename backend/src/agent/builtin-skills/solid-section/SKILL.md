---
name: solid-section
description: 立体几何截面、平面与多面体交线、空间辅助线和截面形状判断技能。
category: high-school-solid-geometry
parent: solid-geometry
level: 2
maturity: default
tags: [二级技能, 截面, 多面体, 平面, 交线, 空间辅助线]
tools: [searchGeoGebraCommands, executeGeoGebraCommands, showSolutionSteps, showTeachingHint, setPerspective]
---

# 空间截面

适用于平面截棱柱、棱锥、长方体、正方体和一般多面体。重点是截面平面与各面的交线连续性。

工作顺序：

1. 切换 3D，先构造多面体骨架和给定截面点。
2. 确定截面平面，再逐面找交线。
3. 判断截面多边形时保持顶点顺序。
4. 若使用 Intersect(平面, 多面体)，先执行并验证实际返回的对象 label；GeoGebra 可能生成 section_{1}、G/H/I 和边线等多个对象，不要直接样式化左侧赋值名。
5. 若 GeoGebra 命令不可用，用交线和顶点标注表达截面关系。
