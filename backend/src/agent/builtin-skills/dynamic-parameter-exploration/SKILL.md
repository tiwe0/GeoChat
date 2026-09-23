---
name: dynamic-parameter-exploration
description: 用单一主滑块组织参数实验、分步演示、动态可见性和预测验证的通用技能。
category: middle-high-school-functions
parent: function-graph
level: 2
maturity: default
tags: [二级技能, 滑块, 动画, 参数探究, 分步演示, 动态可见性, 教学演示]
tools: [getCanvasContext, searchGeoGebraCommands, executeGeoGebraCommands, showAnimationGuide, showSolutionSteps, showTeachingHint]
---

# 动态参数探究

用于函数变换、几何运动、逐步构造和“先猜想、再拖动验证”的教学演示。核心不是让所有对象都动，而是建立一个清晰的主驱动量。

工作顺序：

1. 选择一个主参数 `t` 或 `n`，明确范围、增量和数学含义；其他量尽量由它派生，而不是堆叠多个互相独立的滑块。
2. 先构造静态基准对象，再构造由主参数驱动的对象，最后添加轨迹、测量值或结论提示。
3. 分步演示用整数滑块配合 `If` 或 `SetConditionToShowObject` 控制阶段，保证任意时刻只突出当前步骤。
4. 自动播放前先确认滑块范围有限、增量合理；使用 `StartAnimation` 后仍要保留手动拖动能力。
5. 教学交互遵循“预测—观察—解释”：先让用户猜变化，再播放或拖动，最后显示不变量和结论。

常用 GeoGebra 方向：`Slider`、`StartAnimation`、`SetValue`、`If`、`SetConditionToShowObject`、`Locus`、`Text`。

约束：

- 默认使用 GeoGebra 命令和依赖关系，不生成任意 JavaScript。
- 不要为了动画复制大量对象；可由表达式、`Sequence` 或条件显示生成的内容，应保持单一数据源。
- 一个滑块控制全部过程时，要让各阶段在参数轴上连续衔接，避免对象突然跳变或短暂失去定义。
