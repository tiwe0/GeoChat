---
name: exponential-log-transform
description: 指数对数函数图像变换、定义域、单调性和交点比较的二级技能。
category: high-school-functions
parent: exponential-logarithmic-function
level: 2
maturity: default
tags: [二级技能, 指数函数, 对数函数, 定义域, 单调性, 图像变换]
tools: [searchGeoGebraCommands, executeGeoGebraCommands, showAnimationGuide, showSolutionSteps, showChoiceAnalysis]
---

# 指数对数图像变换

适用于 y=a^x、y=log_a x 及其平移、伸缩、复合和比较大小问题。底数和定义域是第一约束。

工作顺序：

1. 先写出底数限制、真数限制和定义域。
2. 标出关键点、渐近线和单调方向。
3. 比较大小时优先用单调性、同底化或图像交点。
4. 参数题用滑块展示底数、平移量或交点个数变化。

关键规则：`a^(x-h)+k` 的水平渐近线是 `y=k`；`log(a,x-h)+k` 的定义域是 `x>h`、竖直渐近线是 `x=h`；写成 `x-h` 表示向右平移 `h`，不要把符号读反。

## 原生输入小例子

在空白构图中逐行输入；名称冲突时改名，不覆盖用户对象。

```ggb
expShiftELT(x) = 2^(x - 1) + 3
logShiftELT(x) = log(2, x - 1) + 3
horizontalAsymptoteELT: y = 3
verticalAsymptoteELT: x = 1
ExpKeyELT = (1, expShiftELT(1))
LogKeyELT = (2, logShiftELT(2))
logBoundaryELT = logShiftELT(1)
```

预期：`ExpKeyELT=(1,4)`、`LogKeyELT=(2,3)`、`logBoundaryELT` 未定义；指数图像趋近 `y=3` 但不相交，对数图像只在 `x>1` 定义。正常验证检查关键点；边界验证代入 `x=1`；退化验证平移量为 0 时渐近线恢复坐标轴，而底数为 1 时对数模型非法。

官方参考：[预定义函数与运算符](https://geogebra.github.io/docs/manual/en/Predefined_Functions_and_Operators/)、[Asymptote](https://geogebra.github.io/docs/manual/en/commands/Asymptote/)。
