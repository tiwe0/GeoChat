---
name: object-view-layer-management
description: 按语义管理对象在不同视图、图层和教学阶段中的可见性，同时保留核心数学关系和可操作性。
category: geogebra-workflow
parent: multi-view-coordination
level: 2
maturity: default
tags: [对象管理, 图层, 可见性, SetVisibleInView, SetLayer, ShowLayer, HideLayer, 辅助对象, 标签]
tools: [getCanvasContext, searchGeoGebraCommands, executeGeoGebraCommands]
---

# 对象、视图与图层管理

用于复杂构造、双视图对照、教学提示层和可交互课件。图层只负责显示与命中顺序，不应承担数学依赖。

工作顺序：

1. 按语义分组：核心对象、辅助构造、测量标注、交互控件、提示/答案；先列出组再分配图层。
2. 用 `SetVisibleInView` 管理 Graphics/Graphics 2 中的对象归属，用 `SetLayer` 调整重叠和点击优先级。
3. 用 Boolean 与 `SetConditionToShowObject` 表达条件显示；`ShowLayer`/`HideLayer` 只用于整组临时切换。
4. 辅助对象可隐藏标签或设为辅助对象，但必须保留可追踪依赖；核心结论不应仅存在于被隐藏对象中。
5. 设置 Caption、标签与 Tooltip 时保持名称稳定，避免显示名与命令引用名混淆。
6. 在每个视图和每个开关状态下调用 `getCanvasContext` 抽查核心对象，并测试拖动与点击是否仍可用。
7. 将中间量标记为辅助对象可以清理代数视图，但不得删除或复制它们；最终展示仍沿用原依赖链。

约束：

- 不用高图层覆盖错误构造，不用隐藏掩盖未定义或多余对象。
- `ShowLayer`/`HideLayer` 可能影响整个层；执行前必须确认该层没有无关核心对象。
- 保留至少一种不依赖颜色的状态表达，例如标签、线型、数值或文字。
