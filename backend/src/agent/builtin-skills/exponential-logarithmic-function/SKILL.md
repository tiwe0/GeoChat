---
name: exponential-logarithmic-function
description: 高中指数函数、对数函数、幂函数、增长模型和图像性质技能。
category: high-school-functions
maturity: default
tags: [指数函数, 对数函数, 幂函数, 增长模型, 图像, 单调性]
tools: [searchGeoGebraCommands, executeGeoGebraCommands, showAnimationGuide, showSolutionSteps, showChoiceAnalysis]
---

# 指数与对数函数

适用于指数函数、对数函数、幂函数、复合函数和实际增长模型。优先展示底数、定义域、值域、单调性、特殊点和渐近线。

工作顺序：

1. 判断函数类型和参数限制，特别是底数 a>0 且 a≠1、对数真数大于 0。
2. 画出基础函数和变换后的函数，标出 (0,1)、(1,0)、渐近线和单调方向。
3. 比较大小或解不等式时，优先用单调性和图像交点解释。
4. 实际模型题显示增长/衰减曲线、参数意义和临界时间点。

关键规则：底数 `a>0` 且 `a!=1`；对数真数必须大于 0；`a>1` 时指数/对数递增，`0<a<1` 时递减；互为反函数的图像关于 `y=x` 对称。不要忽略定义域或只背性质而不说明底数影响。

## 原生输入小例子

在空白构图中逐行输入；名称冲突时改名，不覆盖用户对象。

```ggb
baseExpLog = 2
expFnEL(x) = baseExpLog^x
logFnEL(x) = log(baseExpLog, x)
expProbeEL = expFnEL(3)
logProbeEL = logFnEL(8)
inverseProbeEL = logFnEL(expFnEL(3))
domainEdgeEL = logFnEL(0)
```

预期：`expProbeEL=8`、`logProbeEL=3`、`inverseProbeEL=3`，`domainEdgeEL` 未定义；图像分别经过 `(0,1)`、`(1,0)`。正常验证检查反函数复合；边界验证检查真数 0；退化验证 `baseExpLog=1` 时对数底非法且指数变常值，不得继续宣称互为反函数。

官方参考：[预定义函数与运算符](https://geogebra.github.io/docs/manual/en/Predefined_Functions_and_Operators/)、[Functions](https://geogebra.github.io/docs/manual/en/Functions/)。
