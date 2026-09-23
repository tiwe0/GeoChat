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

约束：

- 不一次填充无界或超大区域；先估算单元格数量和渲染成本。
- `Cell` 引用对象必须先于调用出现在构造顺序中。
- 若当前嵌入模式不提供 Spreadsheet 视图，改用 `Sequence`/`Zip` 与列表表达同一数据结构，不声称已打开表格。
