---
name: factorization-formulas
description: 因式分解、乘法公式、配方和代数结构识别的二级技能。
category: middle-school-number-algebra
parent: number-expression
level: 2
maturity: default
tags: [二级技能, 因式分解, 乘法公式, 配方, 公因式, 平方差]
tools: [showSolutionSteps, showTeachingHint]
---

# 因式分解与公式

用于提公因式、平方差、完全平方、二次三项式、分组分解和配方。只处理代数结构；若目标是求方程根，转交 `quadratic-equation`。

工作顺序：

1. 先检查公因式、次数、项数和特殊系数。
2. 判断是否符合平方差、完全平方或二次三项式结构。
3. 分解后回乘验证，避免符号错误。
4. 配方题要说明加减同一个量的原因。

关键规则：先提最大公因式；`a^2-b^2=(a-b)(a+b)`，而平方和在有理数范围通常不可分；完全平方中间项必须是 `±2ab`；分解结果应与原式同定义域并通过 `Expand` 回乘。

## 原生输入小例子

此技能当前不声明自动执行 GeoGebra 的工具；以下输入用于模型校验、讲解或用户手动演示，不扩展工具配置。在空白构图中逐行输入；名称冲突时改名，不覆盖用户对象。

```ggb
sourceFac = x^2 - 5*x + 6
factoredFac = Factor(sourceFac)
roundTripFac = Expand(factoredFac)
residualFac = roundTripFac - sourceFac
irreducibleFac = Factor(x^2 + 1)
```

预期：`factoredFac=(x-2)(x-3)`，`roundTripFac=x^2-5x+6`，`residualFac=0`；`irreducibleFac` 在有理数范围保持 `x^2+1`。正常验证检查回乘；退化验证检查常数、多项式零项或平方和；边界验证要声明所用数域，不能把复数分解冒充实数/有理数分解。

官方参考：[Factor](https://geogebra.github.io/docs/manual/en/commands/Factor/)、[Expand](https://geogebra.github.io/docs/manual/en/commands/Expand/)、[CompleteSquare](https://geogebra.github.io/docs/manual/en/commands/CompleteSquare/)。`Factor` 会加载 CAS，避免为纯展示重复调用。
