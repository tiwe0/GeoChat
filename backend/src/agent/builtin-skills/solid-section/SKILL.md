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

适用于平面截棱柱、棱锥、长方体、正方体和一般多面体。核心是“同一面上的两个截点确定一条截线”和各面交线的环形连续性，而不是猜截面形状。

工作顺序：

1. 切换 3D，先构造多面体骨架和给定截面点。
2. 确定截面平面，再逐面找交线。
3. 判断截面多边形时保持顶点顺序。
4. 若使用 Intersect(平面, 多面体)，先执行并验证实际返回的对象 label；GeoGebra 可能生成 section_{1}、G/H/I 和边线等多个对象，不要直接样式化左侧赋值名。
5. 若 GeoGebra 命令不可用，用交线和顶点标注表达截面关系。

## 数学与能力规则

- 截面顶点必须落在多面体的棱上（或退化时落在顶点）；每个普通截点应连接两条同平面截线。
- 截平面过顶点、包含整条棱或与面重合是退化情形，需单独说明，不应强行返回普通多边形。
- 下例 `ss` 前缀执行前必须确认未占用。

## 原生小例：正方体的六边形截面

```ggb
ssA = Point((0, 0, 0))
ssB = Point((4, 0, 0))
ssC = Point((4, 4, 0))
ssD = Point((0, 4, 0))
ssE = Point((0, 0, 4))
ssBase = Polygon(ssA, ssB, ssC, ssD)
ssCube = Prism(ssBase, ssE)
ssP = Point((2, 0, 0))
ssQ = Point((4, 0, 2))
ssR = Point((4, 2, 4))
ssPlane = Plane(ssP, ssQ, ssR)
ssSection = Intersect(ssPlane, ssCube)
SetColor(ssCube, 86, 180, 233)
SetFilling(ssCube, 0.10)
```

预期：截平面方程为 `z=x+y-2`，与正方体交于六个点 `(2,0,0)`、`(4,0,2)`、`(4,2,4)`、`(2,4,4)`、`(0,4,2)`、`(0,2,0)`，形成闭合六边形。执行 `Intersect` 后先读取画布确认实际 polygon3d/point3d 标签，再高亮；不假定 `ssSection` 是可样式化的最终标签。

## 检查与降级

- 正常：验证六点都满足平面方程且在对应棱的参数范围 `[0,1]` 内，按相邻面顺序闭合。
- 退化：平面过顶点/棱或与外表面重合时，先报告交集类型（点、线段、面）。
- 边界：近平行时检查交点是否落在有限棱上，不把延长线交点当截点。
- 无 `Intersect(平面,多面体)` 或 3D/WebGL 时，按上述六点原生构造 `Polygon` 作降级，但标注“未验证引擎自动截交结果”。

## 官方依据

- [Plane 命令](https://geogebra.github.io/docs/manual/en/commands/Plane/)
- [Intersect 命令](https://geogebra.github.io/docs/manual/en/commands/Intersect/)
