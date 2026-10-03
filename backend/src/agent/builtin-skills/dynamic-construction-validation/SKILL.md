---
name: dynamic-construction-validation
description: 规划自由对象与依赖对象，并用拖动测试检查构造不变量、欠约束和过约束的技能。
category: middle-school-geometry
parent: geometric-construction
level: 2
maturity: default
tags: [二级技能, 动态几何, 依赖关系, 拖动测试, 不变量, 欠约束, 过约束]
tools: [getCanvasContext, searchGeoGebraCommands, createGeometryPlan, executeGeoGebraCommands, showSelectedElements, showTeachingHint]
---

# 动态构造验证

用于区分“看起来像”与“按性质构造”。目标是让图形在允许的拖动范围内始终保持题设性质，同时仍覆盖该类图形的一般情形。静态证明用 `geometric-theorem-verification`；只需展示变换效果用 `geometric-transformations`；拖动通过不是符号证明。

工作顺序：

1. 先列出语义实体角色：题目给定对象、最少的自由对象、依赖对象、派生测量和只用于展示的对象；不要让展示对象参与数学依赖。
2. 列出必须保持的不变量，例如等长、垂直、共线、共圆、固定距离或点在路径上，并为每个不变量指定可观察的验证量、容差和退化条件。
3. 建立有方向的依赖图：自由点负责改变一般形状，其余对象通过圆、平行线、垂线、中点、交点等定义生成；依赖对象不得用独立坐标复制。
4. 构造完成后执行拖动测试：改变每个自由点，确认不变量保持、对象不意外消失、分支不跳转。
5. 检查欠约束：若拖动后性质可被破坏，说明只是绘图；检查过约束：若只能得到特殊情形，说明自由度不足。
6. 对可能退化的位置单独检查，例如三点共线、圆半径为零、两线平行导致交点不存在，并在说明中写出有效条件。
7. 修复只触及失败不变量的依赖子图；同一不变量连续两次失败时回滚并重建该子图，不用样式调整掩盖错误。

常用 GeoGebra 方向：`Point`、`PointIn`、`Circle`、`Line`、`Segment`、`PerpendicularLine`、`ParallelLine`、`Intersect`、`Distance`、`Relation`。

验证原则：坐标恰好满足性质不是证明。优先把性质写入对象依赖关系，再用测量或 `Relation` 做可见检查。

## 小型原生例子：依赖构造矩形

例子独立；执行前先确认名称无冲突，再按行输入。

```ggb
A = (-2, 0)
B = (2, 0)
base = Line(A, B)
normalAtA = PerpendicularLine(A, base)
C = Point(normalAtA)
throughC = Line(C, base)
throughB = PerpendicularLine(B, base)
D = Intersect(throughC, throughB)
rightCheck = ArePerpendicular(Line(A, C), Line(A, B))
parallelCheck = AreParallel(Line(C, D), Line(A, B))
```

预期：拖动自由点 `A/B` 或路径点 `C` 后，`D` 自动更新，两个检查在非退化情形均为 `true`。正常检查逐个拖动；边界检查让 `C` 接近 `A`，矩形趋于零高；退化检查 `A = B` 时底边方向消失，或 `C = A` 时图形退化，不能保留旧 `D` 或声称仍是矩形。

若 Boolean/`Relation` 检查失败，先检查依赖图和分支，不用样式修饰掩盖错误。只使用原生命令，不使用 JavaScript、XML 或 `Execute`；命令签名不确定时先用 `searchGeoGebraCommands`。

官方参考：[自由对象与依赖对象](https://geogebra.github.io/docs/manual/en/Free_Dependent_and_Auxiliary_Objects/)、[Point](https://geogebra.github.io/docs/manual/en/commands/Point/)、[Line](https://geogebra.github.io/docs/manual/en/commands/Line/)、[Relation](https://geogebra.github.io/docs/manual/en/commands/Relation/)。
