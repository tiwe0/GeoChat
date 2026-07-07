---
name: viewport-scale-composition
description: 2D/3D 构图后的整体缩放、居中和画面留白技能，防止关键对象过小、过大或被边缘裁剪。
category: visual-post-processing
parent: visual-post-processing
level: 2
tags: [缩放, 视野, 居中, 留白, 裁剪, 坐标轴比例, 2D, 3D, GeoGebra]
tools: [getCanvasContext, searchGeoGebraCommands, executeGeoGebraCommands, setPerspective]
---

# 视野缩放与构图留白

该技能用于主体图形已经生成、但画面过大、过小、偏离中心或边缘裁剪时。

原则：

- 缩放只服务于可读性，不改变数学对象。
- 2D 函数图像、平面几何图和 3D 立体图都可能需要缩放、居中和留白；不要只在 3D 场景才做取景调整。
- 2D 和 3D 都必须保持坐标轴等比例；除非用户明确要求拉伸坐标轴，禁止非 1:1 的 SetAxesRatio。
- 关键对象应有适度留白，不能顶到画布边缘；标签不能被底部、右侧或工具栏裁剪。
- 对动态图形，缩放范围要覆盖参数变化的主要观察区间，而不是只覆盖初始帧。

建议流程：

1. 读取 canvasContext，判断关键对象的空间范围和是否裁剪。
2. 2D 时用 CenterView 或 2D 等比 ZoomIn 调整关键点、函数图像、圆和标签的位置；3D 时可以使用 6 参数 ZoomIn，但 x/y/z 范围必须按同一尺度扩展。
3. 如需 SetAxesRatio，只使用 SetAxesRatio(1, 1) 或 SetAxesRatio(1, 1, 1)。
4. 调整后再次读取画布，确认主体、标签和关键辅助对象都在画面内。
