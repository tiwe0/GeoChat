---
name: quadratic-function
description: 二次函数顶点、对称轴、零点、最值、图像变换和参数变化技能。
category: middle-high-school-functions
parent: function-graph
level: 2
maturity: default
tags: [二级技能, 二次函数, 顶点, 对称轴, 零点, 最值, 参数]
tools: [searchGeoGebraCommands, executeGeoGebraCommands, showAnimationGuide, showSolutionSteps, showChoiceAnalysis]
---

# 二次函数

适用于 y=ax^2+bx+c、顶点式、交点式、最值和参数图像问题。必须展示开口、顶点、对称轴和与坐标轴交点。

工作顺序：

1. 判断表达式形态，必要时转为顶点式或交点式。
2. 标出顶点、对称轴、开口方向和零点个数。
3. 最值题说明定义域；闭区间最值要比较端点和顶点。
4. 参数题用滑块或临界图像展示交点个数变化。

关键规则：`a!=0`；顶点横坐标为 `-b/(2a)`，对称轴经过顶点；闭区间最值必须比较顶点（若在区间内）和两端点；`a=0` 时退化为一次/常值函数。

## 原生输入小例子

在空白构图中逐行输入；名称冲突时改名，不覆盖用户对象。

```ggb
aQuadFn = 1
fQuadFn(x) = aQuadFn*(x - 2)^2 - 3
validQuadFn = aQuadFn != 0
VertexQuadFn = If(validQuadFn, (2, fQuadFn(2)))
axisQuadFn = If(validQuadFn, x = 2)
YInterceptQuadFn = (0, fQuadFn(0))
LeftRootQuadFn = If(aQuadFn > 0, (2 - sqrt(3/aQuadFn), 0))
RightRootQuadFn = If(aQuadFn > 0, (2 + sqrt(3/aQuadFn), 0))
```

预期：`aQuadFn=1` 时顶点 `(2,-3)`、对称轴 `x=2`、y 轴截距 `(0,1)`，零点为 `2±sqrt(3)`。正常验证检查两零点关于 `x=2` 对称；把 `aQuadFn` 设为 `0.25` 后，两根应动态变为 `2±2sqrt(3)`，即使落在原先固定区间 `[0,4]` 外也仍然存在。将 `aQuadFn` 设为 `-1` 后开口向下且无实根，两个根点未定义。边界验证同时也是退化验证：将 `aQuadFn` 设为 `0` 后函数变为常值 `-3`，`validQuadFn=false`，顶点、对称轴和根点均未定义，不能继续称其为抛物线。

官方参考：[If](https://geogebra.github.io/docs/manual/en/commands/If/)、[CompleteSquare](https://geogebra.github.io/docs/manual/en/commands/CompleteSquare/)、[SetValue](https://geogebra.github.io/docs/manual/en/commands/SetValue/)、[预定义函数与运算符](https://geogebra.github.io/docs/manual/en/Predefined_Functions_and_Operators/)。
