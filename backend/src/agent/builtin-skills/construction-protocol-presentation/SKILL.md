---
name: construction-protocol-presentation
description: 按数学逻辑整理构造顺序，利用构造协议和步骤导航完成可回放的教学演示。
category: geogebra-workflow
parent: multi-view-coordination
level: 2
maturity: default
tags: [构造协议, Construction Protocol, 构造步骤, 回放, 导航栏, 教学演示, SetConstructionStep]
tools: [getCanvasContext, searchGeoGebraCommands, executeGeoGebraCommands, setPerspective, showSolutionSteps]
---

# 构造协议与步骤回放

用于尺规作图、证明图、逐步建模和课堂讲解。构造协议展示的是对象创建依赖顺序，不等同于任意剪辑的幻灯片。

工作顺序：

1. 先写出数学步骤，再按“自由对象 → 基础构造 → 交点/测量 → 结论”的顺序创建对象。
2. 把不影响逻辑的样式调整放在构造完成后，避免大量装饰对象打断步骤叙事。
3. 打开 Construction Protocol 或导航栏后，使用 `ConstructionStep` 检查总顺序，用 `SetConstructionStep` 逐步回放关键阶段。
4. 每一步都应有可见的新信息；需要合并教学阶段时，用阶段滑块与条件显示组织，不篡改真实依赖顺序。
5. 回放到首步、中间步和末步，确认对象不会提前出现、引用未定义对象或在恢复全图后丢失。

约束：

- 构造顺序以依赖正确为首要目标，不为“好看”交换前后依赖。
- `SetConstructionStep` 适合真实构造协议回放；自定义教学分镜应使用独立的整数阶段参数。
- 当前 applet 若不支持 Construction Protocol 视图，仍保留规范创建顺序，并用 `showSolutionSteps` 呈现步骤说明。
