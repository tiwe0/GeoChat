---
name: inequality-interval
description: 一元不等式、不等式组、符号表、数轴区间和参数临界点技能。
category: middle-high-school-algebra
parent: equations-inequalities
level: 2
maturity: default
tags: [二级技能, 不等式, 区间, 符号表, 数轴, 参数]
tools: [searchGeoGebraCommands, executeGeoGebraCommands, showSolutionSteps, showChoiceAnalysis]
---

# 不等式与区间

适用于一次、二次、分式、绝对值不等式和不等式组。重点是临界点、符号变化和区间取舍。

工作顺序：

1. 找所有临界点：零点、分母零点、绝对值分界点和参数端点。
2. 在数轴上分区间，说明端点是否可取。
3. 分式不等式不得交叉相乘丢失符号条件。
4. 参数题把临界点排序变化作为主线。

关键规则：零点可能取到，分母零点永远排除；偶重根两侧不变号，奇重根两侧变号；绝对值要按分界点分段；交集为空、单点或无界区间都应明确表示。

## 原生输入小例子

在空白构图中逐行输入；名称冲突时改名，不覆盖用户对象。

```ggb
ratioInt(x) = (x - 1) / (x + 2)
ZeroInt = Root(x - 1, 0, 2)
leftProbeInt = ratioInt(-3)
middleProbeInt = ratioInt(0)
rightProbeInt = ratioInt(2)
excludedProbeInt = ratioInt(-2)
```

预期：临界点为 `-2`（分母为零）和 `1`（分子为零）；探针符号依次为正、负、正，`excludedProbeInt` 未定义。因此 `ratioInt(x) <= 0` 的解集是 `(-2,1]`。正常验证逐区间取样；边界验证区分零点可取与极点不可取；退化验证若分子分母含相同因子，约分后仍保留原分母排除点。

官方参考：[Root](https://geogebra.github.io/docs/manual/en/commands/Root/)、[If](https://geogebra.github.io/docs/manual/en/commands/If/)、[预定义函数与运算符](https://geogebra.github.io/docs/manual/en/Predefined_Functions_and_Operators/)。
