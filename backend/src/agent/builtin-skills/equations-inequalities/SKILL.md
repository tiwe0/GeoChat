---
name: equations-inequalities
description: 初高中方程、不等式、方程组、含参数讨论和区间解集可视化技能。
category: middle-high-school-algebra
maturity: default
tags: [方程, 不等式, 方程组, 参数, 解集, 区间]
tools: [searchGeoGebraCommands, executeGeoGebraCommands, showSolutionSteps, showTeachingHint, showChoiceAnalysis]
---

# 方程与不等式

用于方程、不等式、方程组与含参数解集问题。优先把等价变形、临界点和解集落到数轴或坐标图；纯二次专项可转交 `quadratic-equation`，区间符号专项可转交 `inequality-interval`。

工作顺序：

1. 先列出等价变形的限制：分母、根式、平方增根、参数取值。
2. 方程优先找代数解；若有函数交点意义，同时画出两边函数的交点。
3. 不等式先找临界点，再用数轴区间、符号表或函数正负区间展示。
4. 参数题必须明确临界参数来自重根、切线、交点个数变化或区间端点碰撞。

关键规则：乘除负数时不等号反向；平方、去根号和清分母可能引入增根或漏掉符号条件；参数系数可能为零时必须先分支；最终候选解须回代原式。

## 原生输入小例子

在空白构图中逐行输入；名称冲突时改名，不覆盖用户对象。

```ggb
signEq(x) = (x + 2) * (x - 1)
LeftRootEq = Root(signEq, -3, -1)
RightRootEq = Root(signEq, 0, 2)
farLeftProbeEq = signEq(-3)
insideProbeEq = signEq(0)
outsideProbeEq = signEq(2)
doubleEq(x) = (x - 1)^2
DoubleRootEq = (1, doubleEq(1))
```

预期：`LeftRootEq=(-2,0)`、`RightRootEq=(1,0)`，三个分区探针 `farLeftProbeEq=4`、`insideProbeEq=-2`、`outsideProbeEq=4`，所以 `signEq(x) <= 0` 的解集为 `[-2,1]`。正常验证在每个分区取一个探针；退化验证：`doubleEq(x) <= 0` 只有 `x=1`，重根两侧不变号；边界验证要根据 `<` 或 `<=` 决定是否包含零点。

常用方向：`Root`、`Intersect`、`Solve`、`If`、数轴点与区间。区间版 `Root` 是数值搜索，每个区间只定位一个根，不能当成“返回全部根”；偶重根不跨越 x 轴，已知重根示例直接建立精确检验点。官方参考：[Root](https://geogebra.github.io/docs/manual/en/commands/Root/)、[Intersect](https://geogebra.github.io/docs/manual/en/commands/Intersect/)、[Solve](https://geogebra.github.io/docs/manual/en/commands/Solve/)。
