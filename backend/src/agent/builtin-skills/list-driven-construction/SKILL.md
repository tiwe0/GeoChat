---
name: list-driven-construction
description: 使用列表、Sequence、Zip 和 Flatten 批量生成点列、对象族、迭代图形和离散模型的技能。
category: high-school-algebra
parent: sequence
level: 2
maturity: default
tags: [二级技能, 列表, Sequence, Zip, 批量构造, 迭代, 离散模型]
tools: [searchGeoGebraCommands, executeGeoGebraCommands, showAnimationGuide, showSolutionSteps, showTeachingHint]
---

# 列表驱动构造

用于点列、函数族、几何对象族、递推近似、迭代图形和参数采样。把重复构造表达为数据变换，而不是逐条复制命令。

工作顺序：

1. 先定义最小数据源：索引范围、点列表或参数列表，并为列表取稳定名称。
2. 单索引重复使用 `Sequence`；多个等长列表并行映射使用 `Zip`；嵌套结果确实需要合并时再用 `Flatten`。
3. 用 `Element`、`First`、`Last`、`Take` 或 `KeepIf` 检查局部结果，确认索引从 1 开始且没有越界。
4. 对可视对象族先生成少量样本，验证依赖关系和样式，再扩大数量；不要让每个元素都显示标签。
5. 需要动画时固定有界构造上限，另用整数阶段滑块和 `Take` 控制当前展示范围；不要让阶段滑块在每一帧重建不必要的大型对象集。

常用 GeoGebra 方向：`Sequence`、`Zip`、`Element`、`Flatten`、`Join`、`KeepIf`、`Sort`、`Sum`、`Length`。

## 原生命令示例

以下示例均在空白构图中逐行输入；对象名固定、数据确定，不依赖随机数。

### 例 1：用有界 `Sequence` 生成点列

初始条件：构造上界固定为前 6 项，展示阶段取前 4 项；如改为滑块，保持 `1 <= stagePts <= nMax <= 50`。

```ggb
nMax = 6
stagePts = 4
idx = Sequence(1, nMax)
samplePts = Sequence((k, k^2), k, 1, nMax)
visiblePts = Take(samplePts, 1, stagePts)
thirdPt = Element(samplePts, 3)
sampleCount = Length(samplePts)
SetConditionToShowObject(samplePts, false)
SetConditionToShowObject(thirdPt, false)
```

预期结果：`idx = {1, 2, 3, 4, 5, 6}`，`visiblePts` 含前 4 个点，`thirdPt = (3, 9)`，`sampleCount = 6`。隐藏源点列表和探针后，画面只显示 `visiblePts` 中的点，数学依赖仍然保留；只定义 `Take` 而不隐藏源列表，画面仍可能显示全部点。边界验证：`Element` 的索引从 1 开始，只有在 `1 <= 索引 <= Length(samplePts)` 时才取元素。动画阶段 `stagePts` 与构造上界 `nMax` 分离，避免每一帧改变整个列表的长度；不要用无界或过大的动态终点生成对象族。

### 例 2：用 `Zip` 配对，再用 `KeepIf` 筛选

初始条件：两个数据列表一一对应且长度相同。

```ggb
xData = {-3, -1, 0, 2, 4}
yData = {9, 1, 0, 4, 16}
sameLength = Length(xData) == Length(yData)
pairedPts = Zip((u, v), u, xData, v, yData)
expectedPairCount = Length(xData)
actualPairCount = Length(pairedPts)
nonnegativePts = KeepIf(x(P) >= 0, P, pairedPts)
```

预期结果：`sameLength = true`，`expectedPairCount = actualPairCount = 5`，`nonnegativePts = {(0, 0), (2, 4), (4, 16)}`。常见错误：`Zip` 不会为缺项报齐，它按最短输入列表截断；必须同时检查输入等长和实际输出数量，不能把静默截断误认为完整配对。

### 例 3：保留二维索引，需要时再扁平化

初始条件：构造 2 行、每行 3 个数的规则表。

```ggb
numberRows = Sequence(Sequence(10 r + c, c, 1, 3), r, 1, 2)
secondRow = Element(numberRows, 2)
entry23 = Element(numberRows, 2, 3)
flatValues = Flatten(numberRows)
previewValues = Take(flatValues, 1, 4)
```

预期结果：`numberRows = {{11, 12, 13}, {21, 22, 23}}`，`secondRow = {21, 22, 23}`，`entry23 = 23`，`flatValues = {11, 12, 13, 21, 22, 23}`。边界验证：需要行列含义时保留嵌套列表并用多重索引；`Flatten` 会消除嵌套层级，不是只“展开一层”。先用 `Take` 检查小样本，再扩大列表。

官方参考：[Sequence](https://geogebra.github.io/docs/manual/en/commands/Sequence/)、[Zip](https://geogebra.github.io/docs/manual/en/commands/Zip/)、[KeepIf](https://geogebra.github.io/docs/manual/en/commands/KeepIf/)、[Flatten](https://geogebra.github.io/docs/manual/en/commands/Flatten/)、[Element](https://geogebra.github.io/docs/manual/en/commands/Element/)。

约束：优先使用结构化列表命令，不通过 `Execute` 拼接大量命令字符串；若目标命令不接受列表，先搜索准确语法再选择最小替代方案。
