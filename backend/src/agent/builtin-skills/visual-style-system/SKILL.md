---
name: visual-style-system
description: 为 GeoGebra 构造建立克制、可辨认且色盲友好的配色、线型、点型、标签和数学排版层级。
category: geogebra-workflow
parent: multi-view-coordination
level: 2
maturity: default
tags: [配色, 排版, 审美, 视觉层级, 色盲友好, 标签, 线型, 点型, 填充, SetColor]
tools: [getCanvasContext, searchGeoGebraCommands, executeGeoGebraCommands]
---

# 数学构图视觉系统

用于主体数学构造完成后的视觉整理。样式必须帮助用户区分对象角色、依赖关系和当前结论，不能替代数学结构或用装饰掩盖构造错误。

激活本技能本身不构成样式授权。只有用户明确提出颜色、线型、线宽、点大小、字体或其他外观要求时，才可执行相应 2D 样式命令；没有明确外观请求时保留 GeoGebra 默认样式。题目确需区域、事件、截面或关键对象的语义高亮时，仅允许颜色和轻量填充，并同时提供标签、符号、数值或几何位置等非颜色证据；语义高亮不授权修改线宽、线型、点大小、字体或背景。

工作顺序：

1. 先调用 `getCanvasContext` 确认真实对象与标签，再把对象分为五类：核心对象、可交互驱动对象、比较对象、辅助/参考对象、文字与测量结果。
2. 为每一类指定一种稳定视觉语义。同一变量、向量或对象在图形、公式和动态文本中保持同色；颜色只承担一种稳定语义，不因页面位置改变含义。
3. 默认采用少量色盲友好强调色，而不是彩虹配色：主对象蓝 `#0072B2`，可交互对象橙 `#E69F00`，比较对象蓝绿 `#009E73`，警告或冲突朱红 `#D55E00`，额外系列紫红 `#CC79A7`。普通辅助对象使用中性灰，黑色保留给文字、坐标和高对比轮廓。
4. 不同时使用全部强调色。普通单概念画面以一个主色、一个交互色和一个比较/结果色为上限；只有确实存在多个类别时才扩展调色板，并提供图例或就近标签。
5. 用线宽、线型、点型和透明度共同建立层级：核心轮廓使用实线和较高线宽，辅助线使用细灰虚线，候选或预测使用点划线；关键点适当放大，可拖动点必须同时用大小、形状或短提示标识。
6. 面填充保持低透明度，通常先从 `SetFilling(object, 0.12)` 到 `0.25` 范围试起；相邻区域重叠时优先保留边界清晰度，避免高饱和不透明色遮住网格、标签和交点。
7. 标签只保留题目或操作需要的名称、数值和单位。隐藏内部辅助标签；同类文本左对齐或沿同一基线排列，动态文本为最长可能内容预留空间，避免更新时跳动。
8. 在明确外观请求下应用 `SetColor`、`SetLineStyle`、`SetLineThickness`、`SetPointSize`、`SetFilling`、`SetCaption` 或 `ShowLabel` 后，再检查浅色背景、投影缩放和窄窗口中的可读性。
9. 最后做无颜色检查：若去掉颜色后仍能通过标签、线型、点型、位置或文字识别各角色，视觉编码才算完成。

约束：

- 红色与绿色不能作为唯一的一对状态编码；正确、错误、选中和禁用状态必须同时提供文字、符号、线型或明度差异。
- 不使用彩虹渐变表达无序类别；顺序量应使用明度单调的单色序列，正负偏差才使用以中性值为中心的发散配色。
- 不给每条线、每个点分配不同颜色；先用位置、几何关系、线型和标签解决问题，再使用颜色强化层级。
- 不添加阴影、渐变背景、装饰图标或与数学无关的高亮；网格和坐标轴是参考层，不得比核心构造更抢眼。
- 样式调整只在对象创建并验证后执行；不把视觉美化描述成数学证明或正确性证据。

## 原生样式示例

适用范围：用户明确要求调整已验证构造的外观，并需要语义分层与无颜色可辨认性；不用于修复数学错误或添加装饰。没有明确外观请求时只保留下方的几何构造，跳过全部 `SetColor`、`SetLineThickness`、`SetLineStyle`、`SetPointSize` 与 `ShowLabel` 命令。

```ggb
StyleA = (-3, 0)
StyleB = (3, 0)
styleMain = Segment(StyleA, StyleB)
StyleMid = Midpoint(StyleA, StyleB)
styleAux = PerpendicularLine(StyleMid, styleMain)
```

先读取画布确认上述对象与真实 label，再在用户明确要求这些外观变化时执行样式批次，并在执行后立即验证：

```ggb
SetColor(styleMain, "blue")
SetLineThickness(styleMain, 7)
SetColor(styleAux, "gray")
SetLineStyle(styleAux, 1)
SetPointSize(StyleMid, 6)
ShowLabel(StyleMid, true)
```

预期结果：在用户明确外观请求下，核心线段以较粗实线突出，辅助线以灰色不同线型退后，中点同时有大小与标签提示；关闭颜色辨识后仍能靠线宽、线型和标签区分。边界检查：颜色名称/支持范围必须由 `searchGeoGebraCommands` 或运行结果确认；不要把 CSS 十六进制值直接假定为 `SetColor` 的命令参数。红绿不能成为唯一状态编码，透明填充也不得遮挡标签和交点。canvasContext 没有样式、像素包围盒、图层或窄屏布局字段，不能单独证明颜色、遮挡和可读性合格；需要真实 UI 截图或现场检查，否则明确视觉验收未覆盖。

官方来源：[SetColor](https://geogebra.github.io/docs/manual/en/commands/SetColor/)、[SetLineStyle](https://geogebra.github.io/docs/manual/en/commands/SetLineStyle/)、[SetLineThickness](https://geogebra.github.io/docs/manual/en/commands/SetLineThickness/)、[SetPointSize](https://geogebra.github.io/docs/manual/en/commands/SetPointSize/)。
