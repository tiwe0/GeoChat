---
name: linear-programming-feasible-region
description: 线性规划可行域、边界直线、目标函数平移和最优顶点二级技能。
category: high-school-functions
parent: linear-programming
level: 2
maturity: default
tags: [二级技能, 线性规划, 可行域, 目标函数, 等值线, 顶点]
tools: [searchGeoGebraCommands, executeGeoGebraCommands, showAnimationGuide, showSolutionSteps, showChoiceAnalysis]
---

# 可行域与目标函数

适用于二元一次不等式组、可行域顶点、目标函数等值线平移和实际规划题。更一般的线性规划结论使用父技能 `linear-programming`；整数约束、非线性边界或高维问题不应仅凭二维阴影求解。

工作顺序：

1. 每个约束先画边界直线，再用测试点判断半平面。
2. 求可行域顶点并标注坐标。
3. 目标函数写成等值线，用平移解释最优位置。
4. 实际题要把变量含义、非负约束和单位说明清楚。

## 构造规则

- 合取约束直接定义成一个 Boolean 区域，同时保留各边界直线；严格与非严格不等式不能混同。
- 顶点由边界交点得到，并逐一检查是否满足全部约束；不要把视觉上的交叉点都当作可行顶点。
- 等值线的法向量由目标函数系数决定；唯一顶点最优、整条边最优、无有限最优值须分别报告。

## 小型原生例子：整条边都是最优解

例子独立；执行前先确认名称无冲突，再按行输入。

```ggb
feasible = (x >= 0) && (y >= 0) && (x + y <= 4)
boundary: x + y = 4
A = Intersect(xAxis, yAxis)
B = Intersect(xAxis, boundary)
C = Intersect(yAxis, boundary)
k = 4
objectiveLine: x + y = k
valueA = x(A) + y(A)
valueB = x(B) + y(B)
valueC = x(C) + y(C)
```

预期：可行域是含边界的三角形，`A=(0,0)`、`B=(4,0)`、`C=(0,4)`；`valueA=0`、`valueB=valueC=4`，目标等值线与边界重合，因此线段 `BC` 上每一点都是最大解，不能误报只有两个端点。正常检查区域内部与三顶点；边界检查整边最优；退化检查把 `<=` 改成 `<` 后该边不属于区域，最大值不取到，只存在上确界 `4`。

实际题还要验证单位、非负约束与连续/整数决策变量。只使用原生命令，不使用 JavaScript、XML 或 `Execute`。

官方参考：[Inequalities](https://geogebra.github.io/docs/manual/en/Inequalities/)、[Boolean values](https://geogebra.github.io/docs/manual/en/Boolean_values/)、[Intersect](https://geogebra.github.io/docs/manual/en/commands/Intersect/)。
