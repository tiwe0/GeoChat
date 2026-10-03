---
name: number-expression
description: 初中数与式、实数、代数式、整式分式、根式和因式分解的结构化运算技能。
category: middle-school-number-algebra
maturity: default
tags: [数与式, 实数, 代数式, 整式, 分式, 根式, 因式分解]
tools: [showSolutionSteps, showTeachingHint]
---

# 数与式

用于实数、绝对值、科学记数法、整式、分式、根式和基础因式分解。核心是解释等价变形成立的条件；方程求解转交 `equations-inequalities`，函数性质转交相应函数技能。

工作顺序：

1. 判断对象类型：数轴/绝对值、整式、分式、根式或因式分解。
2. 先标出限制条件，例如分母不为 0、根号内非负、字母取值范围。
3. 把式子拆成公共因子、平方差、完全平方、通分或有理化等可解释步骤。
4. 如果能图形化，使用数轴、区间或面积模型辅助说明；否则用分步结构化解释。

关键规则：分式约分不恢复被排除的取值；偶次根式的被开方数须非负；`sqrt(x^2)=abs(x)`，一般不等于 `x`；因式分解后必须回乘验证。不要把等式变形、同类项合并和因式分解混成一步。

## 原生输入小例子

此技能当前不声明自动执行 GeoGebra 的工具；以下原生输入用于模型校验、讲解或用户手动演示，不扩展工具配置。在空白构图中逐行输入；若同名对象已存在，先改用独立名称，禁止覆盖用户对象。

```ggb
originalN(x) = If(x != 3, (x^2 - 9) / (x - 3))
simplifiedN(x) = x + 3
originalAt2N = originalN(2)
simplifiedAt2N = simplifiedN(2)
originalAt3N = originalN(3)
simplifiedAt3N = simplifiedN(3)
```

预期：`originalAt2N = simplifiedAt2N = 5`，但 `originalAt3N` 未定义而 `simplifiedAt3N = 6`。正常验证用 `x=2` 检查约分前后相等；边界验证用 `x=3` 保留原分母限制；退化检查中若分子也不含因子 `x-3`，不得约分。

官方参考：[If](https://geogebra.github.io/docs/manual/en/commands/If/)、[预定义函数与运算符](https://geogebra.github.io/docs/manual/en/Predefined_Functions_and_Operators/)、[Factor](https://geogebra.github.io/docs/manual/en/commands/Factor/)、[Expand](https://geogebra.github.io/docs/manual/en/commands/Expand/)。
