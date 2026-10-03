---
name: polynomial-function
description: 多项式函数、二次函数、三次函数、零点、单调性、极值和参数变化可视化技能。
category: high-school-functions
maturity: default
tags: [多项式函数, 二次函数, 三次函数, 零点, 极值, 单调性, 参数]
tools: [searchGeoGebraCommands, executeGeoGebraCommands, showAnimationGuide, showSolutionSteps, showChoiceAnalysis]
---

# 多项式函数

用于二次、三次及更高次多项式函数的零点、符号、单调性、极值和参数变化。主路径把代数条件落到函数图像、零点、导函数与关键水平线；不把一般非多项式函数混入本技能。

关注点：

- 二次函数优先展示顶点、对称轴、判别式对应的交点数量。
- 三次/高次函数优先展示零点、局部极值和导数符号区间。
- 参数题尽量使用滑块和动态标记展示临界值变化。
- 选择题用不同 scenario 展示每个选项成立或失败的视觉证据。

关键规则：零点重数决定是否穿过 x 轴；`f'(x)=0` 只给出驻点候选，必须结合导数变号判定极值；最高次项决定两端趋势；参数使次数下降时要单独处理退化分支。

## 原生输入小例子

在空白构图中逐行输入；名称冲突时改名，不覆盖用户对象。

```ggb
fPoly(x) = x^3 - 3*x
dfPoly = Derivative(fPoly)
CriticalLeftPoly = Root(dfPoly, -2, 0)
CriticalRightPoly = Root(dfPoly, 0, 2)
ExtremeLeftPoly = (x(CriticalLeftPoly), fPoly(x(CriticalLeftPoly)))
ExtremeRightPoly = (x(CriticalRightPoly), fPoly(x(CriticalRightPoly)))
flatPoly(x) = x^3
flatDerivativePoly = Derivative(flatPoly)
```

预期：`dfPoly=3x^2-3`，极值点为 `(-1,2)` 和 `(1,-2)`，导数符号为正、负、正。正常验证在三个单调区间分别取样；边界验证检查重根处是否穿轴；退化验证：`flatPoly` 在 `x=0` 虽有 `f'=0`，但导数不变号，故是驻点而非极值；若最高次系数变为 0，应按降低后的次数重新分析。

官方参考：[Derivative](https://geogebra.github.io/docs/manual/en/commands/Derivative/)、[Root](https://geogebra.github.io/docs/manual/en/commands/Root/)、[Extremum](https://geogebra.github.io/docs/manual/en/commands/Extremum/)。
