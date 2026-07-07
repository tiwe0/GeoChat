---
name: camera-framing
description: 3D 立体几何构图后的摄像机、视角和遮挡调整技能，适合棱柱、棱锥、球、截面和空间角。
category: visual-post-processing
parent: visual-post-processing
level: 2
tags: [摄像机, 视角, 3D, 立体几何, 棱柱, 棱锥, 球, 截面, 遮挡, 裁剪]
tools: [getCanvasContext, searchGeoGebraCommands, executeGeoGebraCommands, setPerspective]
---

# 3D 摄像机与视角

该技能在 3D 主体骨架已经画出后使用。目标是让学生同时看见底面、侧面、高、截面或球心等关键结构。

最低视觉标准：

- 立体图不要只正对一个面；优先使用能同时看到三个方向的斜视角。
- 棱柱、棱锥、四面体和球的图形不能过大导致顶点、球面或截面被画布裁剪。
- 球、截面、垂线、投影线不能遮住主体骨架；必要时先降低面体填充，再调整视角。
- 视角调整前后都要保持 1:1 轴比例，不要使用非等比 SetAxesRatio。

建议流程：

1. 主体构造完成后读取 canvasContext，确认 3D 对象存在。
2. 使用 setPerspective 切到 3D 图形视图；必要时再用 GeoGebra 视图命令调整取景。
3. 如果画面裁剪，优先用等比 ZoomIn 范围或中心点缩放；不要通过拉伸坐标轴解决。
4. 调整后再次读取画布，确认关键顶点、截面、球心和半径可见。
