---
name: spreadsheet-data-workflow
description: 用表格视图批量生成依赖数据、记录动态量，并与列表、统计和图形视图保持联动。
category: geogebra-workflow
parent: multi-view-coordination
level: 2
maturity: default
tags: [电子表格, Spreadsheet, 单元格, 相对引用, 绝对引用, 批量填充, 数据记录, 多视图同步]
tools: [getCanvasContext, searchGeoGebraCommands, executeGeoGebraCommands, setPerspective]
---

# 表格数据工作流

用于函数值表、递推数列、实验记录、统计样本和批量点列。表格不是静态抄写区，应优先保存可追踪的依赖关系。

工作顺序：

1. 规划列含义与表头，区分输入列、派生列和检验列；先创建被引用的单元格，再创建 `Cell`、`CellRange` 等依赖。
2. 复制公式前明确引用策略：相对引用随行列变化，`$` 锁定行或列；用少量样例检查后再批量填充。
3. 使用 `FillCells`、`FillColumn`、`FillRow` 前确认是否需要动态依赖；这些命令生成的单元格可能是自由副本，不能假装仍与源数据联动。
4. 把单元格范围转换为列表、点列或矩阵后再绘图或统计，确保表格与图形使用同一数据源。
5. 记录动态量时先验证当前版本是否支持 `StartRecord`/Record to Spreadsheet，并设置有限记录范围；记录后检查缺失值、重复样本和采样顺序。
6. 修改源参数，抽查首行、中间行、末行及对应图形是否同步。
7. 教师分析阶段可保留 Spreadsheet；面向学生的单概念课件若只需展示少量数据，优先用 `TableText` 从列表或单元格范围生成紧凑表格，避免表格窗口挤压主图。
8. 单元格写入、视图布局、图形联动和验证必须在业务动画配置之前完成；播放中再次执行表格命令会停止当前业务动画，写入后立即验证并重新配置。

约束：

- 不一次填充无界或超大区域；先估算单元格数量和渲染成本。
- `Cell` 引用对象必须先于调用出现在构造顺序中。
- 若当前嵌入模式不提供 Spreadsheet 视图，改用 `Sequence`/`Zip` 与列表表达同一数据结构，不声称已打开表格。

## 原生表格示例

适用范围：小型确定数据批量写入单元格并转换为图形对象；需要动态依赖时应显式引用单元格或改用列表表达式。

```ggb
FillColumn(1, {1, 2, 3, 4})
FillColumn(2, {1, 4, 9, 16})
dataRange = CellRange(A1, B4)
dataPoints = {(A1, B1), (A2, B2), (A3, B3), (A4, B4)}
dataCount = Length(dataPoints)
```

预期结果：A1:A4 为 `1..4`，B1:B4 为平方值，`dataCount = 4`，点列可在图形视图显示。边界检查：`FillColumn` 写入的是列表中的值，不能把它描述成会随源列表永久重算的逐格公式；修改 A2 后 B2 不会自动成为 `A2^2`，若需要联动必须把 B2 明确定义为 `A2^2`。可调用宿主 `setPerspective` 的 `mode: "AGS"` 尝试显示 Spreadsheet；canvasContext 不包含单元格网格、列宽或表格可见区域，不能证明表格 UI 已打开且未被裁剪，需现场 UI/截图验证。若视图不可用，使用 `Sequence((k,k^2),k,1,4)` 表达同一数据并明确降级。宿主没有“拖动填充柄”工具时，不声称已执行 GUI 填充。

官方来源：[FillColumn](https://geogebra.github.io/docs/manual/en/commands/FillColumn/)、[CellRange](https://geogebra.github.io/docs/manual/en/commands/CellRange/)、[Spreadsheet View](https://geogebra.github.io/docs/manual/en/Spreadsheet_View/)。
