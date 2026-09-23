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
