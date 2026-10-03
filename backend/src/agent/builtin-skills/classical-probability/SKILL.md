---
name: classical-probability
description: 古典概型、排列组合、树状图、样本空间和条件概率的二级技能。
category: middle-high-school-statistics-probability
parent: probability-statistics
level: 2
maturity: default
tags: [二级技能, 古典概型, 样本空间, 排列组合, 条件概率, 树状图]
tools: [searchGeoGebraCommands, executeGeoGebraCommands, showSolutionSteps, showTeachingHint, showChoiceAnalysis]
---

# 古典概率

适用于有限等可能样本空间、抽取、掷骰、摸球、排列组合、条件概率和独立事件。重点是先列清事件。

工作顺序：

1. 判断是否等可能；不等可能不能直接用古典概型。
2. 列样本空间和目标事件，必要时用树状图或表格。
3. 排列组合题说明是否有序、是否放回、是否重复。
4. 条件概率要先缩小样本空间。

## 数学与能力规则

- 只有有限且等可能时才用 `P(A)=|A|/|Ω|`；否则要改用加权概率、条件概率或分布模型。
- 有序/无序、放回/不放回、可重复/不可重复是样本空间契约；列举命令必须与契约一致。
- `P(A|B)=P(A∩B)/P(B)` 要求 `P(B)>0`；独立性需验证 `P(A∩B)=P(A)P(B)`，不由事件名称推测。
- 下例 `cp` 前缀执行前必须确认未占用。

## 原生小例：两枚公平骰子点数和为 7

```ggb
cpRows = Sequence(Sequence((i, j), j, 1, 6), i, 1, 6)
cpOmega = Flatten(cpRows)
cpEvent = KeepIf(x(P) + y(P) == 7, P, cpOmega)
cpTotal = Length(cpOmega)
cpFavorable = Length(cpEvent)
cpProbability = cpFavorable / cpTotal
```

预期：`cpTotal=36`，`cpEvent` 含 `(1,6)`、`(2,5)`、`(3,4)`、`(4,3)`、`(5,2)`、`(6,1)` 共 6 个有序结果，`cpProbability=1/6`。这是确定列举，不需要随机命令。

## 检查与降级

- 正常：检查 `cpEvent` 是 `cpOmega` 子集、无重复漏计，且每个有序对等可能。
- 退化：空样本空间或条件事件概率为 0 时，不做除法，概率/条件概率报未定义。
- 边界：若骰子非公平，36 个结果仍可列举但不能用计数比，必须对各结果加权。
- 若 `Flatten`/`KeepIf` 不可用，用 6×6 表格手工标出六个事件元素；不改用一次随机试验假装精确概率。

## 官方依据

- [Sequence 命令](https://geogebra.github.io/docs/manual/en/commands/Sequence/)
- [Flatten 命令](https://geogebra.github.io/docs/manual/en/commands/Flatten/)
- [KeepIf 命令](https://geogebra.github.io/docs/manual/en/commands/KeepIf/)
