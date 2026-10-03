---
name: native-expression-modeling
description: 用原生表达式、Boolean 和 If 建立对象依赖、条件逻辑与分支赋值，检查定义域和未定义边界；适用于参数联动与条件建模。
category: geogebra-workflow
parent: function-graph
level: 2
maturity: default
tags: [原生表达式, Boolean, If, 条件逻辑, 对象依赖, 分支赋值, 未定义边界, 参数联动]
tools: [getCanvasContext, searchGeoGebraCommands, executeGeoGebraCommands, inspectGeoGebraObjects, showTeachingHint]
---

# 原生表达式与条件建模

用于“改变输入后结果自动更新”的任务：参数公式、依赖点、条件取值、定义域限制和动态反馈。分段函数的端点与图像问题使用 `piecewise-domain-function`；批量对象与列表映射使用 `list-driven-construction`，不把本技能当作通用命令目录。

## 建模规则

1. 区分自由输入、依赖结果和展示对象，依赖方向保持为“输入 → 数学对象 → 判断 → 反馈”。先创建被引用的对象，再定义结果，不复制当前测量值冒充依赖。
2. 用 `b = 3*a + 1` 保存关系。`SetValue(b, 7)` 是一次状态写入，不能用来建立这条关系；验证时修改自由输入，不直接写依赖输出。
3. 定义用 `=`，相等判断用 `==`；Boolean 可用 `&&`、`||`、`!` 组合。数值计算的相等判断按问题精度采用 `abs(actual - target) <= tolerance`，不要把近似误差当成几何证明。
4. `result = If(condition, value1, value2)` 是一个依赖定义。结果分支保持同类型，不能把 `result = value1` 这种赋值放进分支；多个条件按首个成立者选择，省略最后的默认值表示未定义。
5. 分母非零、根式范围、对数真数和索引有效性应进入模型定义；`If` 用于表达有效范围，不是程序异常捕获器。检查已有对象的定义状态可用 `IsDefined`，但它不是“对象标签是否存在”的查询。
6. 用少量正常值、边界值、无效值验证依赖，必要时调用 `inspectGeoGebraObjects` 或 `getCanvasContext`。隐藏对象仍然存在，条件显示不等于修改对象定义域。

## 小例子

以下各例独立。执行前确认名称未与当前构造冲突；需要复用已有对象时先核对其定义，不覆盖用户已有对象。代码块是按行执行的 GeoGebra 输入，不是脚本。

### 参数驱动坐标，不复制数值

```ggb
a = 2
b = 3*a + 1
P = (a, b)
```

预期：初始 `b = 7`、`P = (2, 7)`；单独执行 `SetValue(a, 4)` 后，自动变为 `b = 13`、`P = (4, 13)`。把 `b` 写成常量 `7` 或把 `P` 写成 `(2, 7)` 会丢失联动。检查正、负、零输入，确认对象定义仍引用 `a`。

### Boolean 驱动条件取值与文字反馈

```ggb
answer = 4.9
target = 5
tolerance = 0.02
correct = abs(answer - target) <= tolerance
feedback = If(correct, "在允许误差内", "请检查差值")
```

预期：初始 `correct = false`；将自由输入 `answer` 改为 `5` 后，`correct` 和 `feedback` 同步更新。`correct` 是依赖判断，不应作为可任意切换的开关。检查目标值两侧以及容差附近的输入；容差必须为非负且符合题意。

### 条件定义允许出现未定义状态

```ggb
d = 2
valid = d != 0
q = If(valid, 1/d)
status = If(valid, "分母有效", "分母不能为零")
```

预期：`d = 2` 时 `q = 0.5`；改为 `0` 时 `q` 未定义且状态给出原因；改为 `-2` 时恢复为 `-0.5`。不要补一个默认 `0` 掩盖除零，也不要删除 `q` 再重建。未定义在这里是模型预期，不是执行命令必然失败。

## 约束

- 优先原生依赖定义，不通过逐次赋值模拟公式联动；条件函数、列表推导和显示条件应保留对输入的引用。
- 不执行 JavaScript、XML 或拼接 `Execute`；本技能只使用当前工具注册表提供的原生命令与对象检查能力。
- 代码例子只覆盖小规模构造；命令接受的对象类型和参数形态不确定时，先用 `searchGeoGebraCommands` 核对。

## 官方参考

- [自由对象与依赖对象](https://geogebra.github.io/docs/manual/en/Free_Dependent_and_Auxiliary_Objects/)
- [Boolean 运算](https://geogebra.github.io/docs/manual/en/Boolean_values/)、[If](https://geogebra.github.io/docs/manual/en/commands/If/)
- [SetValue](https://geogebra.github.io/docs/manual/en/commands/SetValue/)、[IsDefined](https://geogebra.github.io/docs/manual/en/commands/IsDefined/)
