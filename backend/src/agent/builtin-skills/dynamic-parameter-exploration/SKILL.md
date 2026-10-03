---
name: dynamic-parameter-exploration
description: 用单一主滑块组织参数实验、分步演示、动态可见性和预测验证的通用技能。
category: middle-high-school-functions
parent: function-graph
level: 2
maturity: default
tags: [二级技能, 滑块, 动画, 参数探究, 分步演示, 动态可见性, 教学演示]
tools: [getCanvasContext, searchGeoGebraCommands, executeGeoGebraCommands, configureGeoGebraAnimation, controlGeoGebraAnimation, inspectGeoGebraObjects, showAnimationGuide, showSolutionSteps, showTeachingHint]
---

# 动态参数探究

用于函数变换、几何运动、逐步构造和“先猜想、再拖动验证”的教学演示。核心不是让所有对象都动，而是建立一个清晰的主驱动量。

工作顺序：

1. 选择一个主参数 `t` 或 `n`，明确范围、增量和数学含义；其他量尽量由它派生，而不是堆叠多个互相独立的滑块。
2. 先构造静态基准对象，再构造由主参数驱动的对象，最后添加轨迹、测量值或结论提示。
3. 分步演示用整数滑块配合 `If` 或 `SetConditionToShowObject` 控制阶段，保证任意时刻只突出当前步骤。
4. 自动播放前判断主参数是有限过程还是持续时钟；构造验证后使用 `configureGeoGebraAnimation` 配置平滑时间轴，有限教学过程默认 `once`、单程 20 秒。用户要求先预测、观察初态或手动探究时设置 `autoplay: false`；明确请求动画演示时按 `mathematical-animation-design` 默认设置 `autoplay: true`。时钟、天体公转和长期仿真使用 `continuous`，让主时间持续单调增长并把周期性放在依赖表达式中；有限区间重复演示使用 `loop`，往复过程使用 `ping_pong`，同时保留手动拖动能力。
5. 教学交互遵循“预测—观察—解释”：先让用户猜变化，再播放或拖动，最后显示不变量和结论。

常用 GeoGebra 方向：`Slider`、`SetValue`、`If`、`SetConditionToShowObject`、`Locus`、`Text`；播放、暂停和重置使用业务动画工具，不写 XML。

约束：

- 默认使用 GeoGebra 命令和依赖关系，不生成任意 JavaScript。
- 不要为了动画复制大量对象；可由表达式、`Sequence` 或条件显示生成的内容，应保持单一数据源。
- 一个滑块控制全部过程时，要让各阶段在参数轴上连续衔接，避免对象突然跳变或短暂失去定义。

## 原生条件联动小例子

各例独立，先确认对象名无冲突。自由数值可用手动 `SetValue` 验证；需要滑块时再通过已有参数控件设置范围与增量，不另建同名参数。

### 三阶段展示，不反复创建或删除图形

```ggb
stage = 1
P = (0, 0)
Q = (3, 0)
R = (0, 2)
base = Segment(P, Q)
height = Segment(P, R)
side = Segment(Q, R)
stageValid = stage >= 1 && stage <= 3 && stage == floor(stage)
hint = If(stage == 1, "观察底边", stage == 2, "观察高", stage == 3, "观察完整三角形", "阶段必须是 1、2 或 3")
SetConditionToShowObject(P, stageValid)
SetConditionToShowObject(Q, stageValid)
SetConditionToShowObject(R, stageValid && stage >= 2)
SetConditionToShowObject(base, stageValid)
SetConditionToShowObject(height, stageValid && stage >= 2)
SetConditionToShowObject(side, stageValid && stage == 3)
```

将 `stage` 设置为整数 `1..3`，单独执行 `SetValue(stage, 2)`、`SetValue(stage, 3)`、`SetValue(stage, 1)`。预期：合法阶段均显示底边，第二阶段增加高及顶点 `R`，第三阶段增加第三边，提示同步切换；返回第一阶段隐藏后两条线段及 `R`，但对象仍然存在。测试 `0`、`4`、`2.5` 时，几何对象隐藏且提示无效阶段；恢复为 `1` 后重新显示底边。这里显式命名三条线段，不使用可能额外生成边对象的 `Polygon`，避免只隐藏多边形而漏掉自动生成的边。`stage` 不与列表长度或连续时钟共用。

### 从列表映射离散参数，不假装等间隔取值

```ggb
values = {0.1, 0.5, 1, 2, 5}
index = 3
indexValid = index >= 1 && index <= Length(values) && index == floor(index)
a = If(indexValid, Element(values, index))
f(x) = a*x^2
```

将 `index` 设置为整数 `1..5`。预期：初始 `a = 1`；改为 `4` 后 `a = 2`，图像同步变窄。测试 `0`、`6`、`2.5` 时，`a` 与函数应未定义而不是误取其他参数；恢复为 `3` 后恢复有效。`index` 控制列表位置，`a` 是依赖结果，不能直接写 `a` 的值切断映射。

参考：[If](https://geogebra.github.io/docs/manual/en/commands/If/)、[条件显示](https://geogebra.github.io/docs/manual/en/Conditional_Visibility/)、[Element](https://geogebra.github.io/docs/manual/en/commands/Element/)。
