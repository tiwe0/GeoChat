---
name: mathematical-animation-design
description: 设计由单一时间轴驱动、可暂停重置、不过度循环且服务于数学观察的 GeoGebra 动画。
category: geogebra-workflow
parent: multi-view-coordination
level: 2
maturity: default
tags: [动画设计, 时间轴, 滑块, 分步演示, 播放暂停, 重置, 动态几何, 运动可视化]
tools: [getCanvasContext, searchGeoGebraCommands, executeGeoGebraCommands, configureGeoGebraAnimation, controlGeoGebraAnimation, inspectGeoGebraObjects, showAnimationGuide, showTeachingHint]
---

# 数学动画设计

用于连续运动、分步证明、轨迹生成、函数变化和 3D 视角演示。动画必须回答一个明确的数学问题；如果手动拖动或静态分步更清楚，就不启用自动播放。

工作顺序：

1. 先选择模式：参数探究优先手动拖动；解释过程使用一次递增的主滑块；时钟、天体公转、持续旋转和长期仿真使用持续增长时间轴；有限区间的重复演示才使用循环，往复运动使用往返；离散证明步骤使用整数滑块和条件显示，而不是伪造连续运动。
2. 建立一个主时间参数 `t` 或步骤参数 `n`，其他对象全部由它派生。不要启动多个彼此独立的滑块；确需相对速度时，让速度表达式依赖同一个主控量。
3. 默认自动播放。构造和关键状态验证通过后，调用 `configureGeoGebraAnimation` 时显式设置 `autoplay: true`，让用户立即看到动态效果；只有用户明确要求先观察初始状态、手动拖动或手动启动时才设置 `autoplay: false`。播放、暂停和重置控制仍必须可用，自动播放不得成为理解课件的唯一方式。
4. 配置动画前至少检查开始、中点、临界点和终点：宿主没有 seek，必须用独立的 `SetValue` 写入关键值，每次写入后立即 inspect/getCanvas，再恢复 `from` 并验证；分步动画保证每一阶段都有稳定停留状态。遇到渐近线、零分母、退化图形或对象短暂未定义时，应重设范围或分段，而不是让对象闪烁消失。
5. 教学演示默认使用“一次递增”，结束后停在结论状态。对天体公转等需要长期运行的周期过程，不要让主参数在端点跳回起点；让主时间持续增长，并把周期性放入依赖对象的 `sin`、`cos` 或其他周期表达式。只有有限区间的重复演示才使用循环。
6. 构造并验证主参数后，使用 `configureGeoGebraAnimation` 配置业务时间轴：讲解过程默认 `once`；时钟、天体公转、持续旋转和长期仿真使用 `continuous`；有限区间重复演示使用 `loop`；往复运动使用 `ping_pong`。`continuous` 中的 `from` 是起点，`to - from` 是每个 `durationMs` 的增量，并非终点；再用 `controlGeoGebraAnimation` 提供播放、暂停、继续和重置。
7. 控制速度，使用户能跟踪关键对象并读取同步文字。单程默认 20 秒，通常使用 12–30 秒；复杂 3D 或文字密集演示应更慢。动画基于帧时间插值，不通过增大滑块 step 换取速度。
8. 运动期间只突出当前变化对象，静态参照保持克制。轨迹、残影或 Trace 只有在运动路径本身是学习目标时使用，并提供清除或重置方式。
9. 动态颜色只能表达明确连续量并配有文字、数值或图例；不要用高频变色、闪烁、缩放或多个对象同时运动吸引注意。
10. 所有构造、双视图、表格、取景、回放恢复和关键值写入必须在 `configureGeoGebraAnimation` 前完成。宿主执行任意新的 GeoGebra 命令批次都会释放当前业务动画；若播放中必须执行命令，命令后立即验证，再重新 configure。
11. 配置后执行播放—暂停—继续—重置流程，每次控制后立即调用 `inspectGeoGebraObjects` 检查主参数数值与业务动画状态。自动播放后只能抽样当前状态，不能声称已经覆盖全部关键帧；终态与中间态证据来自配置前的逐值检查。
12. 动态对象必须由主时间参数或显式状态派生；不要在每一帧把依赖对象当成自由对象重新赋值。关键状态的语义不变量来自对应题型技能，本技能只负责时间轴、状态映射和播放控制。
13. 如果开始态、终态或中间态连续两次违反同一个不变量，停止继续试符号、角度或速度；记录失败不变量和受影响的依赖子图，回滚到最近正确关键状态后重建该子图。不要把改样式或放慢动画当作语义修复。

