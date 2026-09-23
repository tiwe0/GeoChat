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

常用布局：`SetPerspective("AG")`、`SetPerspective("AGS")`、`SetPerspective("S/G")`、`SetPerspective("+D")`。实际格式和支持范围必须先通过 `searchGeoGebraCommands` 核对。

约束：

- 多视图的目标是展示同一数学关系的不同表示，不是增加视觉噪声。
- 每增加一个视图都必须说明它提供了哪种不可替代的表示；若只是显示几个数值，优先用就近动态文本。
- 不关闭承载关键输入或解释的视图；更改布局不得破坏已有对象、缩放和交互。
- CAS、表格、Construction Protocol 等视图在不同 GeoGebra 产品和嵌入模式中的可用性可能不同，必须以运行时验证为准。
