---
name: dynamic-text-feedback
description: 用动态文本、公式、表格和条件反馈清晰呈现随构造变化的数学信息，避免丑陋表达式和仅靠颜色反馈。
category: geogebra-workflow
parent: multi-view-coordination
level: 2
maturity: default
tags: [动态文本, 即时反馈, FormulaText, FractionText, TableText, LaTeX, 条件显示, 正误提示]
tools: [getCanvasContext, searchGeoGebraCommands, executeGeoGebraCommands, showTeachingHint]
---

# 动态文本与反馈

用于随参数、拖动或输入实时变化的公式、数值表、提示与正误反馈。动态文本必须引用真实对象，不能把当前数值拼成一次性的静态字符串。

工作顺序：

1. 区分静态说明与动态信息：长说明放在课件外层或 `showTeachingHint`；画面内只放与当前对象、数值或状态直接相关的短文本。
2. 动态文本就近放在对应对象附近，并避免与线、点、标签重叠；需要稳定位置时固定文本位置而不是复制文本。
3. 公式显示优先使用 `FormulaText`；分数优先用 `FractionText`；列表、矩阵和少量表格用 `TableText`，不要为了展示几行数值打开整个 Spreadsheet。
4. 展示含参数的多项式时，先用 `Polynomial` 或等价规范化消除零系数、系数 1 和连续正负号，再转为公式文本。
5. 正误状态先建立 Boolean 条件，再用 `SetConditionToShowObject` 显示“正确”“再检查此处”等具体文字；输入尚为空时不显示错误。
6. 反馈不仅告诉结果，还要在可能时指出下一步观察对象或约束；颜色、透明度和动态图标只能作为文字/符号反馈的补充。
7. 切换参数的正、负、零、整数、分数和未定义边界，检查文本不会出现 `+ -`、冗余零项、错误分母符号、`undefined` 或布局跳动。
8. 调用 `getCanvasContext` 确认文本引用对象仍存在，并验证更新源对象后文本同步变化。

约束：

- 不把答案永久显示在题目旁；需要答案时由明确的状态或用户动作控制。
- 不通过任意 JavaScript 拼接普通数学文本；优先使用 GeoGebra 对象、条件和文本命令。
- 不用红绿颜色作为唯一的正误区分，必须同时提供文字、图标、线型或数值证据。

## 原生动态文本示例

适用范围：参数变化时同步显示公式、数值和文字状态；长篇说明继续使用 `showTeachingHint`，不要塞进画布文本。

```ggb
txtA = 2
txtF(x) = txtA*x + 1
txtFormula = FormulaText(txtF, true, true)
txtRows = TableText({{"x", 0, 1}, {"f(x)", txtF(0), txtF(1)}}, "v")
txtIsPositive = txtA > 0
txtIsNonPositive = txtA <= 0
txtPositive = Text("斜率为正：函数递增", (-4, 3))
txtCheck = Text("检查斜率符号与图像方向", (-4, 2.4))
SetConditionToShowObject(txtPositive, txtIsPositive)
SetConditionToShowObject(txtCheck, txtIsNonPositive)
```

预期结果：初始公式含 `txtA = 2` 的当前值，表格显示 `1`、`3`，且出现“函数递增”的文字证据；把 `txtA` 改为负数后两个反馈文本互换，公式、表值同步更新。边界检查：测试 `txtA = 0`，确认不会把常值函数误报为递增；动态反馈不能只改变红/绿色。`FormulaText` 的第二个参数控制是否代入变量值，不要把一次性的字符串冒充依赖文本。

官方来源：[FormulaText](https://geogebra.github.io/docs/manual/en/commands/FormulaText/)、[TableText](https://geogebra.github.io/docs/manual/en/commands/TableText/)、[SetConditionToShowObject](https://geogebra.github.io/docs/manual/en/commands/SetConditionToShowObject/)、[Text](https://geogebra.github.io/docs/manual/en/commands/Text/)。
