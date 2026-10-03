---
name: geometric-theorem-verification
description: 用数值关系检查、拖动测试与 Prove/ProveDetails 做几何猜想验证和退化条件说明的技能。
category: high-school-plane-geometry
parent: plane-geometry
level: 2
maturity: default
tags: [二级技能, 几何定理, 猜想验证, 符号证明, Prove, 退化条件, 拖动测试]
tools: [getCanvasContext, searchGeoGebraCommands, createGeometryPlan, executeGeoGebraCommands, showSolutionSteps, showTeachingHint, showSelectedElements]
---

# 几何定理验证

用于共线、共圆、平行、垂直、等长等猜想的实验检查与符号验证。仅需作图时使用 `plane-geometry`；含超越函数、数值近似或当前证明后端不支持的对象时，不应强行把数值结果包装成定理。GeoGebra 的结论是验证工具，不替代面向学生的证明链。

工作顺序：

1. 先按几何定义建立依赖正确的构造，不要用刻意选择的坐标让命题“碰巧成立”。
2. 用测量值、布尔关系或 `Relation` 检查当前图形，再拖动自由点观察猜想是否稳定。
3. 对支持的命题调用 `Prove`；需要知道非退化条件时调用 `ProveDetails`。
4. 区分三种结果：当前数值成立、一般情形恒成立、在附加条件下成立。`undefined` 只表示系统未能判定，不表示命题为假。
5. 最终答案仍要给出可读的数学证明思路，并明确 GeoGebra 返回的退化条件或适用范围。

## 小型原生例子：三角形中位线

例子独立；执行前先确认名称无冲突，再按行输入。

```ggb
A = (-3, 0)
B = (3, 0)
C = (1, 4)
M = Midpoint(A, B)
N = Midpoint(A, C)
midline = Line(M, N)
opposite = Line(B, C)
currentCheck = AreParallel(midline, opposite)
generalCheck = Prove(AreParallel(midline, opposite))
conditionCheck = ProveDetails(AreParallel(midline, opposite))
```

预期：非共线三角形中 `currentCheck = true`，证明后端支持该构造时 `generalCheck = true`；`conditionCheck` 还应暴露证明状态及可能的非退化条件，不能预设其列表在所有版本中完全相同。正常检查拖动 `A/B/C`；边界检查接近共线；退化检查顶点重合或三点共线，此时“中位线与第三边”语义可能失效，须结合 `ProveDetails` 返回与数学前提解释。

常用 GeoGebra 方向：`Relation`、`AreCollinear`、`AreConcyclic`、`AreParallel`、`ArePerpendicular`、`AreEqual`、`Prove`、`ProveDetails`。

注意：动态测量和有限次拖动只能提供证据；只有符号验证成功或完成数学推理后，才能声称一般性结论。

若 `Prove`/`ProveDetails` 不可用、超时或返回 `undefined`，降级到 Boolean 关系、测量和拖动测试，并明确“系统未能判定”；`undefined` 只表示未能判定，不表示命题为假。只使用原生命令，不使用 JavaScript、XML 或 `Execute`。

官方参考：[Prove](https://geogebra.github.io/docs/manual/en/commands/Prove/)、[ProveDetails](https://geogebra.github.io/docs/manual/en/commands/ProveDetails/)、[Relation](https://geogebra.github.io/docs/manual/en/commands/Relation/)、[AreParallel](https://geogebra.github.io/docs/manual/en/commands/AreParallel/)。
