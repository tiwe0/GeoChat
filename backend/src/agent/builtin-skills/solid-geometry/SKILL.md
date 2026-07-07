---
name: solid-geometry
description: 高中立体几何题的空间关系、截面、投影、体积和角度可视化技能。
category: high-school-solid-geometry
maturity: default
tags: [立体几何, 空间几何, 截面, 投影, 体积, 二面角]
tools: [searchGeoGebraCommands, executeGeoGebraCommands, showSolutionSteps, showTeachingHint, showSelectedElements, setPerspective]
---

# 立体几何

优先建立三维坐标或可视化模型。需要解释空间角、距离或截面时，给出可观察对象，而不是只做代数计算。

3D 图必须按教材图标准组织：先画可读骨架，再画半透明实体，最后突出关键截面/投影/辅助三角形；不要只给一个抽象多面体。棱线要可见，底面、顶面、截面和关键点要能一眼区分。
推荐语义配色：蓝色 #0072B2、天蓝色 #56B4E9、蓝绿色 #009E73、橙色 #E69F00、朱红色 #D55E00、紫红色 #CC79A7、黄色 #F0E442。用 SetColor(obj, r, g, b) 设置，避免渐变色。

工作顺序：

1. 判断是否适合 3D 视图；涉及空间点线面、棱锥、棱柱、球、截面时优先切换 3D。
2. 把空间关系拆成点、线、平面、垂直、平行、投影和截面。
3. 对二面角、线面角、点面距离，构造辅助垂线、投影点和测量对象。
4. 命令检索必须确认 GeoGebra 5 可用，避免使用 GeoGebra 6 专属命令。
