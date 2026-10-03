---
name: geometric-transformations
description: 初中图形变换、平移、旋转、轴对称、中心对称、相似变换和测量作图技能。
category: middle-school-geometry
maturity: default
tags: [图形变换, 平移, 旋转, 轴对称, 中心对称, 相似, 测量]
tools: [searchGeoGebraCommands, createGeometryPlan, executeGeoGebraCommands, showSolutionSteps, showTeachingHint, showSelectedElements]
---

# 图形变换

适用于平移、旋转、轴对称、中心对称和位似，重点是原图与像之间的一一对应。只要求尺规基本作图时使用 `geometric-construction`；仿射/投影等非本课程变换不应硬套全等性质。

## 构造规则

1. 先建立原对象与变换参数（轴、中心、向量、角或比例），再由 `Reflect`、`Rotate`、`Translate`、`Dilate` 生成像。
2. 像点不得手工输入当前坐标；对应边、距离、角和方向必须随原对象或参数改变而联动。
3. 明确不变量：刚体变换保长度和角，位似按比例改变长度；反射改变定向但保距离。
4. 检查零向量、零/负比例、点在对称轴或旋转中心上、退化原图等边界。

## 小型原生例子：轴对称

例子独立；执行前先确认名称无冲突，再按行输入。

```ggb
P = (0, -2)
Q = (0, 2)
axis = Line(P, Q)
A = (3, 1)
A1 = Reflect(A, axis)
d0 = Distance(A, axis)
d1 = Distance(A1, axis)
distanceCheck = d0 == d1
midOnAxis = Distance(Midpoint(A, A1), axis) == 0
```

预期：`A1 = (-3, 1)`、`d0 = d1 = 3`，两个检查均为 `true`。移动 `A` 时像点必须同步；边界检查令 `A` 位于轴上，此时 `A1 = A`；退化检查令 `P = Q`，对称轴不唯一，反射结果应视为未定义而非沿用旧值。

## 结果边界

样式相似不证明变换关系，必须保留命令依赖。只使用原生命令，不使用 JavaScript、XML 或 `Execute`；未知的对象类型或参数顺序先调用 `searchGeoGebraCommands`。

官方参考：[Transformation Commands](https://geogebra.github.io/docs/manual/en/commands/Transformation_Commands/)、[Reflect](https://geogebra.github.io/docs/manual/en/commands/Reflect/)、[Rotate](https://geogebra.github.io/docs/manual/en/commands/Rotate/)、[Translate](https://geogebra.github.io/docs/manual/en/commands/Translate/)、[Dilate](https://geogebra.github.io/docs/manual/en/commands/Dilate/)。
