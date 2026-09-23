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

注意：`Function` 只限制图像显示区间；需要表达真正的条件函数或参与后续判断时，优先使用 `If`。
