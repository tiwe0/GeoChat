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

1. 主体构造完成后读取 canvasContext，确认 3D 对象存在；后处理只引用已有对象，不重复创建球、棱柱或截面。
2. 使用 `setPerspective` 的 `mode: "T"` 切到 3D 图形视图。该宿主工具只切换视图/布局，不等于拖拽旋转 3D 摄像机；当前工具没有专门的轨道相机姿态接口时，不声称已设置俯仰角或方位角。
3. 如果画面裁剪，优先用等比 ZoomIn 范围或中心点缩放；不要通过拉伸坐标轴解决。
4. 调整后再次读取画布确认关键对象仍存在；要判断投影遮挡、像素级裁剪和标签是否出框，必须查看真实 3D 视图截图或现场 UI，不能从 canvasContext 推断。
5. 若画板还要播放业务动画，必须先完成构造、3D 取景和验证，再调用 `configureGeoGebraAnimation`；播放中再次执行取景命令会停止当前业务动画，验证后必须重新配置。

## 小型原生示例

适用范围：已完成的球、棱柱、棱锥或截面构造，需要检查 3D 视图、等比例和遮挡；不负责重建数学对象。

下面是空白画板上的独立演示，才会新建一个球；实际后处理已有球体时只读取并调整已有对象，绝不照抄前三条构造命令重建球。先调用宿主 `setPerspective`，参数使用 `mode: "T"`，确认 3D Graphics 可用且为活动视图，再执行：

```ggb
CamCenter = (0, 0, 0)
camSphere = Sphere(CamCenter, 2)
CamRadiusEnd = (2, 0, 0)
camRadius = Segment(CamCenter, CamRadiusEnd)
SetFilling(camSphere, 0.18)
SetAxesRatio(1, 1, 1)
```

然后调用 `getCanvasContext` 检查 `CamCenter`、`camSphere`、`camRadius` 是否存在。预期结果：对象存在且三轴比例命令按 1:1:1 提交；球心、半径是否在真实 3D Graphics 中清晰可辨必须另看截图或现场 UI。边界检查：`setPerspective` 不能证明对象未裁剪，也不能指定精确相机旋转；canvasContext 没有相机姿态、投影边界或像素包围盒，只能报告视图已切换和对象存在，不能编造“最佳角度”或“无遮挡”。

官方来源：[SetPerspective](https://geogebra.github.io/docs/manual/en/commands/SetPerspective/)、[SetAxesRatio](https://geogebra.github.io/docs/manual/en/commands/SetAxesRatio/)、[GeoGebra Apps API](https://geogebra.github.io/docs/reference/en/GeoGebra_Apps_API)。
