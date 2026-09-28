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

用于区分“看起来像”与“按性质构造”。目标是让图形在允许的拖动范围内始终保持题设性质，同时仍覆盖该类图形的一般情形。

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
