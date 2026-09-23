---
name: cas-graphics-workflow
description: 将 CAS 精确推导、代数定义与图形验证组织成同一依赖链，处理定义域、参数和精确值的一致性。
category: geogebra-workflow
parent: multi-view-coordination
level: 2
maturity: default
tags: [CAS, 符号计算, 图形联动, 精确计算, 代数视图, 定义域, 参数假设]
tools: [getCanvasContext, searchGeoGebraCommands, executeGeoGebraCommands, setPerspective]
---

# CAS 与图形协同

用于方程求解、恒等变形、极限、导数、积分和参数问题。CAS 负责推导精确结果，图形负责观察与反例检查；图形近似不能替代证明，CAS 输出也不能忽略定义域。

工作顺序：

1. 在代数/图形视图建立原始函数、方程或参数对象，保留清楚的自由变量与定义域。
2. 在 CAS 中执行 `Solve`、`Factor`、`Simplify`、`Derivative`、`Integral` 等精确运算；先用 `searchGeoGebraCommands` 确认签名。
3. 将需要可视化的结果定义为共享对象，而不是重新键入一份近似表达式；比较原式、变形式和关键点。
4. 用图形检查漏根、增根、奇点、分支或参数退化，再把异常反馈到 CAS 假设和分类讨论。
5. 修改原参数后验证 CAS 结果、代数值和图形同步变化；若 CAS 视图不可用，使用当前支持的精确命令完成推导，并明确说明视图降级。

约束：

- 保留精确数与符号表达式，非必要不提前转小数。
- 每次变形都记录定义域、分母非零、根式和对数条件；数值图像只用于验证而非证明。
- 不创建名称相近但无依赖关系的“影子对象”；跨视图数据只有一个来源。
