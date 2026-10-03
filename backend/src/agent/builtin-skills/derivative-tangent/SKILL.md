---
name: derivative-tangent
description: 导数几何意义、切线、法线、切点和参数切线条件技能。
category: high-school-calculus
parent: derivative-application
level: 2
maturity: default
tags: [二级技能, 导数, 切线, 法线, 切点, 斜率]
tools: [searchGeoGebraCommands, executeGeoGebraCommands, showSolutionSteps, showChoiceAnalysis]
---

# 导数与切线

适用于求切线方程、过定点切线、公切线、切点参数和切线与函数关系。必须区分切点横坐标和给定点坐标。

工作顺序：

1. 设切点并写出 f'(x0) 作为切线斜率。
2. 用点斜式建立切线方程。
3. 过定点切线题把定点代入切线方程求切点。
4. 可视化时同时画函数、切点、切线和给定点。

关键规则：`Tangent(P,f)` 使用 `x(P)` 作为切点横坐标，给定点不必在函数上；切点应另建为 `(x0,f(x0))`。切线斜率是 `f'(x0)`；法线斜率仅在切线斜率非零时为 `-1/f'(x0)`，水平切线对应竖直法线。

## 原生输入小例子

在空白构图中逐行输入；名称冲突时改名，不覆盖用户对象。

```ggb
fTan(x) = x^2
x0Tan = 1
TouchTan = (x0Tan, fTan(x0Tan))
tangentTan = Tangent(TouchTan, fTan)
slopeTan = Slope(tangentTan)
OffCurveTan = (1, 5)
tangentFromXOnlyTan = Tangent(OffCurveTan, fTan)
flatFnTan(x) = 4
flatTangentTan = Tangent(0, flatFnTan)
```

预期：`TouchTan=(1,1)`，`tangentTan` 与 `tangentFromXOnlyTan` 都是 `y=2x-1`，`slopeTan=2`；这证明函数版 `Tangent` 读取的是点的横坐标，不是要求点落在函数上。正常验证将切点代入直线并核对斜率；边界验证 `flatTangentTan` 为 `y=4`，其法线应为竖线 `x=0`；退化验证在不可导点不要强行生成唯一切线。

官方参考：[Tangent](https://geogebra.github.io/docs/manual/en/commands/Tangent/)、[Slope](https://geogebra.github.io/docs/manual/en/commands/Slope/)、[Derivative](https://geogebra.github.io/docs/manual/en/commands/Derivative/)。
