---
name: derivative-application
description: 高中导数、切线、单调性、极值、最值、零点和参数讨论技能。
category: high-school-calculus
maturity: default
tags: [导数, 切线, 单调性, 极值, 最值, 零点, 参数]
tools: [searchGeoGebraCommands, executeGeoGebraCommands, showAnimationGuide, showSolutionSteps, showChoiceAnalysis]
---

# 导数及其应用

适用于切线、导函数、单调区间、极值最值、函数零点、恒成立和参数讨论。核心是把 f、f'、切线和临界点放在同一视图中解释。

工作顺序：

1. 明确函数定义域，求导前先处理参数和不可导点。
2. 同时画 f(x) 和 f'(x)，用 f' 的符号解释 f 的增减。
3. 极值/最值题标出临界点、端点和函数值；切线题标出切点与斜率。
4. 参数题寻找切线重合、重根、极值穿越水平线或区间端点变化。

关键规则：临界点包括 `f'=0` 和导数不存在但函数有定义的点；驻点不必是极值；闭区间最值还必须比较端点；导数符号从正变负为极大、从负变正为极小。不要只给导数表，必须把临界点和原函数对应起来。

## 原生输入小例子

在空白构图中逐行输入；名称冲突时改名，不覆盖用户对象。

```ggb
fDerApp(x) = x^3 - 3*x
dfDerApp = Derivative(fDerApp)
CriticalLeftDerApp = Root(dfDerApp, -2, 0)
CriticalRightDerApp = Root(dfDerApp, 0, 2)
MaxDerApp = (x(CriticalLeftDerApp), fDerApp(x(CriticalLeftDerApp)))
MinDerApp = (x(CriticalRightDerApp), fDerApp(x(CriticalRightDerApp)))
stationaryOnlyDerApp(x) = x^3
```

预期：`dfDerApp=3x^2-3`，`MaxDerApp=(-1,2)`、`MinDerApp=(1,-2)`；导数在 `(-∞,-1)`、`(1,∞)` 为正，在 `(-1,1)` 为负。正常验证对每个区间取样；边界验证闭区间时另算端点值；退化验证 `stationaryOnlyDerApp` 在 0 处导数为 0 但无极值。

官方参考：[Derivative](https://geogebra.github.io/docs/manual/en/commands/Derivative/)、[Root](https://geogebra.github.io/docs/manual/en/commands/Root/)、[Extremum](https://geogebra.github.io/docs/manual/en/commands/Extremum/)。
