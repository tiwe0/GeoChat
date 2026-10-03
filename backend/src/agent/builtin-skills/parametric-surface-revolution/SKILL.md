---
name: parametric-surface-revolution
description: 3D 参数曲面、二元函数曲面、旋转曲面、截线和曲面构图技能。
category: high-school-solid-geometry
parent: solid-geometry
level: 2
maturity: default
tags: [二级技能, 参数曲面, 旋转曲面, 二元函数, 曲面截线, 3D, 空间建模]
tools: [getCanvasContext, searchGeoGebraCommands, executeGeoGebraCommands, showSolutionSteps, showTeachingHint, setPerspective]
---

# 参数曲面与旋转曲面

用于二元函数图像、参数曲面、曲线绕轴旋转、圆柱/圆锥/环面建模，以及平面与曲面的截线观察。不用它取代可由原生二次曲面命令稳定表达的简单球/柱/锥，除非用户确实要求参数化或动画。

工作顺序：

1. 先判断使用 `f(x,y)`、参数化 `Surface`，还是“曲线 + 旋转角 + 旋转轴”的曲面。
2. 明确两个参数的有限范围和几何含义；先用低复杂度范围验证形状，再逐步增加精度或范围。
3. 先画母线、轴、关键截面或边界，再生成半透明曲面，避免曲面遮住数学结构。
4. 截面问题用平面与曲面/多面体的交对象验证，必要时同时保留 2D 投影或关键截线。
5. 完成后调整 3D 视角，确保三个方向可辨、关键截线无遮挡，且没有无意义的自动旋转。

常用 GeoGebra 方向：`Surface`、`Curve`、`Function`、`Plane`、`Intersect`、`IntersectPath`、`Cylinder`、`Cone`、`Sphere`。

性能约束：禁止一开始用高密度嵌套 `Sequence` 或动态 `Execute` 生成曲面网格；这类构造容易造成 WebGL 压力。优先使用原生 `Surface` 并限制参数范围。

## 数学与能力规则

- `Surface(x(u,v), y(u,v), z(u,v), u, u0, u1, v, v0, v1)` 的两个参数范围必须有限，且终值不小于始值；`x`/`y`/`z` 不可作参数变量。
- 检查参数映射是否在边界重复、在内部自交或退化；“画出来”不等于映射正则。
- 只在用户要求观察过程时添加角度滑块和动画；动画必须有明确起点/终点和停止状态，不启动无意义自动旋转。
- 下例 `ps` 前缀执行前必须确认未占用。

## 原生小例：环面参数化

```ggb
psR = 3
psr = 1
psMeridian = Curve(psR + psr * cos(t), 0, psr * sin(t), t, 0, 2 * pi)
psTorus = Surface((psR + psr * cos(u)) * cos(v), (psR + psr * cos(u)) * sin(v), psr * sin(u), u, 0, 2 * pi, v, 0, 2 * pi)
SetColor(psMeridian, 213, 94, 0)
SetLineThickness(psMeridian, 5)
SetColor(psTorus, 86, 180, 233)
SetFilling(psTorus, 0.22)
```

预期：环面到 z 轴的水平距离范围为 `[2,4]`，z 范围为 `[-1,1]`；`psMeridian` 是半径 1、圆心 `(3,0,0)` 的母圆。

## 检查与降级

- 正常：检查 `psR>psr>0`、参数端点闭合、母线和曲面边界一致。
- 退化：`psr=0` 退化为圆，`psR=psr` 为角环面，`psR<psr` 为自交环面；必须按实际类型说明。
- 边界：参数范围过大、非有限或高密度采样时先缩小到有限低复杂度范围。
- 无 `Surface`/3D/WebGL 时，只画 2D 母圆 `(x-3)^2+y^2=1` 和到旋转轴的半径区间，并明确说明曲面未在真实 applet 渲染验证。

## 官方依据

- [Surface 命令](https://geogebra.github.io/docs/manual/en/commands/Surface/)
- [Curve 命令](https://geogebra.github.io/docs/manual/en/commands/Curve/)
