---
name: geometric-construction
description: 尺规作图、垂直平分线、角平分线、作圆、作切线和作图依据说明技能。
category: middle-school-geometry
parent: geometric-transformations
level: 2
maturity: default
tags: [二级技能, 尺规作图, 垂直平分线, 角平分线, 作圆, 切线]
tools: [searchGeoGebraCommands, createGeometryPlan, executeGeoGebraCommands, showSolutionSteps, showTeachingHint]
---

# 尺规作图

适用于要求作图步骤、轨迹依据或只允许直尺圆规基本构造的题目。若题目允许直接使用变换命令且重点是对应关系，使用 `geometric-transformations`；不要用坐标计算或测量后回填数值冒充尺规构造。

## 构造规则

1. 明确给定对象、允许操作和目标对象，每一步对应画圆/圆弧、作直线或取交点。
2. 先创建被引用对象；交点、平分线和切点必须保留依赖，不能按当前图形手工放置。
3. 对有两个交点或两个解的步骤说明分支选择；隐藏辅助对象前先保留可复核的依据。
4. 验证等距、垂直或等角性质，并检查给定点重合、圆不相交、切点合并等退化情形。

## 小型原生例子：作线段垂直平分线

例子独立；执行前先确认名称无冲突，再按行输入。

```ggb
A = (-2, 0)
B = (2, 0)
cA = Circle(A, B)
cB = Circle(B, A)
C = Intersect(cA, cB, 1)
D = Intersect(cA, cB, 2)
bisector = Line(C, D)
M = Intersect(bisector, Line(A, B))
equalCheck = Distance(M, A) == Distance(M, B)
perpendicularCheck = ArePerpendicular(bisector, Line(A, B))
```

预期：`M = (0, 0)`，两个检查均为 `true`；移动 `A` 或 `B` 后，圆、交点和平分线同步更新。正常检查任意不同端点；边界检查端点非常接近时构造仍依赖两端点；退化检查 `A = B` 时两圆重合、交点和垂直平分线不唯一，不能伪造结果。

## 结果边界

“构造看起来正确”不等于依据正确。若某条命令或参数形态不确定，先用 `searchGeoGebraCommands` 核对；只使用原生命令，不用 JavaScript、XML 或 `Execute` 拼接步骤。

官方参考：[Circle](https://geogebra.github.io/docs/manual/en/commands/Circle/)、[Intersect](https://geogebra.github.io/docs/manual/en/commands/Intersect/)、[PerpendicularBisector](https://geogebra.github.io/docs/manual/en/commands/PerpendicularBisector/)、[AngleBisector](https://geogebra.github.io/docs/manual/en/commands/AngleBisector/)。
