---
name: interactive-controls-workflow
description: 用输入框、复选框、按钮和下拉列表构建简洁可靠的 GeoGebra 交互控制面板。
category: geogebra-workflow
parent: multi-view-coordination
level: 2
maturity: default
tags: [交互控件, 输入框, 复选框, 按钮, 下拉列表, InputBox, Checkbox, SelectedElement, 控制面板]
tools: [getCanvasContext, searchGeoGebraCommands, executeGeoGebraCommands]
---

# 交互控件工作流

用于让用户修改参数、切换提示、选择模型或触发有限动作。只使用 GeoGebra 原生链接与条件关系；本技能不生成 JavaScript、点击脚本或更新脚本。

工作顺序：

1. 每个控件只承担一个明确任务：`InputBox` 修改一个对象，`Checkbox` 控制一个语义层，列表选择一个候选，按钮触发一个有限动作。
2. 输入框优先直接链接自由对象；无需脚本即可更新时，不添加 OnClick/OnUpdate 逻辑。
3. 复选框连接 Boolean，再用 `SetConditionToShowObject` 或对象条件控制可见性。
4. 下拉列表以一个列表为数据源，用 `SelectedIndex` 或 `SelectedElement` 派生结果；不要复制每个选项的独立状态。
5. 按钮只用于明确且可重复的操作，执行后要验证对象状态；保留重置或回退路径。
6. 用非法输入、边界值、重复点击和控件组合测试交互，确认不会产生未定义对象或状态漂移。
7. 离散或非线性参数不要伪装成普通线性滑块：用整数索引配合列表和 `Element` 映射真实值；跨度很大时可用指数映射，精细调节可拆成粗调/微调，但两者必须汇入同一个源值。
8. 可拖动对象要有明显的尺寸、形状或文字提示；不可移动的标题、文本和控件位置应固定，避免误拖。

约束：

- 默认不生成任意 JavaScript；不得把数学依赖藏进不可审计脚本。
- 控件标题使用用户可理解的动作或量名，不暴露内部对象名。
- 控件数量保持最少，避免遮挡图形；核心数学对象不能只靠颜色或隐藏状态表达。
- 正误反馈必须包含文字、符号或数值依据，颜色只能作为辅助提示。

## 原生控件示例

适用范围：输入框修改一个自由对象，复选框控制一个语义层；复杂状态机和任意脚本不属于本技能。

```ggb
ctrlA = 2
ctrlF(x) = ctrlA*x + 1
ctrlInput = InputBox(ctrlA)
ctrlHint = Text("斜率由输入框中的 ctrlA 决定", (-4, 3))
ctrlShowHint = Checkbox("显示斜率说明", {ctrlHint})
SetFixed(ctrlInput, true)
SetFixed(ctrlShowHint, true)
```

预期结果：输入框链接 `ctrlA`，修改后 `ctrlF` 自动更新；复选框显示/隐藏 `ctrlHint`，不需要 OnClick/OnUpdate。边界检查：测试 `ctrlA = 0`、负数和非数值输入；链接对象未成功更新时不创建第二份影子参数。`InputBox`/`Checkbox` 命令创建动作对象，但不等于宿主已替用户点击、聚焦或提交 GUI 控件；当前 host 无通用菜单/鼠标操作工具时，不编造这些动作。

官方来源：[InputBox](https://geogebra.github.io/docs/manual/en/commands/InputBox/)、[Checkbox](https://geogebra.github.io/docs/manual/en/commands/Checkbox/)、[Action Objects](https://geogebra.github.io/docs/manual/en/Action_Objects/)。
