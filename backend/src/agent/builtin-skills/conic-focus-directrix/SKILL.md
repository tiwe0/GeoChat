---
name: conic-focus-directrix
description: 圆锥曲线焦点、准线、离心率、切线、弦长和轨迹生成技能。
category: high-school-analytic-geometry
parent: analytic-geometry-conic
level: 2
maturity: default
tags: [二级技能, 圆锥曲线, 焦点, 准线, 离心率, 切线, 弦长]
tools: [searchGeoGebraCommands, executeGeoGebraCommands, showAnimationGuide, showSolutionSteps, showChoiceAnalysis]
---

# 圆锥曲线焦点准线

适用于椭圆、双曲线、抛物线的标准方程、焦点—准线定义、离心率、切线、弦长和轨迹问题。一般二次曲线代数问题使用父技能 `analytic-geometry-conic`；不能把屏幕测得的距离近似当作定义证明。

工作顺序：

1. 先确定曲线类型、标准方程和坐标轴方向。
2. 标出焦点、顶点、准线、渐近线或对称轴。
3. 直线与曲线问题同时展示交点、弦中点和斜率。
4. 轨迹题用动点或参数滑块展示生成关系。

## 构造规则

- 焦点、准线、动点和垂足保持对象依赖；离心率用点到焦点距离与点到准线距离之比定义，不复制当前数值。
- 明确椭圆 `0 < e < 1`、抛物线 `e = 1`、双曲线 `e > 1` 的有效分支，并检查准线方向和坐标轴方向。
- 切线、弦和交点存在性分别检查；焦点位于准线上、分母距离为零或曲线无实点时必须报告退化。

## 小型原生例子：抛物线焦点—准线等距

例子独立；执行前先确认名称无冲突，再按行输入。

```ggb
D1 = (-3, -2)
D2 = (3, -2)
directrix = Line(D1, D2)
F = (0, 2)
parabola = Parabola(F, directrix)
P = Point(parabola)
normalThroughP = PerpendicularLine(P, directrix)
H = Intersect(normalThroughP, directrix)
focusDistance = Distance(P, F)
directrixDistance = Distance(P, H)
definitionCheck = focusDistance == directrixDistance
```

预期：抛物线顶点为 `(0, 0)`，且 `definitionCheck = true`；沿曲线移动 `P` 后两距离继续相等。正常检查多个位置；边界检查顶点处两距离都为 `2`；退化检查令 `D1 = D2` 或让 `F` 落到准线上，此时准线/抛物线定义失效或退化，不能继续声称标准抛物线。

只使用原生命令，不使用 JavaScript、XML 或 `Execute`；命令签名不确定时先用 `searchGeoGebraCommands` 核对。

官方参考：[Parabola](https://geogebra.github.io/docs/manual/en/commands/Parabola/)、[PerpendicularLine](https://geogebra.github.io/docs/manual/en/commands/PerpendicularLine/)、[Distance](https://geogebra.github.io/docs/manual/en/commands/Distance/)、[Conic sections](https://geogebra.github.io/docs/manual/en/Conic_sections/)。
