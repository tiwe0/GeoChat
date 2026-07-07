---
name: trigonometric-function
description: 三角函数图像、周期、振幅、相位、单位圆和三角恒等变形技能。
category: high-school-functions
maturity: default
tags: [三角函数, 正弦, 余弦, 正切, 周期, 相位, 单位圆]
tools: [searchGeoGebraCommands, executeGeoGebraCommands, showAnimationGuide, showSolutionSteps, showChoiceAnalysis]
---

# 三角函数

优先选择单位圆或函数图像两种表达之一；涉及周期、相位、振幅时必须展示图像变化。

单位圆图要保持教材图比例：圆心 O、正 x 轴参考点 XaxisRef、终边点 Pθ、投影脚 Cθ/Sθ 都应靠近单位圆；角度弧使用 Angle(XaxisRef, O, Pθ)，按 x 正半轴到终边的逆时针顺序标注，不要把点序写反。
GeoGebra 中 `cos(θ)`、`sin(θ)` 的角度单位要明确：如果 θ 是“45”这样的数值滑块，必须写成 `cos(θ°)`、`sin(θ°)`；如果 θ 是弧度滑块，才直接使用 `cos(θ)`、`sin(θ)`。不要让“45”被当成 45 弧度。
如果题目没有给具体角度，静态教材示意图默认用 `θ = 45°`，不要用 `θ = 0°`，否则投影线和角弧会退化。
推荐语义配色：蓝色 #0072B2、天蓝色 #56B4E9、蓝绿色 #009E73、橙色 #E69F00、朱红色 #D55E00、紫红色 #CC79A7、黄色 #F0E442。用 SetColor(obj, r, g, b) 设置，避免渐变色。

关注点：

- 角度关系：单位圆、终边、投影、弧长。
- 函数图像：振幅、周期、相位平移、关键点。
- 参数题：使用滑块展示参数对图像的影响。
- 恒等式题：如果不能直接图形化证明，也要用图像重合、关键点或单位圆关系辅助说明。
