---
name: analytic-geometry-conic
description: 高中解析几何、直线与圆、椭圆、双曲线、抛物线、轨迹和参数关系技能。
category: high-school-analytic-geometry
maturity: default
tags: [解析几何, 直线, 圆, 椭圆, 双曲线, 抛物线, 轨迹]
tools: [searchGeoGebraCommands, executeGeoGebraCommands, showAnimationGuide, showSolutionSteps, showChoiceAnalysis]
---

# 解析几何与圆锥曲线

适用于直线、圆、椭圆、双曲线、抛物线、弦、切线、焦点、离心率、轨迹和参数关系，必须同时维护代数方程和几何图像。纯平面合成证明使用 `plane-geometry`；复杂参数曲线用 `parametric-polar-curves`；仅凭绘图精度不能判断重根、相切或一般性结论。

工作顺序：

1. 先画坐标系、曲线、焦点/准线/中心/渐近线等关键元素。
2. 直线与曲线位置关系用交点、判别式、弦长、中点和斜率展示。
3. 切线题标出切点、切线、法线或斜率条件；轨迹题用动点和参数滑块展示生成过程。
4. 选择题逐项检查焦点、离心率、渐近线、范围或交点数量。

## 小型原生例子：椭圆的水平弦

例子独立；执行前先确认名称无冲突，再按行输入。

```ggb
F1 = (-2, 0)
F2 = (2, 0)
P = (0, 3)
ellipse = Ellipse(F1, F2, P)
focusSum = Distance(P, F1) + Distance(P, F2)
focusGap = Distance(F1, F2)
validEllipse = focusSum > focusGap
U = (0, 1)
V = (1, 1)
chordLine = Line(U, V)
X = Intersect(ellipse, chordLine, 1)
Y = Intersect(ellipse, chordLine, 2)
M = Midpoint(X, Y)
midpointCheck = x(M) == 0
```

预期：初始 `focusSum = 2sqrt(13) > focusGap = 4`、`validEllipse = true`，椭圆方程为 `x²/13 + y²/9 = 1`，`M = (0, 1)`、`midpointCheck = true`。移动 `P` 时曲线、焦距和交点必须联动。正常检查可将 `P` 移到不等距位置 `(1, 3)`：此时两焦距分别为 `sqrt(18)` 与 `sqrt(10)`，其和仍大于 `4`，椭圆继续有效；边界检查割线相切时两交点合并。由三角不等式总有 `focusSum >= focusGap`；等号恰在 `P` 位于焦点线段上时成立，此时椭圆退化为线段。两焦点重合则是圆的特殊情形，须与线段退化区分。

常用 GeoGebra 方向：`Line`、`Circle`、`Ellipse`、`Hyperbola`、`Parabola`、`Intersect`、`Tangent`、`Locus`。

只使用原生命令，不使用 JavaScript、XML 或 `Execute`；交点分支、切线参数或命令签名不确定时先用 `searchGeoGebraCommands` 核对。

官方参考：[Conic sections](https://geogebra.github.io/docs/manual/en/Conic_sections/)、[Ellipse](https://geogebra.github.io/docs/manual/en/commands/Ellipse/)、[Intersect](https://geogebra.github.io/docs/manual/en/commands/Intersect/)、[Tangent](https://geogebra.github.io/docs/manual/en/commands/Tangent/)。
