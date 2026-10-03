---
name: pyramid-circumsphere
description: 棱锥、正四面体、外接球、内切球、空间等距和球心定位技能。
category: high-school-solid-geometry
parent: sphere
level: 2
maturity: default
tags: [二级技能, 棱锥, 四面体, 外接球, 内切球, 球心, 等距]
tools: [searchGeoGebraCommands, executeGeoGebraCommands, showSolutionSteps, showTeachingHint, setPerspective]
---

# 棱锥与外接球

适用于三棱锥、四棱锥、正四面体和多面体外接球/内切球问题。外接球心到所有顶点等距；内切球心到所有支撑面等距且垂足落在对应面内。两者不能混用。

工作顺序：

1. 先构造多面体骨架，稳定命名顶点。
2. 外接球用等距顶点确定球心；内切球用到各面的距离相等确定球心。
3. 对正四面体等特殊体，展示中心、半径和高度关系。
4. 如果不能直接画球面，至少画球心、半径线和关键截面圆。

## 数学与能力规则

- 一般四面体外接球心由三组“到两顶点等距”的垂直平分面交点确定；共面或体积为 0 时不能当作唯一球心。
- 正四面体边长 `a` 的外接球半径为 `a√6/4`，内切球半径为 `a√6/12`；只在已验证正四面体时使用。
- 下例 `pc` 前缀执行前必须确认未占用。

## 原生小例：正四面体外接球

```ggb
pcA = Point((1, 1, 1))
pcB = Point((1, -1, -1))
pcC = Point((-1, 1, -1))
pcD = Point((-1, -1, 1))
pcO = Point((0, 0, 0))
pcBase = Polygon(pcA, pcB, pcC)
pcTet = Pyramid(pcBase, pcD)
pcR = Distance(pcO, pcA)
pcSphere = Sphere(pcO, pcR)
pcRA = Segment(pcO, pcA)
pcRB = Segment(pcO, pcB)
pcRC = Segment(pcO, pcC)
pcRD = Segment(pcO, pcD)
SetColor(pcSphere, 86, 180, 233)
SetFilling(pcSphere, 0.10)
SetColor(pcTet, 230, 159, 0)
SetFilling(pcTet, 0.20)
```

预期：六条棱都为 `2sqrt(2)`，四条半径都为 `sqrt(3)`，且 `sqrt(3)=(2sqrt(2))sqrt(6)/4`。

## 检查与降级

- 正常：检查所有顶点到候选球心距离；内切问题则检查到每个面的有向/无向距离一致。
- 退化：四点共面、底面零面积或重复顶点时，停止声称存在唯一外接球。
- 边界：近共面数据要显示距离差/体积容差，不用渲染重合代替数值检查。
- 无 `Pyramid`/`Sphere`/3D/WebGL 时保留顶点坐标、六条棱和四条等长半径；明确说明实体/球面未在真实 applet 中验证。

## 官方依据

- [Pyramid 命令](https://geogebra.github.io/docs/manual/en/commands/Pyramid/)
- [Sphere 命令](https://geogebra.github.io/docs/manual/en/commands/Sphere/)
