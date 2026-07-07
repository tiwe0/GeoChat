---
name: visual-post-processing
description: GeoGebra 2D/3D 构图完成后的呈现调整技能，用于视角、居中、缩放、标签和辅助对象收尾。
category: visual-post-processing
tags: [后处理, 构图收尾, 视野, 缩放, 居中, 标签, 辅助对象, GeoGebra]
tools: [getCanvasContext, searchGeoGebraCommands, executeGeoGebraCommands, setPerspective, showSelectedElements]
---

# 视觉后处理

该技能只在主体数学构造完成后使用。它负责让图像更容易观看，不负责新增数学结论。

后处理顺序：

1. 必须先读取或使用最近一次 canvasContext，确认对象是否已经创建成功，以及真实 label 是否和命令左侧赋值一致。
2. 先处理视图和构图：2D 图优先居中关键区域并保留坐标读数空间，3D 图选择合适视角；避免主要点线面被裁剪。
3. 再处理标签和辅助对象：保留题目需要观察的对象，弱化或隐藏纯计算辅助对象。
4. 视野调整必须保持 x/y/z 轴 1:1 比例；不要为了“刚好铺满”而拉伸坐标轴。

禁忌：

- 不要在主体构造前调用后处理命令。
- 不要把视角、缩放、配色当成数学证明。
- 不要假设多返回对象命令的左侧赋值名可直接用于样式化；先确认 canvasContext。
