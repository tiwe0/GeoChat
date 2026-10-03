---
name: piecewise-domain-function
description: 分段函数、定义域限制、端点开闭、间断点和局部图像比较技能。
category: middle-high-school-functions
parent: function-graph
level: 2
maturity: default
tags: [二级技能, 分段函数, 定义域, 区间, 端点, 间断点, 局部图像]
tools: [searchGeoGebraCommands, executeGeoGebraCommands, showAnimationGuide, showSolutionSteps, showChoiceAnalysis]
---

# 分段函数与定义域

用于分段函数、只在指定区间显示的函数、绝对值拆分、含参定义域、跳跃/可去间断和端点取值比较。

工作顺序：

1. 先列出每一段的条件、有效区间和端点是否取到，再决定使用 `If` 还是 `Function`。
2. 仅限制一段连续图像时优先 `Function(f, a, b)`；条件互斥或超过两段时使用嵌套 `If`，不要用覆盖在一起的完整函数冒充分段函数。
3. 对开区间、闭区间分别创建空心/实心端点，并检查端点函数值与左右趋势。
4. 涉及参数时只让滑块驱动参数，保留定义域边界、交点和关键函数值作为可见对象。
5. 最后逐段检查：区间是否遗漏或重叠、分母是否为零、根式是否有意义、对数真数是否为正。

常用 GeoGebra 方向：`If`、`Function`、`Intersect`、`Root`、`LimitAbove`、`LimitBelow`、`Point`、`Slider`。

## 原生命令示例

以下示例均在空白构图中逐行输入；条件顺序和端点归属写在函数定义里，不依赖脚本补救。

### 例 1：三段函数按顺序分配端点

初始条件：第一段取 `x < -1`，第二段取 `-1 <= x <= 2`，其余输入进入第三段。

```ggb
f(x) = If(x < -1, x + 4, If(x <= 2, x^2, 6 - x))
fAtLeft = f(-1)
fAtRight = f(2)
leftExcludedMarker = Point((-1, 3))
leftIncludedMarker = Point((-1, fAtLeft))
rightIncludedMarker = Point((2, fAtRight))
SetPointStyle(leftExcludedMarker, 2)
SetPointStyle(leftIncludedMarker, 0)
SetPointStyle(rightIncludedMarker, 0)
```

预期结果：`fAtLeft = 1`、`fAtRight = 4`；`x = -1` 不会落入第一段，`x = 2` 落入第二段。`SetPointStyle` 的 `2` 为空心圆，`0` 为实心圆，明确显示开闭端点。常见错误：先写过宽条件会截走后续分支；嵌套 `If` 应从最具体的左侧条件开始，并逐个代入边界验证。

### 例 2：省略 else，保留真正的未定义区间

初始条件：平方根函数只定义在半开区间 `[0, 4)`。

```ggb
g(x) = If(0 <= x < 4, sqrt(x))
gAtLeft = g(0)
gInside = g(1)
gAtRight = g(4)
gLeftIncluded = Point((0, gAtLeft))
gRightExcludedMarker = Point((4, 2))
SetPointStyle(gLeftIncluded, 0)
SetPointStyle(gRightExcludedMarker, 2)
```

预期结果：`gAtLeft = 0`、`gInside = 1`，`gAtRight` 未定义。`gRightExcludedMarker` 只是空心端点标记，不属于函数。常见错误：写成 `If(0 <= x <= 4, sqrt(x))` 会把右端点纳入定义域；随意补一个 else 值则会把区间外也定义出来。`If` 的各结果分支必须是兼容的对象类型，赋值应写在 `If` 外部，不能把 `b = 2` 之类的赋值塞进结果分支。

### 例 3：闭区间限制与显式条件定义

初始条件：比较同一个基础函数在闭区间 `[-2, 2]` 上的两种原生限制方式。

```ggb
base(x) = x^2 - 1
restricted = Function(base, -2, 2)
domainSafe(x) = If(-2 <= x <= 2, base(x))
restrictedAtRight = restricted(2)
restrictedOutside = restricted(3)
safeProbe = domainSafe(3)
```

预期结果：`restrictedAtRight = 3`，`restrictedOutside` 与 `safeProbe` 都未定义；两种写法都得到限制在 `[-2, 2]` 的函数。`Function` 适合单个闭区间，`If` 适合开端点、半开区间、多个区间或分支表达式。边界验证：分别代入 `-2`、`2` 和区间外的 `3`，不要只凭图像是否显示判断定义域。

官方参考：[If](https://geogebra.github.io/docs/manual/en/commands/If/)、[Function](https://geogebra.github.io/docs/manual/en/commands/Function/)、[Functions：Limit Function to Interval](https://geogebra.github.io/docs/manual/en/Functions/#_limit_function_to_interval)、[SetPointStyle](https://geogebra.github.io/docs/manual/en/commands/SetPointStyle/)。

注意：不要把 `Function(f, a, b)` 简化为“只隐藏区间外图像”。官方函数文档把它与 `If(a <= x <= b, f(x))` 都列为区间限制；若需要开闭端点、非连续区间或多分支规则，则使用 `If` 明确表达条件。
