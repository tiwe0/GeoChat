---
name: function-graph
description: 初高中函数概念、一次函数、反比例函数、二次函数和函数图像性质技能。
category: middle-high-school-functions
maturity: default
tags: [函数, 一次函数, 反比例函数, 二次函数, 图像, 单调性]
tools: [searchGeoGebraCommands, executeGeoGebraCommands, showAnimationGuide, showSolutionSteps, showChoiceAnalysis]
---

# 函数与图像

适用于函数概念、函数图像、一次函数、反比例函数、二次函数，以及由图像读性质的问题。核心是把解析式、表格、图像和实际意义互相转换。

工作顺序：

1. 提取自变量、因变量、定义域、解析式和图像特征。
2. 根据题目选择必要特征：一次函数的斜率、截距和两点；反比例函数的象限、渐近线和 k 的符号；二次函数的顶点、对称轴、开口和零点。不要在简单读图题里叠加所有分析对象。
3. 涉及参数时使用滑块展示图像平移、伸缩、翻折或交点个数变化。
4. 选择题要把每个选项映射成图像特征验证，不只代数代入。

常用 GeoGebra 方向：Function、Slider、Root、Intersect、Extremum、Line、Point。

参数联动、Boolean 与条件取值需要明确依赖结构时使用 `native-expression-modeling`；分段区间使用 `piecewise-domain-function`，不要把所有分支图像都画成完整函数。

## 参数表达式小例子

独立例子，名称无冲突时按行输入：

```ggb
a = 2
f(x) = a*x + 1
P = (1, f(1))
```

预期：初始直线斜率为 `2`，`P = (1, 3)`；执行 `SetValue(a, -1)` 后斜率变为 `-1`、`P = (1, 0)`。`a = 0` 时应得到常值函数。保留 `a` 和 `f(1)` 的引用，不把当前系数和点坐标复制成常量；检查解析式、点和图像是否同时变化。

## 反比例函数的有效输入

独立例子，参数非零时讨论反比例函数，探针避开渐近线：

```ggb
k = 2
g(x) = k/x
inputX = 1
probeValue = g(inputX)
Q = (inputX, probeValue)
```

预期：`Q = (1, 2)`；执行 `SetValue(inputX, -1)` 后 `Q = (-1, -2)`。测试 `inputX = 0` 时探针未定义，不能补点连接渐近线两侧。测试 `k = -2` 时图像转到第二、四象限；`k = 0` 已不是反比例函数，原始 `k/x` 在 `x = 0` 的定义状态仍需实际检查，不能仅凭显示成横线断言处处有定义。恢复 `k = 2`、`inputX = 1` 后验证探针恢复。

参考：[函数](https://geogebra.github.io/docs/manual/en/Functions/)、[SetValue](https://geogebra.github.io/docs/manual/en/commands/SetValue/)、[IsDefined](https://geogebra.github.io/docs/manual/en/commands/IsDefined/)。
