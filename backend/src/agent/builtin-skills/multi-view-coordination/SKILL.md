---
name: multi-view-coordination
description: 在代数、二维图形、图形2、CAS、表格与3D视图之间组织同一组数学对象并验证联动的工作流。
category: geogebra-workflow
maturity: default
tags: [多视图, 视图同步, 联动, 双视图, 图形2, 代数视图, CAS, 表格, 3D, 教学布局]
tools: [getCanvasContext, searchGeoGebraCommands, executeGeoGebraCommands, setPerspective]
---

# 多视图协同

用于需要同时观察公式、数值表、二维/三维图形或符号推导的任务。GeoGebra 的各视图应共享同一构造依赖；不要为每个视图复制一套互不关联的对象。

工作顺序：

1. 先按任务分配职责：代数视图看定义与依赖，图形视图看几何或函数，图形 2 用于对照或不同尺度，CAS 用于精确推导，表格用于批量数值，3D 用于空间对象。
2. 使用 `SetPerspective` 或 `setPerspective` 只打开必要视图；需要后续命令落入特定视图时再用 `SetActiveView`。
3. 对同一对象跨视图检查：改动一个自由对象后，公式、表值与图形应同步更新；禁止用手工复制的常数伪造“同步”。
4. 仅在确有对照价值时启用 Graphics 2；通过 `SetVisibleInView` 或 `AttachCopyToView` 管理对象归属，并保持对象命名一致。
5. 切换布局后调用 `getCanvasContext` 验证视图和关键对象仍可访问；若当前 applet 不支持目标视图，保留原构造并采用现有视图的等价呈现，不声称切换成功。
6. 区分“探索工作区”和“学生课件”：大型探索可并列多个视图；一个概念的学生课件默认保留一个主视图，用动态文本或 `TableText` 把必要的代数、CAS、表格结果带回主画面。
7. Graphics 与 Graphics 2 各有活动视图状态。必须逐个 `SetActiveView` 后用相同跨度的等比取景和 `SetAxesRatio(1,1)`，每个视图批次后立即验证；一次 `SetAxesRatio` 只作用于当时的活动视图，不能代表两个视图都已设置。
8. 多视图构造、可见性和逐视图取景应在业务动画配置之前完成；播放中再次执行命令会停止业务动画，验证后必须重新配置。

常用布局：`SetPerspective("AG")`、`SetPerspective("AGS")`、`SetPerspective("S/G")`、`SetPerspective("+D")`。实际格式和支持范围必须先通过 `searchGeoGebraCommands` 核对。

约束：

- 多视图的目标是展示同一数学关系的不同表示，不是增加视觉噪声。
- 每增加一个视图都必须说明它提供了哪种不可替代的表示；若只是显示几个数值，优先用就近动态文本。
- 不关闭承载关键输入或解释的视图；更改布局不得破坏已有对象、缩放和交互。
- CAS、表格、Construction Protocol 等视图在不同 GeoGebra 产品和嵌入模式中的可用性可能不同，必须以运行时验证为准。

## 跨视图共享对象示例

适用范围：同一对象需要在 Graphics 与 Graphics 2 对照，或需要 Algebra/CAS/Spreadsheet 提供不可替代的表示。

先调用宿主 `setPerspective` 的 `mode: "AGD"`，确认 Graphics 2 可用，再执行：

```ggb
viewA = 1
viewF(x) = viewA*x^2
ViewP = (2, viewF(2))
SetVisibleInView(viewF, 1, true)
SetVisibleInView(viewF, 2, true)
SetVisibleInView(ViewP, 1, true)
SetVisibleInView(ViewP, 2, true)
```

构造批次验证后，分别执行两个取景批次；每个代码块各是一次独立 mutation，下一步必须先验证，再执行另一块：

```ggb
SetActiveView(1)
ZoomIn(-6, -6, 6, 6)
SetAxesRatio(1, 1)
```

```ggb
SetActiveView(2)
ZoomIn(-6, -6, 6, 6)
SetAxesRatio(1, 1)
```

预期结果：Algebra、Graphics、Graphics 2 使用同一 `viewA`、`viewF`、`ViewP`，两个图形视图都按相同数值跨度和 1:1 比例提交取景；把 `viewA` 改为 `-1` 后两个图形视图都同步。边界检查：视图编号 `1`/`2` 只指 Graphics/Graphics 2；canvasContext 不包含分视图可见性、像素范围或各视图轴比例，不能独自证明两幅图都显示且等比例，需真实双视图截图或现场 UI 验证，否则报告未覆盖。若 `D` 不受当前 applet 支持，保留对象并报告降级，不复制一套常数伪造第二视图。宿主 `setPerspective` 与 GeoGebra `SetPerspective` 都控制布局，不等于 GUI 菜单点击，也不保证目标产品支持每个视图。

官方来源：[SetPerspective](https://geogebra.github.io/docs/manual/en/commands/SetPerspective/)、[SetVisibleInView](https://geogebra.github.io/docs/manual/en/commands/SetVisibleInView/)、[SetActiveView](https://geogebra.github.io/docs/manual/en/commands/SetActiveView/)。
