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

1. 读取 canvasContext 确认关键对象存在；它没有像素边界或标签包围盒，不能据此判断是否裁剪。
2. 2D 时用 CenterView 或 2D 等比 ZoomIn 调整关键点、函数图像、圆和标签的位置；3D 时可以使用 6 参数 ZoomIn，但 x/y/z 范围必须按同一尺度扩展。
3. 如需 SetAxesRatio，只使用 SetAxesRatio(1, 1) 或 SetAxesRatio(1, 1, 1)。
4. 调整后再次读取画布，确认主体、标签和关键辅助对象仍存在、数学定义未被取景命令改变；是否都落在像素画面内必须另做真实视觉检查。
5. 所有构造和取景必须在业务动画配置前完成；播放中执行 `ZoomIn`、`CenterView` 或 `SetAxesRatio` 会停止当前业务动画，取景后立即验证并重新配置。

## 小型取景示例

适用范围：主体构造已经正确，只需在 2D 视图中等比缩放和留白；不改变对象定义。

```ggb
FrameA = (-4, -2)
FrameB = (4, 2)
frameDiag = Segment(FrameA, FrameB)
frameCircle = Circle((0, 0), 2)
ZoomIn(-6, -6, 6, 6)
SetAxesRatio(1, 1)
```

预期结果：提交的视野以原点为中心，x/y 数值跨度同为 12，x/y 单位长度相同；线段、圆与标签是否在真实画布内留白且未裁剪必须另看截图或现场 UI。边界检查：宿主策略会把非等跨度的四参数 `ZoomIn` 修复为方形范围，因此示例直接使用等跨度边界，再执行并验证 `SetAxesRatio(1,1)`；动态图形还要在动画配置前逐个写入参数极值并立即验证，而非只看初态。canvasContext 没有像素边界或标签包围盒，不能宣称已完成像素级防裁剪验收。

官方来源：[ZoomIn](https://geogebra.github.io/docs/manual/en/commands/ZoomIn/)、[SetAxesRatio](https://geogebra.github.io/docs/manual/en/commands/SetAxesRatio/)、[CenterView](https://geogebra.github.io/docs/manual/en/commands/CenterView/)。
