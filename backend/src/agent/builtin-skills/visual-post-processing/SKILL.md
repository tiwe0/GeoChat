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
5. 激活后处理技能不等于用户授权修改外观。没有明确外观请求时保留默认线型、线宽、点大小与标签样式；题目确需截面、区域或关键对象的语义高亮时，只用颜色或轻量填充辅助表达。
6. 后处理与验证必须在业务动画配置前完成；播放中再次执行任何 GeoGebra 命令会停止当前业务动画，验证后必须重新配置。

禁忌：

- 不要在主体构造前调用后处理命令。
- 不要把视角、缩放、配色当成数学证明。
- 不要假设多返回对象命令的左侧赋值名可直接用于样式化；先确认 canvasContext。

## 原生收尾示例

适用范围：数学构造已验证，需要统一视野、标签和辅助线层级；不负责补充证明或修改结论。

```ggb
PostA = (-3, 0)
PostB = (3, 0)
PostC = (0, 3)
postTri = Polygon(PostA, PostB, PostC)
postAlt = PerpendicularLine(PostC, Line(PostA, PostB))
SetAxesRatio(1, 1)
```

首批验证后，仅当题目确需把三角形区域作为语义目标突出时，才单独执行轻量填充并立即验证：

```ggb
SetFilling(postTri, 0.15)
```

仅当用户明确要求高线采用不同线型、隐藏多边形标签时，才在前一批验证后单独执行相应外观命令并立即验证：

```ggb
SetLineStyle(postAlt, 1)
ShowLabel(postTri, false)
```

预期结果：坐标比例保持 1:1；存在语义高亮需要时，三角形区域有轻量填充；存在明确外观请求时，高线再以非默认线型弱化并隐藏多边形标签。边界检查：先用 `getCanvasContext` 确认 `postTri` 与 `postAlt` 的真实标签，再执行样式命令；隐藏标签不等于隐藏对象，更不能用于掩盖未定义构造。canvasContext 没有像素包围盒、图层、样式或分视图可见性字段，不能独自证明无遮挡、未裁剪或颜色合格；若没有真实 UI 截图或视觉比较能力，只报告对象/依赖检查与已提交命令，不能声称完成最终视觉验收。

官方来源：[SetFilling](https://geogebra.github.io/docs/manual/en/commands/SetFilling/)、[ShowLabel](https://geogebra.github.io/docs/manual/en/commands/ShowLabel/)、[SetAxesRatio](https://geogebra.github.io/docs/manual/en/commands/SetAxesRatio/)。
