---
name: quadratic-equation
description: 一元二次方程、判别式、根与系数关系和二次方程图像解释技能。
category: middle-high-school-algebra
parent: equations-inequalities
level: 2
maturity: default
tags: [二级技能, 一元二次方程, 判别式, 根与系数, 抛物线, 交点]
tools: [searchGeoGebraCommands, executeGeoGebraCommands, showSolutionSteps, showChoiceAnalysis]
---

# 一元二次方程

用于一元二次方程求根、判别式、根与系数关系及参数讨论。代数解必须与抛物线零点对应；若二次项系数可能为零，先退回一次方程分支。

工作顺序：

1. 整理为 ax^2+bx+c=0，并说明 a≠0。
2. 根据题目选择因式分解、配方、公式法或根与系数关系。
3. 参数题优先分析判别式、重根或根所在区间。
4. 需要可视化时画 y=ax^2+bx+c 和 x 轴交点。

关键规则：`delta=b^2-4ac`；`delta>0` 有两个不等实根，`delta=0` 有一个二重实根，`delta<0` 无实根；韦达关系仅在 `a!=0` 时为 `x1+x2=-b/a`、`x1*x2=c/a`。

## 原生输入小例子

在空白构图中逐行输入；名称冲突时改名，不覆盖用户对象。

```ggb
aQuadEq = 1
bQuadEq = -3
cQuadEq = 2
fQuadEq(x) = aQuadEq*x^2 + bQuadEq*x + cQuadEq
deltaQuadEq = bQuadEq^2 - 4*aQuadEq*cQuadEq
Root1QuadEq = Root(fQuadEq, 0, 1.5)
Root2QuadEq = Root(fQuadEq, 1.5, 3)
doubleQuadEq(x) = (x - 2)^2
DoubleRootQuadEq = (2, doubleQuadEq(2))
```

预期：`deltaQuadEq=1`，两根为 `(1,0)`、`(2,0)`；`DoubleRootQuadEq=(2,0)` 且二重根两侧函数不变号。正常验证检查根代回函数为 0；边界验证检查 `delta=0`；退化验证把 `aQuadEq=0` 时识别为一次方程，不能继续使用二次公式。

官方参考：[Root](https://geogebra.github.io/docs/manual/en/commands/Root/)、[Intersect](https://geogebra.github.io/docs/manual/en/commands/Intersect/)。区间版 `Root` 是数值算法，区间应隔离目标根。
