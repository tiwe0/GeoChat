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

关键规则：`cos(theta)` 与 `sin(theta)` 的符号来自单位圆点的 x、y 坐标，普通 `Segment` 的长度始终非负，不能用线段长度表示第二、三、四象限的负值。需要保留方向时使用从圆心到投影脚、从投影脚到终边点的有向量，并同时显示坐标值。

## 原生输入小例子

在空白构图中逐行输入；名称冲突时改名，不覆盖用户对象。

```ggb
angleDegUC = 45
CenterUC = (0, 0)
XRefUC = (1, 0)
circleUC = Circle(CenterUC, 1)
PointUC = (cos(angleDegUC°), sin(angleDegUC°))
FootUC = (x(PointUC), 0)
cosSegmentUC = Segment(CenterUC, FootUC)
sinSegmentUC = Segment(FootUC, PointUC)
CosVectorUC = Vector(CenterUC, FootUC)
SinVectorUC = Vector(FootUC, PointUC)
cosValueUC = x(PointUC)
sinValueUC = y(PointUC)
angleArcUC = Angle(XRefUC, CenterUC, PointUC)
Point120UC = (cos(120°), sin(120°))
Point225UC = (cos(225°), sin(225°))
cos120UC = x(Point120UC)
sin120UC = y(Point120UC)
cos225UC = x(Point225UC)
sin225UC = y(Point225UC)
```

预期：初始 `PointUC=(sqrt(2)/2,sqrt(2)/2)`，`cosValueUC=sinValueUC=sqrt(2)/2`，`angleArcUC=45°`。跨象限正常验证：`Point120UC=(-1/2,sqrt(3)/2)`，`cos120UC=-1/2`、`sin120UC=sqrt(3)/2`；`Point225UC=(-sqrt(2)/2,-sqrt(2)/2)`，两个坐标值都为负。`cosSegmentUC`、`sinSegmentUC` 的长度仍为对应坐标的绝对值，符号应从坐标或有向量方向读取。边界验证 90° 时余弦投影退化为零长度；退化验证 0° 时角弧和正弦投影不可作为通用示意图，静态默认仍用 45°。负角或超过 360° 时先说明与标准位置角的同终边关系。

官方参考：[Angle](https://geogebra.github.io/docs/manual/en/commands/Angle/)、[Circle](https://geogebra.github.io/docs/manual/en/commands/Circle/)、[Segment](https://geogebra.github.io/docs/manual/en/commands/Segment/)、[Vector](https://geogebra.github.io/docs/manual/en/commands/Vector/)、[预定义函数与运算符](https://geogebra.github.io/docs/manual/en/Predefined_Functions_and_Operators/)。
