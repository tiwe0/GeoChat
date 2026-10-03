---
name: dynamic-worksheet-authoring
description: 按一个概念、一个主画面组织可探索的 GeoGebra 动态课件，并检查首屏、交互暗示和移动端可用性。
category: geogebra-workflow
parent: multi-view-coordination
level: 2
maturity: default
tags: [动态课件, applet, 首屏, 单屏布局, 交互暗示, 移动端, 教学设计, 可用性]
tools: [getCanvasContext, searchGeoGebraCommands, executeGeoGebraCommands, setPerspective, showTeachingHint]
---

# 动态课件编排

用于把一个数学构造整理成可直接操作的学生课件。重点不是展示所有 GeoGebra 能力，而是让用户在一个屏幕内知道“要观察什么、可以动什么、改变后看哪里”。

工作顺序：

1. 每个课件只设一个核心概念或探究目标；若必须承载多个阶段，用清晰步骤或拆分课件，不把所有内容堆在同一画面。
2. 首屏只保留核心构造、一个简短任务和必要控件；静态说明尽量交给 `showTeachingHint`，不要覆盖在图形中心。
3. 可拖动点或控件必须有明显暗示，可通过大小、形状、短标签或邻近提示实现；不能只依赖颜色。
4. 不希望被误拖的文本、函数、滑块位置和装饰对象使用 `SetFixed` 或稳定坐标固定，但不要锁住应供探索的自由对象。
5. 动态数值和结论放在对应对象附近；多视图只有在确有不可替代的表示时才打开，否则用动态文本或 `TableText` 汇总。
6. 检查初始画面：标签不被线段穿过，控件不遮挡图形，主对象在可见范围内，用户无需滚动即可完成主要操作。
7. 用窄窗口和常见缩放再次检查点击区域与文字换行；复杂 3D 或多视图内容无法在窄屏成立时，应主动简化而不是等比缩小到不可操作。
8. 从初始状态完成一次完整任务，再用 `SetValue` 把自由输入恢复为初值，或对已配置的业务动画调用 reset，然后重复任务；不要用清空画板的 `resetCanvas` 代替课件状态重置。

约束：

- 默认遵循“一概念、一主视图、一屏完成”；教师分析工作区不受此限制。
- 提问应具体指向一个动作和观察量，例如“拖动 A 时角和如何变化”，避免只有“你发现了什么”。
- 装饰、背景图和动画只有在支持教学目标时才保留；首屏可读性优先于视觉炫技。

## 单屏课件小例子

适用范围：围绕一个可操作量和一个观察目标制作学生课件；不适合把教师分析用的 CAS、Spreadsheet、3D 全部塞入同一首屏。

```ggb
SheetA = (-3, 0)
SheetB = (3, 0)
sheetU = Slider(-3, 3, 0.1, 1, 120, false, true, false, false)
SetValue(sheetU, 1)
SheetP = (sheetU, 2)
sheetBase = Segment(SheetA, SheetB)
SheetMid = Midpoint(SheetA, SheetB)
sheetGuide = Segment(SheetP, SheetMid)
sheetPrompt = Text("改变 sheetU，观察 P 到底边中点的连线", (-4.5, 3.2))
SetFixed(sheetPrompt, true)
```

预期结果：`sheetU` 是唯一可操作滑块和自由数值驱动量，`SheetP` 与 `sheetGuide` 随它变化，提示文字保持稳定。边界检查：分别独立执行 `SetValue(sheetU,-3)`、`SetValue(sheetU,0)`、`SetValue(sheetU,3)` 时，每次写入后立即验证依赖值，最后用 `SetValue(sheetU,1)` 恢复并验证初值；canvasContext 没有像素包围盒、触控命中区、换行或窄屏布局字段，不能据此确认主对象仍在首屏或提示未遮挡连线。必须查看真实嵌入 UI 的相应尺寸截图，否则明确移动端视觉验收未覆盖。不要用脚本复制 `SheetP` 坐标，也不要锁住应供探索的 `sheetU`。

官方来源：[Text](https://geogebra.github.io/docs/manual/en/commands/Text/)、[SetFixed](https://geogebra.github.io/docs/manual/en/commands/SetFixed/)、[Creating Dynamic Worksheets](https://geogebra.github.io/docs/manual/en/Creating_Dynamic_Worksheets/)。
