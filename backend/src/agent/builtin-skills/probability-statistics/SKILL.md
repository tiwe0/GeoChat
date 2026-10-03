---
name: probability-statistics
description: 初高中统计与概率、样本数据、频率分布、随机事件、古典概型和分布可视化技能。
category: middle-high-school-statistics-probability
maturity: default
tags: [统计, 概率, 频率, 样本, 分布, 随机事件, 古典概型]
tools: [searchGeoGebraCommands, executeGeoGebraCommands, showAnimationGuide, showSolutionSteps, showChoiceAnalysis]
---

# 统计与概率

适用于数据整理、平均数/中位数/众数/方差、频率分布、随机事件、古典概型、独立性、条件概率和简单分布。重点是把样本、事件空间和概率计算分开。

工作顺序：

1. 先判断是统计描述、概率模型、抽样估计还是分布问题。
2. 统计题优先画表格、条形图、折线图、散点图或箱线图，并标出代表数。
3. 概率题先列样本空间和事件，再计算有利结果数或使用树状图/表格。
4. 分布题展示概率质量、累计概率或模拟频率稳定过程。

禁忌：不要把频率直接当概率；不要在事件不独立时直接相乘。

## 数学与能力规则

- 先声明总体/样本、随机试验、样本空间、事件及是否等可能；描述统计量与概率模型不混用。
- `Variance` 表示以总数据个数为分母的方差；题目要求样本方差时应改用 `SampleVariance`。
- 随机模拟必须报告样本量和本次观测频率，不声称固定的随机序列/图形；需复现时先明示设置种子并说明重算规则。
- 下例 `psd` 前缀执行前必须确认未占用。

## 原生小例：确定样本的描述统计

```ggb
psdData = {1, 2, 2, 3, 5, 5, 5, 7}
psdMean = Mean(psdData)
psdMedian = Median(psdData)
psdVariance = Variance(psdData)
psdValues = Unique(psdData)
psdCounts = Frequency(psdData)
psdTable = FrequencyTable(psdData)
```

预期：`psdMean=3.75`、`psdMedian=4`、`psdVariance=3.6875`、`psdValues={1,2,3,5,7}`、`psdCounts={1,2,1,3,1}`，频数和为 8。该例完全确定，不把某次随机结果写成预期常量。

## 检查与降级

- 正常：检查频数和等于样本量、频率和在容差内为 1，统计量的单位/量纲正确。
- 退化：空列表的均值/中位数/方差未定义；单元素数据的方差为 0，但样本方差不应被强制为 0。
- 边界：缺失值、非数值项、权重为负或频数和为 0 时先停止计算并说明数据契约。
- 若统计图命令在当前内核不可用，保留数据、频数列表和数值结果，不声称图已渲染。

## 官方依据

- [Mean 命令](https://geogebra.github.io/docs/manual/en/commands/Mean/)
- [Variance 命令](https://geogebra.github.io/docs/manual/en/commands/Variance/)
- [FrequencyTable 命令](https://geogebra.github.io/docs/manual/en/commands/FrequencyTable/)
