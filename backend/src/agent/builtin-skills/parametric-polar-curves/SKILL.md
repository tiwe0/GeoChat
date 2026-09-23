---
name: parametric-polar-curves
description: 参数曲线、极坐标曲线、3D 空间曲线、切线、曲率和弧长分析技能。
category: high-school-analytic-geometry
parent: analytic-geometry-conic
level: 2
maturity: default
tags: [二级技能, 参数曲线, 极坐标, 空间曲线, 切线, 曲率, 弧长]
tools: [searchGeoGebraCommands, executeGeoGebraCommands, showAnimationGuide, showSolutionSteps, showTeachingHint]
---

# 参数曲线与极坐标曲线

用于无法方便写成 `y=f(x)` 的曲线、极坐标曲线、摆线、螺线、空间螺旋，以及沿曲线运动的切线和几何量。

工作顺序：

1. 明确参数、有限参数区间和方向；参数变量不要使用 `x`、`y` 或 `z`。
2. 2D 曲线使用 `Curve(x(t), y(t), t, a, b)`；3D 曲线补充 `z(t)`；极坐标曲线优先转为 `x=r(t)cos(t)`、`y=r(t)sin(t)`。
3. 用曲线上的动点或参数滑块标示运动方向，再按需构造切线、导向量、曲率圆或弧长。
4. 交点若需数值初值，要明确搜索区间或初始参数，避免把单个数值分支误当作全部交点。
5. 最后检查端点、闭合性、自交点、奇点以及参数增大方向。

常用 GeoGebra 方向：`Curve`、`Point`、`Derivative`、`Tangent`、`Intersect`、`Length`、`Curvature`、`OsculatingCircle`、`Slider`。
