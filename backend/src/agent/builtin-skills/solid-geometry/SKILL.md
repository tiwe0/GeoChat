---
name: solid-geometry
description: 高中立体几何题的空间关系、截面、投影、体积和角度可视化技能。
category: high-school-solid-geometry
maturity: default
tags: [立体几何, 空间几何, 多面体, 展开图, 折叠, 铰链, 截面, 投影, 体积, 二面角]
tools: [getCanvasContext, searchGeoGebraCommands, executeGeoGebraCommands, configureGeoGebraAnimation, controlGeoGebraAnimation, inspectGeoGebraObjects, showSolutionSteps, showTeachingHint, showAnimationGuide, showSelectedElements, setPerspective]
---

# 立体几何

用于空间点线面位置关系、线面/二面角、距离、投影、截面、体积及多面体展开折叠。纯平面几何不必强制切换 3D。需要解释空间量时，必须给出可观察的投影点、垂线、截线或辅助三角形，不只给代数结果。

3D 图必须按教材图标准组织：先画可读骨架，再画半透明实体，最后突出关键截面/投影/辅助三角形；不要只给一个抽象多面体。棱线要可见，底面、顶面、截面和关键点要能一眼区分。
推荐语义配色：蓝色 #0072B2、天蓝色 #56B4E9、蓝绿色 #009E73、橙色 #E69F00、朱红色 #D55E00、紫红色 #CC79A7、黄色 #F0E442。用 SetColor(obj, r, g, b) 设置，避免渐变色。

工作顺序：

1. 判断是否适合 3D 视图；涉及空间点线面、棱锥、棱柱、球、截面时优先切换 3D。
2. 把空间关系拆成点、线、平面、垂直、平行、投影和截面。
3. 对二面角、线面角、点面距离，构造辅助垂线、投影点和测量对象。
4. 命令检索必须确认 GeoGebra 5 可用，避免使用 GeoGebra 6 专属命令。

## 数学与能力规则

- 线面角是直线与其在平面上正射影的夹角；二面角必须在棱上取同一点，在两面内分别作垂直于棱的直线。
- 点到平面距离由垂足与垂线段表示；平行、垂直、共面不能仅凭视觉判定。
- 多面体体积先明确底面积和垂直高；分割前后要检查总体积守恒。
- 执行前用 `getCanvasContext`/`inspectGeoGebraObjects` 选择未占用前缀；下例的 `sg` 前缀若已存在必须整组替换，不覆盖用户对象。

## 原生小例：四面体骨架与高

逐行执行：

```ggb
sgA = Point((0, 0, 0))
sgB = Point((4, 0, 0))
sgC = Point((1, 3, 0))
sgD = Point((1, 1, 4))
sgBase = Polygon(sgA, sgB, sgC)
sgBody = Pyramid(sgBase, sgD)
sgPlane = Plane(sgA, sgB, sgC)
sgFoot = Intersect(PerpendicularLine(sgD, sgPlane), sgPlane)
sgHeight = Segment(sgD, sgFoot)
SetColor(sgBody, 86, 180, 233)
SetFilling(sgBody, 0.18)
SetColor(sgHeight, 213, 94, 0)
SetLineThickness(sgHeight, 5)
```

预期：`sgPlane` 是 `z=0` 底面，`sgFoot=(1,1,0)`，`Length(sgHeight)=4`；四面体为半透明而高线高亮。若 `PerpendicularLine(点,平面)` 在当前内核不可用，保留骨架，直接构造 `sgFoot=Point((1,1,0))` 和高线，并说明这是已知坐标的降级表达。

## 检查

- 正常：棱长、面积、高和题设一致，关键对象在当前视角不遮挡。
- 退化：底面三点共线、高为 0、重合点或零面积时停止构面/求角，先报告退化条件。
- 边界：近共面或极短棱先用距离/面积检查容差，不将浮点噪声解释为新几何关系。
- 能力：若无 3D/WebGL、对象未定义或命令返回标签不明，不连锁样式化；保留坐标、骨架与辅助三角形，明确说明未验证真实 3D 显示。

## 多面体展开与折叠模型

这类任务先建拓扑和刚体依赖，再选择坐标；不能从“看起来像折起来了”的坐标反推几何关系。

1. 用面邻接图描述展开图：每个面是节点，共享边是铰链；明确根面、父子面和折叠顺序。坐标只负责实现该图，不得替代邻接关系。
2. 每个面先在自己的局部坐标中保持刚性，再通过父面当前状态中的共享边派生到全局位置。子面不能直接引用原始展开图里已经移动过的铰链坐标。
3. 位于旋转轴上的点在旋转后必须保持不变；真正离轴的顶点才参与旋转。移动铰链必须由已折叠父面的两个端点导出。
4. 开始态、中间态和闭合态都验证：顶点不意外重合、每个面面积非零、面内边长与角度保持、共享边两侧端点一致、父子折叠链连续。
5. 闭合目标还要验证拓扑闭合：预期重合的顶点和边在容差内重合，非相邻面不发生错误穿插，最终面数、边数和顶点对应关系符合目标多面体。
6. 同一不变量连续失败两次时，不继续试角度正负号或补静态点；回滚到原始展开态，只重建违反不变量的依赖子图，并保留已经验证正确的根面和父级链。

展示层与正确性分离：骨架、半透明面、配色和标签用于讲解，但不能作为面刚性、铰链连续或闭合成立的证据。

## 官方依据

- [Pyramid 命令](https://geogebra.github.io/docs/manual/en/commands/Pyramid/)
- [Plane 命令](https://geogebra.github.io/docs/manual/en/commands/Plane/)
- [Intersect 命令](https://geogebra.github.io/docs/manual/en/commands/Intersect/)
