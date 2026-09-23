---
name: locus-envelope
description: 动点轨迹、精确轨迹方程、曲线族包络和生成机制解释技能。
category: high-school-analytic-geometry
parent: analytic-geometry-conic
level: 2
maturity: default
tags: [二级技能, 轨迹, 轨迹方程, 包络, 动点, 曲线族, 生成机制]
tools: [getCanvasContext, searchGeoGebraCommands, createGeometryPlan, executeGeoGebraCommands, showAnimationGuide, showSolutionSteps]
---

# 轨迹与包络

用于动点轨迹、焦点—准线构造、连杆轨迹、曲线族包络以及从动态构造提取隐式方程。

工作顺序：

1. 区分驱动对象和依赖对象：驱动点必须位于路径上，轨迹点必须由驱动点的依赖链唯一确定。
2. 先用少量位置和拖动测试确认依赖关系，再调用 `Locus`；不要用一串互不相干的采样点冒充动态轨迹。
3. 需要代数方程时再用 `LocusEquation`，并核对额外分支、退化条件和空集/全平面结果。
4. 曲线族的切触边界使用 `Envelope`，先明确“移动点绑定的路径”和“随之变化的输出路径”。
5. 同时保留生成构造与结果曲线：前者解释为什么，后者展示整体形状；视觉上弱化辅助对象但不要删除依赖链。

常用 GeoGebra 方向：`Point`、`Locus`、`LocusEquation`、`Envelope`、`PathParameter`、`ImplicitCurve`、`Intersect`、`Slider`。

限制与校验：

- `LocusEquation` 只支持受限的代数几何构造，复杂结果可能未定义或出现额外分支。
- 驱动点优先使用路径上的点；只有普通轨迹 `Locus` 明确接受滑块时才使用滑块驱动，不能把该能力误套到 `LocusEquation`。
