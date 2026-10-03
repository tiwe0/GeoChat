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

用于无法方便写成 `y=f(x)` 的曲线、极坐标曲线、摆线、螺线、空间螺旋，以及沿曲线运动的切线和几何量。普通函数图像使用 `function-graph`；几何依赖生成的轨迹与包络使用 `locus-envelope`；离散采样折线不能替代连续参数曲线。

工作顺序：

1. 明确参数、有限参数区间和方向；参数变量不要使用 `x`、`y` 或 `z`。
2. 2D 曲线使用 `Curve(x(t), y(t), t, a, b)`；3D 曲线补充 `z(t)`；极坐标曲线优先转为 `x=r(t)cos(t)`、`y=r(t)sin(t)`。
3. 用曲线上的动点或参数滑块标示运动方向，再按需构造切线、导向量、曲率圆或弧长。
4. 交点若需数值初值，要明确搜索区间或初始参数，避免把单个数值分支误当作全部交点。
5. 最后检查端点、闭合性、自交点、奇点以及参数增大方向。

常用 GeoGebra 方向：`Curve`、`Point`、`Derivative`、`Tangent`、`Intersect`、`Length`、`Curvature`、`OsculatingCircle`、`Slider`。

## 小型原生例子：抛物线参数曲线及切线

例子独立；执行前先确认名称无冲突，再按行输入。

```ggb
curve = Curve(t, t^2, t, -2, 2)
P = curve(1)
tangentAtP = Tangent(P, curve)
T0 = curve(0)
T1 = curve(2)
arcLength = Length(curve, 0, 1)
```

预期：`P = (1, 1)`，切线为 `y = 2x - 1`，`T0 = (0, 0)`、`T1 = (2, 4)`；`arcLength` 是参数区间 `[0,1]` 上的弧长。正常检查多个参数位置；边界检查 `t=-2,2` 的端点和 `t=0` 的水平切线；退化检查零长度参数区间得到点状曲线或零弧长，导向量为零的奇点处切线/曲率可能未定义，不能沿用邻近值。

参数变量保留在表达式中，不能把 `P` 的当前坐标复制成常量。极坐标转笛卡尔时同时使用 `r(t) cos(t)`、`r(t) sin(t)` 并注明有限区间。只使用原生命令，不使用 JavaScript、XML 或 `Execute`。

官方参考：[Curves](https://geogebra.github.io/docs/manual/en/Curves/)、[Curve](https://geogebra.github.io/docs/manual/en/commands/Curve/)、[Tangent](https://geogebra.github.io/docs/manual/en/commands/Tangent/)、[Length](https://geogebra.github.io/docs/manual/en/commands/Length/)、[Curvature](https://geogebra.github.io/docs/manual/en/commands/Curvature/)。
