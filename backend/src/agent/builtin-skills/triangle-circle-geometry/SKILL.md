---
name: triangle-circle-geometry
description: 三角形、圆、圆周角、切线、相似全等和常见辅助线的二级几何技能。
category: high-school-plane-geometry
parent: plane-geometry
level: 2
maturity: default
tags: [二级技能, 三角形, 圆, 圆周角, 切线, 相似, 全等]
tools: [searchGeoGebraCommands, createGeometryPlan, executeGeoGebraCommands, showSolutionSteps, showTeachingHint, showSelectedElements]
---

# 三角形与圆

适用于三角形的角边关系、内外接圆、圆周角、弦、切线以及相似/全等辅助线。纯解析坐标计算用 `analytic-geometry-conic`；一般尺规流程用 `geometric-construction`；拖动或测量只能验证当前构造，不能替代证明。

## 构造规则

1. 三角形顶点先作为自由对象，圆心、切点、中点、高等由定义生成；禁止将测得的圆心或切点坐标抄成常量。
2. 切线题连接圆心与切点并验证垂直；圆周角题明确同弧；相似/全等题逐一对应边角条件。
3. 对 `Intersect`、`Tangent` 等多解命令明确所取分支，并在拖动后检查分支是否跳转。
4. 单列三点共线、半径为零、切线变割线或交点合并等退化条件。

## 小型原生例子：圆上一点的切线

例子独立；执行前先确认名称无冲突，再按行输入。

```ggb
A = (-2, 0)
B = (2, 0)
C = (0, 3)
circumcircle = Circle(A, B, C)
O = Center(circumcircle)
tangentAtC = Tangent(C, circumcircle)
radiusAtC = Line(O, C)
tangentCheck = ArePerpendicular(tangentAtC, radiusAtC)
```

预期：`O = (0, 5/6)`，`tangentCheck = true`；拖动任一顶点且保持三点不共线时，圆心、圆和切线联动。正常检查一般三角形；边界检查接近共线时对象可能数值不稳定；退化检查三点共线时外接圆和切线未定义，不能把旧圆心保留下来冒充结果。

## 结果边界

需要“证明”时仍须给出半径垂直切线、同弧所对圆周角等数学链条。符号证明能力不可用或返回 `undefined` 时，只能降级为测量、关系检查和拖动证据；`undefined` 只表示未能判定。

官方参考：[Circle](https://geogebra.github.io/docs/manual/en/commands/Circle/)、[Center](https://geogebra.github.io/docs/manual/en/commands/Center/)、[Tangent](https://geogebra.github.io/docs/manual/en/commands/Tangent/)、[ArePerpendicular](https://geogebra.github.io/docs/manual/en/commands/ArePerpendicular/)。
