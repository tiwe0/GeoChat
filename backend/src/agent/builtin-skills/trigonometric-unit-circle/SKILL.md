---
name: trigonometric-unit-circle
description: 单位圆、任意角、三角函数值、诱导公式和角度关系技能。
category: high-school-functions
parent: trigonometric-function
level: 2
maturity: default
tags: [二级技能, 单位圆, 任意角, 正弦, 余弦, 诱导公式]
tools: [searchGeoGebraCommands, executeGeoGebraCommands, showAnimationGuide, showSolutionSteps, showChoiceAnalysis]
---

# 单位圆三角

适用于任意角、弧度制、三角函数值、象限符号、诱导公式和简单恒等关系。优先用单位圆解释。

工作顺序：

1. 确定角的终边、象限和参考角。
2. 用单位圆上的点坐标解释 sin、cos、tan；cos 投影画在 x 轴上，sin 投影画成从 Pθ 到 x 轴的短线段，不要用无限延伸直线。
3. 诱导公式要说明对称、旋转或周期来源。
4. 角度标注必须从 x 正半轴逆时针到终边：使用 Angle(XaxisRef, O, Pθ)，不要使用 Angle(Pθ, O, XaxisRef) 或把顶点写成 XaxisRef。
5. 对动态图，使用动点展示角变化和投影变化。
6. GeoGebra 数值滑块默认不是角度对象；若 θ 的值是 30、45、60 这类角度数值，坐标必须写 `Pθ = (cos(θ°), sin(θ°))`，或让高级绘图命令处理角度。不要写成 `cos(θ)` 导致 45 被解释为 45 弧度。
7. 如果题目没有给具体角度，静态教材示意图默认用 `θ = 45°`，不要用 `θ = 0°`，否则投影线和角弧会退化。
推荐语义配色：蓝色 #0072B2、天蓝色 #56B4E9、蓝绿色 #009E73、橙色 #E69F00、朱红色 #D55E00、紫红色 #CC79A7、黄色 #F0E442。用 SetColor(obj, r, g, b) 设置，避免渐变色。
