---
name: linear-programming
description: 线性规划、可行域、目标函数等值线和最优顶点技能。
category: high-school-functions
maturity: default
tags: [线性规划, 不等式组, 可行域, 目标函数, 最优解]
tools: [searchGeoGebraCommands, executeGeoGebraCommands, showAnimationGuide, showSolutionSteps, showChoiceAnalysis]
---

# 线性规划

适用于二维线性约束与线性目标函数。必须画出约束边界、半平面方向、可行域和目标函数等值线，最终答案绑定到可行域顶点或最优边。整数规划、非线性约束和三维以上问题不能直接套用“只查顶点”的二维图解法。

工作顺序：

1. 把每个不等式转成边界直线和取侧测试点。
2. 标出可行域顶点。
3. 绘制目标函数等值线，必要时用参数滑块平移。
4. 对最值，逐点或沿边验证，不只给代数结论。

## 小型原生例子：有界可行域的唯一最优顶点

例子独立；执行前先确认名称无冲突，再按行输入。

```ggb
feasible = (x >= 0) && (y >= 0) && (x + y <= 4) && (x + 2y <= 6)
b1: x + y = 4
b2: x + 2y = 6
A = Intersect(xAxis, yAxis)
B = Intersect(xAxis, b1)
C = Intersect(b1, b2)
D = Intersect(yAxis, b2)
values = {3x(A) + 2y(A), 3x(B) + 2y(B), 3x(C) + 2y(C), 3x(D) + 2y(D)}
bestValue = Max(values)
k = 9
objectiveLine: 3x + 2y = k
```

预期：顶点依次为 `(0,0)`、`(4,0)`、`(2,2)`、`(0,3)`，`values={0,12,10,6}`，故依赖测量 `bestValue=12` 且唯一最优点为 `B`。自由参数 `k` 初始为 `9`，用于平移等值线；执行 `SetValue(k, 12)` 后等值线通过 `B`，而 `bestValue` 仍由顶点值列表计算，不能通过改写它来移动直线。正常检查逐顶点代入与多个 `k` 值；边界检查目标线与一条可行边平行时可能有整段最优解；退化检查空可行域、单点/线段可行域和无界可行域，不能在不存在有限最值时仍返回某个绘图区边缘点。

不等式对象保留原约束，顶点用边界交点生成，不手填坐标。严格不等式的边界不属于可行域，最优值可能只有上确界而不取到。只使用原生命令，不使用 JavaScript、XML 或 `Execute`。

官方参考：[Inequalities](https://geogebra.github.io/docs/manual/en/Inequalities/)、[Intersect](https://geogebra.github.io/docs/manual/en/commands/Intersect/)、[Max](https://geogebra.github.io/docs/manual/en/commands/Max/)、[PointIn](https://geogebra.github.io/docs/manual/en/commands/PointIn/)。
