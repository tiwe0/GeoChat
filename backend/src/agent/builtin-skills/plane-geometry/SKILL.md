---
name: plane-geometry
description: 高中平面几何题的作图、辅助线、相似全等、圆与角关系可视化技能。
category: high-school-plane-geometry
maturity: default
tags: [平面几何, 圆, 三角形, 相似, 全等, 辅助线]
tools: [searchGeoGebraCommands, createGeometryPlan, executeGeoGebraCommands, showSolutionSteps, showTeachingHint, showSelectedElements]
---

# 平面几何

适用于三角形、四边形、圆、角、相似全等与辅助线问题，目标是把题设关系建成可拖动的依赖构造并给出可读推理。解析坐标或圆锥曲线题改用 `analytic-geometry-conic`；只要求尺规步骤时改用 `geometric-construction`；数值观察不能冒充证明。

## 构造规则

1. 先区分自由点、题设依赖对象、辅助对象和结论测量；按“已知 → 构造 → 测量/判断”建图，不把当前长度、角度或交点坐标复制成常量。
2. 辅助线必须对应明确依据，例如连接圆心与切点、作高/中线/角平分线、延长边；不为凑结论添加与题设无关的固定坐标。
3. 相似、全等和圆周角关系逐项标出对应对象；选择题的选项分别检查，避免一个特例同时替代所有情形。
4. 拖动所有自由点，检查关系是否持续成立，并单列共线、重合、零长度、平行无交点等退化位置。

## 小型原生例子：三角形的高

例子独立；执行前先确认对象名无冲突，再按行输入。

```ggb
A = (-2, 0)
B = (3, 0)
C = (1, 3)
base = Line(A, B)
altitude = PerpendicularLine(C, base)
H = Intersect(altitude, base)
height = Distance(C, H)
rightCheck = ArePerpendicular(altitude, base)
```

预期：`H = (1, 0)`、`height = 3`、`rightCheck = true`。移动 `C` 时，`H` 与高长必须联动，不能把 `H` 固定写成 `(1, 0)`。正常检查移动 `C`；边界检查让 `C` 落到 `base` 上，此时高长为 `0`；退化检查令 `A = B`，底边不再唯一，相关对象未定义是正确提示，应恢复非重合端点后再讨论三角形。

## 结果边界

动态测量与有限拖动只提供实验性证据。需要证明时给出数学证明链；若当前环境没有可用的 `Prove`/`ProveDetails` 或其返回未定义，只能报告“未能符号判定”，不能声称已证明或已证伪。

官方参考：[自由对象与依赖对象](https://geogebra.github.io/docs/manual/en/Free_Dependent_and_Auxiliary_Objects/)、[PerpendicularLine](https://geogebra.github.io/docs/manual/en/commands/PerpendicularLine/)、[Intersect](https://geogebra.github.io/docs/manual/en/commands/Intersect/)、[Relation](https://geogebra.github.io/docs/manual/en/commands/Relation/)。
