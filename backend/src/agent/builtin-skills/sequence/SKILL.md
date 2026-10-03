---
name: sequence
description: 高中数列、等差数列、等比数列、递推关系、前 n 项和和离散图像技能。
category: high-school-algebra
maturity: default
tags: [数列, 等差数列, 等比数列, 递推, 前n项和, 离散函数]
tools: [searchGeoGebraCommands, executeGeoGebraCommands, showAnimationGuide, showSolutionSteps, showChoiceAnalysis]
---

# 数列

适用于等差、等比、递推、通项、前 n 项和、数列单调性和实际分期模型。把数列看成定义在正整数上的离散函数。

工作顺序：

1. 判断数列类型：等差、等比、递推、分段、周期或由函数取整得到。
2. 标出首项、公差/公比、递推起点和有效 n 的范围。
3. 用离散点列展示项的变化；涉及前 n 项和时同时展示累计和曲线。
4. 参数或最值题优先找单调性、相邻项差值/比值和临界 n。

常用 GeoGebra 方向：`Sequence`、`IterationList`、`Element`、`Take`、`Sum`、`Length`、`Slider`。

## 原生命令示例

以下示例均在空白构图中逐行输入。先保留通项或递推关系，再由关系生成有限列表和离散点；不要先手工抄出一串数值。

### 例 1：等差数列的通项与离散图像

初始条件：首项 `a1 = 4`，公差 `d = 3`，构造上界为前 8 项，展示阶段为前 5 项。

```ggb
a1 = 4
d = 3
nMaxA = 8
stageA = 5
a(n) = a1 + (n - 1) d
aTerms = Sequence(a(k), k, 1, nMaxA)
aPoints = Sequence((k, a(k)), k, 1, nMaxA)
visibleAPoints = Take(aPoints, 1, stageA)
aAt8 = a(8)
SetConditionToShowObject(aPoints, false)
SetConditionToShowObject(a, false)
```

预期结果：`aTerms = {4, 7, 10, 13, 16, 19, 22, 25}`，`visibleAPoints` 含前 5 个点，`aAt8 = 25`。隐藏完整源点列和连续通项曲线，只显示截取结果，不能靠删除源对象控制项数。边界验证：题目中的数列索引从正整数 1 开始；连续函数 `a(n)` 只是通项载体，实际数列对象应由整数索引的 `Sequence` 表示。展示阶段 `stageA` 应限制在 `1 <= stageA <= nMaxA`，且不代替固定的列表上界 `nMaxA`。

### 例 2：等比数列及每个前缀的前 n 项和

初始条件：首项 `b1 = 3`，公比 `q = 2`，计算前 6 项与 `S_1` 到 `S_6`。

```ggb
b1 = 3
q = 2
nMaxB = 6
b(n) = b1 q^(n - 1)
bTerms = Sequence(b(k), k, 1, nMaxB)
bPrefixSums = Sequence(Sum(Sequence(b(k), k, 1, m)), m, 1, nMaxB)
bSumAt6 = Element(bPrefixSums, 6)
bSumPoints = Sequence((m, Element(bPrefixSums, m)), m, 1, Length(bPrefixSums))
```

预期结果：`bTerms = {3, 6, 12, 24, 48, 96}`，`bPrefixSums = {3, 9, 21, 45, 93, 189}`，`bSumAt6 = 189`。常见错误：不要把 `{3, 9, 21, ...}` 手工复制成“前 n 项和”；它必须依赖通项和上限，才能在 `b1`、`q` 或 `nMaxB` 改变时同步更新。

### 例 3：递推数列不手工展开

初始条件：`c1 = 1`，递推关系 `c_(n+1) = 2 c_n + 1`，从首项再迭代 5 次。

```ggb
cStep(x) = 2 x + 1
cTerms = IterationList(cStep, 1, 5)
cCount = Length(cTerms)
cPoints = Sequence((k, Element(cTerms, k)), k, 1, cCount)
cLast = Element(cTerms, cCount)
```

预期结果：`cTerms = {1, 3, 7, 15, 31, 63}`，`cCount = 6`，`cLast = 63`。边界验证：`IterationList` 的“迭代次数”不等于列表项数；包含初始值，所以迭代 5 次得到 6 项。需要恰好前 `n` 项时，迭代次数应为 `n - 1`。

官方参考：[Sequence](https://geogebra.github.io/docs/manual/en/commands/Sequence/)、[Take](https://geogebra.github.io/docs/manual/en/commands/Take/)、[Sum](https://geogebra.github.io/docs/manual/en/commands/Sum/)、[IterationList](https://geogebra.github.io/docs/manual/en/commands/IterationList/)、[Element](https://geogebra.github.io/docs/manual/en/commands/Element/)。
