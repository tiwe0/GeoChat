---
name: parametric-surface-revolution
description: 3D 参数曲面、二元函数曲面、旋转曲面、截线和曲面构图技能。
category: high-school-solid-geometry
parent: solid-geometry
level: 2
maturity: default
tags: [二级技能, 参数曲面, 旋转曲面, 二元函数, 曲面截线, 3D, 空间建模]
tools: [getCanvasContext, searchGeoGebraCommands, executeGeoGebraCommands, showSolutionSteps, showTeachingHint, setPerspective]
---

# 参数曲面与旋转曲面

用于二元函数图像、参数曲面、曲线绕轴旋转、圆柱/圆锥/环面建模，以及平面与曲面的截线观察。

工作顺序：

1. 先判断使用 `f(x,y)`、参数化 `Surface`，还是“曲线 + 旋转角 + 旋转轴”的曲面。
2. 明确两个参数的有限范围和几何含义；先用低复杂度范围验证形状，再逐步增加精度或范围。
3. 先画母线、轴、关键截面或边界，再生成半透明曲面，避免曲面遮住数学结构。
4. 截面问题用平面与曲面/多面体的交对象验证，必要时同时保留 2D 投影或关键截线。
5. 完成后调整 3D 视角，确保三个方向可辨、关键截线无遮挡，且没有无意义的自动旋转。

常用 GeoGebra 方向：`Surface`、`Curve`、`Function`、`Plane`、`Intersect`、`IntersectPath`、`Cylinder`、`Cone`、`Sphere`。

性能约束：禁止一开始用高密度嵌套 `Sequence` 或动态 `Execute` 生成曲面网格；这类构造容易造成 WebGL 压力。优先使用原生 `Surface` 并限制参数范围。
