---
name: regression-model-diagnostics
description: 散点数据、回归模型选择、残差、拟合优度和异常点诊断技能。
category: middle-high-school-statistics-probability
parent: probability-statistics
level: 2
maturity: default
tags: [二级技能, 散点图, 回归, 拟合, 残差, R方, 异常点, 数据建模]
tools: [searchGeoGebraCommands, executeGeoGebraCommands, showSolutionSteps, showTeachingHint, showChoiceAnalysis]
---

# 回归建模与诊断

用于从散点数据选择线性、多项式、指数、对数、幂、正弦或逻辑斯蒂模型，并用残差和拟合优度检查模型，而不是只画一条“看起来接近”的曲线。

工作顺序：

1. 先显示原始散点，检查自变量范围、量纲、重复点、异常点和明显的非线性结构。
2. 根据问题机制选择少量候选模型，例如线性增长、指数增长/衰减、饱和增长或周期变化。
3. 对候选模型分别构造拟合曲线，并比较 `RSquare`、`SumSquaredErrors` 和 `ResidualPlot`。
4. 残差若呈系统形状，说明模型遗漏结构；单纯提高多项式次数不等于模型更合理。
5. 给出结论时同时报告适用区间、异常点影响和外推风险，不把相关性写成因果关系。

常用 GeoGebra 方向：`FitLine`、`FitPoly`、`FitExp`、`FitLog`、`FitPow`、`FitSin`、`FitLogistic`、`ResidualPlot`、`RSquare`、`CorrelationCoefficient`。

## 数学与能力规则

- `FitLine` 是 y 对 x 的最小二乘直线，与 x 对 y 不可互换；但 `ResidualPlot`、`SumSquaredErrors`和 `RSquare` 的官方签名要求函数，因此下游诊断用 `FitPoly(点列表,1)` 产生等价一次函数，不依赖未验证的直线到函数隐式转换。残差定义为 `y_i-f(x_i)`。
- `RSquare` 与 `SumSquaredErrors` 只能在同一数据集、同一响应变量上比较；更高 R²/更低 SSE 不自动证明模型机制正确。
- 相同 x 的多个观测可保留，但所有 x 相同时线性回归退化；对数/幂/逻辑斯蒂模型先检查定义域和参数可识别性。
- 下例 `rm` 前缀执行前必须确认未占用。

## 原生小例：线性回归与残差

```ggb
rmPoints = {(-2, 1), (1, 2), (2, 4), (4, 3), (5, 4)}
rmLinear = FitPoly(rmPoints, 1)
rmBaseline(x) = 2.8
rmResiduals = ResidualPlot(rmPoints, rmLinear)
rmLinearSSE = SumSquaredErrors(rmPoints, rmLinear)
rmBaselineSSE = SumSquaredErrors(rmPoints, rmBaseline)
rmLinearR2 = RSquare(rmPoints, rmLinear)
rmBaselineR2 = RSquare(rmPoints, rmBaseline)
SetColor(rmLinear, 0, 114, 178)
SetLineThickness(rmLinear, 5)
```

预期：`rmLinear(x)=0.4x+2`，残差依次为 `-0.2,-0.4,1.2,-0.6,0`，`rmLinearSSE=2`，`rmLinearR2≈0.705882`。同一点集的均值常数基线 `rmBaseline(x)=2.8` 有 `rmBaselineSSE=6.8`、`rmBaselineR2=0`，因此一次模型对该样本优于基线；这仍不证明因果或外推有效。

## 检查与降级

- 正常：用原始点图、拟合线、残差图和指标共同检查；线性模型还要检查残差有无弯曲/扇形结构。
- 退化：少于两个有效点、所有 x 相同、非有限数值时停止拟合；所有 y 相同时 R² 可未定义，不强制写成 1。
- 边界：极大/极小数先归一化；离群点要比较包含/不包含的结果，但不得为了提高 R² 无理由删点。
- 若回归或残差图命令在当前内核不可用，保留原始点和手算预测/残差表，明确说明真实 applet 计算未验证。

## 官方依据

- [FitLine 命令](https://geogebra.github.io/docs/manual/en/commands/FitLine/)
- [FitPoly 命令](https://geogebra.github.io/docs/manual/en/commands/FitPoly/)
- [ResidualPlot 命令](https://geogebra.github.io/docs/manual/en/commands/ResidualPlot/)
- [RSquare 命令](https://geogebra.github.io/docs/manual/en/commands/RSquare/)
- [SumSquaredErrors 命令](https://geogebra.github.io/docs/manual/en/commands/SumSquaredErrors/)
