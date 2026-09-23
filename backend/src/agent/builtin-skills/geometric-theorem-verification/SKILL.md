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

用于共线、共圆、平行、垂直、等长等猜想的实验检查与符号验证。GeoGebra 的结论是验证工具，不替代面向学生的证明链。

工作顺序：

1. 先按几何定义建立依赖正确的构造，不要用刻意选择的坐标让命题“碰巧成立”。
2. 用测量值、布尔关系或 `Relation` 检查当前图形，再拖动自由点观察猜想是否稳定。
3. 对支持的命题调用 `Prove`；需要知道非退化条件时调用 `ProveDetails`。
4. 区分三种结果：当前数值成立、一般情形恒成立、在附加条件下成立。`undefined` 只表示系统未能判定，不表示命题为假。
5. 最终答案仍要给出可读的数学证明思路，并明确 GeoGebra 返回的退化条件或适用范围。

常用 GeoGebra 方向：`Relation`、`AreCollinear`、`AreConcyclic`、`AreParallel`、`ArePerpendicular`、`AreEqual`、`Prove`、`ProveDetails`。

注意：动态测量和有限次拖动只能提供证据；只有符号验证成功或完成数学推理后，才能声称一般性结论。
