---
name: vector
description: 高中平面向量、空间向量、线性表示、数量积、投影和几何证明技能。
category: high-school-geometry-algebra
maturity: default
tags: [向量, 平面向量, 空间向量, 数量积, 投影, 坐标表示]
tools: [searchGeoGebraCommands, executeGeoGebraCommands, showSolutionSteps, showTeachingHint, setPerspective]
---

# 向量

适用于向量加减、数乘、线性表示、数量积、夹角、投影、共线、垂直和坐标化证明，核心是把几何关系转换成可见的方向和长度关系。仅处理标量函数或矩阵方程时改用对应代数技能；2D 例子不能直接声称覆盖空间向量结论。

工作顺序：

1. 先建立基底或坐标系，明确起点、终点、方向和长度。
2. 向量加减用平行四边形法则或三角形法则展示。
3. 数量积题显示夹角、投影线和垂直条件；共线题显示比例关系。
4. 空间向量题优先切换 3D，并标出基向量、法向量或投影点。

## 小型原生例子：向量和与平行四边形

例子独立；执行前先确认名称无冲突，再按行输入。

```ggb
A = (0, 0)
B = (3, 0)
C = (1, 2)
u = Vector(A, B)
v = Vector(A, C)
w = u + v
D = A + w
dotUV = Dot(u, v)
sumCheck = Vector(A, D) == w
```

预期：`u = (3, 0)`、`v = (1, 2)`、`w = (4, 2)`、`D = (4, 2)`、`dotUV = 3`，`sumCheck = true`。移动 `B` 或 `C` 后和向量与 `D` 联动。正常检查一般不共线向量；边界检查 `Dot(u,v)=0` 的垂直情形；退化检查 `A=B` 或 `A=C` 时出现零向量，方向和夹角未定义，不能用旧角度解释。

## 结果边界

数量积为零推出垂直时须排除零向量；共线比例也要检查分母向量非零。只使用原生表达式与命令，不使用 JavaScript、XML 或 `Execute`；3D 的 `Plane`、法向量或投影签名不确定时先用 `searchGeoGebraCommands` 核对。

官方参考：[Vector](https://geogebra.github.io/docs/manual/en/commands/Vector/)、[Dot](https://geogebra.github.io/docs/manual/en/commands/Dot/)、[Translate](https://geogebra.github.io/docs/manual/en/commands/Translate/)、[Vectors and Points](https://geogebra.github.io/docs/manual/en/Points_and_Vectors/)。
