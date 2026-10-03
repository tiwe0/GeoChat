---
name: construction-protocol-presentation
description: 按数学逻辑整理构造顺序，利用构造协议和步骤导航完成可回放的教学演示。
category: geogebra-workflow
parent: multi-view-coordination
level: 2
maturity: default
tags: [构造协议, Construction Protocol, 构造步骤, 回放, 导航栏, 教学演示, SetConstructionStep]
tools: [getCanvasContext, searchGeoGebraCommands, executeGeoGebraCommands, inspectGeoGebraObjects, setPerspective, showSolutionSteps]
---

# 构造协议与步骤回放

用于尺规作图、证明图、逐步建模和课堂讲解。构造协议展示的是对象创建依赖顺序，不等同于任意剪辑的幻灯片。

工作顺序：

1. 先写出数学步骤，再按“自由对象 → 基础构造 → 交点/测量 → 结论”的顺序创建对象。
2. 把不影响逻辑的样式调整放在构造完成后，避免大量装饰对象打断步骤叙事。
3. 打开 Construction Protocol 或导航栏后，使用 `ConstructionStep` 检查总顺序，用 `SetConstructionStep` 逐步回放关键阶段。
4. 每一步都应有可见的新信息；需要合并教学阶段时，用阶段滑块与条件显示组织，不篡改真实依赖顺序。
5. 回放到首步、中间步和末步，确认对象不会提前出现、引用未定义对象或在恢复全图后丢失。
6. 构造、回放、最终步恢复和各步验证都必须在业务动画配置之前完成；若播放中执行 `SetConstructionStep`，宿主会停止当前业务动画，恢复最终步并验证后必须重新配置动画。

约束：

- 构造顺序以依赖正确为首要目标，不为“好看”交换前后依赖。
- `SetConstructionStep` 适合真实构造协议回放；自定义教学分镜应使用独立的整数阶段参数。
- 当前 applet 若不支持 Construction Protocol 视图，仍保留规范创建顺序，并用 `showSolutionSteps` 呈现步骤说明。

## 原生回放示例

适用范围：真实依赖顺序的尺规作图、证明图和建模步骤；不把构造协议当作可任意剪辑的幻灯片时间轴。

```ggb
ProtoA = (-2, 0)
ProtoB = (2, 0)
protoBase = Segment(ProtoA, ProtoB)
ProtoMid = Midpoint(ProtoA, ProtoB)
protoPerp = PerpendicularLine(ProtoMid, protoBase)
ProtoFinalMarker = Point(protoPerp)
protoMidStepProbe = ConstructionStep(ProtoMid)
protoFinalStepProbe = ConstructionStep(ProtoFinalMarker)
```

构造后立即用 `inspectGeoGebraObjects` 读取 `protoMidStepProbe` 与 `protoFinalStepProbe` 的数值，并在宿主侧记住两个整数；不要假定固定步号。随后独立执行 `SetConstructionStep(<记住的中点整数>)`，立即读取画布，确认 `ProtoMid` 已出现而 `protoPerp` 尚未出现；再独立执行 `SetConstructionStep(<记住的最终内容整数>)` 并立即验证 `ProtoFinalMarker` 与垂线恢复。回退后两个 probe 可能被隐藏或未定义，因此禁止用 `SetConstructionStep(protoMidStepProbe)` 或依赖 probe 恢复；恢复使用宿主已经记住的整数 literal。

预期结果：中点步严格早于最终内容步，回放与恢复不依赖回退后可能消失的辅助数值对象。边界检查：依赖对象的顺序不能越过其输入对象；每次 `SetConstructionStep` 都是 mutation，下一步必须是 `getCanvasContext` 或对象检查。canvasContext 不包含协议导航栏、协议行或断点状态；可调用宿主 `setPerspective` 的 `mode: "L"` 尝试显示 Construction Protocol，但宿主没有导航栏开关或协议行拖拽工具时，不声称已打开导航栏、设置断点或完成 GUI 拖拽，可用 `showSolutionSteps` 提供独立文字讲解。

官方来源：[ConstructionStep](https://geogebra.github.io/docs/manual/en/commands/ConstructionStep/)、[SetConstructionStep](https://geogebra.github.io/docs/manual/en/commands/SetConstructionStep/)、[Construction Protocol](https://geogebra.github.io/docs/manual/en/Construction_Protocol/)。