约束：

- 不生成任意 JavaScript，不写 XML。构造使用 `Slider`、对象依赖、`If` 和 `SetConditionToShowObject`；连续播放统一使用基于 Applet `setValue` 的业务动画工具。
- 持续时间轴强制使用线性插值。不要给持续增长的主时钟套用重复缓动，也不要通过不断扩大滑块上限模拟无界时间。
- 自动运动持续超过五秒时必须可暂停或停止；避免每秒三次以上的闪烁或强烈明暗切换。
- 不同时自动播放多个无共同时间轴的动画，不让摄像机运动与核心数学对象运动争夺注意力。
- 3D 曲面、大列表和密集轨迹先降低对象数量或细节级别，再考虑播放；卡顿时宁可改为手动分步。
- 动画结束必须留下可解释的稳定画面，不能依赖用户在高速运动中“碰巧看见”结论。

## 原生构造与宿主动画示例

适用范围：用一个自由数值/角度驱动连续运动、一次讲解或长期周期过程；离散证明步骤应改用整数阶段参数。

```ggb
animT = 0
animCircle = Circle((0, 0), 2)
AnimP = (2*cos(animT), 2*sin(animT))
animRadius = Segment((0, 0), AnimP)
animAngle = Angle((2, 0), (0, 0), AnimP)
```

上述构造批次完成后，下一步立即用 `inspectGeoGebraObjects` 检查 `animT`、`AnimP` 与 `animAngle`，确认主参数是已定义的自由 numeric/angle，依赖对象也已定义。每次画布 mutation 后必须立即验证，不能连续发送控制操作。再完成关键状态检查；下面每个 `SetValue` 都是一次独立的 `executeGeoGebraCommands` 调用，调用后立即 inspect `animT`、`AnimP` 与角度，不得把四行合并为一个批次：

```ggb
SetValue(animT, 0)
```

验证开始态后执行并验证中点态：

```ggb
SetValue(animT, pi)
```

再执行并验证周期边界：

```ggb
SetValue(animT, 2*pi)
```

最后恢复 `from` 并立即验证：

```ggb
SetValue(animT, 0)
```

所有构造和关键状态验证完成后，才开始宿主动画流程：

1. 调用宿主 `configureGeoGebraAnimation`：`object: "animT"`、`from: 0`、`to: 6.283185307179586`（即 `2*pi`）、`durationMs: 20000`、`mode: "continuous"`、`easing: "linear"`、`autoplay: true`；随后立即 inspect `animT`，确认业务动画状态为 running。
2. 调用 `controlGeoGebraAnimation` 的 pause 后立即 inspect，确认状态为 paused 且当前值保留。
3. 调用 play 后立即 inspect，确认恢复 running。
4. 调用 reset 后立即 inspect，确认状态回到 configured 且数值回到 `from`。任一验证失败即停止后续 mutation。

function-call schema 的 `from`/`to` 是 JSON number，不能把字符串或表达式 `2*pi` 直接作为工具参数。预期结果：动画立即播放；每 20 秒 `animT` 增加 `2*pi`，不会在 `to` 回跳，点的周期性来自 `sin/cos`。边界检查：宿主没有 seek；`controlGeoGebraAnimation` 只接受 `play|pause|stop|reset`，不要编造 reverse；`continuous` 强制线性且 `to` 是参考跨度端点，不是最终上限。默认保持 `autoplay: true`，只有用户明确要求手动启动或先看初态时才用 false。

官方来源：[GeoGebra Apps API `setValue`](https://geogebra.github.io/docs/reference/en/GeoGebra_Apps_API)、[Circle](https://geogebra.github.io/docs/manual/en/commands/Circle/)、[Angle](https://geogebra.github.io/docs/manual/en/commands/Angle/)。业务动画的模式和参数以当前宿主 function-call schema 为准，不宣称它等同于 GeoGebra 原生 `StartAnimation`。
