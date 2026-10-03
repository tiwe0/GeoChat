---
name: sphere
description: 球、球面截线、内切外接、空间距离与球心定位技能。
category: high-school-solid-geometry
maturity: default
tags: [球, 球心, 半径, 截面圆, 外接球, 内切球]
tools: [searchGeoGebraCommands, executeGeoGebraCommands, showSolutionSteps, showTeachingHint, setPerspective]
---

# 球

用于球心/半径定位、平面截球、相交球、多面体内切/外接球和球面距离。先把条件翻译为“到点等距”或“到面等距”，再构造球面。若目标内核不支持 `Sphere`，不臆造命令，改用球心、半径线和关键截面圆。

关注点：

- 外接球：球心到所有相关顶点距离相等。
- 截面：截面圆半径、球半径、球心到截面距离组成直角三角形。
- 与多面体结合：先构造多面体骨架，再标出球心候选和等距关系。

## 数学与能力规则

- 距球心 `d` 的平面与半径 `R` 的球相交时，必须有 `0≤d≤R`，截面圆半径 `r=sqrt(R²-d²)`。
- `d<R` 为圆，`d=R` 退化为切点，`d>R` 无实交集；不得在后两种情况伪造截面圆。
- 下例 `sp` 前缀必须先检查为未占用。

## 原生小例：球的平面截圆

```ggb
spO = Point((0, 0, 0))
spR = 5
spHeight = 4
spDistance = abs(spHeight)
spSphere = Sphere(spO, spR)
spPlane: z = spHeight
spSectionKind = If(spDistance < spR, "circle", spDistance == spR, "point", "undefined")
spSectionRadius = If(spDistance <= spR, sqrt(spR^2 - spDistance^2))
spCenter = If(spDistance <= spR, Point((0, 0, spHeight)))
spRadiusEnd = If(spDistance < spR, Point((spSectionRadius, 0, spHeight)))
spRadiusSeg = If(spDistance < spR, Segment(spCenter, spRadiusEnd))
spCircle = If(spDistance < spR, Intersect(spPlane, spSphere))
spTangentPoint = If(spDistance == spR, Point((0, 0, spHeight)))
SetColor(spSphere, 86, 180, 233)
SetFilling(spSphere, 0.12)
SetColor(spCircle, 213, 94, 0)
SetLineThickness(spCircle, 6)
```

预期：初始 `spHeight=4` 时，`spSectionKind="circle"`，`spCircle` 圆心为 `(0,0,4)`、`spSectionRadius=3`，与 `3²+4²=5²` 一致。只修改 `spHeight` 或 `spR` 会联动更新平面、圆心、半径和端点；`abs(spHeight)=spR` 时 `spSectionKind="point"` 且只有 `spTangentPoint` 定义，`abs(spHeight)>spR` 时为 `"undefined"`，截圆、切点和半径均不定义。

## 检查与降级

- 正常：检查球面所有约束点到球心等距，截圆平面垂直于球心到圆心的连线。
- 退化/边界：单独验证 `d=R`、`d>R`、`R=0`；对近相切值先检查容差。
- `Intersect` 若未定义或返回对象类型/标签不明，停止样式化它，改画 `spCenter`、半径段和直角三角形。无 3D/WebGL 时用过球心的 2D 剖面降级，并声明球面未真实渲染验证。

## 官方依据

- [Sphere 命令](https://geogebra.github.io/docs/manual/en/commands/Sphere/)
- [Intersect 命令](https://geogebra.github.io/docs/manual/en/commands/Intersect/)
- [If 命令](https://geogebra.github.io/docs/manual/en/commands/If/)
