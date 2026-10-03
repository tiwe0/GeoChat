---
name: statistical-distribution
description: 统计图表、频率分布、平均数、中位数、方差和样本估计技能。
category: middle-high-school-statistics-probability
parent: probability-statistics
level: 2
maturity: default
tags: [二级技能, 统计图表, 频率分布, 平均数, 中位数, 方差, 样本]
tools: [searchGeoGebraCommands, executeGeoGebraCommands, showSolutionSteps, showTeachingHint, showChoiceAnalysis]
---

# 统计图表与分布

适用于样本数据整理、频数/频率分布、条形图、折线图、直方图、箱线图、平均数、中位数、众数和方差。

工作顺序：

1. 先判断数据类型：分类、离散数值或连续区间。
2. 选择合适图表，不用一种图表硬套所有题。
3. 计算代表数时说明它反映的是集中趋势还是离散程度。
4. 样本估计总体时说明随机性和误差来源。

## 数学与能力规则

- 分类数据用条形图，离散数值可用点图/频数表，连续数据用明确组界的直方图；条高、频数、频率和频数密度必须标清。
- `Histogram(组界,原数据,false)` 的条高是频数；密度模式下面积而非条高承担频数/频率意义。
- 箱线图的离群规则需说明；小样本四分位数可因教材约定不同，必要时明示给出五数概括而不隐式计算。
- 下例 `sd` 前缀执行前必须确认未占用。

## 原生小例：频数直方图与箱线图

```ggb
sdData = {1, 2, 2, 3, 5, 5, 5, 7}
sdBounds = {0, 2, 4, 6, 8}
sdCounts = Frequency(sdBounds, sdData)
sdHistogram = Histogram(sdBounds, sdData, false)
sdBox = BoxPlot(-1, 0.5, sdData, true)
sdMean = Mean(sdData)
sdMedian = Median(sdData)
```

预期：四组区间 `[0,2)`、`[2,4)`、`[4,6)`、`[6,8]` 的频数为 `{1,3,3,1}`，直方图条高与之一致；`sdMean=3.75`、`sdMedian=4`。

## 检查与降级

- 正常：组界严格递增，所有数据都落在最小到最大组界内，频数和等于样本量。
- 退化：空数据、重复/逆序组界、零组宽时停止画直方图；全部数据相同时承认四分位距为 0。
- 边界：最后一组包含右端点，其余组采用左闭右开；组界外数据会导致直方图未定义。
- 图表命令不可用时保留 `sdCounts`、五数概括和区间约定，明确说明真实 applet 图形未验证。

## 官方依据

- [Histogram 命令](https://geogebra.github.io/docs/manual/en/commands/Histogram/)
- [BoxPlot 命令](https://geogebra.github.io/docs/manual/en/commands/BoxPlot/)
- [Frequency 命令](https://geogebra.github.io/docs/manual/en/commands/Frequency/)
