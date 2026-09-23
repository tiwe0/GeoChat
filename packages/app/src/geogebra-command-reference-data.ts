// Generated from the command localization bundles shipped with GeoGebra 5.2.871.0.
// These bundles are the runtime authority for canonical command names and exact parameter signatures.
// Run `bun run geogebra:commands:generate` after updating the vendored GeoGebra runtime.

import type { GeoGebraCommandReferenceEntry } from "./geogebra-command-reference";

export const GENERATED_GEOGEBRA_COMMAND_REFERENCE_METADATA = {
  "runtimeVersion": "5.2.871.0",
  "commandCount": 508,
  "sources": {
    "english": "vendor/geogebra/HTML5/5.0/web3d/js/properties_keys_en.js",
    "chinese": "vendor/geogebra/HTML5/5.0/web3d/js/properties_keys_zh-CN.js",
    "runtimeManifest": "vendor/geogebra/HTML5/5.0/web3d/sworker-locked.js",
    "taxonomy": {
      "repository": "https://github.com/geogebra/manual.git",
      "commit": "16454c25f339d10bcf99cfcbc5587b4ad19b24ba",
      "categoryIndex": "en/modules/ROOT/nav.adoc",
      "categoryPages": "en/modules/ROOT/pages/commands/*_Commands.adoc"
    }
  },
  "sha256": {
    "english": "ce1e54f0deac70929f21ade19e5284fe9a6458a02abe95c84a460680d6fca2b1",
    "chinese": "546e0fa03266fc5e9d86a5f768bca79051a5c281ea2ee60ea7537c3ca90b55a9",
    "runtimeManifest": "0425ba4c34c76ff0281c24963b28c6b4c7dea439d5dbf7b6d680e34707515146"
  }
} as const;

export const GENERATED_GEOGEBRA_COMMAND_TAGS = [
  "capability:alignment",
  "capability:animation",
  "capability:audio",
  "capability:cas-only",
  "capability:cas-supported",
  "capability:color",
  "capability:construction-control",
  "capability:coordinates",
  "capability:create",
  "capability:export",
  "capability:fill",
  "capability:interaction",
  "capability:label",
  "capability:label-content",
  "capability:label-mode",
  "capability:label-visibility",
  "capability:layer",
  "capability:line-style",
  "capability:measure",
  "capability:parse",
  "capability:point-style",
  "capability:position",
  "capability:query",
  "capability:randomization",
  "capability:record",
  "capability:relation",
  "capability:script",
  "capability:script-execution",
  "capability:selection",
  "capability:style",
  "capability:text-position",
  "capability:transform",
  "capability:view",
  "capability:visibility",
  "category:3d",
  "category:algebra",
  "category:chart",
  "category:conic",
  "category:discrete-math",
  "category:financial",
  "category:functions-and-calculus",
  "category:geogebra",
  "category:geometry",
  "category:list",
  "category:logic",
  "category:optimization",
  "category:probability",
  "category:scripting",
  "category:spreadsheet",
  "category:statistics",
  "category:text",
  "category:transformation",
  "category:vector-and-matrix",
  "risk:bulk-mutation",
  "risk:destructive",
  "risk:export",
  "risk:external-output",
  "risk:script-execution"
] as const;

export const GENERATED_GEOGEBRA_COMMAND_REFERENCE = [
  {
    "command": "AffineRatio",
    "localizedName": "仿射比λ",
    "syntax": "AffineRatio( <点>, <点>, <点> )",
    "syntaxEn": "AffineRatio( <Point>, <Point>, <Point> )",
    "description": "返回三个共线点 A、B 和 C 的仿射比 λ，其中 C = A + λ * AB。",
    "searchTextEn": "AffineRatio 仿射比λ AffineRatio( <Point>, <Point> )",
    "examples": [
      "AffineRatio((-1, 1), (1, 1), (4, 1)) 收益率 2.5"
    ],
    "tags": [
      "category:geometry",
      "capability:measure"
    ]
  },
  {
    "command": "Angle",
    "localizedName": "角度",
    "syntax": "Angle( <对象> ); Angle( <向量>, <向量> ); Angle( <直线>, <直线> ); Angle( <点>, <顶点>, <点> ); Angle( <点>, <顶点>, <度|弧度> ); Angle( <直线>, <平面> ); Angle( <平面>, <平面> ); Angle( <点>, <点>, <点>, <方向> )",
    "syntaxEn": "Angle( <Object> ); Angle( <Vector>, <Vector> ); Angle( <Line>, <Line> ); Angle( <Point>, <Apex>, <Point> ); Angle( <Point>, <Apex>, <Angle> ); Angle( <Line>, <Plane> ); Angle( <Plane>, <Plane> ); Angle( <Point>, <Point>, <Point>, <Direction> )",
    "description": "基于不同输入返回角度：圆锥曲线、向量、点、数字、多边形、直线、平面及其组合，结果以度或弧度表示，具体取决于默认角度单位。",
    "searchTextEn": "Angle 角度 Angle( <Object> ); <Vector>, <Vector> <Line>, <Line> <Point>, <Apex>, <Point> <Angle> <Plane> <Plane>, <Direction> )",
    "examples": [
      "返回圆锥曲线长轴的扭转角度",
      "返回 x 轴和向量之间的角度",
      "返回 x 轴和点之间的角度",
      "将数字转换为角度",
      "创建多边形的所有角度",
      "返回两个向量之间的角度",
      "返回两条线之间的角度",
      "返回直线和平面之间的角度",
      "返回两个平面之间的角度",
      "返回由三点定义的角度",
      "从有顶点的点绘制指定大小的角",
      "返回由点和方向定义的角度"
    ],
    "tags": [
      "category:3d",
      "category:geometry",
      "capability:measure"
    ]
  },
  {
    "command": "AngleBisector",
    "localizedName": "角平分线",
    "syntax": "AngleBisector( <直线>, <直线> ); AngleBisector( <点>, <点>, <点> )",
    "syntaxEn": "AngleBisector( <Line>, <Line> ); AngleBisector( <Point>, <Point>, <Point> )",
    "description": "角平分线",
    "searchTextEn": "AngleBisector AngularBisector 角平分线 AngleBisector( <Line>, <Line> ); <Point>, <Point> )",
    "examples": [],
    "tags": [
      "category:geometry",
      "capability:create"
    ]
  },
  {
    "command": "ANOVA",
    "localizedName": "方差分析",
    "syntax": "ANOVA( <列表>, <列表>, ... )",
    "syntaxEn": "ANOVA( <List>, <List>, ... )",
    "description": "对给定的数字列表执行单向 ANOVA 测试。结果以列表形式返回为{P值，F检验统计量}。",
    "searchTextEn": "ANOVA 方差分析 ANOVA( <List>, ... )",
    "examples": [],
    "tags": [
      "category:statistics"
    ]
  },
  {
    "command": "Append",
    "localizedName": "追加",
    "syntax": "Append( <列表>, <对象> ); Append( <对象>, <列表> )",
    "syntaxEn": "Append( <List>, <Object> ); Append( <Object>, <List> )",
    "description": "将对象附加到列表并在新列表中生成结果，或者将列表附加到对象并在新列表中生成结果。",
    "searchTextEn": "Append 追加 Append( <List>, <Object> ); <Object>, <List> )",
    "examples": [
      "将对象追加到列表中",
      "将列表附加到对象"
    ],
    "tags": [
      "category:list"
    ]
  },
  {
    "command": "ApplyMatrix",
    "localizedName": "应用矩阵",
    "syntax": "ApplyMatrix( <矩阵>, <对象> )",
    "syntaxEn": "ApplyMatrix( <Matrix>, <Object> )",
    "description": "变换对象 O，使 O 的点 P 映射到： • 点 M*P，如果 P 是 2D 点且 M 是 2 x 2 矩阵 • 点 Project(M*(x(P), y(P), 1))，如果 P 是 2D 点且 M 是 3 x 3 矩阵：project 是投影，将点 (x, y, z) 映射到 (x/z, y/z)。 • 点 M*P，如果 P 是 3D 点且 M 是 3 x 3 矩阵 • 点 N*P，如果 P 是 3D 点且 M 是 2 x 2 矩阵：矩阵 N 是 M 的补全或阶 3：给定 M = stem:[\\begin{pmatrix}a&b\\\\ c&d \\end{pmatrix}] 则 N = stem:[\\begin{pmatrix}a&b&0\\\\ c&d&0\\\\0&0&1 \\end{pmatrix}]",
    "searchTextEn": "ApplyMatrix 应用矩阵 ApplyMatrix( <Matrix>, <Object> )",
    "examples": [
      "设 M={{cos(π/2),-sin(π/2)}, {sin(π/2), cos(π/2)}} 为变换矩阵，u = (2,1) 为给定向量（对象）。 ApplyMatrix(M,u) 产生向量 u'=(-1,2)，即向量 u 在数学上正旋转 90° 的结果。",
      "设 M={{1,1,0},{0,1,1},{1,0,1}} 为矩阵，u=(2,1) 为给定向量。 ApplyMatrix(M,u) 产生向量 u'=(1,0.67)。实际上，茎：[\\begin{pmatrix}1&1&0\\\\ 0&1&1\\\\1&0&1 \\end{pmatrix}] 茎：[\\begin{pmatrix}2\\\\ 1\\\\1 \\end{pmatrix}] = 茎：[\\begin{pmatrix}3\\\\ 2\\\\3 \\end{pmatrix}]，并且 (3/3 = 1, 2/3 ≈ 0.67) （四舍五入到小数点后 2 位）"
    ],
    "tags": [
      "category:vector-and-matrix",
      "capability:transform"
    ]
  },
  {
    "command": "Arc",
    "localizedName": "弧线",
    "syntax": "Arc( <圆>, <点>, <点> ); Arc( <椭圆>, <点>, <点> ); Arc( <圆>, <参数值>, <参数值> ); Arc( <椭圆>, <参数值>, <参数值> )",
    "syntaxEn": "Arc( <Circle>, <Point>, <Point> ); Arc( <Ellipse>, <Point>, <Point> ); Arc( <Circle>, <Parameter Value>, <Parameter Value> ); Arc( <Ellipse>, <Parameter Value>, <Parameter Value> )",
    "description": "返回给定圆或椭圆的有向弧（逆时针），其端点为 M 和 N，或者返回其端点由指定参数值标识的圆/椭圆弧。",
    "searchTextEn": "Arc 弧线 Arc( <Circle>, <Point>, <Point> ); <Ellipse>, <Parameter Value>, Value> )",
    "examples": [
      "具有端点 M 和 N 的圆弧",
      "端点 M 和 N 的椭圆弧",
      "由参数值定义的圆弧",
      "由参数值定义的椭圆弧"
    ],
    "tags": [
      "category:geometry"
    ]
  },
  {
    "command": "Area",
    "localizedName": "面积",
    "syntax": "Area( <圆锥曲线> ); Area( <多边形> ); Area( <点>, ..., <点> )",
    "syntaxEn": "Area( <Conic> ); Area( <Polygon> ); Area( <Point>, ..., <Point> )",
    "description": "计算几何对象的面积，包括由点定义的多边形、圆锥曲线（圆形或椭圆形）和多边形。",
    "searchTextEn": "Area 面积 Area( <Conic> ); <Polygon> <Point>, ..., <Point> )",
    "examples": [
      "计算由给定点定义的多边形的面积",
      "计算圆锥曲线（圆或椭圆）的面积",
      "计算多边形的面积"
    ],
    "tags": [
      "category:geometry",
      "capability:measure"
    ]
  },
  {
    "command": "AreCollinear",
    "localizedName": "是否共线",
    "syntax": "AreCollinear( <点>, <点>, <点> )",
    "syntaxEn": "AreCollinear( <Point>, <Point>, <Point> )",
    "description": "确定点是否共线。通常该命令以数字方式计算结果。可以使用 Prove 命令更改此行为。",
    "searchTextEn": "AreCollinear 是否共线 AreCollinear( <Point>, <Point> )",
    "examples": [
      "AreCollinear((1, 2), (3, 4), (5, 6)) 产生 true，因为所有三个点都位于同一条线上。"
    ],
    "tags": [
      "category:geometry",
      "capability:relation"
    ]
  },
  {
    "command": "AreConcurrent",
    "localizedName": "是否共点",
    "syntax": "AreConcurrent( <直线>, <直线>, <直线> )",
    "syntaxEn": "AreConcurrent( <Line>, <Line>, <Line> )",
    "description": "决定线路是否并发。如果这些线是平行的，则它们被认为在无穷远处有一个公共点，因此在这种情况下该命令返回 true。通常该命令以数字方式计算结果。可以使用 Prove 命令更改此行为。",
    "searchTextEn": "AreConcurrent 是否共点 AreConcurrent( <Line>, <Line> )",
    "examples": [
      "检查三条线是否并发"
    ],
    "tags": [
      "category:geometry",
      "capability:relation"
    ]
  },
  {
    "command": "AreConcyclic",
    "localizedName": "是否共圆",
    "syntax": "AreConcyclic( <点>, <点>, <点>, <点> )",
    "syntaxEn": "AreConcyclic( <Point>, <Point>, <Point>, <Point> )",
    "description": "决定点是否同循环。",
    "searchTextEn": "AreConcyclic 是否共圆 AreConcyclic( <Point>, <Point> )",
    "examples": [
      "AreConcyclic((1, 2), (3, 4), (1, 4), (3, 2)) 产生 true，因为这些点位于同一个圆上。"
    ],
    "tags": [
      "category:geometry",
      "capability:relation"
    ]
  },
  {
    "command": "AreCongruent",
    "localizedName": "是否全等",
    "syntax": "AreCongruent( <对象>, <对象> )",
    "syntaxEn": "AreCongruent( <Object>, <Object> )",
    "description": "决定对象是否一致。通常该命令以数字方式计算结果。可以使用 Prove 命令更改此行为。",
    "searchTextEn": "AreCongruent 是否全等 AreCongruent( <Object>, <Object> )",
    "examples": [
      "AreCongruent(Circle((0, 0),1),x2+y2=1) 和 AreCongruent(Circle((1, 1),1),x2+y2=1) 产生 true，因为两个圆具有相同的半径。"
    ],
    "tags": [
      "category:geometry",
      "capability:relation"
    ]
  },
  {
    "command": "AreEqual",
    "localizedName": "是否相等",
    "syntax": "AreEqual( <对象>, <对象> )",
    "syntaxEn": "AreEqual( <Object>, <Object> )",
    "description": "决定对象是否相等。通常该命令以数字方式计算结果。可以使用 Prove 命令更改此行为。",
    "searchTextEn": "AreEqual 是否相等 AreEqual( <Object>, <Object> )",
    "examples": [
      "AreEqual(Circle((0, 0),1),x2+y2=1) 产生 true，因为两个圆具有相同的圆心和半径。",
      "AreEqual(Segment((1, 2), (3, 4)), Segment((3, 4), (1, 6))) 与 Segment((1, 2), (3, 4)) == Segment((3, 4), (1, 6)) 不同，后者仅比较长度"
    ],
    "tags": [
      "category:algebra",
      "category:geometry",
      "capability:relation"
    ]
  },
  {
    "command": "AreParallel",
    "localizedName": "是否平行",
    "syntax": "AreParallel( <直线>, <直线> )",
    "syntaxEn": "AreParallel( <Line>, <Line> )",
    "description": "确定直线是否平行。通常该命令以数字方式计算结果。可以使用 Prove 命令更改此行为。",
    "searchTextEn": "AreParallel 是否平行 AreParallel( <Line>, <Line> )",
    "examples": [
      "AreParallel(Line[(1, 2), (3, 4))、Line((5, 6),(7,8))) 产生 true，因为给定的线是平行的。"
    ],
    "tags": [
      "category:geometry",
      "capability:relation"
    ]
  },
  {
    "command": "ArePerpendicular",
    "localizedName": "是否垂直",
    "syntax": "ArePerpendicular( <直线>, <直线> )",
    "syntaxEn": "ArePerpendicular( <Line>, <Line> )",
    "description": "确定线条是否垂直。通常该命令以数字方式计算结果。可以使用 Prove 命令更改此行为。",
    "searchTextEn": "ArePerpendicular 是否垂直 ArePerpendicular( <Line>, <Line> )",
    "examples": [
      "ArePerpendicular(Line((-1, 0), (0, -1)), Line((0, 0),(2,2))) 产生 true，因为给定的线是垂直的。"
    ],
    "tags": [
      "category:geometry",
      "capability:relation"
    ]
  },
  {
    "command": "Assume",
    "localizedName": "假设",
    "syntax": "Assume( <条件>, <代数式> )",
    "syntaxEn": "Assume( <Condition>, <Expression> )",
    "description": "根据条件评估表达式",
    "searchTextEn": "Assume 假设 Assume( <Condition>, <Expression> )",
    "examples": [
      "Assume(a > 0, Integral(exp(-a x), 0, infinity)) 产量为 1/a。",
      "Assume(x>0 && n>0, Solve(log(n2*(x/n)lg(x))=log(x2), x)) 产生 {x = 100, x = n}",
      "Assume(x<2,Simplify(sqrt(x-2sqrt(x-1)))) 得出 -sqrt(x - 1) + 1",
      "Assume(x>2,Simplify(sqrt(x-2sqrt(x-1)))) 得出 sqrt(x - 1) - 1",
      "Assume(k>0, Extremum(k*3*x2/4-2*x/2)) 产生词干:[ \\left\\{ \\left(\\frac{2}{3 k}, -\\frac{1}{3 k} \\right)\\right\\} ]",
      "Assume(k>0, InflectionPoint(0.25 k x3 - 0.5x2 + k)) 产生词干:[ \\left\\{ \\left(\\frac{2}{3 k}, \\frac{27k{3} - 4}{27 k{2}} \\right) \\right\\} ]"
    ],
    "tags": [
      "category:algebra",
      "capability:cas-supported"
    ]
  },
  {
    "command": "Asymptote",
    "localizedName": "渐近线",
    "syntax": "Asymptote( <对象> )",
    "syntaxEn": "Asymptote( <Object> )",
    "description": "产生二次曲线、函数或隐式曲线的渐近线。对于函数，GeoGebra 尝试查找渐近线并将其返回到列表中，但可能无法找到全部（例如，像 ln(x) 这样的非有理函数的垂直渐近线）。此语法在图形和几何应用程序中不可用。",
    "searchTextEn": "Asymptote 渐近线 Asymptote( <Object> )",
    "examples": [
      "产生圆锥曲线的两条渐近线。",
      "返回列表中有理函数的渐近线。",
      "生成包含隐式曲线的所有渐近线的列表。"
    ],
    "tags": [
      "category:functions-and-calculus"
    ]
  },
  {
    "command": "AttachCopyToView",
    "localizedName": "附加副本",
    "syntax": "AttachCopyToView( <对象>, <视图值 0-创建副本|1-创建从属副本|2-创建从属副本> ); AttachCopyToView( <对象>, <视图值 0-创建副本|1-创建从属副本|2-创建从属副本>, <点1>, <点2>, <屏幕点1>, <屏幕点2> )",
    "syntaxEn": "AttachCopyToView( <Object>, <View 0|1|2> ); AttachCopyToView( <Object>, <View 0|1|2>, <Point 1>, <Point 2>, <Screen Point 1>, <Screen Point 2> )",
    "description": "创建附加到特定视图的对象的副本，并使用可选的仿射变换将点映射到屏幕坐标。",
    "searchTextEn": "AttachCopyToView 附加副本 AttachCopyToView( <Object>, <View 0|1|2> ); 0|1|2>, <Point 1>, 2>, <Screen Point 2> )",
    "examples": [
      "在图形视图 1 中创建具有恒定大小的从属副本",
      "使用仿射变换在左上角创建一个 100px x 100px 的正方形"
    ],
    "tags": [
      "category:scripting",
      "capability:view",
      "capability:script"
    ]
  },
  {
    "command": "Axes",
    "localizedName": "轴线",
    "syntax": "Axes( <圆锥曲线> ); Axes( <二次曲面> )",
    "syntaxEn": "Axes( <Conic> ); Axes( <Quadric> )",
    "description": "返回二次曲线的长轴和短轴方程，或创建给定二次曲线的 3 个轴。",
    "searchTextEn": "Axes 轴线 Axes( <Conic> ); <Quadric> )",
    "examples": [
      "返回圆锥曲线的长轴和短轴的方程。",
      "创建给定二次曲面的 3 个轴。",
      "Axes(x2 + y2 + z2= 3) 返回三行 a: X = (0, 0, 0) + λ (1, 0, 0)、b: X = (0, 0, 0) + λ (0, 1, 0) 和 c: X = (0, 0, 0) + λ (0, 0, 1)"
    ],
    "tags": [
      "category:3d",
      "category:conic"
    ]
  },
  {
    "command": "AxisStepX",
    "localizedName": "x轴步长",
    "syntax": "AxisStepX()",
    "syntaxEn": "AxisStepX()",
    "description": "返回 _x_ 轴的当前步长。",
    "searchTextEn": "AxisStepX x轴步长 AxisStepX()",
    "examples": [
      "另请参见 AxisStepY 命令。",
      "与“角”和“序列”命令一起，AxisStepX 和 AxisStepY 命令允许您创建自定义轴（另请参阅自定义坐标轴和网格部分）。"
    ],
    "tags": [
      "category:geogebra",
      "capability:query"
    ]
  },
  {
    "command": "AxisStepY",
    "localizedName": "y轴步长",
    "syntax": "AxisStepY()",
    "syntaxEn": "AxisStepY()",
    "description": "返回 y 轴的当前步长。",
    "searchTextEn": "AxisStepY y轴步长 AxisStepY()",
    "examples": [],
    "tags": [
      "category:geogebra",
      "capability:query"
    ]
  },
  {
    "command": "BarChart",
    "localizedName": "条形图",
    "syntax": "BarChart( <数据列表>, <频数列表> ); BarChart( <原始数据列表>, <条形宽度>, <竖直缩放因子(可选)> ); BarChart( <数据列表>, <频数列表>, <条形宽度> ); BarChart( <起始值>, <终止值>, <高度列表> ); BarChart( <起始值>, <终止值>, <代数式>, <变量>, <初始数字>, <终止数字> ); BarChart( <起始值>, <终止值>, <代数式>, <变量>, <初始数字>, <终止数字>, <步长> )",
    "syntaxEn": "BarChart( <List of Data>, <List of Frequencies> ); BarChart( <List of Raw Data>, <Width of Bars>, <Vertical Scale Factor (optional)> ); BarChart( <List of Data>, <List of Frequencies>, <Width of Bars> ); BarChart( <Start Value>, <End Value>, <List of Heights> ); BarChart( <Start Value>, <End Value>, <Expression>, <Variable>, <From Number>, <To Number> ); BarChart( <Start Value>, <End Value>, <Expression>, <Variable>, <From Number>, <To Number>, <Step Width> )",
    "description": "使用各种参数组合创建条形图以指定数据、频率、间隔和条形属性。",
    "searchTextEn": "BarChart 条形图 BarChart( <List of Data>, Frequencies> ); Raw <Width Bars>, <Vertical Scale Factor (optional)> Frequencies>, Bars> <Start Value>, <End Heights> <Expression>, <Variable>, <From Number>, <To Number> <Step Width> )",
    "examples": [
      "使用具有相应频率的数据列表创建条形图",
      "使用给定的原始数据创建条形图；条形具有给定的宽度，条形的高度取决于垂直比例因子",
      "使用数据列表和相应的频率创建条形图。条形的宽度已给出",
      "创建给定间隔内的条形图：条形图的数量由列表的长度决定，列表的元素是条形图的高度",
      "在区间 [Start Value, End Value] 上创建条形图，使用区间 [From number, To number] 中给定变量的表达式计算条形高度",
      "在区间 [起始值，结束值] 上创建条形图，使用给定步长宽度的区间 [从数字，到数字] 中给定变量的表达式计算条形高度"
    ],
    "tags": [
      "category:chart"
    ]
  },
  {
    "command": "Barycenter",
    "localizedName": "重心",
    "syntax": "Barycenter( <点列>, <权重列表> )",
    "syntaxEn": "Barycenter( <List of Points>, <List of Weights> )",
    "description": "使用正确的公式 (https://en.wikipedia.org/wiki/Center_of_mass) 设置列表中点系统的中心，定义为其位置的平均值，并按其值加权。",
    "searchTextEn": "Barycenter 重心 Barycenter( <List of Points>, Weights> )",
    "examples": [
      "Barycenter({(2, 0), (0, 2), (-2, 0), (0, -2)}, {1, 1, 1, 1}) 产生点 A(0, 0)",
      "Barycenter({(2, 0), (0, 2), (-2, 0), (0, -2)}, {2, 1, 1, 1}) 产生点 B(0.4, 0)。该点的_x_坐标由stem:[ \\frac{1}{ 2+1+1+1 }*(2*2+1*0+1*(-2)+1*0)] = stem:[\\frac{1}{ 5 }*2] = 0.4 确定"
    ],
    "tags": [
      "category:geometry"
    ]
  },
  {
    "command": "Bernoulli",
    "localizedName": "伯努利分布",
    "syntax": "Bernoulli( <概率>, <是否累积? true|false> )",
    "syntaxEn": "Bernoulli( <Probability>, <Boolean Cumulative> )",
    "description": "如果 Cumulative = false，则返回伯努利分布的条形图，其中成功概率等于 p。如果 Cumulative = true，则返回累积伯努利分布的条形图。",
    "searchTextEn": "Bernoulli 伯努利分布 Bernoulli( <Probability>, <Boolean Cumulative> )",
    "examples": [],
    "tags": [
      "category:probability"
    ]
  },
  {
    "command": "BetaDist",
    "localizedName": "贝塔分布",
    "syntax": "BetaDist( <形状参数α>, <尺度参数β>, <变量值> ); BetaDist( <形状参数α>, <尺度参数β>, <变量值>, <是否累积? true|false> ); BetaDist( <形状参数α>, <尺度参数β>, x, <是否累积? true|false> )",
    "syntaxEn": "BetaDist( <Alpha>, <Beta>, <Variable Value> ); BetaDist( <Alpha>, <Beta>, <Variable Value>, <Boolean Cumulative> ); BetaDist( <Alpha>, <Beta>, x, <Boolean Cumulative> )",
    "description": "计算变量值 v 处参数为 α、β 的 Beta 分布的累积分布函数值，即概率 P(X≤v)，其中 X 是参数为 α 和 β 的 beta 分布的随机变量。如果 Cumulative 为 true，则计算变量值 v 处具有参数 α 和 β 的 Beta 分布的累积分布函数的值。如果 Cumulative 为 false，则计算 v 处相应 beta 分布的概率密度函数 (pdf) 的值。如果 Cumulative 为 true，则创建具有参数 α 和 β 的 beta 分布的累积分布函数，否则创建相应 Beta 分布的概率密度函数 (pdf)。",
    "searchTextEn": "BetaDist 贝塔分布 BetaDist( <Alpha>, <Beta>, <Variable Value> ); Value>, <Boolean Cumulative> x, )",
    "examples": [],
    "tags": [
      "category:probability"
    ]
  },
  {
    "command": "BinomialCoefficient",
    "localizedName": "二项式系数",
    "syntax": "BinomialCoefficient( <数字 n>, <数字 r> )",
    "syntaxEn": "BinomialCoefficient( <Number n>, <Number r> )",
    "description": "二项式系数",
    "searchTextEn": "BinomialCoefficient Binomial 二项式系数 BinomialCoefficient( <Number n>, r> )",
    "examples": [],
    "tags": [
      "category:algebra"
    ]
  },
  {
    "command": "BinomialDist",
    "localizedName": "二项分布",
    "syntax": "BinomialDist( <试验次数>, <成功概率> ); BinomialDist( <试验次数>, <成功概率>, <是否累积? true|false> ); BinomialDist( <试验次数>, <成功概率>, <数值列表> ); BinomialDist( <试验次数>, <成功概率>, <变量值>, <是否累积? true|false> )",
    "syntaxEn": "BinomialDist( <Number of Trials>, <Probability of Success> ); BinomialDist( <Number of Trials>, <Probability of Success>, <Boolean Cumulative> ); BinomialDist( <Number of Trials>, <Probability of Success>, <List of Values> ); BinomialDist( <Number of Trials>, <Probability of Success>, <Variable Value>, <Boolean Cumulative> )",
    "description": "返回二项式分布的直方图或图形，或者根据试验次数和成功概率计算二项式随机变量的概率，并使用累积分布、变量值或值列表的可选参数。",
    "searchTextEn": "BinomialDist 二项分布 BinomialDist( <Number of Trials>, <Probability Success> ); Success>, <Boolean Cumulative> <List Values> <Variable Value>, )",
    "examples": [
      "计算 10 次试验中恰好有 1 次成功的概率，成功概率为 0.2",
      "计算 3 次试验中最多两次成功的累积概率，成功概率为 0.9",
      "使用值列表计算一定范围内的成功概率",
      "绘制累积概率差异图"
    ],
    "tags": [
      "category:probability",
      "capability:cas-supported"
    ]
  },
  {
    "command": "Bottom",
    "localizedName": "下底",
    "syntax": "Bottom( <二次曲面> )",
    "syntaxEn": "Bottom( <Quadric> )",
    "description": "创建有限二次曲面的底部。",
    "searchTextEn": "Bottom 下底 Bottom( <Quadric> )",
    "examples": [
      "Bottom(cylinder) 产生一个圆。"
    ],
    "tags": [
      "category:3d"
    ]
  },
  {
    "command": "BoxPlot",
    "localizedName": "箱形图",
    "syntax": "BoxPlot( <y轴向偏移量>, <y轴向范围>, <原始数据列表> ); BoxPlot( <y轴向偏移量>, <y轴向范围>, <原始数据列表>, <是否离群值? true|false> ); BoxPlot( <y轴向偏移量>, <y轴向范围>, <数据列表>, <频数列表>, <是否离群值? true|false> ); BoxPlot( <y轴向偏移量>, <y轴向范围>, <起始值>, <Q1>, <中位数>, <Q3>, <终止值> )",
    "syntaxEn": "BoxPlot( <yOffset>, <yScale>, <List of Raw Data> ); BoxPlot( <yOffset>, <yScale>, <List of Raw Data>, <Boolean Outliers> ); BoxPlot( <yOffset>, <yScale>, <List of Data>, <List of Frequencies>, <Boolean Outliers> ); BoxPlot( <yOffset>, <yScale>, <Start Value>, <Q1>, <Median>, <Q3>, <End Value> )",
    "description": "使用给定的原始数据创建箱线图，其在坐标系中的垂直位置由变量 yOffset 控制，其高度受因子 yScale 影响。",
    "searchTextEn": "BoxPlot 箱形图 BoxPlot( <yOffset>, <yScale>, <List of Raw Data> ); Data>, <Boolean Outliers> Frequencies>, <Start Value>, <Q1>, <Median>, <Q3>, <End Value> )",
    "examples": [
      "根据原始数据创建箱线图"
    ],
    "tags": [
      "category:chart"
    ]
  },
  {
    "command": "Button",
    "localizedName": "按钮",
    "syntax": "Button(); Button( <标题> )",
    "syntaxEn": "Button(); Button( <Caption> )",
    "description": "创建一个带有给定标题的新按钮。",
    "searchTextEn": "Button 按钮 Button(); Button( <Caption> )",
    "examples": [
      "Button(\"Ok\") 在图形视图的左上角创建一个按钮，标题为“Ok”。"
    ],
    "tags": [
      "category:scripting",
      "capability:interaction",
      "capability:script"
    ]
  },
  {
    "command": "CASLoaded",
    "localizedName": "CASLoaded",
    "syntax": "CASLoaded()",
    "syntaxEn": "CASLoaded()",
    "description": "返回一个布尔值：如果 CAS 命令已加载，则返回 true，否则返回 false。该值是动态的（加载 CAS 命令时更改为 true）。",
    "searchTextEn": "CASLoaded CASLoaded()",
    "examples": [
      "此命令在 GeoGebra 的 Web 版本中很有用，其中 CAS 命令在应用程序启动后会延迟加载。您可以将此命令与条件可见性一起使用，以在加载 CAS 时隐藏一些构造元素。"
    ],
    "tags": [
      "category:geogebra"
    ]
  },
  {
    "command": "Cauchy",
    "localizedName": "柯西分布",
    "syntax": "Cauchy( <中位数>, <尺度参数λ>, <变量值> ); Cauchy( <中位数>, <尺度参数λ>, <变量值>, <是否累积? true|false> ); Cauchy( <中位数>, <尺度参数λ>, x, <是否累积? true|false> )",
    "syntaxEn": "Cauchy( <Median>, <Scale>, <Variable Value> ); Cauchy( <Median>, <Scale>, <Variable Value>, <Boolean Cumulative> ); Cauchy( <Median>, <Scale>, x, <Boolean Cumulative> )",
    "description": "计算柯西分布给定变量值 v 处的累积密度函数 (cdf) 值，即概率 P(X≤v)，其中 X 是给定参数中值和尺度的柯西分布的随机变量。",
    "searchTextEn": "Cauchy 柯西分布 Cauchy( <Median>, <Scale>, <Variable Value> ); Value>, <Boolean Cumulative> x, )",
    "examples": [
      "Cauchy(1, 2, 3) 在代数视图中产生 0.75，在 CAS 视图中产生茎:[\\frac{3}{4}]。"
    ],
    "tags": [
      "category:probability",
      "capability:cas-supported"
    ]
  },
  {
    "command": "Cell",
    "localizedName": "单元格",
    "syntax": "Cell( <列序>, <行序> )",
    "syntaxEn": "Cell( <Column>, <Row> )",
    "description": "返回给定列和行中的电子表格单元格的副本。",
    "searchTextEn": "Cell 单元格 Cell( <Column>, <Row> )",
    "examples": [
      "Cell(2, 1) 返回 B1 的副本。"
    ],
    "tags": [
      "category:spreadsheet"
    ]
  },
  {
    "command": "CellRange",
    "localizedName": "单元格区域数值列表",
    "syntax": "CellRange( <起始单元格>, <终止单元格> )",
    "syntaxEn": "CellRange( <Start Cell>, <End Cell> )",
    "description": "创建一个包含此单元格区域中的单元格值的列表。",
    "searchTextEn": "CellRange 单元格区域数值列表 CellRange( <Start Cell>, <End Cell> )",
    "examples": [
      "设 A1 = 1、A2 = 4、A3 = 9 为电子表格单元格值。然后 CellRange(A1, A3) 返回列表 {1, 4, 9}。"
    ],
    "tags": [
      "category:spreadsheet"
    ]
  },
  {
    "command": "Center",
    "localizedName": "中心",
    "syntax": "Center( <圆锥曲线> ); Center( <二次曲面> )",
    "syntaxEn": "Center( <Conic> ); Center( <Quadric> )",
    "description": "返回圆、椭圆或双曲线的中心；或创建二次曲面的中心（例如球体、圆锥体等）。注意：此命令在英语变体中有所不同：Center (US)、Centre (UK + Aus)。",
    "searchTextEn": "Center 中心 Center( <Conic> ); <Quadric> )",
    "examples": [
      "二次曲线方程的中心",
      "二次方程的中心"
    ],
    "tags": [
      "category:3d",
      "category:conic"
    ]
  },
  {
    "command": "CenterView",
    "localizedName": "中心定位",
    "syntax": "CenterView( <视图中心坐标(x, y)|视图中心点> )",
    "syntaxEn": "CenterView( <Center Point> )",
    "description": "平移图形视图，使指定点位于中心。",
    "searchTextEn": "CenterView 中心定位 CenterView( <Center Point> )",
    "examples": [
      "CenterView((0, 0)) 将原点移动到图形视图的中心。"
    ],
    "tags": [
      "category:scripting",
      "capability:view",
      "capability:script"
    ]
  },
  {
    "command": "Centroid",
    "localizedName": "形心",
    "syntax": "Centroid( <多边形> )",
    "syntaxEn": "Centroid( <Polygon> )",
    "description": "返回多边形的质心。",
    "searchTextEn": "Centroid 形心 Centroid( <Polygon> )",
    "examples": [
      "设 A = (1, 4)、B = (1, 1)、C = (5, 1) 和 D = (5, 4) 为多边形的顶点。 Polygon(A, B, C, D) 产生 poly1 = 12。"
    ],
    "tags": [
      "category:geometry"
    ]
  },
  {
    "command": "CFactor",
    "localizedName": "复数域因式分解",
    "syntax": "CFactor( <代数式> ); CFactor( <代数式>, <变量> )",
    "syntaxEn": "CFactor( <Expression> ); CFactor( <Expression>, <Variable> )",
    "description": "对给定表达式进行因式分解，允许复杂的因素。可以对指定变量进行因式分解。",
    "searchTextEn": "CFactor 复数域因式分解 CFactor( <Expression> ); <Expression>, <Variable> )",
    "examples": [
      "将 x² + 4 分解为复数",
      "关于变量 a 对 a² + x² 进行因式分解",
      "关于变量 x 对 a² + x² 进行因式分解"
    ],
    "tags": [
      "category:algebra",
      "capability:cas-supported",
      "capability:cas-only"
    ]
  },
  {
    "command": "CharacteristicPolynomial",
    "localizedName": "特征多项式",
    "syntax": "CharacteristicPolynomial( <矩阵> )",
    "syntaxEn": "CharacteristicPolynomial( <Matrix> )",
    "description": "返回给定矩阵的特征多项式 (https://en.wikipedia.org/wiki/Characteristic_polynomial)。",
    "searchTextEn": "CharacteristicPolynomial 特征多项式 CharacteristicPolynomial( <Matrix> )",
    "examples": [
      "CharacteristicPolynomial({{1,2},{3,4}}) 产生茎：[x2-5x-2]。"
    ],
    "tags": [
      "category:vector-and-matrix",
      "capability:cas-supported"
    ]
  },
  {
    "command": "Checkbox",
    "localizedName": "复选框",
    "syntax": "Checkbox(); Checkbox( <标题> ); Checkbox( <列表> ); Checkbox( <标题>, <列表> )",
    "syntaxEn": "Checkbox(); Checkbox( <Caption> ); Checkbox( <List> ); Checkbox( <Caption>, <List> )",
    "description": "创建一个复选框。变体包括创建一个带有标题的复选框、一个在未选中时隐藏列出的对象的复选框，或两者都创建。",
    "searchTextEn": "Checkbox 复选框 Checkbox(); Checkbox( <Caption> ); <List> <Caption>, )",
    "examples": [
      "设 A 和 B 为点。 c = Checkbox({A,B}) 创建复选框 c。当c被选中时，A和B是可见的，否则它们是隐藏的。"
    ],
    "tags": [
      "category:scripting",
      "capability:interaction",
      "capability:script"
    ]
  },
  {
    "command": "ChiSquared",
    "localizedName": "卡方分布",
    "syntax": "ChiSquared( <自由度>, <变量值> ); ChiSquared( <自由度>, <变量值>, <是否累积? true|false> ); ChiSquared( <自由度>, x, <是否累积? true|false> ); ChiSquared( <自由度>, <变量> )",
    "syntaxEn": "ChiSquared( <Degrees of Freedom>, <Variable Value> ); ChiSquared( <Degrees of Freedom>, <Variable Value>, <Boolean Cumulative> ); ChiSquared( <Degrees of Freedom>, x, <Boolean Cumulative> ); ChiSquared( <Degrees of Freedom>, <Variable> )",
    "description": "计算变量值 v 处卡方分布的累积分布函数值，即概率 P(X ≤ v)，其中 X 是具有给定自由度的卡方分布的随机变量。",
    "searchTextEn": "ChiSquared 卡方分布 ChiSquared( <Degrees of Freedom>, <Variable Value> ); Value>, <Boolean Cumulative> x, <Variable> )",
    "examples": [
      "计算变量值 3 处 4 个自由度的累积分布函数值",
      "基于布尔累积参数计算累积分布函数或概率密度函数"
    ],
    "tags": [
      "category:probability",
      "capability:cas-supported"
    ]
  },
  {
    "command": "ChiSquaredTest",
    "localizedName": "卡方检验",
    "syntax": "ChiSquaredTest( <矩阵> ); ChiSquaredTest( <列表>, <列表> ); ChiSquaredTest( <矩阵>, <矩阵> )",
    "syntaxEn": "ChiSquaredTest( <Matrix> ); ChiSquaredTest( <List>, <List> ); ChiSquaredTest( <Matrix>, <Matrix> )",
    "description": "执行卡方检验的独立性或拟合优度，返回结果为{概率值，卡方检验统计量}。",
    "searchTextEn": "ChiSquaredTest 卡方检验 ChiSquaredTest( <Matrix> ); <List>, <List> <Matrix>, )",
    "examples": [
      "执行卡方检验，将给定的观察计数矩阵与由独立性假设确定的预期计数矩阵进行比较。",
      "执行拟合优度检验，将给定的观察计数列表与给定的预期计数列表进行比较。",
      "执行卡方检验，将给定的观察计数矩阵与给定的预期计数矩阵进行比较。",
      "执行拟合优度检验，使用特定数量的自由度将给定的观察计数列表与给定的预期计数列表进行比较。"
    ],
    "tags": [
      "category:probability",
      "category:statistics"
    ]
  },
  {
    "command": "CIFactor",
    "localizedName": "复无理数域因式分解",
    "syntax": "CIFactor( <代数式> ); CIFactor( <代数式>, <变量> )",
    "syntaxEn": "CIFactor( <Expression> ); CIFactor( <Expression>, <Variable> )",
    "description": "复杂无理数的因子，可选地相对于给定变量。",
    "searchTextEn": "CIFactor 复无理数域因式分解 CIFactor( <Expression> ); <Expression>, <Variable> )",
    "examples": [
      "对复杂无理数进行因式分解",
      "将表达式分解为关于变量的复无理数"
    ],
    "tags": [
      "category:algebra",
      "capability:cas-supported"
    ]
  },
  {
    "command": "Circle",
    "localizedName": "圆周",
    "syntax": "Circle( <点>, <半径长度> ); Circle( <点>, <线段> ); Circle( <点>, <点> ); Circle( <点>, <点>, <点> ); Circle( <直线>, <点> ); Circle( <点>, <半径>, <方向> ); Circle( <点>, <点>, <方向> )",
    "syntaxEn": "Circle( <Point>, <Radius Number> ); Circle( <Point>, <Segment> ); Circle( <Point>, <Point> ); Circle( <Point>, <Point>, <Point> ); Circle( <Line>, <Point> ); Circle( <Point>, <Radius>, <Direction> ); Circle( <Point>, <Point>, <Direction> )",
    "description": "圆周",
    "searchTextEn": "Circle 圆周 Circle( <Point>, <Radius Number> ); <Segment> <Point> <Line>, <Radius>, <Direction> )",
    "examples": [],
    "tags": [
      "category:3d",
      "category:conic",
      "category:geometry",
      "capability:create"
    ]
  },
  {
    "command": "CircularArc",
    "localizedName": "圆弧",
    "syntax": "CircularArc( <圆心>, <点>, <点> )",
    "syntaxEn": "CircularArc( <Midpoint>, <Point>, <Point> )",
    "description": "圆弧",
    "searchTextEn": "CircularArc CircleArc 圆弧 CircularArc( <Midpoint>, <Point>, <Point> )",
    "examples": [],
    "tags": [
      "category:3d",
      "category:geometry"
    ]
  },
  {
    "command": "CircularSector",
    "localizedName": "圆扇形",
    "syntax": "CircularSector( <圆心>, <点>, <点> )",
    "syntaxEn": "CircularSector( <Midpoint>, <Point>, <Point> )",
    "description": "圆扇形",
    "searchTextEn": "CircularSector CircleSector 圆扇形 CircularSector( <Midpoint>, <Point>, <Point> )",
    "examples": [],
    "tags": [
      "category:3d",
      "category:geometry"
    ]
  },
  {
    "command": "CircumcircularArc",
    "localizedName": "外接圆弧",
    "syntax": "CircumcircularArc( <点>, <点>, <点> )",
    "syntaxEn": "CircumcircularArc( <Point>, <Point>, <Point> )",
    "description": "外接圆弧",
    "searchTextEn": "CircumcircularArc CircumcircleArc 外接圆弧 CircumcircularArc( <Point>, <Point> )",
    "examples": [],
    "tags": [
      "category:3d",
      "category:geometry"
    ]
  },
  {
    "command": "CircumcircularSector",
    "localizedName": "外接圆扇形",
    "syntax": "CircumcircularSector( <点>, <点>, <点> )",
    "syntaxEn": "CircumcircularSector( <Point>, <Point>, <Point> )",
    "description": "外接圆扇形",
    "searchTextEn": "CircumcircularSector CircumcircleSector 外接圆扇形 CircumcircularSector( <Point>, <Point> )",
    "examples": [],
    "tags": [
      "category:3d",
      "category:geometry"
    ]
  },
  {
    "command": "Circumference",
    "localizedName": "周界长",
    "syntax": "Circumference( <圆锥曲线> )",
    "syntaxEn": "Circumference( <Conic> )",
    "description": "如果给定的二次曲线是圆或椭圆，则此命令返回其周长。否则结果是不确定的。",
    "searchTextEn": "Circumference 周界长 Circumference( <Conic> )",
    "examples": [
      "椭圆的周长 x² + 2y² = 1"
    ],
    "tags": [
      "category:3d",
      "category:conic",
      "category:geometry",
      "capability:measure"
    ]
  },
  {
    "command": "Classes",
    "localizedName": "组限",
    "syntax": "Classes( <数据列表>, <组的数量> ); Classes( <数据列表>, <起点>, <组的宽度> )",
    "syntaxEn": "Classes( <List of Data>, <Number of Classes> ); Classes( <List of Data>, <Start>, <Width of Classes> )",
    "description": "给出类边界的列表。第一个边界 (min) 等于 Start，最后一个边界 (max) 将至少是列表的最大值，并且边界将在 min 和 max 之间等距间隔。或者，使用两个参数，第一个边界 (min) 等于列表的最小值，最后一个边界 (max) 将是列表的最大值，并且边界将在 min 和 max 之间等距。",
    "searchTextEn": "Classes 组限 Classes( <List of Data>, <Number Classes> ); <Start>, <Width )",
    "examples": [
      "具有开始和宽度的类",
      "班级及班级人数"
    ],
    "tags": [
      "category:list",
      "category:statistics"
    ]
  },
  {
    "command": "ClosestPoint",
    "localizedName": "最近点",
    "syntax": "ClosestPoint( <路径>, <点> ); ClosestPoint( <直线>, <直线> )",
    "syntaxEn": "ClosestPoint( <Path>, <Point> ); ClosestPoint( <Line>, <Line> )",
    "description": "返回路径上距离选定点最近的新点。",
    "searchTextEn": "ClosestPoint 最近点 ClosestPoint( <Path>, <Point> ); <Line>, <Line> )",
    "examples": [
      "返回路径上距离选定点最近的新点。",
      "返回第一条线上最接近第二条线的新点。"
    ],
    "tags": [
      "category:geometry"
    ]
  },
  {
    "command": "ClosestPointRegion",
    "localizedName": "区域内最近点",
    "syntax": "ClosestPointRegion( <区域>, <点> )",
    "syntaxEn": "ClosestPointRegion( <Region>, <Point> )",
    "description": "返回区域上最接近选定点的新点。",
    "searchTextEn": "ClosestPointRegion 区域内最近点 ClosestPointRegion( <Region>, <Point> )",
    "examples": [],
    "tags": [
      "category:geometry"
    ]
  },
  {
    "command": "Coefficients",
    "localizedName": "系数列表",
    "syntax": "Coefficients( <多项式> ); Coefficients( <圆锥曲线> ); Coefficients( <多项式>, <变量> )",
    "syntaxEn": "Coefficients( <Polynomial> ); Coefficients( <Conic> ); Coefficients( <Polynomial>, <Variable> )",
    "description": "生成多项式 a_k x^k + a_{k-1} x^{k-1} +... + a_1 x + a_0 的所有系数 [a_k, a_{k-1},..., a_1, a_0] 的列表。",
    "searchTextEn": "Coefficients 系数列表 Coefficients( <Polynomial> ); <Conic> <Polynomial>, <Variable> )",
    "examples": [
      "多项式的系数",
      "具有指定变量的多项式的系数",
      "不同变量的系数"
    ],
    "tags": [
      "category:algebra",
      "category:conic",
      "category:functions-and-calculus",
      "capability:cas-supported"
    ]
  },
  {
    "command": "Column",
    "localizedName": "列序",
    "syntax": "Column( <数据区单元格> )",
    "syntaxEn": "Column( <Spreadsheet Cell> )",
    "description": "以数字形式返回单元格的列（从 1 开始）。",
    "searchTextEn": "Column 列序 Column( <Spreadsheet Cell> )",
    "examples": [
      "q = Column(B3) 返回 q = 2，因为 B 列是电子表格的第二列。"
    ],
    "tags": [
      "category:spreadsheet"
    ]
  },
  {
    "command": "ColumnName",
    "localizedName": "列名称",
    "syntax": "ColumnName( <数据区单元格> )",
    "syntaxEn": "ColumnName( <Spreadsheet Cell> )",
    "description": "以文本形式返回单元格的列名称。",
    "searchTextEn": "ColumnName 列名称 ColumnName( <Spreadsheet Cell> )",
    "examples": [
      "r = ColumnName(A1) 创建 r = A 并在图形视图中显示此类文本 - A -。"
    ],
    "tags": [
      "category:spreadsheet"
    ]
  },
  {
    "command": "CommonDenominator",
    "localizedName": "公分母",
    "syntax": "CommonDenominator( <代数式>, <代数式> )",
    "syntaxEn": "CommonDenominator( <Expression>, <Expression> )",
    "description": "返回两个表达式的最小公分母。",
    "searchTextEn": "CommonDenominator 公分母 CommonDenominator( <Expression>, <Expression> )",
    "examples": [
      "CommonDenominator(3 / (2 x + 1), 3 / (4 x2 + 4 x + 1)) 产生 4 x2 + 4 x + 1"
    ],
    "tags": [
      "category:algebra",
      "capability:cas-supported",
      "capability:cas-only"
    ]
  },
  {
    "command": "CompleteSquare",
    "localizedName": "配方",
    "syntax": "CompleteSquare( <二次函数> )",
    "syntaxEn": "CompleteSquare( <Quadratic Function> )",
    "description": "返回以下形式的二次函数：a (x - h)2 + k。",
    "searchTextEn": "CompleteSquare 配方 CompleteSquare( <Quadratic Function> )",
    "examples": [
      "CompleteSquare(x2 - 4x + 7) 产生 1 (x - 2)2 + 3。",
      "CompleteSquare(x2 - 4x + 7) 产生 (x - 2)2 + 3。"
    ],
    "tags": [
      "category:algebra",
      "capability:cas-supported"
    ]
  },
  {
    "command": "ComplexRoot",
    "localizedName": "复数根",
    "syntax": "ComplexRoot( <多项式> )",
    "syntaxEn": "ComplexRoot( <Polynomial> )",
    "description": "求 x 中给定多项式的复数根。点是在图形视图中创建的。",
    "searchTextEn": "ComplexRoot 复数根 ComplexRoot( <Polynomial> )",
    "examples": [
      "ComplexRoot(x2 + 4) 在 CAS 语法中产生 (0 + 2 ί) 和 (0 - 2 ί)",
      "ComplexRoot(x2 + 4) 产生 {- 2 ί, 2 ί}"
    ],
    "tags": [
      "category:algebra",
      "category:functions-and-calculus",
      "capability:cas-supported"
    ]
  },
  {
    "command": "Cone",
    "localizedName": "圆锥",
    "syntax": "Cone( <圆>, <高度> ); Cone( <点>, <点>, <半径> ); Cone( <点>, <向量>, <度|弧度> )",
    "syntaxEn": "Cone( <Circle>, <Height> ); Cone( <Point>, <Point>, <Radius> ); Cone( <Point>, <Vector>, <Angle> )",
    "description": "创建具有给定底面和高度的圆锥体。\n创建一个具有顶点（第二个点）、圆心（第一个点）和给定半径的圆锥体。\n创建一个无限圆锥体，以给定点为顶点，对称轴平行于给定向量，顶角为 2α。",
    "searchTextEn": "Cone 圆锥 Cone( <Circle>, <Height> ); <Point>, <Radius> <Vector>, <Angle> )",
    "examples": [
      "如果角度≥stem:[\\frac{\\pi}{2}]，则此命令产生未定义。",
      "另请参见 InfiniteCone 命令、圆锥工具和拉伸到金字塔或圆锥工具，该工具通过拖动或选择圆并输入高度来创建直圆锥进行操作。"
    ],
    "tags": [
      "category:3d",
      "capability:create"
    ]
  },
  {
    "command": "Conic",
    "localizedName": "圆锥曲线",
    "syntax": "Conic( <列表> ); Conic( <点>, <点>, <点>, <点>, <点> ); Conic( <数字>, <数字>, <数字>, <数字>, <数字>, <数字> )",
    "syntaxEn": "Conic( <List> ); Conic( <Point>, <Point>, <Point>, <Point>, <Point> ); Conic( <Number>, <Number>, <Number>, <Number>, <Number>, <Number> )",
    "description": "返回通过五个给定点或由系数定义的圆锥曲线。",
    "searchTextEn": "Conic 圆锥曲线 Conic( <List> ); <Point>, <Point> <Number>, <Number> )",
    "examples": [
      "返回通过五个给定点的圆锥曲线",
      "返回由系数 a、b、c、d、e、f 定义的圆锥曲线",
      "返回由系数列表定义的圆锥曲线"
    ],
    "tags": [
      "category:conic"
    ]
  },
  {
    "command": "ConjugateDiameter",
    "localizedName": "共轭直径",
    "syntax": "ConjugateDiameter( <向量>, <圆锥曲线> ); ConjugateDiameter( <直线>, <圆锥曲线> )",
    "syntaxEn": "ConjugateDiameter( <Vector>, <Conic> ); ConjugateDiameter( <Line>, <Conic> )",
    "description": "共轭直径",
    "searchTextEn": "ConjugateDiameter Diameter 共轭直径 ConjugateDiameter( <Vector>, <Conic> ); <Line>, )",
    "examples": [],
    "tags": [
      "category:conic"
    ]
  },
  {
    "command": "ConstructionStep",
    "localizedName": "作图步序",
    "syntax": "ConstructionStep(); ConstructionStep( <对象> )",
    "syntaxEn": "ConstructionStep(); ConstructionStep( <Object> )",
    "description": "以数字形式返回当前的构造协议步骤，或以数字形式返回给定对象的构造协议步骤。",
    "searchTextEn": "ConstructionStep 作图步序 ConstructionStep(); ConstructionStep( <Object> )",
    "examples": [
      "获取当前的构建协议步骤",
      "获取特定对象的构造协议步骤"
    ],
    "tags": [
      "category:geogebra",
      "capability:query"
    ]
  },
  {
    "command": "ContingencyTable",
    "localizedName": "列联表",
    "syntax": "ContingencyTable( <文本列表>, <文本列表> ); ContingencyTable( <文本列表>, <文本列表>, <选项 \"|\"-显示列百分比|\"_\"-显示行百分比|\"+\"-显示总百分比|\"e\"-显示预期计数|\"k\"-显示卡方贡献|\"=\"-显示卡方检验结果> ); ContingencyTable( <行数值列表>, <列数值列表>, <频数表> ); ContingencyTable( <行数值列表>, <列数值列表>, <频数表> , <选项 \"|\"-显示列百分比|\"_\"-显示行百分比|\"+\"-显示总百分比|\"e\"-显示预期计数|\"k\"-显示卡方贡献|\"=\"-显示卡方检验结果> )",
    "syntaxEn": "ContingencyTable( <List of Text>, <List of Text> ); ContingencyTable( <List of Text>, <List of Text>, <Options> ); ContingencyTable( <List of Row Values>, <List of Column Values>, <Frequency Table> ); ContingencyTable( <List of Row Values>, <List of Column Values>, <Frequency Table> , <Options> )",
    "description": "绘制根据给定列表创建的意外事件 Table (https://en.wikipedia.org/wiki/Contingency_table)。第一个列表中的唯一值用作行值，第二个列表中的唯一值用作列值。选项控制表中可选计算的显示。",
    "searchTextEn": "ContingencyTable 列联表 ContingencyTable( <List of Text>, Text> ); <Options> Row Values>, Column <Frequency Table> , )",
    "examples": [
      "从两个文本值列表中绘制列联表。",
      "从两个文本值列表中绘制列联表，并提供计算选项。",
      "使用给定的行值、列值和频率表绘制列联表。",
      "绘制包含频率表和选项的列联表，显示行百分比。"
    ],
    "tags": [
      "category:chart",
      "category:statistics",
      "category:text"
    ]
  },
  {
    "command": "ContinuedFraction",
    "localizedName": "连分式",
    "syntax": "ContinuedFraction( <数字> ); ContinuedFraction( <数字>, <层级> ); ContinuedFraction( <数字>, <层级>, <速记? true|false> )",
    "syntaxEn": "ContinuedFraction( <Number> ); ContinuedFraction( <Number>, <Level> ); ContinuedFraction( <Number>, <Level>, <Boolean Shorthand> )",
    "description": "创建近似给定数字的连分数。该分数以精度 10-8 的数值进行计算。",
    "searchTextEn": "ContinuedFraction 连分式 ContinuedFraction( <Number> ); <Number>, <Level> <Level>, <Boolean Shorthand> )",
    "examples": [
      "创建近似给定数字的连分数。结果是 LaTeX 文本对象。",
      "创建具有指定级别的逼近给定数字的连分数。商数小于或等于 Level，但绝不会超过达到 10-8 数值精度所需的商数。",
      "使用可选级别和速记语法创建近似给定数字的连分数。当 Shorthand 为 true 时，LaTeX 文本使用较短的语法并包含整数部分的列表。",
      "使用指定的级别和速记语法创建近似给定数字的连分数。"
    ],
    "tags": [
      "category:algebra",
      "category:text"
    ]
  },
  {
    "command": "ConvexHull",
    "localizedName": "凸包",
    "syntax": "ConvexHull( <点列> )",
    "syntaxEn": "ConvexHull( <List of Points> )",
    "description": "创建给定点集的凸包。返回的对象是一个轨迹，因此它是辅助的。",
    "searchTextEn": "ConvexHull 凸包 ConvexHull( <List of Points> )",
    "examples": [],
    "tags": [
      "category:discrete-math"
    ]
  },
  {
    "command": "CopyFreeObject",
    "localizedName": "复制自由对象",
    "syntax": "CopyFreeObject( <对象> )",
    "syntaxEn": "CopyFreeObject( <Object> )",
    "description": "创建对象的免费副本。保留所有基本对象属性，辅助对象的副本也是辅助的。",
    "searchTextEn": "CopyFreeObject 复制自由对象 CopyFreeObject( <Object> )",
    "examples": [],
    "tags": [
      "category:scripting",
      "capability:script",
      "capability:construction-control"
    ]
  },
  {
    "command": "Corner",
    "localizedName": "角点",
    "syntax": "Corner( <角点数字 1-左下角|2-右下角|3-右上角|4-左上角|5-绘图区解析度像素|6-GeoGebra视窗的宽度与高度> ); Corner( <图片>, <角点数字 1-左下角|2-右下角|3-右上角|4-左上角|5-绘图区解析度像素|6-GeoGebra视窗的宽度与高度> ); Corner( <文本>, <角点数字 1-左下角|2-右下角|3-右上角|4-左上角|5-绘图区解析度像素|6-GeoGebra视窗的宽度与高度> ); Corner( <绘图区编号数字>, <角点数字 1-左下角|2-右下角|3-右上角|4-左上角|5-绘图区解析度像素|6-GeoGebra视窗的宽度与高度> )",
    "syntaxEn": "Corner( <Number of Corner> ); Corner( <Image>, <Number of Corner> ); Corner( <Text>, <Number of Corner> ); Corner( <Graphics View>, <Number of Corner> )",
    "description": "根据指定的数字在图形视图、图像或文本的角处创建一个点。对于图形视图，数字 n=1,2,3,4 在角处创建一个点，n=5 返回点 (w, h)，其中 w 和 h 是以像素为单位的宽度和高度。始终使用第一个图形视图。对于 -1 的 3D 图形视图，数字 1-8 表示角点，9-13 表示特殊返回，例如尺寸、视图方向或比例。",
    "searchTextEn": "Corner 角点 Corner( <Number of Corner> ); <Image>, <Text>, <Graphics View>, )",
    "examples": [
      "Corner( <Number of Corner> ) 在其他命令中不起作用。相反，创建例如 C_1 = Corner(1) 并使用它。",
      "Corner( <Graphics View>, <Number of Corner> ) 在其他命令中不起作用。相反，创建例如 C_1 = Corner(1, 1) 并使用它。",
      "对 3D 图形视图的角使用 -1（数字的可用值：从 1 到 8）。此外：Corner(-1,9) 返回点 (w, h, 0)，其中 w 和 h 是 3D 图形视图的宽度和高度（以像素为单位）； Corner(-1,10) 返回点 (w, h, 0)，其中 w 和 h 是主窗口的宽度和高度（以像素为单位）； Corner(-1,11) 返回视图方向或眼睛位置； Corner(-1,12) 返回屏幕从左到右方向； Corner(-1,13) 返回 x、y 和 z 轴的比例。",
      "Corner( <Text>, <Number of Corner> ) 在 Sequence 或 Zip 命令中不起作用。另外，必须取消选中“屏幕上的绝对位置”属性。"
    ],
    "tags": [
      "category:geogebra",
      "capability:query"
    ]
  },
  {
    "command": "CorrelationCoefficient",
    "localizedName": "相关系数",
    "syntax": "CorrelationCoefficient( <点列> ); CorrelationCoefficient( <x坐标列表>, <y坐标列表> )",
    "syntaxEn": "CorrelationCoefficient( <List of Points> ); CorrelationCoefficient( <List of x-coordinates>, <List of y-coordinates> )",
    "description": "相关系数",
    "searchTextEn": "CorrelationCoefficient PMCC 相关系数 CorrelationCoefficient( <List of Points> ); x-coordinates>, y-coordinates> )",
    "examples": [],
    "tags": [
      "category:statistics"
    ]
  },
  {
    "command": "CountIf",
    "localizedName": "条件计数",
    "syntax": "CountIf( <条件>, <列表> ); CountIf( <条件>, <变量>, <列表> )",
    "syntaxEn": "CountIf( <Condition>, <List> ); CountIf( <Condition>, <Variable>, <List> )",
    "description": "计算列表中满足条件的元素数量。",
    "searchTextEn": "CountIf 条件计数 CountIf( <Condition>, <List> ); <Variable>, )",
    "examples": [
      "计算列表中小于 3 的数字",
      "计算电子表格范围内值小于 3 的单元格数量",
      "使用变量语法计算 x 坐标小于 3 的点"
    ],
    "tags": [
      "category:list",
      "category:logic"
    ]
  },
  {
    "command": "Covariance",
    "localizedName": "协方差",
    "syntax": "Covariance( <点列> ); Covariance( <数字列表>, <数字列表> )",
    "syntaxEn": "Covariance( <List of Points> ); Covariance( <List of Numbers>, <List of Numbers> )",
    "description": "计算指定列表的元素之间或指定点的 x 和 y 坐标之间的协方差。",
    "searchTextEn": "Covariance 协方差 Covariance( <List of Points> ); Numbers>, Numbers> )",
    "examples": [
      "两个数字列表之间的协方差",
      "点列表的协方差"
    ],
    "tags": [
      "category:statistics",
      "capability:cas-supported"
    ]
  },
  {
    "command": "Cross",
    "localizedName": "叉积",
    "syntax": "Cross( <向量>, <向量> )",
    "syntaxEn": "Cross( <Vector>, <Vector> )",
    "description": "计算 u 和 v 的叉积。除了向量之外，您还可以使用列表。",
    "searchTextEn": "Cross 叉积 Cross( <Vector>, <Vector> )",
    "examples": [
      "3D 向量 (1, 3, 2) 和 (0, 3, -2) 的叉积",
      "3D 向量 {1, 1, 1} 和 {-1, -1, -1} 的叉积",
      "二维向量 (1,2) 和 (4,5) 的叉积，产生 z 坐标"
    ],
    "tags": [
      "category:vector-and-matrix",
      "capability:cas-supported",
      "capability:cas-only"
    ]
  },
  {
    "command": "CrossRatio",
    "localizedName": "交比",
    "syntax": "CrossRatio( <点>, <点>, <点>, <点> )",
    "syntaxEn": "CrossRatio( <Point>, <Point>, <Point>, <Point> )",
    "description": "计算四个共线点 A、B、C、D 的交叉比 λ，其中： λ = AffineRatio[B, C, D] / AffineRatio[A, C, D]。",
    "searchTextEn": "CrossRatio 交比 CrossRatio( <Point>, <Point> )",
    "examples": [
      "CrossRatio((-1, 1), (1, 1), (3, 1), (4, 1)) 收益率 1.2"
    ],
    "tags": [
      "category:geometry",
      "capability:measure"
    ]
  },
  {
    "command": "CSolutions",
    "localizedName": "复数解集",
    "syntax": "CSolutions( <方程> ); CSolutions( <方程>, <变量> ); CSolutions( <方程列表>, <变量列表> )",
    "syntaxEn": "CSolutions( <Equation> ); CSolutions( <Equation>, <Variable> ); CSolutions( <List of Equations>, <List of Variables> )",
    "description": "求解主变量的给定方程并返回所有解的列表，允许复杂的解。",
    "searchTextEn": "CSolutions 复数解集 CSolutions( <Equation> ); <Equation>, <Variable> <List of Equations>, Variables> )",
    "examples": [
      "求解复杂解的 x^2 = -1",
      "使用复数解对变量 a 求解 a^2 = -1",
      "对变量 {x, y} 求解具有复数解的方程组 {y^2 = x - 1, x = 2 * y - 1}"
    ],
    "tags": [
      "category:algebra",
      "capability:cas-supported",
      "capability:cas-only"
    ]
  },
  {
    "command": "CSolve",
    "localizedName": "复数解",
    "syntax": "CSolve( <方程> ); CSolve( <方程>, <变量> ); CSolve( <方程列表>, <变量列表> )",
    "syntaxEn": "CSolve( <Equation> ); CSolve( <Equation>, <Variable> ); CSolve( <List of Equations>, <List of Variables> )",
    "description": "求解主变量的给定方程并返回所有解的列表，允许复杂的解。",
    "searchTextEn": "CSolve 复数解 CSolve( <Equation> ); <Equation>, <Variable> <List of Equations>, Variables> )",
    "examples": [
      "对于复杂的解决方案，求解 x² = -1",
      "对于具有复数解的变量 a，求解 a² = -1",
      "对变量 {x, y} 求解具有复数解的方程组 {y² = x - 1, x = 2y - 1}"
    ],
    "tags": [
      "category:algebra",
      "capability:cas-supported",
      "capability:cas-only"
    ]
  },
  {
    "command": "Cube",
    "localizedName": "正六面体",
    "syntax": "Cube( <正方形> ); Cube( <点>, <点>, <点> ); Cube( <点>, <点>, <方向> )",
    "syntaxEn": "Cube( <Square> ); Cube( <Point>, <Point>, <Point> ); Cube( <Point>, <Point>, <Direction> )",
    "description": "创建具有各种参数组合的立方体：使用正方形作为基础；使用两个点和一个方向来定义边缘和方向；使用三个相邻点定义一个面；或使用两个相邻点自动生成第三点进行旋转。",
    "searchTextEn": "Cube 正六面体 Cube( <Square> ); <Point>, <Point> <Direction> )",
    "examples": [
      "Cube(A, B) 是 Cube(A, B, C) 的缩写，其中 C = Point(Circle(B, Distance(A, B), Segment(A, B)))",
      "另请参见四面体、八面体、二十面体、十二面体命令"
    ],
    "tags": [
      "category:3d"
    ]
  },
  {
    "command": "Cubic",
    "localizedName": "三次曲线",
    "syntax": "Cubic( <点>, <点>, <点>, <数字> )",
    "syntaxEn": "Cubic( <Point>, <Point>, <Point>, <Number> )",
    "description": "给出给定三角形 ABC 的第 n 个三角形立方 (https://bernard-gibert.pagesperso-orange.fr/ctc.html)。",
    "searchTextEn": "Cubic 三次曲线 Cubic( <Point>, <Number> )",
    "examples": [
      "令 A = (0, 1)、B = (2, 1) 且 C = (1, 2)。 Cubic(A, B, C, 2) 产生隐式曲线 -x3 + 3x2 + 5x y2 - 14x y + 7x - 5y2 + 14y = 9。"
    ],
    "tags": [
      "category:functions-and-calculus",
      "category:geometry"
    ]
  },
  {
    "command": "Curvature",
    "localizedName": "曲率",
    "syntax": "Curvature( <点>, <对象> )",
    "syntaxEn": "Curvature( <Point>, <Object> )",
    "description": "产生给定点处对象的曲率（函数、曲线、二次曲线）。",
    "searchTextEn": "Curvature 曲率 Curvature( <Point>, <Object> )",
    "examples": [
      "函数 x^2 在点 (0,0) 处的曲率",
      "参数曲线在 (0,0) 点的曲率",
      "圆锥曲线在点 (-1,0) 处的曲率"
    ],
    "tags": [
      "category:conic",
      "category:functions-and-calculus",
      "capability:measure"
    ]
  },
  {
    "command": "CurvatureVector",
    "localizedName": "曲率向量",
    "syntax": "CurvatureVector( <点>, <对象> )",
    "syntaxEn": "CurvatureVector( <Point>, <Object> )",
    "description": "产生给定点处对象（函数、曲线、二次曲线）的曲率向量。",
    "searchTextEn": "CurvatureVector 曲率向量 CurvatureVector( <Point>, <Object> )",
    "examples": [
      "CurvatureVector((0, 0), x2) 产生向量 (0, 2)",
      "CurvatureVector((0, 0), Curve(cos(t), sin(2t), t, 0, π)) 产生向量 (0, 0)",
      "CurvatureVector((-1, 0), Conic({1, 1, 1, 2, 2, 3})) 产生向量 (0, -2)"
    ],
    "tags": [
      "category:functions-and-calculus",
      "category:vector-and-matrix"
    ]
  },
  {
    "command": "Curve",
    "localizedName": "曲线",
    "syntax": "Curve( <代数式>, <代数式>, <参变量t>, <起始值>, <终止值> ); Curve( <代数式>, <代数式>, <代数式>, <参变量t>, <起始值>, <终止值> )",
    "syntaxEn": "Curve( <Expression>, <Expression>, <Parameter Variable>, <Start Value>, <End Value> ); Curve( <Expression>, <Expression>, <Expression>, <Parameter Variable>, <Start Value>, <End Value> )",
    "description": "曲线",
    "searchTextEn": "Curve CurveCartesian 曲线 Curve( <Expression>, <Parameter Variable>, <Start Value>, <End Value> ); )",
    "examples": [],
    "tags": [
      "category:3d",
      "category:functions-and-calculus",
      "capability:create"
    ]
  },
  {
    "command": "Cylinder",
    "localizedName": "圆柱",
    "syntax": "Cylinder( <圆>, <高度> ); Cylinder( <点>, <点>, <半径> )",
    "syntaxEn": "Cylinder( <Circle>, <Height> ); Cylinder( <Point>, <Point>, <Radius> )",
    "description": "创建具有给定底面和给定高度的圆柱体。创建具有给定半径并以给定点作为顶部和底部中心的圆柱体。",
    "searchTextEn": "Cylinder 圆柱 Cylinder( <Circle>, <Height> ); <Point>, <Radius> )",
    "examples": [],
    "tags": [
      "category:3d",
      "capability:create"
    ]
  },
  {
    "command": "DataFunction",
    "localizedName": "数据函数",
    "syntax": "DataFunction( <数字列表>, <数字列表> )",
    "syntaxEn": "DataFunction( <List of Numbers>, <List of Numbers> )",
    "description": "产生一个连接点 (x1, y1), (x2, y2),...,(xn, yn) 的函数，其中 {x1,..., xn}, {y1,..., yn} 是输入列表。在这些点之间使用线性插值。该命令由传感器使用。",
    "searchTextEn": "DataFunction 数据函数 DataFunction( <List of Numbers>, Numbers> )",
    "examples": [
      "DataFunction({0, 1, 2, 4}, {0, 1, 4, 16}) 产生一个经过点 (0, 0)、(1,1)、(2, 4)、(4, 16) 的函数。"
    ],
    "tags": [
      "category:functions-and-calculus",
      "category:list"
    ]
  },
  {
    "command": "Degree",
    "localizedName": "多项式次数",
    "syntax": "Degree( <多项式> ); Degree( <多项式>, <变量> )",
    "syntaxEn": "Degree( <Polynomial> ); Degree( <Polynomial>, <Variable> )",
    "description": "给出多项式的次数（在主变量或单项式中）。",
    "searchTextEn": "Degree 多项式次数 Degree( <Polynomial> ); <Polynomial>, <Variable> )",
    "examples": [
      "主变量多项式的次数",
      "多变量多项式的次数",
      "特定变量 x 的多项式的次数",
      "特定变量 y 的多项式的次数"
    ],
    "tags": [
      "category:algebra",
      "category:functions-and-calculus",
      "capability:cas-supported"
    ]
  },
  {
    "command": "DelaunayTriangulation",
    "localizedName": "Delaunay三角网",
    "syntax": "DelaunayTriangulation( <点列> )",
    "syntaxEn": "DelaunayTriangulation( <List of Points> )",
    "description": "Delaunay三角网",
    "searchTextEn": "DelaunayTriangulation DelauneyTriangulation Delaunay三角网 DelaunayTriangulation( <List of Points> )",
    "examples": [],
    "tags": [
      "category:discrete-math"
    ]
  },
  {
    "command": "Delete",
    "localizedName": "删除",
    "syntax": "Delete( <对象> )",
    "syntaxEn": "Delete( <Object> )",
    "description": "删除对象及其所有依赖对象。",
    "searchTextEn": "Delete 删除 Delete( <Object> )",
    "examples": [
      "设 P 为点，sli 为滑块，seg=Segment(P, sli)。命令 Delete(sli) 删除滑块 sli 和线段 seg，但不会从构造中删除点 P，因为该点不依赖于滑块 sli。",
      "设 P 为点，sli 为滑块，seg=Segment(P,sli)。命令 Delete(sli) 删除滑块 sli 和线段 seg，但不会从构造中删除点 P，因为该点不依赖于滑块 sli。"
    ],
    "tags": [
      "category:scripting",
      "capability:cas-supported",
      "capability:script",
      "capability:construction-control",
      "risk:destructive",
      "risk:bulk-mutation"
    ]
  },
  {
    "command": "Denominator",
    "localizedName": "分母",
    "syntax": "Denominator( <数字> ); Denominator( <函数> ); Denominator( <代数式> )",
    "syntaxEn": "Denominator( <Number> ); Denominator( <Function> ); Denominator( <Expression> )",
    "description": "返回有理数或表达式的分母。",
    "searchTextEn": "Denominator 分母 Denominator( <Number> ); <Function> <Expression> )",
    "examples": [
      "对于函数，返回函数的分母",
      "对于有理数，返回其简化分母",
      "尽可能简化分母",
      "当分子可被分母整除时返回 1",
      "适用于涉及多个分数的表达式"
    ],
    "tags": [
      "category:algebra",
      "category:functions-and-calculus",
      "capability:cas-supported"
    ]
  },
  {
    "command": "Derivative",
    "localizedName": "导数",
    "syntax": "Derivative( <函数> ); Derivative( <曲线> ); Derivative( <函数>, <数字> ); Derivative( <函数>, <变量> ); Derivative( <曲线>, <数字> ); Derivative( <函数>, <变量>, <数字> ); Derivative( <代数式> ); Derivative( <代数式>, <变量> ); Derivative( <代数式>, <变量>, <数字> )",
    "syntaxEn": "Derivative( <Function> ); Derivative( <Curve> ); Derivative( <Function>, <Number> ); Derivative( <Function>, <Variable> ); Derivative( <Curve>, <Number> ); Derivative( <Function>, <Variable>, <Number> ); Derivative( <Expression> ); Derivative( <Expression>, <Variable> ); Derivative( <Expression>, <Variable>, <Number> )",
    "description": "返回函数、表达式或参数曲线相对于变量的导数，包括偏导数和高阶导数。",
    "searchTextEn": "Derivative 导数 Derivative( <Function> ); <Curve> <Function>, <Number> <Variable> <Curve>, <Variable>, <Expression> <Expression>, )",
    "examples": [
      "返回函数相对于主变量的导数",
      "返回函数相对于主变量的 n 阶导数",
      "返回函数相对于给定变量的偏导数",
      "返回函数相对于给定变量的 n 阶偏导数",
      "返回曲线的导数",
      "返回曲线的 n 阶导数",
      "返回表达式相对于主变量的导数",
      "返回表达式相对于给定变量的导数",
      "返回表达式相对于给定变量的 n 阶导数"
    ],
    "tags": [
      "category:functions-and-calculus",
      "capability:cas-supported"
    ]
  },
  {
    "command": "Determinant",
    "localizedName": "行列式",
    "syntax": "Determinant( <矩阵> )",
    "syntaxEn": "Determinant( <Matrix> )",
    "description": "给出矩阵的行列式。如果矩阵包含未定义的变量，则会生成行列式的公式。",
    "searchTextEn": "Determinant 行列式 Determinant( <Matrix> )",
    "examples": [
      "数值矩阵的行列式",
      "具有变量的矩阵的行列式"
    ],
    "tags": [
      "category:vector-and-matrix",
      "capability:cas-supported"
    ]
  },
  {
    "command": "Difference",
    "localizedName": "差集",
    "syntax": "Difference( <多边形>, <多边形> )",
    "syntaxEn": "Difference( <Polygon>, <Polygon> )",
    "description": "找出两个多边形的差异。",
    "searchTextEn": "Difference 差集 Difference( <Polygon>, <Polygon> )",
    "examples": [
      "找出两个多边形的差异。"
    ],
    "tags": [
      "category:geometry"
    ]
  },
  {
    "command": "Dilate",
    "localizedName": "位似",
    "syntax": "Dilate( <对象>, <位似比> ); Dilate( <对象>, <位似比>, <位似中心> )",
    "syntaxEn": "Dilate( <Object>, <Dilation Factor> ); Dilate( <Object>, <Dilation Factor>, <Dilation Center Point> )",
    "description": "使用给定因子从原点或从指定的膨胀中心点膨胀对象。",
    "searchTextEn": "Dilate 位似 Dilate( <Object>, <Dilation Factor> ); Factor>, Center Point> )",
    "examples": [
      "使用膨胀因子膨胀对象",
      "使用膨胀因子和特定中心点来膨胀对象"
    ],
    "tags": [
      "category:transformation",
      "capability:transform"
    ]
  },
  {
    "command": "Dimension",
    "localizedName": "维度",
    "syntax": "Dimension( <对象> )",
    "syntaxEn": "Dimension( <Object> )",
    "description": "给出向量或矩阵的维数。",
    "searchTextEn": "Dimension 维度 Dimension( <Object> )",
    "examples": [
      "向量的维数",
      "矩阵的维数",
      "具有符号项的矩阵的维数"
    ],
    "tags": [
      "category:vector-and-matrix",
      "capability:cas-supported"
    ]
  },
  {
    "command": "Direction",
    "localizedName": "方向向量",
    "syntax": "Direction( <直线> )",
    "syntaxEn": "Direction( <Line> )",
    "description": "方向向量",
    "searchTextEn": "Direction 方向向量 Direction( <Line> )",
    "examples": [],
    "tags": [
      "category:geometry",
      "category:vector-and-matrix"
    ]
  },
  {
    "command": "Directrix",
    "localizedName": "准线",
    "syntax": "Directrix( <圆锥曲线> )",
    "syntaxEn": "Directrix( <Conic> )",
    "description": "产生二次曲线的准线。",
    "searchTextEn": "Directrix 准线 Directrix( <Conic> )",
    "examples": [
      "Directrix(x2 - 3x + 3y = 9) 产生行 y = 4.5"
    ],
    "tags": [
      "category:conic"
    ]
  },
  {
    "command": "Distance",
    "localizedName": "距离",
    "syntax": "Distance( <点>, <对象> ); Distance( <直线>, <直线> ); Distance( <平面>, <平面> )",
    "syntaxEn": "Distance( <Point>, <Object> ); Distance( <Line>, <Line> ); Distance( <Plane>, <Plane> )",
    "description": "产生点与对象之间、两条线之间或两个平面之间的最短距离。",
    "searchTextEn": "Distance 距离 Distance( <Point>, <Object> ); <Line>, <Line> <Plane>, <Plane> )",
    "examples": [
      "点与物体之间的距离",
      "3D 中两点之间的距离",
      "点与函数之间的距离",
      "两条线之间的距离",
      "3D 中两条线之间的距离",
      "两个平面之间的距离"
    ],
    "tags": [
      "category:3d",
      "category:geometry",
      "capability:measure"
    ]
  },
  {
    "command": "Div",
    "localizedName": "商式",
    "syntax": "Div( <被除数>, <除数> ); Div( <被除式>, <除式> )",
    "syntaxEn": "Div( <Dividend Number>, <Divisor Number> ); Div( <Dividend Polynomial>, <Divisor Polynomial> )",
    "description": "返回两个数字的商（结果的整数部分）或两个多项式的商。",
    "searchTextEn": "Div 商式 Div( <Dividend Number>, <Divisor Number> ); Polynomial>, Polynomial> )",
    "examples": [
      "Div(16, 3) 产生 5。",
      "Div(x2 + 3 x + 1, x - 1) 得出 f(x) = x + 4。"
    ],
    "tags": [
      "category:algebra",
      "capability:cas-supported"
    ]
  },
  {
    "command": "Division",
    "localizedName": "除法",
    "syntax": "Division( <被除数>, <除数> ); Division( <被除式>, <除式> )",
    "syntaxEn": "Division( <Dividend Number>, <Divisor Number> ); Division( <Dividend Polynomial>, <Divisor Polynomial> )",
    "description": "给出商（结果的整数部分）和两个数字相除的余数。",
    "searchTextEn": "Division 除法 Division( <Dividend Number>, <Divisor Number> ); Polynomial>, Polynomial> )",
    "examples": [
      "数字除法",
      "多项式除法",
      "CAS视图中的多变量除法",
      "具有相反项的多变量除法"
    ],
    "tags": [
      "category:algebra",
      "capability:cas-supported"
    ]
  },
  {
    "command": "Divisors",
    "localizedName": "因数个数",
    "syntax": "Divisors( <数字> )",
    "syntaxEn": "Divisors( <Number> )",
    "description": "计算所有正因数的数量，包括数字本身。",
    "searchTextEn": "Divisors 因数个数 Divisors( <Number> )",
    "examples": [
      "Divisors(15) 的结果是 4，即 15 的所有正因数的个数，其中包括 15。"
    ],
    "tags": [
      "category:algebra",
      "capability:cas-supported"
    ]
  },
  {
    "command": "DivisorsList",
    "localizedName": "因数列表",
    "syntax": "DivisorsList( <数字> )",
    "syntaxEn": "DivisorsList( <Number> )",
    "description": "给出所有正因数的列表，包括数字本身。",
    "searchTextEn": "DivisorsList 因数列表 DivisorsList( <Number> )",
    "examples": [
      "DivisorsList(15) 产生 {1, 3, 5, 15}，即 15 的所有正因数列表，包括 15。"
    ],
    "tags": [
      "category:algebra",
      "capability:cas-supported"
    ]
  },
  {
    "command": "DivisorsSum",
    "localizedName": "因数和",
    "syntax": "DivisorsSum( <数字> )",
    "syntaxEn": "DivisorsSum( <Number> )",
    "description": "计算所有正因数的总和，包括数字本身。",
    "searchTextEn": "DivisorsSum 因数和 DivisorsSum( <Number> )",
    "examples": [
      "DivisorsSum(15) 得到 24，总和为 1 + 3 + 5 + 15。"
    ],
    "tags": [
      "category:algebra",
      "capability:cas-supported"
    ]
  },
  {
    "command": "Dodecahedron",
    "localizedName": "正十二面体",
    "syntax": "Dodecahedron( <正五边形> ); Dodecahedron( <点>, <点>, <点> ); Dodecahedron( <点>, <点>, <方向> )",
    "syntaxEn": "Dodecahedron( <Regular Pentagon> ); Dodecahedron( <Point>, <Point>, <Point> ); Dodecahedron( <Point>, <Point>, <Direction> )",
    "description": "创建具有不同参数组合的十二面体：使用正五边形作为基础；使用两个点和一个方向来确定顶点；使用第一个面的三个相邻点；或使用两个相邻点自动创建第三点以围绕第一条边旋转。",
    "searchTextEn": "Dodecahedron 正十二面体 Dodecahedron( <Regular Pentagon> ); <Point>, <Point> <Direction> )",
    "examples": [
      "Dodecahedron(A, B) 是 Dodecahedron(A, B, C) 的缩写，其中 C = Point(Circle(((1 - sqrt(5)) A + (3 + sqrt(5)) B) / 4, Distance(A, B) sqrt(10 + 2sqrt(5)) / 4, Segment(A, B)))",
      "另请参见立方体、四面体、二十面体、八面体命令"
    ],
    "tags": [
      "category:3d"
    ]
  },
  {
    "command": "Dot",
    "localizedName": "点积",
    "syntax": "Dot( <向量>, <向量> )",
    "syntaxEn": "Dot( <Vector>, <Vector> )",
    "description": "返回两个向量的点积（标量积）。",
    "searchTextEn": "Dot 点积 Dot( <Vector>, <Vector> )",
    "examples": [
      "Dot((1, 3, 2), (0, 3, -2)) 产生 5，即 (1, 3, 2) 和 (0, 3, -2) 的标量积。"
    ],
    "tags": [
      "category:vector-and-matrix",
      "capability:cas-supported",
      "capability:cas-only"
    ]
  },
  {
    "command": "DotPlot",
    "localizedName": "点阵图",
    "syntax": "DotPlot( <原始数据列表>, <堆栈相邻点(可选)>, <缩放因子(可选)> )",
    "syntaxEn": "DotPlot( <List of Raw Data>, <Stack Adjacent Dots (optional)>, <Scale Factor (optional)> )",
    "description": "返回给定数据列表的点图以及点图点列表。如果某个数据n在原始数据列表中出现k次，则返回的列表包含点(n, 1), (n, 2),..., (n, k)。如果选择比例因子 s，则返回的列表包含点 (n, 1s)、(n, 2s)、...、(n, ks)。 Stack Adjacent Dots 表示布尔值（true 或 false）：如果选择 true，则点（彼此靠近）会堆叠。如果选择 false，结果将与没有 <Stack Adjacent Dots (optional)> 相同。命令 DotPlot 也适用于文本列表。",
    "searchTextEn": "DotPlot 点阵图 DotPlot( <List of Raw Data>, <Stack Adjacent Dots (optional)>, <Scale Factor (optional)> )",
    "examples": [
      "DotPlot 带有数字列表",
      "DotPlot 带有文本列表"
    ],
    "tags": [
      "category:chart"
    ]
  },
  {
    "command": "DynamicCoordinates",
    "localizedName": "动态坐标",
    "syntax": "DynamicCoordinates( <点>, <横坐标x>, <纵坐标y> ); DynamicCoordinates( <点>, <横坐标x>, <纵坐标y>, <竖坐标z> )",
    "syntaxEn": "DynamicCoordinates( <Point>, <x-Coordinate>, <y-Coordinate> ); DynamicCoordinates( <Point>, <x-Coordinate>, <y-Coordinate>, <z-Coordinate> )",
    "description": "使用给定坐标创建一个新点：该点是相关的，但可以移动。每当您尝试将新点移动到坐标 (x, y) 时，给定点就会移动到那里并计算新点的坐标。如果给定点不可见并且使用鼠标拖动，则效果最佳。至少一个给定坐标应取决于给定点。",
    "searchTextEn": "DynamicCoordinates 动态坐标 DynamicCoordinates( <Point>, <x-Coordinate>, <y-Coordinate> ); <y-Coordinate>, <z-Coordinate> )",
    "examples": [
      "设 A 为一个点，B = DynamicCoordinates(A, round(x(A)), round(y(A)))。当您尝试使用移动工具将 B 移动到 (1.3, 2.1) 时，A 点变为 (1.3, 2.1)，而 B 出现在 (1,2) 处。",
      "B = DynamicCoordinates(A, x(A), min(y(A), sin(x(A)))) 在 sin(x) 下创建一个点。",
      "令 A = Point(xAxis) 且 B = Point(xAxis)。现在在输入栏中输入：DynamicCoordinates(B, Min(x(B), x(A)), 0) 并按 Enter。 SetVisibleInView(B, 1, false)，然后按 Enter 键。 SetLayer(C, 1)，然后按 Enter 键。现在，C 不能移动到 A 的右侧。",
      "定义 A=(1, 2)。现在，在输入栏中输入：SetVisibleInView(A, 1, false) 并按 Enter。 B = DynamicCoordinates(A, If(x(A) > 3, 3, If(x(A) < -3, -3, If(x(A) < 0, round(x(A)), x(A)))), If(x(A) < 0, 0.5, If(y(A) > 2, 2, If(y(A) < 0, 0, y(A))))) 并按 Enter 键。",
      "当将点 C 拖到 A 附近时，此示例会使 A 成为粘性点。定义 A = (1, 2) 和 B = (2, 3)。现在，在输入栏中输入：SetVisibleInView(B, 1, false) 并按 Enter。 C = DynamicCoordinates(B, If(Distance(A, B) < 1, x(A), x(B)), If(Distance(A, B) < 1, y(A), y(B)))。"
    ],
    "tags": [
      "category:geogebra",
      "capability:position",
      "capability:coordinates"
    ]
  },
  {
    "command": "Eccentricity",
    "localizedName": "离心率",
    "syntax": "Eccentricity( <圆锥曲线> )",
    "syntaxEn": "Eccentricity( <Conic> )",
    "description": "计算圆锥曲线的偏心率。",
    "searchTextEn": "Eccentricity 离心率 Eccentricity( <Conic> )",
    "examples": [
      "Eccentricity(x2/9 + y2/4 = 1) 返回 a = 0.75"
    ],
    "tags": [
      "category:conic",
      "capability:measure"
    ]
  },
  {
    "command": "Eigenvalues",
    "localizedName": "特征值",
    "syntax": "Eigenvalues( <矩阵> )",
    "syntaxEn": "Eigenvalues( <Matrix> )",
    "description": "查找给定矩阵的特征值。",
    "searchTextEn": "Eigenvalues 特征值 Eigenvalues( <Matrix> )",
    "examples": [
      "CAS 查找矩阵特征值的语法示例"
    ],
    "tags": [
      "category:vector-and-matrix",
      "capability:cas-supported"
    ]
  },
  {
    "command": "Eigenvectors",
    "localizedName": "特征向量",
    "syntax": "Eigenvectors( <矩阵> )",
    "syntaxEn": "Eigenvectors( <Matrix> )",
    "description": "查找给定矩阵的特征向量。",
    "searchTextEn": "Eigenvectors 特征向量 Eigenvectors( <Matrix> )",
    "examples": [
      "CAS 语法"
    ],
    "tags": [
      "category:vector-and-matrix",
      "capability:cas-supported"
    ]
  },
  {
    "command": "Element",
    "localizedName": "元素",
    "syntax": "Element( <列表>, <元素位置> ); Element( <矩阵>, <行序>, <列序> ); Element( <列表>, <索引1>, <索引2>, ... )",
    "syntaxEn": "Element( <List>, <Position of Element> ); Element( <Matrix>, <Row>, <Column> ); Element( <List>, <Index1>, <Index2>, ... )",
    "description": "产生列表的第 n 个元素。产生给定行和列中的矩阵元素。假设列表是 n 维列表，则最多可以指定 n 个索引来获取给定坐标处的元素（或元素列表）。",
    "searchTextEn": "Element 元素 Element( <List>, <Position of Element> ); <Matrix>, <Row>, <Column> <Index1>, <Index2>, ... )",
    "examples": [
      "Element({1, 3, 2}, 2) 产生 3，即 {1, 3, 2} 的第二个元素。",
      "Element({a, b, c}, 2) 产生 b，即 {a, b, c} 的第二个元素。",
      "Element({{1, 3, 2}, {0, 3, -2}}, 2, 3) 产生 -2，即矩阵第二行的第三个元素。",
      "Element({{a, b, c}, {d, e, f}}, 2, 3) 产生 f，矩阵第二行的第三个元素。",
      "令 L = {{{1, 2}, {3, 4}}, {{5, 6}, {7, 8}}}。那么 Element(L, 1, 2, 1) 产生 3，Element(L, 2, 2) 产生 {7, 8}。"
    ],
    "tags": [
      "category:list",
      "category:vector-and-matrix",
      "capability:cas-supported"
    ]
  },
  {
    "command": "Eliminate",
    "localizedName": "消元",
    "syntax": "Eliminate( <多项式列表>, <变量列表> )",
    "syntaxEn": "Eliminate( <List of Polynomials>, <List of Variables> )",
    "description": "考虑由多项式定义的代数方程组，并在消除给定列表中的所有变量后计算等效系统。",
    "searchTextEn": "Eliminate 消元 Eliminate( <List of Polynomials>, Variables> )",
    "examples": [
      "Eliminate({x2 + x, y2 - x}, {x}) 产生 {stem:[ y{4} + y{2} ]}。"
    ],
    "tags": [
      "category:algebra",
      "capability:cas-supported"
    ]
  },
  {
    "command": "Ellipse",
    "localizedName": "椭圆",
    "syntax": "Ellipse( <焦点>, <焦点>, <主半轴长> ); Ellipse( <焦点>, <焦点>, <线段> ); Ellipse( <焦点>, <焦点>, <点> )",
    "syntaxEn": "Ellipse( <Focus>, <Focus>, <Semimajor Axis Length> ); Ellipse( <Focus>, <Focus>, <Segment> ); Ellipse( <Focus>, <Focus>, <Point> )",
    "description": "创建具有两个焦点和长半轴长度的椭圆，或者具有两个焦点（其中长半轴的长度等于给定线段的长度）的椭圆，或者具有两个穿过给定点的焦点的椭圆。",
    "searchTextEn": "Ellipse 椭圆 Ellipse( <Focus>, <Semimajor Axis Length> ); <Segment> <Point> )",
    "examples": [
      "创建具有两个焦点和半长轴长度的椭圆",
      "创建具有两个焦点的椭圆，其中长半轴的长度等于给定线段的长度",
      "创建一个椭圆，其中两个焦点穿过给定点"
    ],
    "tags": [
      "category:conic",
      "capability:create"
    ]
  },
  {
    "command": "Ends",
    "localizedName": "底面",
    "syntax": "Ends( <二次曲面> )",
    "syntaxEn": "Ends( <Quadric> )",
    "description": "创建有限二次曲面的顶部和底部。",
    "searchTextEn": "Ends 底面 Ends( <Quadric> )",
    "examples": [
      "Ends( cylinder ) 产生两个圆圈。",
      "Ends( cone ) 产生一个圆和圆锥末端（点）。"
    ],
    "tags": [
      "category:3d"
    ]
  },
  {
    "command": "Envelope",
    "localizedName": "包络",
    "syntax": "Envelope( <路径>, <点> )",
    "syntaxEn": "Envelope( <Path>, <Point> )",
    "description": "当移动点绑定到另一个对象时，创建一组输出路径的包络方程。包络线是一条在某个点与输出路径族的每个成员相切的曲线。",
    "searchTextEn": "Envelope 包络 Envelope( <Path>, <Point> )",
    "examples": [
      "一架梯子靠在墙上，正在往下滑。其轨迹的轮廓将是梯子的包络线。严格来说，GeoGebra 计算包含梯子作为一段的整条线的包络线。只有在适当的构造导致代数方程系统的情况下才能计算这样的包络。"
    ],
    "tags": [
      "category:geometry"
    ]
  },
  {
    "command": "Erlang",
    "localizedName": "爱尔朗分布",
    "syntax": "Erlang( <形状参数k>, <比率参数λ>, <变量值> ); Erlang( <形状参数k>, <比率参数λ>, <变量值>, <是否累积? true|false> ); Erlang( <形状参数k>, <比率参数λ>, x, <是否累积? true|false> )",
    "syntaxEn": "Erlang( <Shape>, <Rate>, <Variable Value> ); Erlang( <Shape>, <Rate>, <Variable Value>, <Boolean Cumulative> ); Erlang( <Shape>, <Rate>, x, <Boolean Cumulative> )",
    "description": "计算变量值 v 处的 Erlang 分布的累积分布函数值，即概率 P(X ≤ v)，其中 X 是具有由参数形状和速率定义的 Erlang 分布的随机变量。",
    "searchTextEn": "Erlang 爱尔朗分布 Erlang( <Shape>, <Rate>, <Variable Value> ); Value>, <Boolean Cumulative> x, )",
    "examples": [
      "返回给定值的概率，即给定 x 坐标左侧的 Erlang 分布曲线下的面积。",
      "如果 Cumulative = true，则计算给定变量值处具有给定形状和速率的 Erlang 分布的累积分布函数的值，否则计算变量值处分布的概率密度函数。",
      "如果 Cumulative = true，则创建具有给定形状和比率的 Erlang 分布的累积密度函数 (cdf)，否则创建分布的概率密度函数 (pdf)。"
    ],
    "tags": [
      "category:probability"
    ]
  },
  {
    "command": "Execute",
    "localizedName": "执行",
    "syntax": "Execute( <文本列表> ); Execute( <文本列表>, <参数>, <参数>, ... )",
    "syntaxEn": "Execute( <List of Text> ); Execute( <List of Text>, <Parameter>, <Parameter>, ... )",
    "description": "执行以文本形式输入的命令列表，并带有占位符的可选参数。",
    "searchTextEn": "Execute 执行 Execute( <List of Text> ); Text>, <Parameter>, ... )",
    "examples": [
      "创建点 A、B 及其中点 C",
      "创建斐波那契数列的前 10 个元素",
      "使用占位符创建线段 AB 及其中点"
    ],
    "tags": [
      "category:scripting",
      "capability:script",
      "capability:script-execution",
      "risk:script-execution",
      "risk:bulk-mutation"
    ]
  },
  {
    "command": "Expand",
    "localizedName": "展开",
    "syntax": "Expand( <代数式> )",
    "syntaxEn": "Expand( <Expression> )",
    "description": "扩展表达式。",
    "searchTextEn": "Expand 展开 Expand( <Expression> )",
    "examples": [
      "展开表达式 (2 x - 1)2 + 2 x + 3"
    ],
    "tags": [
      "category:algebra",
      "capability:cas-supported"
    ]
  },
  {
    "command": "Exponential",
    "localizedName": "指数分布",
    "syntax": "Exponential( <率参数λ>, <变量值> ); Exponential( <率参数λ>, <变量值>, <是否累积? true|false> ); Exponential( <率参数λ>, x, <是否累积? true|false> )",
    "syntaxEn": "Exponential( <Lambda>, <Variable Value> ); Exponential( <Lambda>, <Variable Value>, <Boolean Cumulative> ); Exponential( <Lambda>, x, <Boolean Cumulative> )",
    "description": "根据 lambda 参数和可选的累积标志，计算给定变量值处指数分布的累积分布函数 (cdf) 或概率密度函数 (pdf) 的值。",
    "searchTextEn": "Exponential 指数分布 Exponential( <Lambda>, <Variable Value> ); Value>, <Boolean Cumulative> x, )",
    "examples": [
      "计算特定值处的累积分布函数",
      "计算累积标志设置为 true 的累积分布函数",
      "计算累积标志设置为 false 的概率密度函数"
    ],
    "tags": [
      "category:probability",
      "capability:cas-supported"
    ]
  },
  {
    "command": "ExportImage",
    "localizedName": "导出图片",
    "syntax": "ExportImage( <属性>, <数值>, <属性>, <数值>, ... )",
    "syntaxEn": "ExportImage( <Property>, <Value>, <Property>, <Value>, ... )",
    "description": "导出当前活动视图（或“view”参数指定的视图）的图像",
    "searchTextEn": "ExportImage 导出图片 ExportImage( <Property>, <Value>, ... )",
    "examples": [
      "显示当前视图的弹出窗口，以便用户可以右键单击 -> 将图像另存为...",
      "保存当前视图的名为“image.png”的文件",
      "保存图形视图 2 的名为“image.png”的文件",
      "保存查看 3D 图形的名为“image.png”的文件",
      "以 300 dpi（每英寸点数）保存当前视图的名为“image.png”的文件",
      "以比例 2（即标称屏幕分辨率的两倍）保存当前视图的名为“image.png”的文件",
      "以 600 dpi、比例 1 单位 = 2 厘米保存当前视图的名为“image.png”的文件",
      "保存当前视图的名为“image.png”的文件，宽度 = 1000 像素",
      "保存当前视图的名为“image.png”的文件，高度 = 1000 像素",
      "保存名为“image.png”的透明 PNG 文件。将“透明”属性设置为 false 也会保存背景图像。",
      "以 SVG 格式保存当前视图的名为“image.svg”的文件",
      "保存当前视图的循环动画 GIF，由滑块“a”控制，帧间间隔 200 毫秒。保持滑块的宽度和数量较小",
      "保存由滑块“a”控制的当前视图的循环动画 GIF，帧之间间隔 200 毫秒，并在动画期间将视图旋转 360°。保持视图的大小和步数较小",
      "创建当前视图的 PDF（如果图形视图 2 打开，则创建 2 页 PDF）",
      "创建当前视图的多页 PDF，其中每一页对应于滑块“n”的一步",
      "创建视图 2 的 GeoGebra 图像并将其放置在视图中，位置由 A 和 B 定义"
    ],
    "tags": [
      "category:scripting",
      "capability:script",
      "capability:export",
      "risk:external-output",
      "risk:export"
    ]
  },
  {
    "command": "ExtendedGCD",
    "localizedName": "辗转相除法",
    "syntax": "ExtendedGCD( <自然数>, <自然数> ); ExtendedGCD( <多项式>, <多项式> )",
    "syntaxEn": "ExtendedGCD( <Integer>, <Integer> ); ExtendedGCD( <Polynomial>, <Polynomial> )",
    "description": "返回一个列表，其中包含 Bézout 恒等式的系数以及给定整数或多项式的最大公约数，使用扩展欧几里得算法计算得出。",
    "searchTextEn": "ExtendedGCD 辗转相除法 ExtendedGCD( <Integer>, <Integer> ); <Polynomial>, <Polynomial> )",
    "examples": [
      "ExtendedGCD 具有整数 240 和 46",
      "ExtendedGCD 具有多项式 x²-1 和 x+4"
    ],
    "tags": [
      "category:algebra",
      "capability:cas-supported"
    ]
  },
  {
    "command": "Extremum",
    "localizedName": "极值点",
    "syntax": "Extremum( <多项式> ); Extremum( <函数>, <x-起始值>, <x-终止值> ); Extremum( <函数> )",
    "syntaxEn": "Extremum( <Polynomial> ); Extremum( <Function>, <Start x-Value>, <End x-Value> ); Extremum( <Function> )",
    "description": "将多项式函数的所有局部极值作为函数图上的点生成，或计算（数值）开区间 ( <Start x-Value>, <End x-Value> ) 中函数的极值。",
    "searchTextEn": "Extremum 极值点 Extremum( <Polynomial> ); <Function>, <Start x-Value>, <End x-Value> <Function> )",
    "examples": [
      "为多项式创建局部极值",
      "计算特定区间内的极值",
      "连续可微函数局部极值的 CAS 语法",
      "假设范围并找到局部转折点"
    ],
    "tags": [
      "category:functions-and-calculus"
    ]
  },
  {
    "command": "Factor",
    "localizedName": "因式分解",
    "syntax": "Factor( <多项式> ); Factor( <数字> ); Factor( <代数式>, <变量> )",
    "syntaxEn": "Factor( <Polynomial> ); Factor( <Number> ); Factor( <Expression>, <Variable> )",
    "description": "对多项式进行因式分解。",
    "searchTextEn": "Factor 因式分解 Factor( <Polynomial> ); <Number> <Expression>, <Variable> )",
    "examples": [
      "对多项式进行因式分解",
      "将一个数分解为质因数",
      "关于变量 x 的表达式因式分解",
      "对变量 y 的表达式进行因式分解"
    ],
    "tags": [
      "category:algebra",
      "category:functions-and-calculus",
      "capability:cas-supported"
    ]
  },
  {
    "command": "Factors",
    "localizedName": "因式",
    "syntax": "Factors( <多项式> ); Factors( <数字> )",
    "syntaxEn": "Factors( <Polynomial> ); Factors( <Number> )",
    "description": "给出多项式的 {factor, exponent} 类型的列表列表或带有数字指数的质因数矩阵，表示因式分解。",
    "searchTextEn": "Factors 因式 Factors( <Polynomial> ); <Number> )",
    "examples": [
      "对多项式进行因式分解",
      "分解一个数字",
      "用多个质因数对一个数进行因式分解",
      "在 CAS 视图中对具有未定义变量的多项式进行因式分解"
    ],
    "tags": [
      "category:algebra",
      "category:functions-and-calculus",
      "capability:cas-supported"
    ]
  },
  {
    "command": "FDistribution",
    "localizedName": "F分布",
    "syntax": "FDistribution( <分子自由度>, <分母自由度>, <变量值> ); FDistribution( <分子自由度>, <分母自由度>, <变量值>, <是否累积? true|false> ); FDistribution( <分子自由度>, <分母自由度>, x, <是否累积? true|false> )",
    "syntaxEn": "FDistribution( <Numerator Degrees of Freedom>, <Denominator Degrees of Freedom>, <Variable Value> ); FDistribution( <Numerator Degrees of Freedom>, <Denominator Degrees of Freedom>, <Variable Value>, <Boolean Cumulative> ); FDistribution( <Numerator Degrees of Freedom>, <Denominator Degrees of Freedom>, x, <Boolean Cumulative> )",
    "description": "根据布尔累积参数的存在和值，计算给定变量值处 F 分布的累积分布函数 (CDF) 或概率密度函数 (PDF) 的值。",
    "searchTextEn": "FDistribution F分布 FDistribution( <Numerator Degrees of Freedom>, <Denominator <Variable Value> ); Value>, <Boolean Cumulative> x, )",
    "examples": [
      "计算变量值 v 处 F 分布的累积分布函数值，即概率 P(X≤v)，其中 X 是具有给定分子和分母自由度的 F 分布的随机变量。",
      "如果 Cumulative = true，则计算给定变量值处具有给定分子和分母自由度的 F 分布的累积分布函数值，否则计算变量值处 F 分布的概率密度函数。",
      "如果 Cumulative = true，则创建具有给定分子和分母自由度的 F 分布的累积密度函数 (cdf)，否则创建分布的概率密度函数 (pdf)。"
    ],
    "tags": [
      "category:probability",
      "capability:cas-supported"
    ]
  },
  {
    "command": "FillCells",
    "localizedName": "填充单元格",
    "syntax": "FillCells( <单元格区域>, <对象> ); FillCells( <单元格>, <列表> ); FillCells( <单元格>, <矩阵> )",
    "syntaxEn": "FillCells( <CellRange>, <Object> ); FillCells( <Cell>, <List> ); FillCells( <Cell>, <Matrix> )",
    "description": "将对象的值/方程等复制到给定的单元格范围。生成的单元格是自由对象，即独立于对象。",
    "searchTextEn": "FillCells 填充单元格 FillCells( <CellRange>, <Object> ); <Cell>, <List> <Matrix> )",
    "examples": [
      "将对象的值/方程等复制到给定的单元格范围。生成的单元格是自由对象，即独立于对象。",
      "将列表中的值复制到给定单元格右侧的第一个单元格。生成的单元格是自由对象，即独立于列表。",
      "将值从矩阵复制到电子表格中。矩阵的左上角与给定的单元格匹配。得到的细胞是自由物体，即独立于矩阵。"
    ],
    "tags": [
      "category:spreadsheet",
      "risk:bulk-mutation"
    ]
  },
  {
    "command": "FillColumn",
    "localizedName": "填充列",
    "syntax": "FillColumn( <列序>, <列表> )",
    "syntaxEn": "FillColumn( <Column>, <List> )",
    "description": "将列表中的值复制到数字指定的列的第一个单元格（1 代表 A，2 代表 B，等等）。生成的单元格是自由对象，即独立于列表。",
    "searchTextEn": "FillColumn 填充列 FillColumn( <Column>, <List> )",
    "examples": [
      "FillColumn( <Column>, <List> )：将列表中的值复制到数字指定的列的第一个单元格（1 表示 A，2 表示 B 等）。生成的单元格是自由对象，即独立于列表。"
    ],
    "tags": [
      "category:spreadsheet",
      "risk:bulk-mutation"
    ]
  },
  {
    "command": "FillRow",
    "localizedName": "填充行",
    "syntax": "FillRow( <行序>, <列表> )",
    "syntaxEn": "FillRow( <Row>, <List> )",
    "description": "将列表中的值复制到数字给定的行的第一个单元格。生成的单元格是自由对象，即独立于列表。",
    "searchTextEn": "FillRow 填充行 FillRow( <Row>, <List> )",
    "examples": [],
    "tags": [
      "category:spreadsheet",
      "risk:bulk-mutation"
    ]
  },
  {
    "command": "First",
    "localizedName": "最前元素",
    "syntax": "First( <列表> ); First( <文本> ); First( <列表>, <最前元素数量> ); First( <文本>, <最前元素数量> ); First( <轨迹>, <最前元素数量> )",
    "syntaxEn": "First( <List> ); First( <Text> ); First( <List>, <Number of Elements> ); First( <Text>, <Number of Elements> ); First( <Locus>, <Number of Elements> )",
    "description": "给出一个新列表，其中包含给定列表、文本或轨迹的第一个元素，可以选择指定要提取的元素数量。",
    "searchTextEn": "First 最前元素 First( <List> ); <Text> <List>, <Number of Elements> <Text>, <Locus>, )",
    "examples": [
      "获取列表的第一个元素",
      "获取列表的前 n 个元素",
      "获取文本的第一个字符",
      "获取文本的前n个字符"
    ],
    "tags": [
      "category:list",
      "category:text",
      "capability:cas-supported"
    ]
  },
  {
    "command": "Fit",
    "localizedName": "拟合曲线",
    "syntax": "Fit( <点列>, <函数列表> ); Fit( <点列>, <函数> )",
    "syntaxEn": "Fit( <List of Points>, <List of Functions> ); Fit( <List of Points>, <Function> )",
    "description": "返回最适合列表中点的函数的线性组合，或返回一个函数，该函数对于具有滑块的指定模型，以最小平方误差拟合点。",
    "searchTextEn": "Fit 拟合曲线 Fit( <List of Points>, Functions> ); <Function> )",
    "examples": [
      "用函数 x^2 和 x 拟合点",
      "使用滑块用模型函数 a + x^2 拟合点"
    ],
    "tags": [
      "category:statistics"
    ]
  },
  {
    "command": "FitExp",
    "localizedName": "指数拟合",
    "syntax": "FitExp( <点列> )",
    "syntaxEn": "FitExp( <List of Points> )",
    "description": "计算 aℯbx 形式的指数回归曲线。",
    "searchTextEn": "FitExp 指数拟合 FitExp( <List of Points> )",
    "examples": [
      "将指数回归拟合到点列表"
    ],
    "tags": [
      "category:statistics",
      "capability:cas-supported"
    ]
  },
  {
    "command": "FitGrowth",
    "localizedName": "生长曲线拟合",
    "syntax": "FitGrowth( <点列> )",
    "syntaxEn": "FitGrowth( <List of Points> )",
    "description": "计算列表中点的 a·b^x 形式的函数。 （与 FitExp[ <List of Points> ] 非常相似，只是形式略有不同）。",
    "searchTextEn": "FitGrowth 生长曲线拟合 FitGrowth( <List of Points> )",
    "examples": [
      "将增长函数拟合到点"
    ],
    "tags": [
      "category:statistics"
    ]
  },
  {
    "command": "FitImplicit",
    "localizedName": "隐函数拟合",
    "syntax": "FitImplicit( <点列>, <次数> )",
    "syntaxEn": "FitImplicit( <List of Points>, <Order> )",
    "description": "尝试通过这些点找到 n ≥ 2 阶的最佳拟合隐式曲线。您至少需要 stem:[\\frac{n(n+3)}2] 点。",
    "searchTextEn": "FitImplicit 隐函数拟合 FitImplicit( <List of Points>, <Order> )",
    "examples": [],
    "tags": [
      "category:statistics"
    ]
  },
  {
    "command": "FitLine",
    "localizedName": "拟合直线Y",
    "syntax": "FitLine( <点列> )",
    "syntaxEn": "FitLine( <List of Points> )",
    "description": "拟合直线Y",
    "searchTextEn": "FitLine FitLineY 拟合直线Y FitLine( <List of Points> )",
    "examples": [],
    "tags": [
      "category:statistics"
    ]
  },
  {
    "command": "FitLineX",
    "localizedName": "拟合直线X",
    "syntax": "FitLineX( <点列> )",
    "syntaxEn": "FitLineX( <List of Points> )",
    "description": "计算点的 x on y 回归线。",
    "searchTextEn": "FitLineX 拟合直线X FitLineX( <List of Points> )",
    "examples": [
      "FitLineX 带有点列表",
      "CAS FitLineX 的语法示例"
    ],
    "tags": [
      "category:statistics"
    ]
  },
  {
    "command": "FitLog",
    "localizedName": "对数拟合",
    "syntax": "FitLog( <点列> )",
    "syntaxEn": "FitLog( <List of Points> )",
    "description": "计算对数回归曲线。",
    "searchTextEn": "FitLog 对数拟合 FitLog( <List of Points> )",
    "examples": [
      "FitLog({(ℯ, 1), (ℯ², 4)}) 产生 -2 + 3 ln(x)",
      "FitLog({(ℯ, 1), (ℯ², 4)}) 产生 3 ln(x) - 2"
    ],
    "tags": [
      "category:statistics",
      "capability:cas-supported"
    ]
  },
  {
    "command": "FitLogistic",
    "localizedName": "逻辑斯蒂曲线拟合",
    "syntax": "FitLogistic( <点列> )",
    "syntaxEn": "FitLogistic( <List of Points> )",
    "description": "以stem:[\\frac{a}{1+b e{-kx}}] 的形式计算回归曲线。",
    "searchTextEn": "FitLogistic 逻辑斯蒂曲线拟合 FitLogistic( <List of Points> )",
    "examples": [
      "将逻辑回归拟合到给定点"
    ],
    "tags": [
      "category:statistics"
    ]
  },
  {
    "command": "FitPoly",
    "localizedName": "多项式拟合",
    "syntax": "FitPoly( <点列>, <多项式次数> ); FitPoly( <手绘函数>, <多项式次数> )",
    "syntaxEn": "FitPoly( <List of Points>, <Degree of Polynomial> ); FitPoly( <Freehand Function>, <Degree of Polynomial> )",
    "description": "计算拟合指定点的给定次数的多项式回归模型。",
    "searchTextEn": "FitPoly 多项式拟合 FitPoly( <List of Points>, <Degree Polynomial> ); <Freehand Function>, )",
    "examples": [
      "将 3 次多项式拟合到点 {(-1, -1), (0, 1), (1, 1), (2, 5)}"
    ],
    "tags": [
      "category:statistics",
      "capability:cas-supported"
    ]
  },
  {
    "command": "FitPow",
    "localizedName": "幂函数拟合",
    "syntax": "FitPow( <点列> )",
    "syntaxEn": "FitPow( <List of Points> )",
    "description": "计算 a x^b 形式的回归曲线。",
    "searchTextEn": "FitPow 幂函数拟合 FitPow( <List of Points> )",
    "examples": [
      "FitPow({(1, 1), (3, 2), (7, 4)}) 创建回归曲线 f(x) = 0.97 x^0.71。",
      "FitPow({(1, 1), (3, 2), (7, 4)}) 产生 0.97 x^0.71。"
    ],
    "tags": [
      "category:statistics",
      "capability:cas-supported"
    ]
  },
  {
    "command": "FitSin",
    "localizedName": "正弦拟合",
    "syntax": "FitSin( <点列> )",
    "syntaxEn": "FitSin( <List of Points> )",
    "description": "计算 a + b sin (c x + d) 形式的回归曲线。",
    "searchTextEn": "FitSin 正弦拟合 FitSin( <List of Points> )",
    "examples": [
      "将正弦曲线拟合到一组点"
    ],
    "tags": [
      "category:statistics",
      "capability:cas-supported"
    ]
  },
  {
    "command": "Flatten",
    "localizedName": "扁平列表",
    "syntax": "Flatten( <列表> )",
    "syntaxEn": "Flatten( <List> )",
    "description": "将列表扁平化为一个列表。",
    "searchTextEn": "Flatten 扁平列表 Flatten( <List> )",
    "examples": [
      "Flatten({2, 3, {5, 1}, {{2, 1, {3}}}}) 产生 list1 = {2, 3, 5, 1, 2, 1, 3}。"
    ],
    "tags": [
      "category:list"
    ]
  },
  {
    "command": "Focus",
    "localizedName": "焦点",
    "syntax": "Focus( <圆锥曲线> )",
    "syntaxEn": "Focus( <Conic> )",
    "description": "Yields (all) 圆锥曲线的焦点。",
    "searchTextEn": "Focus 焦点 Focus( <Conic> )",
    "examples": [
      "Focus(4x2 - y2 + 16x + 20 = 0) 返回给定双曲线的两个焦点：A=(-2, -2.24) 和 B=(-2, 2.24)。"
    ],
    "tags": [
      "category:conic"
    ]
  },
  {
    "command": "FormulaText",
    "localizedName": "公式文本",
    "syntax": "FormulaText( <对象> ); FormulaText( <对象>, <是否替换变量? true|false> ); FormulaText( <对象>, <是否替换变量? true|false>, <是否显示名称? true|false> )",
    "syntaxEn": "FormulaText( <Object> ); FormulaText( <Object>, <Boolean for Substitution of Variables> ); FormulaText( <Object>, <Boolean for Substitution of Variables>, <Boolean Show Name> )",
    "description": "公式文本",
    "searchTextEn": "FormulaText LaTeX 公式文本 FormulaText( <Object> ); <Object>, <Boolean for Substitution of Variables> Variables>, Show Name> )",
    "examples": [],
    "tags": [
      "category:text"
    ]
  },
  {
    "command": "FractionText",
    "localizedName": "分数文本",
    "syntax": "FractionText( <数字> ); FractionText( <点> ); FractionText( <数字>, <布尔简分数> )",
    "syntaxEn": "FractionText( <Number> ); FractionText( <Point> ); FractionText( <Number>, <Boolean Single fraction> )",
    "description": "在图形视图中创建并显示包含给定数字或点坐标的分数形式的 LaTeX 文本。对于带有布尔参数的数字，它控制分数显示中负号的位置。",
    "searchTextEn": "FractionText 分数文本 FractionText( <Number> ); <Point> <Number>, <Boolean Single fraction> )",
    "examples": [
      "给定行 a：y = 1.5 x + 2，FractionText(Slope(a)) 创建 LaTeX 文本主干：[\\frac{3}{2}]。",
      "给定点 A=(1.33,0.8)，FractionText(A) 创建 LaTeX 文本主干：[ \\left( \\frac{133}{100},\\frac{4}{5} \\right) ]。",
      "给定数字 n = -0.8，FractionText(n, true) 创建 LaTeX 文本主干：[\\frac{- 4}{5}]。",
      "给定数字 n = -0.8，FractionText(n, false) 创建 LaTeX 文本主干：[-\\frac{4}{5}]。"
    ],
    "tags": [
      "category:text"
    ]
  },
  {
    "command": "Frequency",
    "localizedName": "频数列表",
    "syntax": "Frequency( <原始数据列表> ); Frequency( <是否累积? true|false>, <原始数据列表> ); Frequency( <组界列表>, <原始数据列表> ); Frequency( <文本列表>, <文本列表> ); Frequency( <是否累积? true|false>, <组界列表>, <原始数据列表> ); Frequency( <组界列表>, <原始数据列表>, <是否应用密度>, <密度缩放因子(可选)> ); Frequency( <是否累积? true|false>, <组界列表>, <原始数据列表>, <是否应用密度>, <密度缩放因子(可选)> )",
    "syntaxEn": "Frequency( <List of Raw Data> ); Frequency( <Boolean Cumulative>, <List of Raw Data> ); Frequency( <List of Class Boundaries>, <List of Raw Data> ); Frequency( <List of Text>, <List of Text> ); Frequency( <Boolean Cumulative>, <List of Class Boundaries>, <List of Raw Data> ); Frequency( <List of Class Boundaries>, <List of Raw Data>, <Use Density>, <Density Scale Factor (optional)> ); Frequency( <Boolean Cumulative>, <List of Class Boundaries>, <List of Raw Data>, <Use Density>, <Density Scale Factor (optional)> )",
    "description": "返回一个列表，其中包含给定数据列表中每个唯一值的出现次数。该输入列表可以是数字或文本。该列表按唯一值的升序排序。要获取相应唯一值的列表，请使用 Unique 命令。",
    "searchTextEn": "Frequency 频数列表 Frequency( <List of Raw Data> ); <Boolean Cumulative>, Class Boundaries>, Text>, Text> Data>, <Use Density>, <Density Scale Factor (optional)> )",
    "examples": [
      "输入 list1 = { \"a\", \"a\", \"x\", \"x\", \"x\", \"b\" }。 Frequency(list1) 返回列表 { 2, 1, 3 }。 Unique(list1) 返回列表 { \"a\", \"b\", \"x\" }。",
      "输入 list1 = { 0, 0, 0, 1, 1, 2 }。 Frequency(true, list1) 返回列表 { 3, 5, 6 }。 Frequency(false, list1) 返回列表 { 3, 2, 1}。 Unique(list1) 返回列表 { 0, 1, 2 }。",
      "Frequency({1, 2, 3}, {1, 1, 2, 3}) 返回列表 { 2, 2 }。",
      "令 list1 = {\"a\", \"b\", \"b\", \"c\", \"c\", \"c\", \"c\"} 且 list2 = {\"a\", \"b\", \"a\", \"a\", \"c\", \"c\", \"d\"}。然后 Frequency(list1, list2) 返回矩阵主干：[\\begin{pmatrix} 1 & 0 & 0 & 0\\\\ 1 &1 & 0 &0 \\\\ 1 & 0 & 2 & 1 \\\\ \\end{pmatrix}]",
      "令 data = {1, 2, 2, 2, 3, 3, 4, 4, 4, 4} 为原始数据列表，classes={0, 2, 5} 为类边界列表。那么 Frequency(classes, data, false) 和 Frequency(classes, data) 都返回列表 {1, 9}，而 Frequency(classes, data, true) 返回列表 {0.5, 3}。"
    ],
    "tags": [
      "category:list",
      "category:statistics"
    ]
  },
  {
    "command": "FrequencyPolygon",
    "localizedName": "频数多边形",
    "syntax": "FrequencyPolygon( <组界列表>, <高度列表> ); FrequencyPolygon( <组界列表>, <原始数据列表>, <是否应用密度? true|false>, <密度缩放因子(可选)> ); FrequencyPolygon( <是否累积? true|false>, <组界列表>, <原始数据列表>, <是否应用密度? true|false>, <密度缩放因子(可选)> )",
    "syntaxEn": "FrequencyPolygon( <List of Class Boundaries>, <List of Heights> ); FrequencyPolygon( <List of Class Boundaries>, <List of Raw Data>, <Boolean Use Density>, <Density Scale Factor (optional)> ); FrequencyPolygon( <Boolean Cumulative>, <List of Class Boundaries>, <List of Raw Data>, <Boolean Use Density>, <Density Scale Factor (optional)> )",
    "description": "创建频数多边形、通过连接直方图条形中点或基于类边界和高度/原始数据绘制的线图，以及密度和累积计算选项。",
    "searchTextEn": "FrequencyPolygon 频数多边形 FrequencyPolygon( <List of Class Boundaries>, Heights> ); Raw Data>, <Boolean Use Density>, <Density Scale Factor (optional)> Cumulative>, )",
    "examples": [
      "使用类边界创建顶点在给定高度的频率多边形。",
      "使用原始数据和默认密度设置（使用密度 = true，密度比例因子 = 1）创建频率多边形。",
      "如果 Cumulative 为 true，则根据原始数据和可选密度设置创建累积频数多边形。"
    ],
    "tags": [
      "category:chart",
      "category:statistics"
    ]
  },
  {
    "command": "FrequencyTable",
    "localizedName": "频数表",
    "syntax": "FrequencyTable( <原始数据列表>, <缩放因子(可选)> ); FrequencyTable( <是否累积? true|false>, <原始数据列表> ); FrequencyTable( <组界列表>, <原始数据列表> ); FrequencyTable( <是否累积? true|false>, <组界列表>, <原始数据列表> ); FrequencyTable( <组界列表>, <原始数据列表>, <是否应用密度>, <密度缩放因子(可选)> ); FrequencyTable( <是否累积? true|false>, <组界列表>, <原始数据列表>, <是否应用密度>, <密度缩放因子(可选)> )",
    "syntaxEn": "FrequencyTable( <List of Raw Data>, <Scale Factor (optional)> ); FrequencyTable( <Boolean Cumulative>, <List of Raw Data> ); FrequencyTable( <List of Class Boundaries>, <List of Raw Data> ); FrequencyTable( <Boolean Cumulative>, <List of Class Boundaries>, <List of Raw Data> ); FrequencyTable( <List of Class Boundaries>, <List of Raw Data>, <Use Density>, <Density Scale Factor (optional)> ); FrequencyTable( <Boolean Cumulative>, <List of Class Boundaries>, <List of Raw Data>, <Use Density>, <Density Scale Factor (optional)> )",
    "description": "返回包含频率数据的表格（作为文本）。多个重载处理不同的输入组合：基本频率计数、累积频率、类间隔、密度计算和缩放因子。支持数字和文本数据。",
    "searchTextEn": "FrequencyTable 频数表 FrequencyTable( <List of Raw Data>, <Scale Factor (optional)> ); <Boolean Cumulative>, Data> Class Boundaries>, <Use Density>, <Density Scale )",
    "examples": [
      "带有文本数据比例因子的频率表",
      "具有数字数据比例因子的频率表"
    ],
    "tags": [
      "category:chart",
      "category:statistics",
      "category:text"
    ]
  },
  {
    "command": "FromBase",
    "localizedName": "转换为十进制",
    "syntax": "FromBase( <指定进制型数字>, <进制(基数) 2~36> )",
    "syntaxEn": "FromBase( <Number as Text>, <Base> )",
    "description": "将给定数字从给定基数 (https://en.wikipedia.org/wiki/Radix) 转换为十进制基数。基数必须介于 2 到 36 之间。数字必须是整数。",
    "searchTextEn": "FromBase 转换为十进制 FromBase( <Number as Text>, <Base> )",
    "examples": [
      "将十六进制 FF 转换为十进制",
      "将二进制 100000000 转换为十进制"
    ],
    "tags": [
      "category:algebra"
    ]
  },
  {
    "command": "Function",
    "localizedName": "函数",
    "syntax": "Function( <函数>, <x-起始值>, <x-终止值> ); Function( <数字列表> ); Function( <代数式>, <参变量1>, <起始值>, <终止值>, <参变量2>, <起始值>, <终止值> )",
    "syntaxEn": "Function( <Function>, <Start x-Value>, <End x-Value> ); Function( <List of Numbers> ); Function( <Expression>, <Parameter Variable 1>, <Start Value>, <End Value>, <Parameter Variable 2>, <Start Value>, <End Value> )",
    "description": "根据输入格式生成函数或限制函数的可视化： 1) 从数字列表创建分段函数，其中前两个是 x 范围，其余是 y 值； 2）将二维函数可视化限制在一个区间内； 3) 限制二变量函数的 3D 表面可视化。",
    "searchTextEn": "Function 函数 Function( <Function>, <Start x-Value>, <End x-Value> ); <List of Numbers> <Expression>, <Parameter Variable 1>, Value>, 2>, Value> )",
    "examples": [
      "在 x = 2 和 x = 4 之间创建三角波",
      "在 x = -3 和 x = 3 之间创建斜率 = 1 的线性方程",
      "将 y = x + 2 的可视化限制为区间 [1, 2]",
      "为函数 b(u,v)=u 创建 3D 曲面，限制为 [0,3] 中的 u 和 [0,2] 中的 v"
    ],
    "tags": [
      "category:3d",
      "category:functions-and-calculus"
    ]
  },
  {
    "command": "FutureValue",
    "localizedName": "未来值",
    "syntax": "FutureValue( <利率>, <期数>, <每期付款额>, <现值(可选)>, <类型(可选) 1-期初|0-期末> )",
    "syntaxEn": "FutureValue( <Rate>, <Number of Periods>, <Payment>, <Present Value (optional)>, <Type (optional)> )",
    "description": "返回基于定期、恒定付款和恒定利率的投资的未来价值。",
    "searchTextEn": "FutureValue 未来值 FutureValue( <Rate>, <Number of Periods>, <Payment>, <Present Value (optional)>, <Type (optional)> )",
    "examples": [
      "指定所有参数的计算示例"
    ],
    "tags": [
      "category:financial"
    ]
  },
  {
    "command": "Gamma",
    "localizedName": "伽玛分布",
    "syntax": "Gamma( <形状参数α>, <尺度参数β>, <变量值> ); Gamma( <形状参数α>, <尺度参数β>, <变量值>, <是否累积? true|false> ); Gamma( <形状参数α>, <尺度参数β>, x, <是否累积? true|false> )",
    "syntaxEn": "Gamma( <Alpha>, <Beta>, <Variable Value> ); Gamma( <Alpha>, <Beta>, <Variable Value>, <Boolean Cumulative> ); Gamma( <Alpha>, <Beta>, x, <Boolean Cumulative> )",
    "description": "根据参数 alpha 和 beta 以及可选的累积标志，计算给定变量值处 Gamma 分布的累积分布函数 (cdf) 或概率密度函数 (pdf) 的值。",
    "searchTextEn": "Gamma 伽玛分布 Gamma( <Alpha>, <Beta>, <Variable Value> ); Value>, <Boolean Cumulative> x, )",
    "examples": [
      "计算变量值 v 处的伽马分布的累积分布函数 (cdf)，即概率 P(X ≤ v)。",
      "如果 Cumulative = true，则计算 cdf；否则，计算给定变量值处的 Gamma 分布的 pdf。",
      "如果 Cumulative = true，则创建 cdf；否则，创建 Gamma 分布的 pdf。"
    ],
    "tags": [
      "category:probability",
      "capability:cas-supported"
    ]
  },
  {
    "command": "GCD",
    "localizedName": "最大公约数",
    "syntax": "GCD( <数字列表> ); GCD( <数字>, <数字> ); GCD( <多项式列表> ); GCD( <多项式>, <多项式> )",
    "syntaxEn": "GCD( <List of Numbers> ); GCD( <Number>, <Number> ); GCD( <List of Polynomials> ); GCD( <Polynomial>, <Polynomial> )",
    "description": "计算数字或多项式的最大公约数。在CAS视图中，它支持多项式。",
    "searchTextEn": "GCD 最大公约数 GCD( <List of Numbers> ); <Number>, <Number> Polynomials> <Polynomial>, <Polynomial> )",
    "examples": [
      "计算两个数的 GCD",
      "计算数字列表的 GCD",
      "在CAS视图中计算两个多项式的GCD",
      "计算 CAS 中多项式列表的 GCD 查看"
    ],
    "tags": [
      "category:algebra",
      "capability:cas-supported"
    ]
  },
  {
    "command": "GeometricMean",
    "localizedName": "几何平均数",
    "syntax": "GeometricMean( <数字列表> )",
    "syntaxEn": "GeometricMean( <List of Numbers> )",
    "description": "返回给定数字列表的几何平均值 (https://en.wikipedia.org/wiki/Geometric_mean)。",
    "searchTextEn": "GeometricMean 几何平均数 GeometricMean( <List of Numbers> )",
    "examples": [
      "GeometricMean({13, 7, 26, 5, 19}) 的收益率为 11.76。"
    ],
    "tags": [
      "category:algebra",
      "category:statistics"
    ]
  },
  {
    "command": "GetTime",
    "localizedName": "系统时间",
    "syntax": "GetTime(); GetTime( <格式> )",
    "syntaxEn": "GetTime(); GetTime( <Format> )",
    "description": "以各种格式返回当前时间和日期。如果没有参数，它会返回一个包含详细组件的列表。使用格式字符串，它会根据 PHP 日期格式字符创建格式化文本。",
    "searchTextEn": "GetTime 系统时间 GetTime(); GetTime( <Format> )",
    "examples": [
      "按顺序返回包含当前时间和日期的列表：毫秒、秒、分钟、小时 (0-23)、日期、月份 (1-12)、年、月（作为文本）、日（作为文本）、日（1 = 星期日、2 = 星期一等）",
      "使用 Format 作为模板创建文本，替换以反斜杠为前缀的 PHP 日期格式字符"
    ],
    "tags": [
      "category:scripting",
      "capability:query",
      "capability:script"
    ]
  },
  {
    "command": "GroebnerDegRevLex",
    "localizedName": "分次反字典序Groebner基",
    "syntax": "GroebnerDegRevLex( <多项式列表> ); GroebnerDegRevLex( <多项式列表>, <变量列表> )",
    "syntaxEn": "GroebnerDegRevLex( <List of Polynomials> ); GroebnerDegRevLex( <List of Polynomials>, <List of Variables> )",
    "description": "相对于变量的分级反向字典顺序（也称为总度反向字典顺序、degrevlex 或 grevlex 排序）计算多项式列表的 Gröbner 基。",
    "searchTextEn": "GroebnerDegRevLex 分次反字典序Groebner基 GroebnerDegRevLex( <List of Polynomials> ); Polynomials>, Variables> )",
    "examples": [
      "计算给定多项式的 Gröbner 基",
      "计算具有指定变量阶数的 Gröbner 基"
    ],
    "tags": [
      "category:algebra",
      "capability:cas-supported"
    ]
  },
  {
    "command": "GroebnerLex",
    "localizedName": "字典序Groebner基",
    "syntax": "GroebnerLex( <多项式列表> ); GroebnerLex( <多项式列表>, <变量列表> )",
    "syntaxEn": "GroebnerLex( <List of Polynomials> ); GroebnerLex( <List of Polynomials>, <List of Variables> )",
    "description": "根据变量的字典顺序（也称为 lex、plex 或纯字典顺序）计算多项式列表的 Gröbner 基。",
    "searchTextEn": "GroebnerLex 字典序Groebner基 GroebnerLex( <List of Polynomials> ); Polynomials>, Variables> )",
    "examples": [
      "根据变量的字典顺序计算多项式列表的 Gröbner 基",
      "根据给定变量的字典顺序计算多项式列表的 Gröbner 基"
    ],
    "tags": [
      "category:algebra",
      "capability:cas-supported"
    ]
  },
  {
    "command": "GroebnerLexDeg",
    "localizedName": "分次字典序Groebner基",
    "syntax": "GroebnerLexDeg( <多项式列表> ); GroebnerLexDeg( <多项式列表>, <变量列表> )",
    "syntaxEn": "GroebnerLexDeg( <List of Polynomials> ); GroebnerLexDeg( <List of Polynomials>, <List of Variables> )",
    "description": "根据变量的分级词典顺序（也称为 grlex、tdeg、lexdeg、总度词典顺序或消除顺序）计算多项式列表的 Gröbner 基。",
    "searchTextEn": "GroebnerLexDeg 分次字典序Groebner基 GroebnerLexDeg( <List of Polynomials> ); Polynomials>, Variables> )",
    "examples": [
      "计算多项式列表的 Gröbner 基",
      "计算具有指定变量的多项式列表的 Gröbner 基"
    ],
    "tags": [
      "category:algebra",
      "capability:cas-supported"
    ]
  },
  {
    "command": "HarmonicMean",
    "localizedName": "调和平均数",
    "syntax": "HarmonicMean( <数字列表> )",
    "syntaxEn": "HarmonicMean( <List of Numbers> )",
    "description": "返回给定数字列表的调和平均值 (https://en.wikipedia.org/wiki/Harmonic_mean)。",
    "searchTextEn": "HarmonicMean 调和平均数 HarmonicMean( <List of Numbers> )",
    "examples": [
      "HarmonicMean({13, 7, 26, 5, 19}) 的收益率为 9.79。"
    ],
    "tags": [
      "category:algebra",
      "category:statistics"
    ]
  },
  {
    "command": "Height",
    "localizedName": "高度",
    "syntax": "Height( <立体图形> )",
    "syntaxEn": "Height( <Solid> )",
    "description": "计算给定实体的“定向”高度。",
    "searchTextEn": "Height 高度 Height( <Solid> )",
    "examples": [
      "Height( <Cone> ) 计算给定圆锥体的“定向”高度。",
      "Height( <Cylinder> ) 计算给定圆柱体的“定向”高度。",
      "Height( <Polyhedron> ) 计算给定实心多面体的“定向”高度。"
    ],
    "tags": [
      "category:3d",
      "capability:measure"
    ]
  },
  {
    "command": "HideLayer",
    "localizedName": "隐藏图层",
    "syntax": "HideLayer( <数字> )",
    "syntaxEn": "HideLayer( <Number> )",
    "description": "使给定图层中的所有对象不可见。不覆盖条件可见性。",
    "searchTextEn": "HideLayer 隐藏图层 HideLayer( <Number> )",
    "examples": [],
    "tags": [
      "category:scripting",
      "capability:visibility",
      "capability:layer",
      "capability:script",
      "risk:bulk-mutation"
    ]
  },
  {
    "command": "Histogram",
    "localizedName": "直方图",
    "syntax": "Histogram( <组界列表>, <高度列表> ); Histogram( <组界列表>, <原始数据列表>, <是否应用密度>, <密度缩放因子(可选)> ); Histogram( <是否累积? true|false>, <组界列表>, <原始数据列表>, <是否应用密度>, <密度缩放因子(可选)> )",
    "syntaxEn": "Histogram( <List of Class Boundaries>, <List of Heights> ); Histogram( <List of Class Boundaries>, <List of Raw Data>, <Use Density>, <Density Scale Factor (optional)> ); Histogram( <Boolean Cumulative>, <List of Class Boundaries>, <List of Raw Data>, <Use Density>, <Density Scale Factor (optional)> )",
    "description": "使用给定高度的条形或使用原始数据创建直方图，并提供密度缩放和累积频率选项。",
    "searchTextEn": "Histogram 直方图 Histogram( <List of Class Boundaries>, Heights> ); Raw Data>, <Use Density>, <Density Scale Factor (optional)> <Boolean Cumulative>, )",
    "examples": [
      "创建包含 5 个给定高度的条形的直方图",
      "具有密度缩放的默认直方图",
      "不进行密度缩放的计数直方图",
      "相对频率直方图",
      "总面积 = 1 的归一化直方图",
      "具有密度缩放的累积直方图"
    ],
    "tags": [
      "category:chart"
    ]
  },
  {
    "command": "HistogramRight",
    "localizedName": "直方图右和",
    "syntax": "HistogramRight( <组界列表>, <高度列表> ); HistogramRight( <组界列表>, <原始数据列表>, <是否应用密度>, <密度缩放因子(可选)> ); HistogramRight( <是否累积? true|false>, <组界列表>, <原始数据列表>, <是否应用密度>, <密度缩放因子(可选)> )",
    "syntaxEn": "HistogramRight( <List of Class Boundaries>, <List of Heights> ); HistogramRight( <List of Class Boundaries>, <List of Raw Data>, <Use Density>, <Density Scale Factor (optional)> ); HistogramRight( <Boolean Cumulative>, <List of Class Boundaries>, <List of Raw Data>, <Use Density>, <Density Scale Factor (optional)> )",
    "description": "与直方图命令相同，但如果数据等于某个类的右边界，则将其计入该类，而不计入下一类。对每个类别使用 a < x ≤ b 规则，但第一个类别 (a ≤ x ≤ b) 除外。",
    "searchTextEn": "HistogramRight 直方图右和 HistogramRight( <List of Class Boundaries>, Heights> ); Raw Data>, <Use Density>, <Density Scale Factor (optional)> <Boolean Cumulative>, )",
    "examples": [
      "HistogramRight 具有班级边界和高度",
      "HistogramRight 具有类边界、原始数据、使用密度和可选的密度比例因子",
      "HistogramRight 具有累积布尔值、类边界、原始数据、使用密度和可选密度比例因子"
    ],
    "tags": [
      "category:chart"
    ]
  },
  {
    "command": "Hyperbola",
    "localizedName": "双曲线",
    "syntax": "Hyperbola( <焦点>, <焦点>, <主半轴长> ); Hyperbola( <焦点>, <焦点>, <线段> ); Hyperbola( <焦点>, <焦点>, <点> )",
    "syntaxEn": "Hyperbola( <Focus>, <Focus>, <Semimajor Axis Length> ); Hyperbola( <Focus>, <Focus>, <Segment> ); Hyperbola( <Focus>, <Focus>, <Point> )",
    "description": "创建具有给定焦点和长半轴长度、定义长半轴或穿过给定点的线段的双曲线。",
    "searchTextEn": "Hyperbola 双曲线 Hyperbola( <Focus>, <Semimajor Axis Length> ); <Segment> <Point> )",
    "examples": [
      "创建具有给定焦点和半长轴长度的双曲线。",
      "创建具有给定焦点的双曲线，其中长半轴的长度等于线段的长度。",
      "创建一条双曲线，其中给定焦点穿过给定点。"
    ],
    "tags": [
      "category:conic",
      "capability:create"
    ]
  },
  {
    "command": "HyperGeometric",
    "localizedName": "超几何分布",
    "syntax": "HyperGeometric( <总体容量>, <成功次数>, <样本容量> ); HyperGeometric( <总体容量>, <成功次数>, <样本容量>, <是否累积? true|false> ); HyperGeometric( <总体容量>, <成功次数>, <样本容量>, <变量值>, <是否累积? true|false> )",
    "syntaxEn": "HyperGeometric( <Population Size>, <Number of Successes>, <Sample Size> ); HyperGeometric( <Population Size>, <Number of Successes>, <Sample Size>, <Boolean Cumulative> ); HyperGeometric( <Population Size>, <Number of Successes>, <Sample Size>, <Variable Value>, <Boolean Cumulative> )",
    "description": "返回基于参数的超几何分布条形图或概率值，以及累积分布和特定变量值的变化。",
    "searchTextEn": "HyperGeometric 超几何分布 HyperGeometric( <Population Size>, <Number of Successes>, <Sample Size> ); <Boolean Cumulative> <Variable Value>, )",
    "examples": [
      "生成一个条形图，显示从瓮中抽取的未经放回的样本中白球数量的概率分布。",
      "计算在没有累积分布的特定场景中选择白球的概率。",
      "计算在特定场景中选择白球的累积概率。"
    ],
    "tags": [
      "category:probability",
      "capability:cas-supported"
    ]
  },
  {
    "command": "Icosahedron",
    "localizedName": "正二十面体",
    "syntax": "Icosahedron( <等边三角形> ); Icosahedron( <点>, <点>, <点> ); Icosahedron( <点>, <点>, <方向> )",
    "syntaxEn": "Icosahedron( <Equilateral Triangle> ); Icosahedron( <Point>, <Point>, <Point> ); Icosahedron( <Point>, <Point>, <Direction> )",
    "description": "使用各种输入方法创建二十面体：使用等边三角形作为底，使用两个点和一个方向来定义边和方向，三个点形成第一个面的等边三角形，或者使用两个点自动生成第三点以围绕第一个边旋转。",
    "searchTextEn": "Icosahedron 正二十面体 Icosahedron( <Equilateral Triangle> ); <Point>, <Point> <Direction> )",
    "examples": [
      "Icosahedron(A, B) 是 Icosahedron(A, B, C) 的缩写，其中 C = Point(Circle(Midpoint(A, B), Distance(A, B) sqrt(3) / 2, Segment(A, B)))",
      "另请参见立方体、四面体、八面体、十二面体命令"
    ],
    "tags": [
      "category:3d"
    ]
  },
  {
    "command": "Identity",
    "localizedName": "单位矩阵",
    "syntax": "Identity( <数字> )",
    "syntaxEn": "Identity( <Number> )",
    "description": "给出给定阶数的单位矩阵。",
    "searchTextEn": "Identity 单位矩阵 Identity( <Number> )",
    "examples": [
      "Identity(3) 产生矩阵主干：[\\begin{pmatrix}1&0&0\\\\0&1&0\\\\0&0&1\\end{pmatrix}]。",
      "如果 A 是 n 阶方阵，则 A0 的结果与 Identity(n) 相同。"
    ],
    "tags": [
      "category:vector-and-matrix",
      "capability:cas-supported"
    ]
  },
  {
    "command": "If",
    "localizedName": "如果",
    "syntax": "If( <条件>, <结果> ); If( <条件>, <结果>, <否则> )",
    "syntaxEn": "If( <Condition>, <Then> ); If( <Condition>, <Then>, <Else> )",
    "description": "根据条件评估生成对象的副本。对于两个参数，如果条件为真，则返回“Then”；如果为假，则返回“未定义”。对于三个参数，如果条件为 true，则返回“Then”；如果为 false，则返回“Else”。对于多个条件-then 对和可选的 Else，返回与第一个满足的条件对应的 Then，或者如果提供了但不满足任何条件，则返回 Else，否则未定义。",
    "searchTextEn": "If 如果 If( <Condition>, <Then> ); <Then>, <Else> )",
    "examples": [
      "带两个参数的基本条件",
      "具有三个参数的条件",
      "Else 的多个条件",
      "创建分段函数",
      "多元条件函数",
      "在脚本中使用 If"
    ],
    "tags": [
      "category:logic"
    ]
  },
  {
    "command": "IFactor",
    "localizedName": "实数域因式分解",
    "syntax": "IFactor( <多项式> ); IFactor( <代数式> )",
    "syntaxEn": "IFactor( <Polynomial> ); IFactor( <Expression> )",
    "description": "非理性因素。",
    "searchTextEn": "IFactor 实数域因式分解 IFactor( <Polynomial> ); <Expression> )",
    "examples": [
      "IFactor(x2 + x - 1) 给出词干：[ \\left( x + \\frac{-\\sqrt{5} + 1}{2} \\right) \\left( x + \\frac{\\sqrt{5} 1}{2} \\right)]",
      "IFactor(a2 + a - 1, a) 返回词干：[ \\left( a + \\frac{-\\sqrt{5} + 1}{2} \\right) \\left( a + \\frac{\\sqrt{5} 1}{2} \\right)]"
    ],
    "tags": [
      "category:algebra",
      "capability:cas-supported"
    ]
  },
  {
    "command": "ImplicitCurve",
    "localizedName": "隐式曲线",
    "syntax": "ImplicitCurve( <点列> ); ImplicitCurve( <f(x, y)> )",
    "syntaxEn": "ImplicitCurve( <List of Points> ); ImplicitCurve( <f(x, y)> )",
    "description": "通过给定的一组点创建隐式曲线。对于度数stem:[n]的隐式曲线，列表的长度必须为stem:[\\frac{n(n+3)}2]。创建隐式曲线 f(x,y) = 0。",
    "searchTextEn": "ImplicitCurve 隐式曲线 ImplicitCurve( <List of Points> ); <f(x, y)> )",
    "examples": [],
    "tags": [
      "category:functions-and-calculus"
    ]
  },
  {
    "command": "ImplicitDerivative",
    "localizedName": "隐式微分",
    "syntax": "ImplicitDerivative( <f(x, y)> ); ImplicitDerivative( <代数式>, <因变量>, <自变量> )",
    "syntaxEn": "ImplicitDerivative( <f(x, y)> ); ImplicitDerivative( <Expression>, <Dependent Variable>, <Independent Variable> )",
    "description": "给出给定表达式的隐式导数。",
    "searchTextEn": "ImplicitDerivative 隐式微分 ImplicitDerivative( <f(x, y)> ); <Expression>, <Dependent Variable>, <Independent Variable> )",
    "examples": [
      "x + 2y 的隐式导数",
      "x + 2y 的隐式导数与 LaTeX 输出",
      "x^2 + y^2 关于 y 和 x 的隐式导数"
    ],
    "tags": [
      "category:functions-and-calculus",
      "capability:cas-supported"
    ]
  },
  {
    "command": "Incircle",
    "localizedName": "内切圆",
    "syntax": "Incircle( <点>, <点>, <点> )",
    "syntaxEn": "Incircle( <Point>, <Point>, <Point> )",
    "description": "返回由三个点形成的三角形的 Incircle (https://en.wikipedia.org/wiki/Incircle_and_excircles_of_a_triangle)。",
    "searchTextEn": "Incircle 内切圆 Incircle( <Point>, <Point> )",
    "examples": [
      "设 O=(0, 0)、A=(3, 0) 和 B=(0, 5) 为三个点：Incircle(O, A, B) 在代数视图中得出 (x - 1.08)² + (y - 1.08)² = 1.18 并在图形视图中绘制相应的圆。"
    ],
    "tags": [
      "category:3d",
      "category:conic",
      "category:geometry"
    ]
  },
  {
    "command": "IndexOf",
    "localizedName": "索引",
    "syntax": "IndexOf( <对象>, <列表> ); IndexOf( <文本>, <文本> ); IndexOf( <对象>, <列表>, <起始索引> ); IndexOf( <文本>, <文本>, <起始索引> )",
    "syntaxEn": "IndexOf( <Object>, <List> ); IndexOf( <Text>, <Text> ); IndexOf( <Object>, <List>, <Start Index> ); IndexOf( <Text>, <Text>, <Start Index> )",
    "description": "返回列表中对象或文本中文本第一次出现的位置。",
    "searchTextEn": "IndexOf 索引 IndexOf( <Object>, <List> ); <Text>, <Text> <List>, <Start Index> )",
    "examples": [
      "查找列表中第一次出现的 5",
      "从索引 3 开始查找列表中 5 的第一次出现",
      "从索引 4 开始查找列表中第一次出现的 5",
      "从索引 6 开始查找列表中第一次出现的 5",
      "查找文本中第一次出现“Ge”",
      "从索引 2 开始查找文本中第一次出现的“Ge”"
    ],
    "tags": [
      "category:list",
      "category:text"
    ]
  },
  {
    "command": "InfiniteCone",
    "localizedName": "无限长圆锥",
    "syntax": "InfiniteCone( <点>, <向量>, <度|弧度> ); InfiniteCone( <点>, <点>, <度|弧度> ); InfiniteCone( <点>, <直线>, <度|弧度> )",
    "syntaxEn": "InfiniteCone( <Point>, <Vector>, <Angle> ); InfiniteCone( <Point>, <Point>, <Angle> ); InfiniteCone( <Point>, <Line>, <Angle> )",
    "description": "无限长圆锥",
    "searchTextEn": "InfiniteCone ConeInfinite 无限长圆锥 InfiniteCone( <Point>, <Vector>, <Angle> ); <Line>, )",
    "examples": [],
    "tags": [
      "category:3d"
    ]
  },
  {
    "command": "InfiniteCylinder",
    "localizedName": "无限长圆柱",
    "syntax": "InfiniteCylinder( <直线>, <半径> ); InfiniteCylinder( <点>, <向量>, <半径> ); InfiniteCylinder( <点>, <点>, <半径> )",
    "syntaxEn": "InfiniteCylinder( <Line>, <Radius> ); InfiniteCylinder( <Point>, <Vector>, <Radius> ); InfiniteCylinder( <Point>, <Point>, <Radius> )",
    "description": "无限长圆柱",
    "searchTextEn": "InfiniteCylinder CylinderInfinite 无限长圆柱 InfiniteCylinder( <Line>, <Radius> ); <Point>, <Vector>, )",
    "examples": [],
    "tags": [
      "category:3d"
    ]
  },
  {
    "command": "InflectionPoint",
    "localizedName": "拐点",
    "syntax": "InflectionPoint( <多项式> ); InflectionPoint( <函数> )",
    "syntaxEn": "InflectionPoint( <Polynomial> ); InflectionPoint( <Function> )",
    "description": "拐点",
    "searchTextEn": "InflectionPoint TurningPoint 拐点 InflectionPoint( <Polynomial> ); <Function> )",
    "examples": [],
    "tags": [
      "category:functions-and-calculus"
    ]
  },
  {
    "command": "InputBox",
    "localizedName": "输入框",
    "syntax": "InputBox( <链接对象> )",
    "syntaxEn": "InputBox( <Linked Object> )",
    "description": "输入框",
    "searchTextEn": "InputBox Textfield 输入框 InputBox( <Linked Object> )",
    "examples": [],
    "tags": [
      "category:scripting",
      "capability:interaction",
      "capability:script"
    ]
  },
  {
    "command": "Insert",
    "localizedName": "插入",
    "syntax": "Insert( <列表>, <列表>, <序数位置> ); Insert( <对象>, <列表>, <序数位置> )",
    "syntaxEn": "Insert( <List>, <List>, <Position> ); Insert( <Object>, <List>, <Position> )",
    "description": "将对象插入列表中的给定位置。",
    "searchTextEn": "Insert 插入 Insert( <List>, <Position> ); <Object>, )",
    "examples": [
      "在第三个位置插入x2",
      "使用负位置在列表末尾插入 x2",
      "将第一个列表的所有元素插入到第三个位置",
      "使用负位置将第一个列表的元素插入到最后一个元素之前"
    ],
    "tags": [
      "category:list"
    ]
  },
  {
    "command": "Integral",
    "localizedName": "积分",
    "syntax": "Integral( <函数> ); Integral( <函数>, <变量> ); Integral( <函数>, <x-起始值>, <x-终止值> ); Integral( <函数>, <x-起始值>, <x-终止值>, <是否给出积分值? true|false> ); Integral( <函数>, <变量>, <起始值>, <终止值> )",
    "syntaxEn": "Integral( <Function> ); Integral( <Function>, <Variable> ); Integral( <Function>, <Start x-Value>, <End x-Value> ); Integral( <Function>, <Start x-Value>, <End x-Value>, <Boolean Evaluate> ); Integral( <Function>, <Variable>, <Start Value>, <End Value> )",
    "description": "给出相对于主变量的不定积分、相对于给定变量的部分积分或区间内的定积分，并提供遮蔽区域和评估的选项。",
    "searchTextEn": "Integral 积分 Integral( <Function> ); <Function>, <Variable> <Start x-Value>, <End x-Value> <Boolean Evaluate> <Variable>, Value>, Value> )",
    "examples": [
      "给出 x³ 的不定积分",
      "给出 x³+3x y 关于 x 的偏积分",
      "给出 x³ 从 1 到 2 的定积分",
      "给出 CAS 中 cos(a t) 关于 t 的积分",
      "给出 cos(t) 关于 t 从 a 到 b 的定积分"
    ],
    "tags": [
      "category:functions-and-calculus",
      "capability:cas-supported"
    ]
  },
  {
    "command": "IntegralBetween",
    "localizedName": "积分介于",
    "syntax": "IntegralBetween( <函数>, <函数>, <x-起始值>, <x-终止值> ); IntegralBetween( <函数>, <函数>, <x-起始值>, <x-终止值>, <是否给出积分值? true|false> ); IntegralBetween( <函数>, <函数>, <变量>, <起始值>, <终止值> )",
    "syntaxEn": "IntegralBetween( <Function>, <Function>, <Start x-Value>, <End x-Value> ); IntegralBetween( <Function>, <Function>, <Start x-Value>, <End x-Value>, <Boolean Evaluate> ); IntegralBetween( <Function>, <Function>, <Variable>, <Start Value>, <End Value> )",
    "description": "给出两个函数 f 和 g 在区间 [a, b] 上的差值 f(x) - g(x) 相对于主变量或指定变量的定积分，其中 a 是第一个数字，b 是第二个数字，并且可以选择对函数图之间的区域进行着色。",
    "searchTextEn": "IntegralBetween 积分介于 IntegralBetween( <Function>, <Start x-Value>, <End x-Value> ); <Boolean Evaluate> <Variable>, Value>, Value> )",
    "examples": [
      "sin(x) - cos(x) 从 0 到 pi 的积分",
      "sin(x) - cos(x) 从 pi/4 到 5pi/4 的积分",
      "a*sin(t) - a*cos(t) 关于 t 从 pi/4 到 5pi/4 的积分"
    ],
    "tags": [
      "category:functions-and-calculus",
      "capability:cas-supported"
    ]
  },
  {
    "command": "IntegralSymbolic",
    "localizedName": "不定积分",
    "syntax": "IntegralSymbolic( <函数> ); IntegralSymbolic( <函数>, <变量> )",
    "syntaxEn": "IntegralSymbolic( <Function> ); IntegralSymbolic( <Function>, <Variable> )",
    "description": "给出关于主变量的不定符号积分。积分常数 c 不会自动显示为滑块。",
    "searchTextEn": "IntegralSymbolic 不定积分 IntegralSymbolic( <Function> ); <Function>, <Variable> )",
    "examples": [
      "IntegralSymbolic(3x2) 产生茎：[x3+c_{1}]。"
    ],
    "tags": [
      "category:functions-and-calculus",
      "capability:cas-supported"
    ]
  },
  {
    "command": "InteriorAngles",
    "localizedName": "内角",
    "syntax": "InteriorAngles( <多边形> )",
    "syntaxEn": "InteriorAngles( <Polygon> )",
    "description": "创建给定多边形的所有内角。",
    "searchTextEn": "InteriorAngles 内角 InteriorAngles( <Polygon> )",
    "examples": [
      "创建给定多边形的所有内角。"
    ],
    "tags": [
      "category:3d",
      "category:geometry"
    ]
  },
  {
    "command": "Intersect",
    "localizedName": "交点",
    "syntax": "Intersect( <对象>, <对象> ); Intersect( <对象>, <对象>, <交点索引> ); Intersect( <对象>, <对象>, <起点> ); Intersect( <函数>, <函数>, <x-起始值>, <x-终止值> ); Intersect( <曲线1>, <曲线2>, <参数1>, <参数2> ); Intersect( <函数>, <函数> )",
    "syntaxEn": "Intersect( <Object>, <Object> ); Intersect( <Object>, <Object>, <Index of Intersection Point> ); Intersect( <Object>, <Object>, <Initial Point> ); Intersect( <Function>, <Function>, <Start x-Value>, <End x-Value> ); Intersect( <Curve 1>, <Curve 2>, <Parameter 1>, <Parameter 2> ); Intersect( <Function>, <Function> )",
    "description": "生成两个对象的交点，具有针对不同对象类型和参数的多种语法。",
    "searchTextEn": "Intersect 交点 Intersect( <Object>, <Object> ); <Index of Intersection Point> <Initial <Function>, <Start x-Value>, <End x-Value> <Curve 1>, 2>, <Parameter 2> <Function> )",
    "examples": [
      "直线和椭圆的交点",
      "直线和曲线的交点",
      "两条曲线的交点",
      "函数和直线的第 N 个交点",
      "使用初始点的交点",
      "区间内两个函数的交点",
      "使用参数的两条曲线的交点",
      "CAS 两个函数交点的语法"
    ],
    "tags": [
      "category:3d",
      "category:functions-and-calculus",
      "category:geometry",
      "capability:create",
      "capability:cas-supported"
    ]
  },
  {
    "command": "IntersectConic",
    "localizedName": "相交曲线",
    "syntax": "IntersectConic( <平面>, <二次曲面> ); IntersectConic( <二次曲面>, <二次曲面> )",
    "syntaxEn": "IntersectConic( <Plane>, <Quadric> ); IntersectConic( <Quadric>, <Quadric> )",
    "description": "平面与二次曲面相交。返回在交点实际上是圆锥曲线的情况下定义的圆锥曲线。",
    "searchTextEn": "IntersectConic 相交曲线 IntersectConic( <Plane>, <Quadric> ); <Quadric>, )",
    "examples": [
      "IntersectConic(sphere1, sphere2) 创建两个球体的相交圆锥曲线。"
    ],
    "tags": [
      "category:3d"
    ]
  },
  {
    "command": "Intersection",
    "localizedName": "交集",
    "syntax": "Intersection( <列表>, <列表> )",
    "syntaxEn": "Intersection( <List>, <List> )",
    "description": "为您提供一个新列表，其中包含属于两个列表的所有元素。",
    "searchTextEn": "Intersection 交集 Intersection( <List>, <List> )",
    "examples": [
      "令 list1 = {1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15} 和 list2 = {2, 4, 6, 8, 10, 12, 14, 16, 18, 20, 22, 24, 26, 28, 30} 为两个列表。 Intersection(list1, list2) 生成新列表 list3 = {2, 4, 6, 8, 10, 12, 14}。"
    ],
    "tags": [
      "category:list"
    ]
  },
  {
    "command": "IntersectPath",
    "localizedName": "相交路径",
    "syntax": "IntersectPath( <直线>, <多边形> ); IntersectPath( <多边形>, <多边形> ); IntersectPath( <平面>, <多边形> ); IntersectPath( <平面>, <二次曲面> )",
    "syntaxEn": "IntersectPath( <Line>, <Polygon> ); IntersectPath( <Polygon>, <Polygon> ); IntersectPath( <Plane>, <Polygon> ); IntersectPath( <Plane>, <Quadric> )",
    "description": "创建不同几何对象之间的相交路径：直线和多边形、两个多边形、平面和多边形或平面和二次曲面。",
    "searchTextEn": "IntersectPath 相交路径 IntersectPath( <Line>, <Polygon> ); <Polygon>, <Plane>, <Quadric> )",
    "examples": [
      "在直线 a 和多边形三角形的第一个和第二个交点之间创建一条线段。",
      "创建一个新多边形作为两个给定多边形的交集。",
      "在多边形平面中，在平面 a 和多边形三角形的第一个和第二个交点之间创建一条线段。",
      "创建一个圆作为平面 a 和二次球面的交点。"
    ],
    "tags": [
      "category:3d",
      "category:geometry"
    ]
  },
  {
    "command": "InverseBeta",
    "localizedName": "逆贝塔分布",
    "syntax": "InverseBeta( <形状参数α>, <尺度参数β>, <概率> )",
    "syntaxEn": "InverseBeta( <Alpha>, <Beta>, <Probability> )",
    "description": "对于给定概率 p，使用参数 α 和 β 计算 Beta 累积分布的反函数。换句话说，该命令找到 t 使得 P(X ≤ t) = p，其中 X 是具有 Beta 分布的随机变量。概率 p 是区间 [0,1] 中的任意值。",
    "searchTextEn": "InverseBeta 逆贝塔分布 InverseBeta( <Alpha>, <Beta>, <Probability> )",
    "examples": [],
    "tags": [
      "category:probability"
    ]
  },
  {
    "command": "InverseBinomial",
    "localizedName": "逆二项分布",
    "syntax": "InverseBinomial( <试验次数>, <成功概率>, <累积概率> )",
    "syntaxEn": "InverseBinomial( <Number of Trials>, <Probability of Success>, <Cumulative Probability> )",
    "description": "返回满足 P(X ≤ n) ≥ p 的最小整数 n，其中 p 是概率，X 是由试验次数和成功概率给出的二项式随机变量。",
    "searchTextEn": "InverseBinomial 逆二项分布 InverseBinomial( <Number of Trials>, <Probability Success>, <Cumulative Probability> )",
    "examples": [],
    "tags": [
      "category:probability"
    ]
  },
  {
    "command": "InverseBinomialMinimumTrials",
    "localizedName": "逆二项最小实验",
    "syntax": "InverseBinomialMinimumTrials( <累积概率>, <成功概率>, <成功次数> )",
    "syntaxEn": "InverseBinomialMinimumTrials( <Cumulative Probability>, <Probability of Success>, <Number of Successes> )",
    "description": "返回获得给定成功次数的最小尝试次数 n。",
    "searchTextEn": "InverseBinomialMinimumTrials 逆二项最小实验 InverseBinomialMinimumTrials( <Cumulative Probability>, <Probability of Success>, <Number Successes> )",
    "examples": [
      "计算累积概率 0.5、成功概率 0.2 和 50 次成功的最少试验次数"
    ],
    "tags": [
      "category:probability"
    ]
  },
  {
    "command": "InverseCauchy",
    "localizedName": "逆柯西分布",
    "syntax": "InverseCauchy( <中位数>, <尺度参数λ>, <概率> )",
    "syntaxEn": "InverseCauchy( <Median>, <Scale>, <Probability> )",
    "description": "计算概率 p 处柯西分布 (https://en.wikipedia.org/wiki/Cauchy_distribution) 的累积分布函数的反函数，其中柯西分布由参数中值和尺度定义。换句话说，找到 t 使得 P(X ≤ t) = p，其中 X 是柯西随机变量。概率 p 必须是闭区间 [0,1] 中的值。",
    "searchTextEn": "InverseCauchy 逆柯西分布 InverseCauchy( <Median>, <Scale>, <Probability> )",
    "examples": [],
    "tags": [
      "category:probability"
    ]
  },
  {
    "command": "InverseChiSquared",
    "localizedName": "逆卡方分布",
    "syntax": "InverseChiSquared( <自由度>, <概率> )",
    "syntaxEn": "InverseChiSquared( <Degrees of Freedom>, <Probability> )",
    "description": "计算概率为 p 的卡方分布的累积分布函数的反函数，其中卡方分布由给定的自由度定义。换句话说，它找到 t 使得 P(X ≤ t) = p，其中 X 是卡方随机变量。概率 p 必须是闭区间 [0,1] 中的值。",
    "searchTextEn": "InverseChiSquared 逆卡方分布 InverseChiSquared( <Degrees of Freedom>, <Probability> )",
    "examples": [],
    "tags": [
      "category:probability"
    ]
  },
  {
    "command": "InverseExponential",
    "localizedName": "逆指数分布",
    "syntax": "InverseExponential( <率参数λ>, <概率> )",
    "syntaxEn": "InverseExponential( <Lambda>, <Probability> )",
    "description": "计算概率 p 处的指数分布的累积分布函数的反函数，其中指数分布由给定参数 lambda 定义。换句话说，找到 t 使得 P(X ≤ t) = p，其中 X 是指数随机变量。概率 p 必须是闭区间 [0,1] 中的值。",
    "searchTextEn": "InverseExponential 逆指数分布 InverseExponential( <Lambda>, <Probability> )",
    "examples": [],
    "tags": [
      "category:probability"
    ]
  },
  {
    "command": "InverseFDistribution",
    "localizedName": "逆F分布",
    "syntax": "InverseFDistribution( <分子自由度>, <分母自由度>, <概率> )",
    "syntaxEn": "InverseFDistribution( <Numerator Degrees of Freedom>, <Denominator Degrees of Freedom>, <Probability> )",
    "description": "计算概率 p 处 F 分布的累积分布函数的反函数，其中 F 分布由给定的自由度定义。换句话说，它找到 t 使得 P(X ≤ t) = p，其中 X 是具有 F 分布的随机变量。概率 p 必须是闭区间 [0,1] 中的值。",
    "searchTextEn": "InverseFDistribution 逆F分布 InverseFDistribution( <Numerator Degrees of Freedom>, <Denominator <Probability> )",
    "examples": [],
    "tags": [
      "category:probability"
    ]
  },
  {
    "command": "InverseGamma",
    "localizedName": "逆伽玛分布",
    "syntax": "InverseGamma( <形状参数α>, <尺度参数β>, <概率> )",
    "syntaxEn": "InverseGamma( <Alpha>, <Beta>, <Probability> )",
    "description": "对于给定概率 p，使用参数 α 和 β 计算 Gamma 累积分布的逆。换句话说，该命令找到 t 使得 P(X ≤ t) = p，其中 X 是具有 Gamma 分布的随机变量。概率 p 是区间 [0,1] 中的任意值。",
    "searchTextEn": "InverseGamma 逆伽玛分布 InverseGamma( <Alpha>, <Beta>, <Probability> )",
    "examples": [],
    "tags": [
      "category:probability"
    ]
  },
  {
    "command": "InverseHyperGeometric",
    "localizedName": "逆超几何分布",
    "syntax": "InverseHyperGeometric( <总体容量>, <成功次数>, <样本容量>, <概率> )",
    "syntaxEn": "InverseHyperGeometric( <Population Size>, <Number of Successes>, <Sample Size>, <Probability> )",
    "description": "返回满足 P(X ≤ n) ≥ p 的最小整数 n，其中 p 是概率，X 是由总体大小、成功数和样本大小给出的超几何随机变量。",
    "searchTextEn": "InverseHyperGeometric 逆超几何分布 InverseHyperGeometric( <Population Size>, <Number of Successes>, <Sample <Probability> )",
    "examples": [],
    "tags": [
      "category:probability"
    ]
  },
  {
    "command": "InverseLaplace",
    "localizedName": "拉普拉斯逆变换",
    "syntax": "InverseLaplace( <函数> ); InverseLaplace( <函数>, <变量> ); InverseLaplace( <函数>, <变量>, <变量> )",
    "syntaxEn": "InverseLaplace( <Function> ); InverseLaplace( <Function>, <Variable> ); InverseLaplace( <Function>, <Variable>, <Variable> )",
    "description": "返回给定函数的拉普拉斯逆变换。",
    "searchTextEn": "InverseLaplace 拉普拉斯逆变换 InverseLaplace( <Function> ); <Function>, <Variable> <Variable>, )",
    "examples": [
      "返回给定函数的拉普拉斯逆变换。",
      "返回函数相对于给定变量的拉普拉斯逆变换。"
    ],
    "tags": [
      "category:functions-and-calculus",
      "capability:cas-supported"
    ]
  },
  {
    "command": "InverseLogistic",
    "localizedName": "逆逻辑分布",
    "syntax": "InverseLogistic( <平均数>, <尺度参数λ>, <概率> )",
    "syntaxEn": "InverseLogistic( <Mean>, <Scale>, <Probability> )",
    "description": "计算 Logistic 分布 (https://en.wikipedia.org/wiki/Logistic_distribution) 在概率 p 处的累积分布函数的反函数，其中 Logistic 分布由给定参数均值和尺度定义。换句话说，它找到 t 使得 P(X ≤ t) = p，其中 X 是 Logistic 随机变量。概率 p 必须是闭区间 [0,1] 中的值。",
    "searchTextEn": "InverseLogistic 逆逻辑分布 InverseLogistic( <Mean>, <Scale>, <Probability> )",
    "examples": [
      "InverseLogistic(100, 2, 1) 产生词干：[ \\infty ]。"
    ],
    "tags": [
      "category:probability"
    ]
  },
  {
    "command": "InverseLogNormal",
    "localizedName": "逆对数正态分布",
    "syntax": "InverseLogNormal( <平均数>, <标准差>, <概率> )",
    "syntaxEn": "InverseLogNormal( <Mean>, <Standard Deviation>, <Probability> )",
    "description": "计算概率 p 处对数正态分布的累积分布函数的反函数，其中对数正态分布由给定参数均值和标准差定义。换句话说，它找到 t 使得 P(X ≤ t) = p，其中 X 是对数正态随机变量。概率 p 必须是闭区间 [0, 1] 中的值。",
    "searchTextEn": "InverseLogNormal 逆对数正态分布 InverseLogNormal( <Mean>, <Standard Deviation>, <Probability> )",
    "examples": [
      "计算平均值为 10、标准差为 20、概率为 1/3 的逆对数正态分布",
      "计算均值 1000、标准差 2 和概率 1 的逆对数正态分布"
    ],
    "tags": [
      "category:probability"
    ]
  },
  {
    "command": "InverseNormal",
    "localizedName": "逆正态分布",
    "syntax": "InverseNormal( <平均数>, <标准差>, <累积概率> )",
    "syntaxEn": "InverseNormal( <Mean>, <Standard Deviation>, <Cumulative Probability> )",
    "description": "在给定概率 P 下计算表达式 Φ⁻1(P) × σ + μ，其中 Φ⁻1 是 N(0,1) 的累积分布函数 Φ 的反函数，由给定参数均值和标准差定义。返回正态分布曲线下左侧具有给定概率（区域）的点的 x 坐标。",
    "searchTextEn": "InverseNormal 逆正态分布 InverseNormal( <Mean>, <Standard Deviation>, <Cumulative Probability> )",
    "examples": [
      "计算平均值为 50、标准差为 2 的正态分布的第 90 个百分位"
    ],
    "tags": [
      "category:probability"
    ]
  },
  {
    "command": "InversePascal",
    "localizedName": "逆帕斯卡分布",
    "syntax": "InversePascal( <成功次数>, <成功概率>, <概率> )",
    "syntaxEn": "InversePascal( <n>, <p>, <Probability> )",
    "description": "返回满足 P(X≤n) ≥ p 的最小整数 n，其中 p 是概率，X 是由 n 和 p 给出的帕斯卡随机变量 (https://en.wikipedia.org/wiki/Negative_binomial_distribution)。",
    "searchTextEn": "InversePascal 逆帕斯卡分布 InversePascal( <n>, <p>, <Probability> )",
    "examples": [],
    "tags": [
      "category:probability"
    ]
  },
  {
    "command": "InversePoisson",
    "localizedName": "逆泊松分布",
    "syntax": "InversePoisson( <平均数>, <概率> )",
    "syntaxEn": "InversePoisson( <Mean>, <Probability> )",
    "description": "返回满足 P(X≤n) ≥ p 的最小整数 n，其中 p 是给定概率，X 是具有给定均值的泊松随机变量。",
    "searchTextEn": "InversePoisson 逆泊松分布 InversePoisson( <Mean>, <Probability> )",
    "examples": [
      "InversePoisson( <Mean>, <Probability> )：返回满足 P(X≤n) ≥ p 的最小整数 n，其中 p 是给定概率，X 是具有给定均值的泊松随机变量。"
    ],
    "tags": [
      "category:probability"
    ]
  },
  {
    "command": "InverseTDistribution",
    "localizedName": "逆t分布",
    "syntax": "InverseTDistribution( <自由度>, <概率> )",
    "syntaxEn": "InverseTDistribution( <Degrees of Freedom>, <Probability> )",
    "description": "在 p 处计算具有给定自由度数的 t 分布的累积分布函数的反函数。找到 r 使得 P(X≤r)=p，其中 X 是具有 t 分布的随机变量。概率 p 必须是闭区间 [0,1] 中的值。",
    "searchTextEn": "InverseTDistribution 逆t分布 InverseTDistribution( <Degrees of Freedom>, <Probability> )",
    "examples": [],
    "tags": [
      "category:probability"
    ]
  },
  {
    "command": "InverseWeibull",
    "localizedName": "逆威布尔分布",
    "syntax": "InverseWeibull( <形状参数k>, <尺度参数λ>, <概率> )",
    "syntaxEn": "InverseWeibull( <Shape>, <Scale>, <Probability> )",
    "description": "计算给定 p 处威布尔分布的累积分布函数的反函数，其中威布尔分布由给定参数形状和尺度定义。换句话说，它找到 t 使得 P(X ≤ t) = p，其中 X 是具有威布尔分布的随机变量。概率 p 必须是闭区间 [0,1] 中的值。",
    "searchTextEn": "InverseWeibull 逆威布尔分布 InverseWeibull( <Shape>, <Scale>, <Probability> )",
    "examples": [],
    "tags": [
      "category:probability"
    ]
  },
  {
    "command": "InverseZipf",
    "localizedName": "逆齐普夫分布",
    "syntax": "InverseZipf( <最前元素数量>, <指数>, <概率> )",
    "syntaxEn": "InverseZipf( <Number of Elements>, <Exponent>, <Probability> )",
    "description": "返回满足 P(X≤n) ≥ p 的最小整数 n，其中 X 是由给定数量的元素和指数定义的 Zipf 随机变量，p 是概率。",
    "searchTextEn": "InverseZipf 逆齐普夫分布 InverseZipf( <Number of Elements>, <Exponent>, <Probability> )",
    "examples": [],
    "tags": [
      "category:probability"
    ]
  },
  {
    "command": "Invert",
    "localizedName": "逆反",
    "syntax": "Invert( <矩阵> ); Invert( <函数> )",
    "syntaxEn": "Invert( <Matrix> ); Invert( <Function> )",
    "description": "反转给定矩阵或给出函数的逆矩阵。",
    "searchTextEn": "Invert 逆反 Invert( <Matrix> ); <Function> )",
    "examples": [
      "用特定值反转矩阵",
      "反转具有未定义变量的矩阵",
      "反转函数"
    ],
    "tags": [
      "category:functions-and-calculus",
      "category:vector-and-matrix",
      "capability:cas-supported"
    ]
  },
  {
    "command": "IsDefined",
    "localizedName": "是否已定义",
    "syntax": "IsDefined( <对象> )",
    "syntaxEn": "IsDefined( <Object> )",
    "description": "是否已定义",
    "searchTextEn": "IsDefined Defined 是否已定义 IsDefined( <Object> )",
    "examples": [],
    "tags": [
      "category:logic",
      "capability:query"
    ]
  },
  {
    "command": "IsFactored",
    "localizedName": "是否已分解",
    "syntax": "IsFactored( <多项式> )",
    "syntaxEn": "IsFactored( <Polynomial> )",
    "description": "如果多项式包含 ℚ 因子，则返回“true”，否则返回“false”。一般来说，为了将多项式分解视为因子分解，每个因子的首项系数必须为正。",
    "searchTextEn": "IsFactored 是否已分解 IsFactored( <Polynomial> )",
    "examples": [
      "IsFactored(x) 产生 true",
      "IsFactored(0.5) 产生 true",
      "IsFactored(5) 产生 true",
      "IsFactored(x²-1) 产生 false",
      "IsFactored(x²-2) 产生 true",
      "IsFactored(x(x+1)) 产生 true",
      "IsFactored(x(2x+2)) 产生 false",
      "IsFactored(x³-1) 产生 false",
      "IsFactored(x(x/2+1/2)) 产生 false",
      "IsFactored((x+1)(x²-1)) 产生 false",
      "IsFactored(-2x-2) 产生 false",
      "IsFactored(2x+2) 产生 false"
    ],
    "tags": [
      "category:algebra",
      "category:logic"
    ]
  },
  {
    "command": "IsInRegion",
    "localizedName": "是否在区域内",
    "syntax": "IsInRegion( <点>, <区域> )",
    "syntaxEn": "IsInRegion( <Point>, <Region> )",
    "description": "如果该点位于给定区域内，则返回 true，否则返回 false。",
    "searchTextEn": "IsInRegion 是否在区域内 IsInRegion( <Point>, <Region> )",
    "examples": [
      "IsInRegion((1,2), Polygon((0,0), (2,0), (1,3))) 返回 true。"
    ],
    "tags": [
      "category:geometry",
      "category:logic",
      "capability:relation"
    ]
  },
  {
    "command": "IsInteger",
    "localizedName": "是否为整数",
    "syntax": "IsInteger( <数字> )",
    "syntaxEn": "IsInteger( <Number> )",
    "description": "根据数字是否为整数返回 true 或 false。",
    "searchTextEn": "IsInteger 是否为整数 IsInteger( <Number> )",
    "examples": [
      "检查除法结果是否为整数"
    ],
    "tags": [
      "category:algebra",
      "category:logic"
    ]
  },
  {
    "command": "IsPrime",
    "localizedName": "是否为质数",
    "syntax": "IsPrime( <数字> )",
    "syntaxEn": "IsPrime( <Number> )",
    "description": "根据数字是否为素数给出 true 或 false。",
    "searchTextEn": "IsPrime 是否为质数 IsPrime( <Number> )",
    "examples": [
      "检查 10 是否是质数",
      "检查 11 是否是质数"
    ],
    "tags": [
      "category:algebra",
      "category:logic",
      "capability:cas-supported"
    ]
  },
  {
    "command": "IsTangent",
    "localizedName": "是否相切",
    "syntax": "IsTangent( <直线>, <圆锥曲线> )",
    "syntaxEn": "IsTangent( <Line>, <Conic> )",
    "description": "确定直线是否与圆锥曲线相切。通常该命令以数字方式计算结果。可以使用 Prove 命令更改此行为。",
    "searchTextEn": "IsTangent 是否相切 IsTangent( <Line>, <Conic> )",
    "examples": [
      "检查直线是否与圆相切"
    ],
    "tags": [
      "category:geometry",
      "category:logic",
      "capability:relation"
    ]
  },
  {
    "command": "IsVertexForm",
    "localizedName": "是否为顶点式",
    "syntax": "IsVertexForm( <函数> )",
    "syntaxEn": "IsVertexForm( <Function> )",
    "description": "检查函数是否以顶点形式编写。",
    "searchTextEn": "IsVertexForm 是否为顶点式 IsVertexForm( <Function> )",
    "examples": [
      "IsVertexForm((x+2/3)2-(2/3)2) 产生 true",
      "IsVertexForm(2*(3 x-2)(2)+1) 产生 false"
    ],
    "tags": [
      "category:functions-and-calculus",
      "category:logic"
    ]
  },
  {
    "command": "Iteration",
    "localizedName": "迭代",
    "syntax": "Iteration( <函数>, <起始值>, <迭代次数> ); Iteration( <代数式>, <变量>, <起始值>, <迭代次数> )",
    "syntaxEn": "Iteration( <Function>, <Start Value>, <Number of Iterations> ); Iteration( <Expression>, <Variables>, <Start Values>, <Count> )",
    "description": "使用给定的起始值迭代函数或表达式 n 次（n = 迭代次数）。",
    "searchTextEn": "Iteration 迭代 Iteration( <Function>, <Start Value>, <Number of Iterations> ); <Expression>, <Variables>, Values>, <Count> )",
    "examples": [
      "定义 f(x) = x^2 后，命令 Iteration(f, 3, 2) 给出结果 (3^2)^2 = 81。",
      "要获得 7 与数字 3 的重复加法，定义 g(x) = x + 7，则 Iteration(g, 3, 4) 得到 (((3+7) +7) +7) +7 = 31。",
      "Iteration(a^2+1, a, {(1+ί)/(sqrt(2))}, 5) 将对复数进行重复迭代。"
    ],
    "tags": [
      "category:functions-and-calculus"
    ]
  },
  {
    "command": "IterationList",
    "localizedName": "迭代列表",
    "syntax": "IterationList( <函数>, <起始值>, <迭代次数> ); IterationList( <代数式>, <变量>, <起始值>, <迭代次数> )",
    "syntaxEn": "IterationList( <Function>, <Start Value>, <Number of Iterations> ); IterationList( <Expression>, <Variables>, <Start Values>, <Count> )",
    "description": "给出一个长度为 n+1（n = 迭代次数）的列表，其元素是从起始值开始的函数迭代。",
    "searchTextEn": "IterationList 迭代列表 IterationList( <Function>, <Start Value>, <Number of Iterations> ); <Expression>, <Variables>, Values>, <Count> )",
    "examples": [
      "定义 f(x) = x^2 后，命令 IterationList(f, 3, 2) 给出列表 {3, 9, 81}。",
      "定义f(k,a)=(k+1)*a，对应阶乘的递归定义。命令 IterationList(f, {3, 6}, 4) 为您提供列表 {6, 24, 120, 720, 5040}。",
      "设A、B为点。命令 IterationList(Midpoint(A, C), C, {B}, 3) 产生 {C0、C1、C2、C3}。因此，对于 A = (0,0) 且 B = (8,0)，结果将是 {(8,0), (4,0), (2,0), (1,0)}。",
      "令 f_0、f_1 为数字。 IterationList(a + b, a, b, {f_0, f_1}, 5) 对于 f_0 = f_1 = 1，结果将为 {1, 1, 2, 3, 5, 8}。"
    ],
    "tags": [
      "category:functions-and-calculus"
    ]
  },
  {
    "command": "Join",
    "localizedName": "合并",
    "syntax": "Join( <列表的列表> ); Join( <列表>, <列表>, ... )",
    "syntaxEn": "Join( <List of Lists> ); Join( <List>, <List>, ... )",
    "description": "连接两个或多个列表，或将列表列表中的子列表连接到一个较长的列表中。",
    "searchTextEn": "Join 合并 Join( <List of Lists> ); <List>, ... )",
    "examples": [
      "连接两个列表",
      "连接单个列表列表",
      "从列表列表中加入多个子列表"
    ],
    "tags": [
      "category:list"
    ]
  },
  {
    "command": "JordanDiagonalization",
    "localizedName": "约当对角化",
    "syntax": "JordanDiagonalization( <矩阵> )",
    "syntaxEn": "JordanDiagonalization( <Matrix> )",
    "description": "将给定矩阵分解为 S J S⁻1 形式，其中 J 为乔丹规范形式。",
    "searchTextEn": "JordanDiagonalization 约当对角化 JordanDiagonalization( <Matrix> )",
    "examples": [
      "JordanDiagonalization 用于 2x2 矩阵"
    ],
    "tags": [
      "category:vector-and-matrix",
      "capability:cas-supported"
    ]
  },
  {
    "command": "KeepIf",
    "localizedName": "条件子列",
    "syntax": "KeepIf( <条件>, <列表> ); KeepIf( <条件>, <变量>, <列表> )",
    "syntaxEn": "KeepIf( <Condition>, <List> ); KeepIf( <Condition>, <Variable>, <List> )",
    "description": "创建一个新列表，其中仅包含初始列表中满足条件的元素。",
    "searchTextEn": "KeepIf 条件子列 KeepIf( <Condition>, <List> ); <Variable>, )",
    "examples": [
      "根据条件过滤数字",
      "根据带有变量的条件过滤点等对象"
    ],
    "tags": [
      "category:list",
      "category:logic"
    ]
  },
  {
    "command": "Laplace",
    "localizedName": "拉普拉斯变换",
    "syntax": "Laplace( <函数> ); Laplace( <函数>, <变量> ); Laplace( <函数>, <变量>, <变量> )",
    "syntaxEn": "Laplace( <Function> ); Laplace( <Function>, <Variable> ); Laplace( <Function>, <Variable>, <Variable> )",
    "description": "返回给定函数的拉普拉斯变换，可选地相对于指定变量。",
    "searchTextEn": "Laplace 拉普拉斯变换 Laplace( <Function> ); <Function>, <Variable> <Variable>, )",
    "examples": [
      "sin(t) 的拉普拉斯变换",
      "sin(a*t) 关于 t 的拉普拉斯变换",
      "sin(a*t) 关于 a 的拉普拉斯变换"
    ],
    "tags": [
      "category:functions-and-calculus",
      "capability:cas-supported"
    ]
  },
  {
    "command": "Last",
    "localizedName": "最后元素",
    "syntax": "Last( <列表> ); Last( <文本> ); Last( <列表>, <最前元素数量> ); Last( <文本>, <最前元素数量> )",
    "syntaxEn": "Last( <List> ); Last( <Text> ); Last( <List>, <Number of Elements> ); Last( <Text>, <Number of Elements> )",
    "description": "给出一个新列表，其中包含初始列表或文本的最后一个元素。",
    "searchTextEn": "Last 最后元素 Last( <List> ); <Text> <List>, <Number of Elements> <Text>, )",
    "examples": [
      "获取列表的最后一个元素",
      "获取列表的最后 n 个元素",
      "获取文本的最后一个字符",
      "获取文本的最后 n 个字符",
      "获取最后一个元素的替代方法"
    ],
    "tags": [
      "category:list",
      "category:text",
      "capability:cas-supported"
    ]
  },
  {
    "command": "LCM",
    "localizedName": "最小公倍数",
    "syntax": "LCM( <数字列表> ); LCM( <数字>, <数字> ); LCM( <多项式列表> ); LCM( <多项式>, <多项式> )",
    "syntaxEn": "LCM( <List of Numbers> ); LCM( <Number>, <Number> ); LCM( <List of Polynomials> ); LCM( <Polynomial>, <Polynomial> )",
    "description": "计算两个数字、数字列表、两个多项式或多项式列表的最小公倍数。",
    "searchTextEn": "LCM 最小公倍数 LCM( <List of Numbers> ); <Number>, <Number> Polynomials> <Polynomial>, <Polynomial> )",
    "examples": [
      "计算两个数字的最小公倍数",
      "计算列表中元素的最小公倍数",
      "计算两个多项式的最小公倍数",
      "计算列表中多项式的最小公倍数"
    ],
    "tags": [
      "category:algebra",
      "capability:cas-supported"
    ]
  },
  {
    "command": "LeftSide",
    "localizedName": "左边",
    "syntax": "LeftSide( <方程> ); LeftSide( <方程列表> ); LeftSide( <方程列表>, <索引> )",
    "syntaxEn": "LeftSide( <Equation> ); LeftSide( <List of Equations> ); LeftSide( <List of Equations>, <Index> )",
    "description": "给出一个或多个简化方程的左侧。",
    "searchTextEn": "LeftSide 左边 LeftSide( <Equation> ); <List of Equations> Equations>, <Index> )",
    "examples": [
      "获取单个方程的左侧",
      "得到另一个方程的左边",
      "从多个方程中获取左侧列表",
      "通过索引获取特定方程的左侧"
    ],
    "tags": [
      "category:algebra",
      "capability:cas-supported"
    ]
  },
  {
    "command": "LeftSum",
    "localizedName": "左和",
    "syntax": "LeftSum( <函数>, <x-起始值>, <x-终止值>, <矩形数量> )",
    "syntaxEn": "LeftSum( <Function>, <Start x-Value>, <End x-Value>, <Number of Rectangles> )",
    "description": "使用 n 个矩形计算区间内函数的左和。",
    "searchTextEn": "LeftSum 左和 LeftSum( <Function>, <Start x-Value>, <End <Number of Rectangles> )",
    "examples": [
      "LeftSum(x2 + 1, 0, 2, 4) 产生 a = 3.75"
    ],
    "tags": [
      "category:functions-and-calculus"
    ]
  },
  {
    "command": "Length",
    "localizedName": "长度",
    "syntax": "Length( <对象> ); Length( <函数>, <x-起始值>, <x-终止值> ); Length( <函数>, <起始点>, <终止点> ); Length( <曲线>, <t-起始值>, <t-终止值> ); Length( <曲线>, <起始点>, <终止点> ); Length( <列表> ); Length( <函数>, <变量>, <x-起始值>, <x-终止值> )",
    "syntaxEn": "Length( <Object> ); Length( <Function>, <Start x-Value>, <End x-Value> ); Length( <Function>, <Start Point>, <End Point> ); Length( <Curve>, <Start t-Value>, <End t-Value> ); Length( <Curve>, <Start Point>, <End Point> ); Length( <List> ); Length( <Function>, <Variable>, <Start x-Value>, <End x-Value> )",
    "description": "生成对象的长度，例如向量、点、列表、文本、轨迹、弧、函数图或曲线。",
    "searchTextEn": "Length 长度 Length( <Object> ); <Function>, <Start x-Value>, <End x-Value> Point>, Point> <Curve>, t-Value>, t-Value> <List> <Variable>, )",
    "examples": [
      "向量的长度",
      "点位置向量的长度",
      "列表的长度（元素数量）",
      "文本长度（字符数）",
      "轨迹长度（点数）",
      "弧或扇形的长度",
      "区间内函数图的长度",
      "两点之间函数图的长度",
      "两个参数值之间的曲线长度",
      "曲线上两点之间的曲线长度",
      "具有指定变量的函数图的长度"
    ],
    "tags": [
      "category:functions-and-calculus",
      "category:geometry",
      "category:text",
      "category:vector-and-matrix",
      "capability:measure",
      "capability:cas-supported"
    ]
  },
  {
    "command": "LetterToUnicode",
    "localizedName": "字母转换为统一码",
    "syntax": "LetterToUnicode( <字母> )",
    "syntaxEn": "LetterToUnicode( <Letter> )",
    "description": "将单个字母转换为相应的 Unicode 数字 (https://en.wikipedia.org/wiki/Unicode)。",
    "searchTextEn": "LetterToUnicode 字母转换为统一码 LetterToUnicode( <Letter> )",
    "examples": [
      "将单个字母转换为相应的 Unicode 数字"
    ],
    "tags": [
      "category:text"
    ]
  },
  {
    "command": "Limit",
    "localizedName": "极限",
    "syntax": "Limit( <函数>, <数值> ); Limit( <代数式>, <数值> ); Limit( <代数式>, <变量>, <数值> )",
    "syntaxEn": "Limit( <Function>, <Value> ); Limit( <Expression>, <Value> ); Limit( <Expression>, <Variable>, <Value> )",
    "description": "计算主函数变量给定值的函数极限 (https://en.wikipedia.org/wiki/Limit_of_a_function)。 （这也可能产生无穷大。）",
    "searchTextEn": "Limit 极限 Limit( <Function>, <Value> ); <Expression>, <Variable>, )",
    "examples": [
      "Limit((x2 + x) / x2, +∞) 产生 1。",
      "Limit(a sin(x) / x, 0) 产生 a。",
      "Limit(a sin(v) / v, v, 0) 产生 a。"
    ],
    "tags": [
      "category:functions-and-calculus",
      "capability:cas-supported"
    ]
  },
  {
    "command": "LimitAbove",
    "localizedName": "右极限",
    "syntax": "LimitAbove( <函数>, <数值> ); LimitAbove( <代数式>, <数值> ); LimitAbove( <代数式>, <变量>, <数值> )",
    "syntaxEn": "LimitAbove( <Function>, <Value> ); LimitAbove( <Expression>, <Value> ); LimitAbove( <Expression>, <Variable>, <Value> )",
    "description": "针对主函数变量的给定值计算函数的右单侧极限。",
    "searchTextEn": "LimitAbove 右极限 LimitAbove( <Function>, <Value> ); <Expression>, <Variable>, )",
    "examples": [
      "当 x 接近 0 时，计算 1/x 的右侧极限"
    ],
    "tags": [
      "category:functions-and-calculus",
      "capability:cas-supported"
    ]
  },
  {
    "command": "LimitBelow",
    "localizedName": "左极限",
    "syntax": "LimitBelow( <函数>, <数值> ); LimitBelow( <代数式>, <数值> ); LimitBelow( <代数式>, <变量>, <数值> )",
    "syntaxEn": "LimitBelow( <Function>, <Value> ); LimitBelow( <Expression>, <Value> ); LimitBelow( <Expression>, <Variable>, <Value> )",
    "description": "针对主函数变量的给定值计算函数的左单边极限。",
    "searchTextEn": "LimitBelow 左极限 LimitBelow( <Function>, <Value> ); <Expression>, <Variable>, )",
    "examples": [
      "当 x 接近 0 时，计算 1/x 的左侧极限",
      "当 a 接近 0 时，计算 1/a 的左侧极限"
    ],
    "tags": [
      "category:functions-and-calculus",
      "capability:cas-supported"
    ]
  },
  {
    "command": "Line",
    "localizedName": "直线",
    "syntax": "Line( <点>, <点> ); Line( <点>, <平行线> ); Line( <点>, <方向向量> )",
    "syntaxEn": "Line( <Point>, <Point> ); Line( <Point>, <Parallel Line> ); Line( <Point>, <Direction Vector> )",
    "description": "创建一条穿过两点 A 和 B、穿过与给定直线平行的给定点或穿过具有方向向量 v 的给定点的直线。",
    "searchTextEn": "Line 直线 Line( <Point>, <Point> ); <Parallel Line> <Direction Vector> )",
    "examples": [
      "另请参见直线和平行线工具。",
      "您还可以使用参数语法来创建线条。"
    ],
    "tags": [
      "category:3d",
      "category:geometry",
      "capability:create"
    ]
  },
  {
    "command": "LinearEccentricity",
    "localizedName": "半焦距",
    "syntax": "LinearEccentricity( <圆锥曲线> )",
    "syntaxEn": "LinearEccentricity( <Conic> )",
    "description": "半焦距",
    "searchTextEn": "LinearEccentricity Excentricity 半焦距 LinearEccentricity( <Conic> )",
    "examples": [],
    "tags": [
      "category:conic",
      "capability:measure"
    ]
  },
  {
    "command": "LineGraph",
    "localizedName": "折线图",
    "syntax": "LineGraph( <x坐标列表>, <y坐标列表> )",
    "syntaxEn": "LineGraph( <List of x-coordinates>, <List of y-coordinates> )",
    "description": "创建一个图表，用线段连接列表中定义的坐标点，以可视化给定数据。 <x 坐标列表> 是包含 x 值的列表，定义为按升序排列的数字，<y 坐标列表> 是包含 y 值的列表，定义为数字。",
    "searchTextEn": "LineGraph 折线图 LineGraph( <List of x-coordinates>, y-coordinates> )",
    "examples": [],
    "tags": [
      "category:chart"
    ]
  },
  {
    "command": "Locus",
    "localizedName": "轨迹",
    "syntax": "Locus( <构造轨迹线的点>, <点> ); Locus( <构造轨迹线的点>, <滑动条> ); Locus( <斜率场>, <点> ); Locus( <f(x, y)>, <点> )",
    "syntaxEn": "Locus( <Point Creating Locus Line>, <Point> ); Locus( <Point Creating Locus Line>, <Slider> ); Locus( <Slopefield>, <Point> ); Locus( <f(x, y)>, <Point> )",
    "description": "返回点 Q 的轨迹曲线，该轨迹曲线取决于点 P。",
    "searchTextEn": "Locus 轨迹 Locus( <Point Creating Line>, <Point> ); <Slider> <Slopefield>, <f(x, y)>, )",
    "examples": [
      "点 P 必须是对象上的点（例如直线、线段、圆）。",
      "返回点 Q 的轨迹曲线，该轨迹曲线取决于滑块 t 假定的值。",
      "返回相当于给定点的斜率场的轨迹曲线。",
      "返回轨迹曲线，该曲线等于给定点处微分方程 dy/dx = f(x,y) 的解（以数值方式计算）。"
    ],
    "tags": [
      "category:geometry"
    ]
  },
  {
    "command": "LocusEquation",
    "localizedName": "轨迹方程",
    "syntax": "LocusEquation( <轨迹> ); LocusEquation( <轨迹点>, <动点> ); LocusEquation( <布尔表达式>, <动点> )",
    "syntaxEn": "LocusEquation( <Locus> ); LocusEquation( <Locus Point>, <Moving Point> ); LocusEquation( <Boolean Expression>, <Moving Point> )",
    "description": "计算轨迹方程并将其绘制为隐式曲线。它支持三种签名：轨迹、跟踪器和移动点以及带有自由点的布尔条件。",
    "searchTextEn": "LocusEquation 轨迹方程 LocusEquation( <Locus> ); <Locus Point>, <Moving Point> <Boolean Expression>, )",
    "examples": [
      "使用点 A、B、F、P 和 Q 构建一条抛物线作为轨迹，其中 Q 是线 p 和 b 的交点。",
      "计算使 A、B 和 C 点共线的自由点 A 的位置集，从而形成一条穿过 B 和 C 的直线。"
    ],
    "tags": [
      "category:geometry"
    ]
  },
  {
    "command": "Logistic",
    "localizedName": "逻辑分布",
    "syntax": "Logistic( <平均数>, <尺度参数λ>, <变量值> ); Logistic( <平均数>, <尺度参数λ>, <变量值>, <是否累积? true|false> ); Logistic( <平均数>, <尺度参数λ>, x, <是否累积? true|false> )",
    "syntaxEn": "Logistic( <Mean>, <Scale>, <Variable Value> ); Logistic( <Mean>, <Scale>, <Variable Value>, <Boolean Cumulative> ); Logistic( <Mean>, <Scale>, x, <Boolean Cumulative> )",
    "description": "评估变量值 v 处逻辑分布的累积分布函数，即计算概率 P(X ≤ v)，其中 X 是随机变量，其逻辑分布由给定参数均值和尺度定义。",
    "searchTextEn": "Logistic 逻辑分布 Logistic( <Mean>, <Scale>, <Variable Value> ); Value>, <Boolean Cumulative> x, )",
    "examples": [
      "评估给定变量值处逻辑分布的累积分布函数。",
      "基于布尔累积参数评估逻辑分布的累积分布函数或概率密度函数。",
      "基于布尔累积参数创建逻辑分布的累积密度函数或概率密度函数。"
    ],
    "tags": [
      "category:probability"
    ]
  },
  {
    "command": "LogNormal",
    "localizedName": "对数正态分布",
    "syntax": "LogNormal( <平均数>, <标准差>, <变量值> ); LogNormal( <平均数>, <标准差>, <变量值>, <是否累积? true|false> ); LogNormal( <平均数>, <标准差>, x, <是否累积? true|false> )",
    "syntaxEn": "LogNormal( <Mean>, <Standard Deviation>, <Variable Value> ); LogNormal( <Mean>, <Standard Deviation>, <Variable Value>, <Boolean Cumulative> ); LogNormal( <Mean>, <Standard Deviation>, x, <Boolean Cumulative> )",
    "description": "根据给定参数和变量值评估对数正态分布的累积分布函数 (CDF) 或概率密度函数 (PDF)，并提供累积或非累积计算选项。",
    "searchTextEn": "LogNormal 对数正态分布 LogNormal( <Mean>, <Standard Deviation>, <Variable Value> ); Value>, <Boolean Cumulative> x, )",
    "examples": [
      "评估变量值处对数正态分布的累积分布函数，计算 P(X ≤ v)。",
      "如果 Cumulative = true，则评估 CDF，否则评估变量值处的分布的 PDF。",
      "如果 Cumulative = true，则创建 CDF，否则创建分布的 PDF。"
    ],
    "tags": [
      "category:probability"
    ]
  },
  {
    "command": "LowerSum",
    "localizedName": "下和",
    "syntax": "LowerSum( <函数>, <x-起始值>, <x-终止值>, <矩形数量> )",
    "syntaxEn": "LowerSum( <Function>, <Start x-Value>, <End x-Value>, <Number of Rectangles> )",
    "description": "使用 n 个矩形计算区间 [Start x-Value, End x-Value] 上给定函数的较低总和。",
    "searchTextEn": "LowerSum 下和 LowerSum( <Function>, <Start x-Value>, <End <Number of Rectangles> )",
    "examples": [
      "LowerSum(x2, -2, 4, 6) 产生 15。"
    ],
    "tags": [
      "category:functions-and-calculus"
    ]
  },
  {
    "command": "LUDecomposition",
    "localizedName": "LU分解",
    "syntax": "LUDecomposition( <矩阵> )",
    "syntaxEn": "LUDecomposition( <Matrix> )",
    "description": "计算给定矩阵的 LU 分解。",
    "searchTextEn": "LUDecomposition LU分解 LUDecomposition( <Matrix> )",
    "examples": [
      "2x2 矩阵的 LUDecomposition"
    ],
    "tags": [
      "category:vector-and-matrix",
      "capability:cas-supported"
    ]
  },
  {
    "command": "mad",
    "localizedName": "mad",
    "syntax": "mad( <原始数据列表> ); mad( <数字列表>, <频数列表> )",
    "syntaxEn": "mad( <List of Raw Data> ); mad( <List of Numbers>, <List of Frequencies> )",
    "description": "计算列表中数字的平均绝对值 Deviation (https://en.wikipedia.org/wiki/Average_absolute_deviation)。对于两个参数，计算加权平均绝对偏差。",
    "searchTextEn": "mad mad( <List of Raw Data> ); Numbers>, Frequencies> )",
    "examples": [
      "计算列表中数字的平均绝对偏差",
      "计算给定数字的加权平均绝对偏差"
    ],
    "tags": [
      "category:statistics"
    ]
  },
  {
    "command": "MAD",
    "localizedName": "平均绝对偏差",
    "syntax": "MAD( <原始数据列表> ); MAD( <数字列表>, <频数列表> )",
    "syntaxEn": "MAD( <List of Raw Data> ); MAD( <List of Numbers>, <List of Frequencies> )",
    "description": "计算列表中数字的平均绝对值 Deviation (https://en.wikipedia.org/wiki/Average_absolute_deviation)。对于两个参数，计算加权平均绝对偏差。",
    "searchTextEn": "MAD 平均绝对偏差 MAD( <List of Raw Data> ); Numbers>, Frequencies> )",
    "examples": [
      "计算列表中数字的平均绝对偏差",
      "计算给定数字的加权平均绝对偏差"
    ],
    "tags": [
      "category:statistics"
    ]
  },
  {
    "command": "MajorAxis",
    "localizedName": "主轴",
    "syntax": "MajorAxis( <圆锥曲线> )",
    "syntaxEn": "MajorAxis( <Conic> )",
    "description": "主轴",
    "searchTextEn": "MajorAxis FirstAxis 主轴 MajorAxis( <Conic> )",
    "examples": [],
    "tags": [
      "category:conic"
    ]
  },
  {
    "command": "MatrixRank",
    "localizedName": "矩阵的秩",
    "syntax": "MatrixRank( <矩阵> )",
    "syntaxEn": "MatrixRank( <Matrix> )",
    "description": "返回给定矩阵的排名 (https://en.wikipedia.org/wiki/Rank_(linear_algebra))。",
    "searchTextEn": "MatrixRank 矩阵的秩 MatrixRank( <Matrix> )",
    "examples": [
      "计算矩阵 {{2, 2}, {1, 1}} 的秩",
      "计算矩阵 {{1, 2}, {3, 4}} 的秩",
      "计算矩阵 A = {{1, 2, 3}, {1, 1, 1}, {2, 2, 2}} 的秩",
      "计算具有变量 k 的矩阵的秩"
    ],
    "tags": [
      "category:vector-and-matrix",
      "capability:cas-supported"
    ]
  },
  {
    "command": "Max",
    "localizedName": "最大值",
    "syntax": "Max( <区间> ); Max( <数字>, <数字> ); Max( <列表> ); Max( <数据列表>, <频数列表> ); Max( <函数>, <x-起始值>, <x-终止值> )",
    "syntaxEn": "Max( <Interval> ); Max( <Number>, <Number> ); Max( <List> ); Max( <List of Data>, <List of Frequencies> ); Max( <Function>, <Start x-Value>, <End x-Value> )",
    "description": "根据不同的输入类型返回最大值：数字列表、区间界限、两个数字、区间内的函数最大值或具有频率的数据。",
    "searchTextEn": "Max 最大值 Max( <Interval> ); <Number>, <Number> <List> <List of Data>, Frequencies> <Function>, <Start x-Value>, <End x-Value> )",
    "examples": [
      "查找列表中数字的最大值",
      "获取区间的上界",
      "查找两个数字中的最大值",
      "计算区间内函数的局部极大点",
      "从具有频率的数据中查找最大值",
      "CAS语法：包括端点在内的最大间隔"
    ],
    "tags": [
      "category:algebra",
      "category:functions-and-calculus",
      "category:list",
      "category:statistics",
      "capability:cas-supported"
    ]
  },
  {
    "command": "Maximize",
    "localizedName": "最大值点",
    "syntax": "Maximize( <因变数>, <滑动条> ); Maximize( <因变数>, <界点> )",
    "syntaxEn": "Maximize( <Dependent Number>, <Free Number> ); Maximize( <Dependent Number>, <Point on Path> )",
    "description": "使用滑块间隔或路径作为搜索间隔，计算给出从属数最大值的点的自由数或位置。该关系应该是连续的，并且在区间内只有一个局部最大值点。如果构造复杂，该命令可能会返回 ?以避免使用过多的处理器时间。",
    "searchTextEn": "Maximize 最大值点 Maximize( <Dependent Number>, <Free Number> ); <Point on Path> )",
    "examples": [
      "使用滑块最大化三角形面积",
      "最大化圆外点到圆上点的距离"
    ],
    "tags": [
      "category:optimization"
    ]
  },
  {
    "command": "mean",
    "localizedName": "mean",
    "syntax": "mean( <原始数据列表> ); mean( <数字列表>, <频数列表> )",
    "syntaxEn": "mean( <List of Raw Data> ); mean( <List of Numbers>, <List of Frequencies> )",
    "description": "计算列表元素的算术平均值或列表元素的加权平均值。",
    "searchTextEn": "mean mean( <List of Raw Data> ); Numbers>, Frequencies> )",
    "examples": [
      "计算列表元素的算术平均值",
      "计算列表元素的加权平均值"
    ],
    "tags": [
      "category:statistics"
    ]
  },
  {
    "command": "Mean",
    "localizedName": "平均数",
    "syntax": "Mean( <原始数据列表> ); Mean( <数字列表>, <频数列表> )",
    "syntaxEn": "Mean( <List of Raw Data> ); Mean( <List of Numbers>, <List of Frequencies> )",
    "description": "计算列表元素的算术平均值或列表元素的加权平均值。",
    "searchTextEn": "Mean 平均数 Mean( <List of Raw Data> ); Numbers>, Frequencies> )",
    "examples": [
      "计算列表元素的算术平均值",
      "计算列表元素的加权平均值"
    ],
    "tags": [
      "category:algebra",
      "category:list",
      "category:statistics",
      "capability:cas-supported"
    ]
  },
  {
    "command": "MeanX",
    "localizedName": "横坐标平均数",
    "syntax": "MeanX( <点列> )",
    "syntaxEn": "MeanX( <List of Points> )",
    "description": "计算列表中点的 _x_ 坐标的平均值。",
    "searchTextEn": "MeanX 横坐标平均数 MeanX( <List of Points> )",
    "examples": [
      "计算给定点列表的 x 坐标平均值"
    ],
    "tags": [
      "category:statistics"
    ]
  },
  {
    "command": "MeanY",
    "localizedName": "纵坐标平均数",
    "syntax": "MeanY( <点列> )",
    "syntaxEn": "MeanY( <List of Points> )",
    "description": "计算列表中点的 _y_ 坐标的平均值。",
    "searchTextEn": "MeanY 纵坐标平均数 MeanY( <List of Points> )",
    "examples": [
      "MeanY({(0,0), (3,2), (5,1), (2,1), (2,4)}) 收益率 1.6"
    ],
    "tags": [
      "category:statistics"
    ]
  },
  {
    "command": "Median",
    "localizedName": "中位数",
    "syntax": "Median( <原始数据列表> ); Median( <数字列表>, <频数列表> ); Median( <数字列表> )",
    "syntaxEn": "Median( <List of Raw Data> ); Median( <List of Numbers>, <List of Frequencies> ); Median( <List of Numbers> )",
    "description": "确定列表元素的中位数。",
    "searchTextEn": "Median 中位数 Median( <List of Raw Data> ); Numbers>, Frequencies> Numbers> )",
    "examples": [
      "{1, 2, 3} 的中位数为 2",
      "{1, 1, 8, 8} 的中位数为 4.5"
    ],
    "tags": [
      "category:statistics",
      "capability:cas-supported"
    ]
  },
  {
    "command": "Midpoint",
    "localizedName": "中点",
    "syntax": "Midpoint( <线段> ); Midpoint( <圆锥曲线> ); Midpoint( <区间> ); Midpoint( <点>, <点> )",
    "syntaxEn": "Midpoint( <Segment> ); Midpoint( <Conic> ); Midpoint( <Interval> ); Midpoint( <Point>, <Point> )",
    "description": "返回各种几何对象的中点或中心。",
    "searchTextEn": "Midpoint 中点 Midpoint( <Segment> ); <Conic> <Interval> <Point>, <Point> )",
    "examples": [
      "返回线段的中点。",
      "返回圆锥曲线的中心。",
      "返回间隔的中点（作为数字）。",
      "返回两点的中点。",
      "返回给定二次曲面（例如球体、圆锥体等）的中点"
    ],
    "tags": [
      "category:3d",
      "category:algebra",
      "category:conic",
      "category:geometry",
      "capability:create"
    ]
  },
  {
    "command": "Min",
    "localizedName": "最小值",
    "syntax": "Min( <区间> ); Min( <数字>, <数字> ); Min( <列表> ); Min( <数据列表>, <频数列表> ); Min( <函数>, <x-起始值>, <x-终止值> )",
    "syntaxEn": "Min( <Interval> ); Min( <Number>, <Number> ); Min( <List> ); Min( <List of Data>, <List of Frequencies> ); Min( <Function>, <Start x-Value>, <End x-Value> )",
    "description": "返回各种输入的最小值，包括列表、间隔、数字、间隔函数或频率数据。",
    "searchTextEn": "Min 最小值 Min( <Interval> ); <Number>, <Number> <List> <List of Data>, Frequencies> <Function>, <Start x-Value>, <End x-Value> )",
    "examples": [
      "返回列表中数字的最小值",
      "返回区间的下界",
      "返回两个给定数字中的最小值",
      "Calculates (numerically) 给定区间内函数的局部极小点",
      "返回具有相应频率的数据列表的最小值",
      "CAS 语法：给出区间内的最小值，包括端点"
    ],
    "tags": [
      "category:algebra",
      "category:functions-and-calculus",
      "category:list",
      "category:statistics",
      "capability:cas-supported"
    ]
  },
  {
    "command": "MinimalPolynomial",
    "localizedName": "极小多项式",
    "syntax": "MinimalPolynomial( <矩阵> )",
    "syntaxEn": "MinimalPolynomial( <Matrix> )",
    "description": "返回给定矩阵的最小多项式 (https://en.wikipedia.org/wiki/Minimal_polynomial_(linear_algebra))。",
    "searchTextEn": "MinimalPolynomial 极小多项式 MinimalPolynomial( <Matrix> )",
    "examples": [
      "CAS 语法"
    ],
    "tags": [
      "category:vector-and-matrix",
      "capability:cas-supported"
    ]
  },
  {
    "command": "Minimize",
    "localizedName": "最小值点",
    "syntax": "Minimize( <因变数>, <滑动条> ); Minimize( <因变数>, <界点> )",
    "syntaxEn": "Minimize( <Dependent Number>, <Free Number> ); Minimize( <Dependent Number>, <Point on Path> )",
    "description": "计算给出从属数最小值的自由数。空闲号码必须是滑块，并且滑块间隔将用作搜索间隔。该关系应该是连续的，并且在区间内只有一个局部最小值。如果构造复杂，该命令可能会返回 ?以避免使用过多的处理器时间。或者，计算给出从属数最小值的点的位置。该点必须是路径上的点，并且该路径将用作搜索间隔。该关系应该是连续的，并且区间内只有一个局部极小值点。",
    "searchTextEn": "Minimize 最小值点 Minimize( <Dependent Number>, <Free Number> ); <Point on Path> )",
    "examples": [
      "设 a 为 [0,10] 内的滑块，t1 为顶点 C = (_a_, 0)、A = (0, 0) 和 B = (0,10 - _a_) 的直角三角形。 Minimize(t1, a) 给出 0，即最小化 t1 面积的 a 值（当三角形退化为线段时）。",
      "设c为圆，C为圆上的点，D为圆外的点。如果 f = Segment(C,D)，则 Minimize(f,C) 在 c 上创建距 D 距离最小的点。"
    ],
    "tags": [
      "category:optimization"
    ]
  },
  {
    "command": "MinimumSpanningTree",
    "localizedName": "最小生成树",
    "syntax": "MinimumSpanningTree( <点列> )",
    "syntaxEn": "MinimumSpanningTree( <List of Points> )",
    "description": "返回给定顶点上完整图的最小生成树，其中边 (u,v) 的权重是 u 和 v 之间的欧几里得距离。生成的对象是一个轨迹。",
    "searchTextEn": "MinimumSpanningTree 最小生成树 MinimumSpanningTree( <List of Points> )",
    "examples": [],
    "tags": [
      "category:discrete-math"
    ]
  },
  {
    "command": "MinorAxis",
    "localizedName": "副轴",
    "syntax": "MinorAxis( <圆锥曲线> )",
    "syntaxEn": "MinorAxis( <Conic> )",
    "description": "副轴",
    "searchTextEn": "MinorAxis SecondAxis 副轴 MinorAxis( <Conic> )",
    "examples": [],
    "tags": [
      "category:conic"
    ]
  },
  {
    "command": "MixedNumber",
    "localizedName": "带分数",
    "syntax": "MixedNumber( <数字> )",
    "syntaxEn": "MixedNumber( <Number> )",
    "description": "将给定数字转换为带分数。",
    "searchTextEn": "MixedNumber 带分数 MixedNumber( <Number> )",
    "examples": [
      "MixedNumber(3.5) 产生茎：[3 + \\frac{1}{2}]。",
      "MixedNumber(12 / 3) 产生 4。",
      "MixedNumber(12 / 14) 产生茎：[\\frac{6}{7}]。"
    ],
    "tags": [
      "category:algebra",
      "capability:cas-supported",
      "capability:cas-only"
    ]
  },
  {
    "command": "Mod",
    "localizedName": "余式",
    "syntax": "Mod( <被除数>, <除数> ); Mod( <被除式>, <除式> )",
    "syntaxEn": "Mod( <Dividend Number>, <Divisor Number> ); Mod( <Dividend Polynomial>, <Divisor Polynomial> )",
    "description": "得出被除数除以除数时的余数，或得出被除数多项式除以除数多项式时的余数。",
    "searchTextEn": "Mod 余式 Mod( <Dividend Number>, <Divisor Number> ); Polynomial>, Polynomial> )",
    "examples": [
      "对数字求模得到余数",
      "多项式取模得到多项式余数"
    ],
    "tags": [
      "category:algebra",
      "capability:cas-supported"
    ]
  },
  {
    "command": "Mode",
    "localizedName": "众数",
    "syntax": "Mode( <数字列表> )",
    "syntaxEn": "Mode( <List of Numbers> )",
    "description": "确定列表元素的模式。",
    "searchTextEn": "Mode 众数 Mode( <List of Numbers> )",
    "examples": [
      "Mode({1, 2, 3, 4}) 返回空列表 {}。",
      "Mode({1, 1, 1, 2, 3, 4}) 返回列表 {1}。",
      "Mode({1, 1, 2, 2, 3, 3, 4}) 返回列表 {1, 2, 3}。"
    ],
    "tags": [
      "category:statistics"
    ]
  },
  {
    "command": "ModularExponent",
    "localizedName": "模幂",
    "syntax": "ModularExponent( <数字>, <数字>, <数字> )",
    "syntaxEn": "ModularExponent( <Number>, <Number>, <Number> )",
    "description": "返回给定数字的模指数。另请参阅模幂 (https://en.wikipedia.org/wiki/Modular_exponentiation) 了解更多详细信息。",
    "searchTextEn": "ModularExponent 模幂 ModularExponent( <Number>, <Number> )",
    "examples": [
      "ModularExponent(5,12,13) 产生 1，因为 mod(5^12,13)=1。"
    ],
    "tags": [
      "category:algebra",
      "capability:cas-supported"
    ]
  },
  {
    "command": "Name",
    "localizedName": "名称",
    "syntax": "Name( <对象> )",
    "syntaxEn": "Name( <Object> )",
    "description": "在图形视图中以文本形式返回对象的名称。",
    "searchTextEn": "Name 名称 Name( <Object> )",
    "examples": [
      "在图形视图中以文本形式返回对象的名称。"
    ],
    "tags": [
      "category:geogebra",
      "capability:query"
    ]
  },
  {
    "command": "nCr",
    "localizedName": "nCr",
    "syntax": "nCr( <数字 n>, <数字 r> )",
    "syntaxEn": "nCr( <Number n>, <Number r> )",
    "description": "nCr",
    "searchTextEn": "nCr nCr( <Number n>, r> )",
    "examples": [],
    "tags": [
      "category:algebra"
    ]
  },
  {
    "command": "NDerivative",
    "localizedName": "数值导数",
    "syntax": "NDerivative( <函数> ); NDerivative( <函数>, <次数> )",
    "syntaxEn": "NDerivative( <Function> ); NDerivative( <Function>, <Order> )",
    "description": "绘制给定函数的一阶导数（以数值计算）。",
    "searchTextEn": "NDerivative 数值导数 NDerivative( <Function> ); <Function>, <Order> )",
    "examples": [
      "绘制给定函数的一阶导数（以数值计算）。",
      "绘制给定函数的 n 阶导数（以数值方式计算）。"
    ],
    "tags": [
      "category:functions-and-calculus"
    ]
  },
  {
    "command": "Net",
    "localizedName": "展开图",
    "syntax": "Net( <多面体>, <数字> ); Net( <多面体>, <数字>, <面>, <棱>, <棱>, ... )",
    "syntaxEn": "Net( <Polyhedron>, <Number> ); Net( <Polyhedron>, <Number>, <Face>, <Edge>, <Edge>, ... )",
    "description": "在包含用于构建凸多面体的面的平面上创建凸多面体的网。该数字用于定义展开过程的进度，需要介于 0 和 1 之间。当给定数字为 1 时，网络完全展开。",
    "searchTextEn": "Net 展开图 Net( <Polyhedron>, <Number> ); <Number>, <Face>, <Edge>, ... )",
    "examples": [
      "立方体的网显示为拉丁十字。",
      "要探索立方体网络的不同配置，请参阅 GeoGebra 上的示例文件 (http://geogebra.org/material/show/id/136596)。"
    ],
    "tags": [
      "category:3d"
    ]
  },
  {
    "command": "NextPrime",
    "localizedName": "后一质数",
    "syntax": "NextPrime( <数字> )",
    "syntaxEn": "NextPrime( <Number> )",
    "description": "返回大于输入数字的最小素数。",
    "searchTextEn": "NextPrime 后一质数 NextPrime( <Number> )",
    "examples": [
      "NextPrime(10000) 产生 10007。"
    ],
    "tags": [
      "category:algebra",
      "capability:cas-supported"
    ]
  },
  {
    "command": "NIntegral",
    "localizedName": "定积分",
    "syntax": "NIntegral( <函数> ); NIntegral( <函数>, <x-起始值>, <x-终止值> ); NIntegral( <函数>, <x-起始值>, <Start y-Value>, <x-终止值> ); NIntegral( <函数>, <变量>, <起始值>, <终止值> )",
    "syntaxEn": "NIntegral( <Function> ); NIntegral( <Function>, <Start x-Value>, <End x-Value> ); NIntegral( <Function>, <Start x-Value>, <Start y-Value>, <End x-Value> ); NIntegral( <Function>, <Variable>, <Start Value>, <End Value> )",
    "description": "以数值方式计算并绘制不定积分或定积分。对于不定积分，用 c=0 绘制 y=F(x)+c 的图形。对于定积分，计算指定区间内积分的数值。",
    "searchTextEn": "NIntegral 定积分 NIntegral( <Function> ); <Function>, <Start x-Value>, <End x-Value> y-Value>, <Variable>, Value>, Value> )",
    "examples": [
      "使用积分常数 c=0 绘制 e^(-x^2) 的不定积分",
      "计算 e^(-x^2) 从 0 到 1 的定积分，结果为 0.75",
      "绘制区间 [π,2π] 中通过点 (π,1) 的 sin(x)/x 的不定积分",
      "计算 e^(-a^2) 关于变量 a 从 0 到 1 的定积分，结果为 0.75"
    ],
    "tags": [
      "category:functions-and-calculus",
      "capability:cas-supported",
      "capability:cas-only"
    ]
  },
  {
    "command": "NInvert",
    "localizedName": "反函数",
    "syntax": "NInvert( <函数> )",
    "syntaxEn": "NInvert( <Function> )",
    "description": "给出函数的反函数，但不显示反函数公式。如果您想获得公式，请使用反转命令。",
    "searchTextEn": "NInvert 反函数 NInvert( <Function> )",
    "examples": [
      "NInvert(sin(x)) 产生函数 f，对于 -1 < x < 1 满足 sin(f(x))=x。"
    ],
    "tags": [
      "category:functions-and-calculus"
    ]
  },
  {
    "command": "Normal",
    "localizedName": "正态分布",
    "syntax": "Normal( <平均数>, <标准差>, <变量值> ); Normal( <平均数>, <标准差>, <变量值>, <是否累积? true|false> ); Normal( <平均数>, <标准差>, x, <是否累积? true|false> )",
    "syntaxEn": "Normal( <Mean>, <Standard Deviation>, <Variable Value> ); Normal( <Mean>, <Standard Deviation>, <Variable Value>, <Boolean Cumulative> ); Normal( <Mean>, <Standard Deviation>, x, <Boolean Cumulative> )",
    "description": "根据给定的平均值、标准差和变量值，评估正态分布的累积分布函数 (CDF) 或概率密度函数 (PDF)，或计算间隔内的概率。",
    "searchTextEn": "Normal 正态分布 Normal( <Mean>, <Standard Deviation>, <Variable Value> ); Value>, <Boolean Cumulative> x, )",
    "examples": [
      "在给定变量值处评估 CDF，返回该值左侧的概率。",
      "在给定变量值处，如果 Cumulative = true，则评估 CDF；如果 Cumulative = false，则评估 PDF。",
      "计算区间 [u, v] 中正态随机变量的概率。",
      "如果 Cumulative = true，则创建 CDF；如果 Cumulative = false，则创建 PDF，作为 x 的函数。"
    ],
    "tags": [
      "category:probability",
      "capability:cas-supported"
    ]
  },
  {
    "command": "Normalize",
    "localizedName": "归一化",
    "syntax": "Normalize( <数字列表> ); Normalize( <点列> )",
    "syntaxEn": "Normalize( <List of Numbers> ); Normalize( <List of Points> )",
    "description": "返回包含给定数字或点的标准化形式的列表，使用线性函数 x → (x - Min(list)) / (Max(list) - Min(list)) 将值映射到区间 [0, 1]。",
    "searchTextEn": "Normalize 归一化 Normalize( <List of Numbers> ); Points> )",
    "examples": [
      "标准化数字列表",
      "标准化点列表"
    ],
    "tags": [
      "category:algebra",
      "category:functions-and-calculus",
      "category:list",
      "category:statistics"
    ]
  },
  {
    "command": "NormalQuantilePlot",
    "localizedName": "正态分位数图",
    "syntax": "NormalQuantilePlot( <原始数据列表> )",
    "syntaxEn": "NormalQuantilePlot( <List of Raw Data> )",
    "description": "根据给定的数据列表创建正态分位数图，并通过点绘制一条线，显示完全正态数据的理想图。通过在 _x_ 轴上绘制数据值与在 _y_ 轴上的预期正常得分（Z 得分）来形成点。更准确地说，_y_ 值是使用 Filliben 的估计来计算的。",
    "searchTextEn": "NormalQuantilePlot 正态分位数图 NormalQuantilePlot( <List of Raw Data> )",
    "examples": [],
    "tags": [
      "category:chart"
    ]
  },
  {
    "command": "NSolutions",
    "localizedName": "近似解集",
    "syntax": "NSolutions( <方程> ); NSolutions( <方程>, <变量> ); NSolutions( <方程>, <变量 = 初值> ); NSolutions( <方程列表>, <变量列表> )",
    "syntaxEn": "NSolutions( <Equation> ); NSolutions( <Equation>, <Variable> ); NSolutions( <Equation>, <Variable = starting value> ); NSolutions( <List of Equations>, <List of Variables> )",
    "description": "Attempts (numerically) 求主变量方程的解。对于非多项式，您应该始终指定一个起始值。",
    "searchTextEn": "NSolutions 近似解集 NSolutions( <Equation> ); <Equation>, <Variable> <Variable = starting value> <List of Equations>, Variables> )",
    "examples": [
      "求解多项式方程",
      "求解指定变量的方程",
      "用起始值求解方程",
      "用特定变量的起始值求解方程",
      "求解具有起始值的方程组"
    ],
    "tags": [
      "category:algebra",
      "capability:cas-supported",
      "capability:cas-only"
    ]
  },
  {
    "command": "NSolve",
    "localizedName": "近似解",
    "syntax": "NSolve( <方程> ); NSolve( <方程>, <变量> ); NSolve( <方程>, <变量 = 初值> ); NSolve( <方程列表>, <变量列表> )",
    "syntaxEn": "NSolve( <Equation> ); NSolve( <Equation>, <Variable> ); NSolve( <Equation>, <Variable = starting value> ); NSolve( <List of Equations>, <List of Variables> )",
    "description": "Attempts (numerically) 求主变量方程的解。对于非多项式，您应该始终指定一个起始值（见下文）。",
    "searchTextEn": "NSolve 近似解 NSolve( <Equation> ); <Equation>, <Variable> <Variable = starting value> <List of Equations>, Variables> )",
    "examples": [
      "求解多项式方程",
      "在 CAS 视图中求解特定变量的方程",
      "求解具有变量起始值的方程",
      "求解具有初始值的方程组"
    ],
    "tags": [
      "category:algebra",
      "capability:cas-supported",
      "capability:cas-only"
    ]
  },
  {
    "command": "NSolveODE",
    "localizedName": "解常微分方程组",
    "syntax": "NSolveODE( <导数列表>, <x坐标初值>, <y坐标初值列表>, <x坐标终值> )",
    "syntaxEn": "NSolveODE( <List of Derivatives>, <Initial x-coordinate>, <List of Initial y-coordinates>, <Final x-coordinate> )",
    "description": "Solves (numerically) 微分方程组",
    "searchTextEn": "NSolveODE 解常微分方程组 NSolveODE( <List of Derivatives>, <Initial x-coordinate>, Initial y-coordinates>, <Final x-coordinate> )",
    "examples": [
      "求解时间上向前和向后的三个微分方程组",
      "求解具有初始条件的四个微分方程组",
      "求解摆微分方程并创建动画"
    ],
    "tags": [
      "category:functions-and-calculus"
    ]
  },
  {
    "command": "Numerator",
    "localizedName": "分子",
    "syntax": "Numerator( <数字> ); Numerator( <函数> ); Numerator( <代数式> )",
    "syntaxEn": "Numerator( <Number> ); Numerator( <Function> ); Numerator( <Expression> )",
    "description": "返回有理数或表达式的分子。对于函数，返回函数的分子。对于数字，返回有理数（简化）的分子或无理数输入的连分数的分子。",
    "searchTextEn": "Numerator 分子 Numerator( <Number> ); <Function> <Expression> )",
    "examples": [
      "获取函数的分子",
      "获取有理数的分子（简化）",
      "得到化简后的有理数的分子",
      "获取表达式的分子",
      "获取变量表达式的分子",
      "化简后得到分子"
    ],
    "tags": [
      "category:algebra",
      "category:functions-and-calculus",
      "capability:cas-supported"
    ]
  },
  {
    "command": "Numeric",
    "localizedName": "近似数",
    "syntax": "Numeric( <代数式> ); Numeric( <代数式>, <有效数字个数> )",
    "syntaxEn": "Numeric( <Expression> ); Numeric( <Expression>, <Significant Figures> )",
    "description": "尝试确定给定表达式的数值近似值。小数位数取决于您在选项菜单中选择的全局舍入。",
    "searchTextEn": "Numeric 近似数 Numeric( <Expression> ); <Expression>, <Significant Figures> )",
    "examples": [
      "Numeric(3 / 2) 的收益率为 1.5。",
      "Numeric(sin(1), 20) 的收益率为 0.84147098480789650665。",
      "Numeric(-500000000/785398163*sin(785398163/500000000)*1258025227.192+500000000/785398163*1258025227.192,10) 将给出 4096，但 Numeric(-500000000/785398163*sin(785398163/500000000)*1258025227.192+500000000/785398163*1258025227.192,30) 将给出 0.318309886345536696694580314215。"
    ],
    "tags": [
      "category:algebra",
      "capability:cas-supported",
      "capability:cas-only"
    ]
  },
  {
    "command": "Object",
    "localizedName": "对象",
    "syntax": "Object( <对象名称文本> )",
    "syntaxEn": "Object( <Name of Object as Text> )",
    "description": "返回给定名称的对象。结果始终是一个依赖对象。",
    "searchTextEn": "Object 对象 Object( <Name of as Text> )",
    "examples": [
      "如果点 A1、A2、...、A20 存在并且还有滑块 n = 2，则 Object(\"A\" + n) 将创建点 A2 的副本。"
    ],
    "tags": [
      "category:geogebra",
      "capability:query"
    ]
  },
  {
    "command": "Octahedron",
    "localizedName": "正八面体",
    "syntax": "Octahedron( <等边三角形> ); Octahedron( <点>, <点>, <点> ); Octahedron( <点>, <点>, <方向> )",
    "syntaxEn": "Octahedron( <Equilateral Triangle> ); Octahedron( <Point>, <Point>, <Point> ); Octahedron( <Point>, <Point>, <Direction> )",
    "description": "基于不同的输入配置创建八面体：以等边三角形为底，使用两个点和一个方向定义边和方向，使用三个点定义第一个面（必须形成等边三角形），或使用两个点自动生成第三个点以围绕第一条边旋转。",
    "searchTextEn": "Octahedron 正八面体 Octahedron( <Equilateral Triangle> ); <Point>, <Point> <Direction> )",
    "examples": [
      "创建具有两个点的八面体，自动生成第三个点以围绕第一条边旋转。",
      "另请参阅用于创建其他几何实体的命令。"
    ],
    "tags": [
      "category:3d"
    ]
  },
  {
    "command": "Ordinal",
    "localizedName": "序数",
    "syntax": "Ordinal( <自然数> )",
    "syntaxEn": "Ordinal( <Integer> )",
    "description": "将数字转换为序数（作为文本）。",
    "searchTextEn": "Ordinal 序数 Ordinal( <Integer> )",
    "examples": [
      "Ordinal(5) 返回“5th”。"
    ],
    "tags": [
      "category:text"
    ]
  },
  {
    "command": "OrdinalRank",
    "localizedName": "序数列表",
    "syntax": "OrdinalRank( <列表> )",
    "syntaxEn": "OrdinalRank( <List> )",
    "description": "返回一个列表，其第 i 个元素是列表 L (rank of element is its position in Sort(L)) 中第 i 个元素的排名。如果 L 中有更多相等的元素占据了 Sort[L] 中从 k 到 l 的位置，则从 k 到 l 的排名与这些元素相关联。",
    "searchTextEn": "OrdinalRank 序数列表 OrdinalRank( <List> )",
    "examples": [
      "OrdinalRank({4, 1, 2, 3, 4, 2}) 返回 {5, 1, 2, 4, 6, 3}",
      "OrdinalRank({3, 2, 2, 1}) 返回 {4, 2, 3, 1}"
    ],
    "tags": [
      "category:list"
    ]
  },
  {
    "command": "OsculatingCircle",
    "localizedName": "密切圆",
    "syntax": "OsculatingCircle( <点>, <对象> )",
    "syntaxEn": "OsculatingCircle( <Point>, <Object> )",
    "description": "产生给定点处对象的密切圆（函数、曲线、二次曲线）。",
    "searchTextEn": "OsculatingCircle 密切圆 OsculatingCircle( <Point>, <Object> )",
    "examples": [
      "函数在一点的密切圆",
      "曲线在一点处的密切圆",
      "函数、曲线和二次曲线的密切圆示例"
    ],
    "tags": [
      "category:conic",
      "category:functions-and-calculus"
    ]
  },
  {
    "command": "Pan",
    "localizedName": "移动视图",
    "syntax": "Pan( <x>, <y> ); Pan( <x>, <y>, <z> )",
    "syntaxEn": "Pan( <x>, <y> ); Pan( <x>, <y>, <z> )",
    "description": "对于 2D 视图，将活动视图向右移动 x 像素，向上移动 y 像素；对于 3D 视图，将活动视图向右移动 (x, y, z) 像素。",
    "searchTextEn": "Pan 移动视图 Pan( <x>, <y> ); <y>, <z> )",
    "examples": [
      "将活动视图向右移动 x 像素，向上移动 y 像素",
      "如果活动视图是 3D 视图，则将活动视图移动 (x, y, z) 像素；如果是 2D 视图，则将活动视图移动 (x, y) 像素"
    ],
    "tags": [
      "category:scripting",
      "capability:view",
      "capability:script"
    ]
  },
  {
    "command": "Parabola",
    "localizedName": "抛物线",
    "syntax": "Parabola( <点>, <直线> )",
    "syntaxEn": "Parabola( <Point>, <Line> )",
    "description": "返回以焦点和直线为准线的抛物线。",
    "searchTextEn": "Parabola 抛物线 Parabola( <Point>, <Line> )",
    "examples": [
      "令 a = Line((0,1), (2,1))。 Parabola((3, 3), a) 得出 x² - 6x - 4y = -17。"
    ],
    "tags": [
      "category:conic",
      "capability:create"
    ]
  },
  {
    "command": "Parameter",
    "localizedName": "焦参数",
    "syntax": "Parameter( <抛物线> )",
    "syntaxEn": "Parameter( <Parabola> )",
    "description": "返回抛物线的参数，即准线和焦点之间的距离。",
    "searchTextEn": "Parameter 焦参数 Parameter( <Parabola> )",
    "examples": [
      "Parameter(y = x2 - 3x + 5) 返回 0.5。"
    ],
    "tags": [
      "category:conic"
    ]
  },
  {
    "command": "ParametricDerivative",
    "localizedName": "参数导数",
    "syntax": "ParametricDerivative( <曲线> )",
    "syntaxEn": "ParametricDerivative( <Curve> )",
    "description": "返回由 stem:[ \\left( x(t), \\frac{y'(t)}{ x'(t)} \\right) ] 给出的新参数曲线。",
    "searchTextEn": "ParametricDerivative 参数导数 ParametricDerivative( <Curve> )",
    "examples": [
      "ParametricDerivative(Curve(2t, t², t, 0, 10)) 返回参数曲线 (x(t) = 2t, y(t) = t)。作为命令参数给出的曲线是函数 f(x) = stem:[ \\frac{x²}{4}]，结果是该函数的导数：f'(x) = stem:[ \\frac{x}{2}]。"
    ],
    "tags": [
      "category:functions-and-calculus"
    ]
  },
  {
    "command": "ParseToFunction",
    "localizedName": "解析为函数",
    "syntax": "ParseToFunction( <函数>, <字符串> )",
    "syntaxEn": "ParseToFunction( <Function>, <String> )",
    "description": "解析包含函数定义的文本并创建相应的函数。",
    "searchTextEn": "ParseToFunction 解析为函数 ParseToFunction( <Function>, <String> )",
    "examples": [
      "ParseToFunction(\"x2\") 创建函数 _f_(_x_) = x2_._",
      "ParseToFunction(\"t+2/t\") 创建函数 _f_(_t_) = t + 2/_t_。",
      "定义 f(x) = 3x² + 2 且 text1 =“f(x) = 3x + 1”。 ParseToFunction(f, text1) 返回 f(x) = 3x +1。",
      "ParseToFunction(\"2u+3v\",{\"u\", \"v\"}) 创建函数 a(u,v) = 2u + 3v。"
    ],
    "tags": [
      "category:functions-and-calculus",
      "category:scripting",
      "category:text",
      "capability:script",
      "capability:parse"
    ]
  },
  {
    "command": "ParseToNumber",
    "localizedName": "解析为数",
    "syntax": "ParseToNumber( <数字>, <字符串> )",
    "syntaxEn": "ParseToNumber( <Number>, <String> )",
    "description": "解析文本并将结果存储为数字。",
    "searchTextEn": "ParseToNumber 解析为数 ParseToNumber( <Number>, <String> )",
    "examples": [
      "定义 a = 3 和 text1 =“6”。 ParseToNumber(a, text1) 返回 a = 6。",
      "ParseToNumber(\"1+2+5-pi\") 创建号码 a = 4.86。"
    ],
    "tags": [
      "category:algebra",
      "category:scripting",
      "category:text",
      "capability:script",
      "capability:parse"
    ]
  },
  {
    "command": "PartialFractions",
    "localizedName": "部分分式",
    "syntax": "PartialFractions( <函数> ); PartialFractions( <函数>, <变量> )",
    "syntaxEn": "PartialFractions( <Function> ); PartialFractions( <Function>, <Variable> )",
    "description": "如果可能，生成主函数变量或指定变量的给定函数的部分分数，并在图形视图中绘制图形。",
    "searchTextEn": "PartialFractions 部分分式 PartialFractions( <Function> ); <Function>, <Variable> )",
    "examples": [
      "计算具有主变量的函数的部分分数",
      "计算具有指定变量的函数的部分分数"
    ],
    "tags": [
      "category:algebra",
      "category:functions-and-calculus",
      "capability:cas-supported"
    ]
  },
  {
    "command": "Pascal",
    "localizedName": "帕斯卡分布",
    "syntax": "Pascal( <成功次数>, <成功概率> ); Pascal( <成功次数>, <成功概率>, <是否累积? true|false> ); Pascal( <成功次数>, <成功概率>, <变量值>, <是否累积? true|false> )",
    "syntaxEn": "Pascal( <n>, <p> ); Pascal( <n>, <p>, <Boolean Cumulative> ); Pascal( <n>, <p>, <Variable Value>, <Boolean Cumulative> )",
    "description": "返回帕斯卡分布（负二项分布）的条形图。帕斯卡分布对重复相互独立的伯努利试验中第 n 次成功之前的失败次数进行建模，每次试验的成功概率为 p。",
    "searchTextEn": "Pascal 帕斯卡分布 Pascal( <n>, <p> ); <p>, <Boolean Cumulative> <Variable Value>, )",
    "examples": [
      "如果必须成功的独立伯努利试验次数为 n = 1，则一次试验成功的概率为 p = 1/6，则成功之前 2 次失败的概率由 Pascal(1, 1/6, 2, false) 给出，在代数视图中得出 0.12，在 CAS 视图中得出 25/216。"
    ],
    "tags": [
      "category:probability",
      "capability:cas-supported"
    ]
  },
  {
    "command": "PathParameter",
    "localizedName": "路径值",
    "syntax": "PathParameter( <路径上的点> )",
    "syntaxEn": "PathParameter( <Point On Path> )",
    "description": "返回属于路径的点的参数（即范围从 0 到 1 的数字）。",
    "searchTextEn": "PathParameter 路径值 PathParameter( <Point On Path> )",
    "examples": [
      "令 f(x) = x² + x - 1 且 A 是附加到该函数的坐标为 (1,1) 的点（您可以使用对象上的点工具或 A=Point(f)、SetCoords(A,1,1) 命令创建此类点）。那么 PathParameter(A) 的值为 0.47。",
      "显示不同几何对象的路径参数公式的表格"
    ],
    "tags": [
      "category:conic",
      "category:functions-and-calculus",
      "category:geometry"
    ]
  },
  {
    "command": "Payment",
    "localizedName": "每期付款额",
    "syntax": "Payment( <利率>, <期数>, <现值>, <未来值(可选)>, <类型(可选) 1-期初|0-期末> )",
    "syntaxEn": "Payment( <Rate>, <Number of Periods>, <Present Value>, <Future Value (optional)>, <Type (optional)> )",
    "description": "根据固定还款额和固定利率计算贷款付款额。",
    "searchTextEn": "Payment 每期付款额 Payment( <Rate>, <Number of Periods>, <Present Value>, <Future Value (optional)>, <Type (optional)> )",
    "examples": [
      "每月支付贷款"
    ],
    "tags": [
      "category:financial"
    ]
  },
  {
    "command": "PenStroke",
    "localizedName": "PenStroke",
    "syntax": "PenStroke( <点>, ..., <点> )",
    "syntaxEn": "PenStroke( <Point>, ..., <Point> )",
    "description": "PenStroke",
    "searchTextEn": "PenStroke PenStroke( <Point>, ..., <Point> )",
    "examples": [],
    "tags": [
      "category:geometry"
    ]
  },
  {
    "command": "Percentile",
    "localizedName": "百分位数",
    "syntax": "Percentile( <数字列表>, <百分数> )",
    "syntaxEn": "Percentile( <List of Numbers>, <Percent> )",
    "description": "当列表按升序排序时，返回截断数字列表的前 P% 的值。百分比必须是区间 0 < P ≤ 1 中的数字。",
    "searchTextEn": "Percentile 百分位数 Percentile( <List of Numbers>, <Percent> )",
    "examples": [
      "计算列表的第 25 个百分位"
    ],
    "tags": [
      "category:statistics"
    ]
  },
  {
    "command": "Perimeter",
    "localizedName": "周长",
    "syntax": "Perimeter( <多边形> ); Perimeter( <圆锥曲线> ); Perimeter( <轨迹> )",
    "syntaxEn": "Perimeter( <Polygon> ); Perimeter( <Conic> ); Perimeter( <Locus> )",
    "description": "返回多边形的周长。如果给定的二次曲线是圆或椭圆，则此命令返回其周长。否则结果是不确定的。如果给定轨迹是有限的，则此命令返回其近似周长。否则结果是不确定的。",
    "searchTextEn": "Perimeter 周长 Perimeter( <Polygon> ); <Conic> <Locus> )",
    "examples": [
      "多边形的周长",
      "圆锥曲线（圆或椭圆）的周长"
    ],
    "tags": [
      "category:3d",
      "category:conic",
      "category:geometry",
      "capability:measure"
    ]
  },
  {
    "command": "Periods",
    "localizedName": "期数",
    "syntax": "Periods( <利率>, <每期付款额>, <现值>, <未来值(可选)>, <类型(可选) 1-期初|0-期末> )",
    "syntaxEn": "Periods( <Rate>, <Payment>, <Present Value>, <Future Value (optional)>, <Type (optional)> )",
    "description": "返回基于定期、固定付款和固定利率的年金的期数。",
    "searchTextEn": "Periods 期数 Periods( <Rate>, <Payment>, <Present Value>, <Future Value (optional)>, <Type (optional)> )",
    "examples": [
      "计算期末付款的付款次数",
      "使用期初付款计算付款次数"
    ],
    "tags": [
      "category:financial"
    ]
  },
  {
    "command": "PerpendicularBisector",
    "localizedName": "中垂线",
    "syntax": "PerpendicularBisector( <线段> ); PerpendicularBisector( <点>, <点> ); PerpendicularBisector( <点>, <点>, <方向> )",
    "syntaxEn": "PerpendicularBisector( <Segment> ); PerpendicularBisector( <Point>, <Point> ); PerpendicularBisector( <Point>, <Point>, <Direction> )",
    "description": "中垂线",
    "searchTextEn": "PerpendicularBisector LineBisector 中垂线 PerpendicularBisector( <Segment> ); <Point>, <Point> <Direction> )",
    "examples": [],
    "tags": [
      "category:3d",
      "category:geometry",
      "capability:create"
    ]
  },
  {
    "command": "PerpendicularLine",
    "localizedName": "垂线",
    "syntax": "PerpendicularLine( <点>, <直线> ); PerpendicularLine( <点>, <线段> ); PerpendicularLine( <点>, <向量> ); PerpendicularLine( <点>, <平面> ); PerpendicularLine( <直线>, <直线> ); PerpendicularLine( <点>, <方向>, <方向> ); PerpendicularLine( <点>, <直线>, <平面xOy｜3D 空间> )",
    "syntaxEn": "PerpendicularLine( <Point>, <Line> ); PerpendicularLine( <Point>, <Segment> ); PerpendicularLine( <Point>, <Vector> ); PerpendicularLine( <Point>, <Plane> ); PerpendicularLine( <Line>, <Line> ); PerpendicularLine( <Point>, <Direction>, <Direction> ); PerpendicularLine( <Point>, <Line>, <Context> )",
    "description": "垂线",
    "searchTextEn": "PerpendicularLine OrthogonalLine 垂线 PerpendicularLine( <Point>, <Line> ); <Segment> <Vector> <Plane> <Line>, <Direction>, <Direction> <Context> )",
    "examples": [],
    "tags": [
      "category:3d",
      "category:geometry",
      "capability:create"
    ]
  },
  {
    "command": "PerpendicularPlane",
    "localizedName": "垂直平面",
    "syntax": "PerpendicularPlane( <点>, <直线> ); PerpendicularPlane( <点>, <向量> )",
    "syntaxEn": "PerpendicularPlane( <Point>, <Line> ); PerpendicularPlane( <Point>, <Vector> )",
    "description": "垂直平面",
    "searchTextEn": "PerpendicularPlane OrthogonalPlane 垂直平面 PerpendicularPlane( <Point>, <Line> ); <Vector> )",
    "examples": [],
    "tags": [
      "category:3d",
      "capability:create"
    ]
  },
  {
    "command": "PerpendicularVector",
    "localizedName": "法向量",
    "syntax": "PerpendicularVector( <直线> ); PerpendicularVector( <线段> ); PerpendicularVector( <向量> ); PerpendicularVector( <平面> )",
    "syntaxEn": "PerpendicularVector( <Line> ); PerpendicularVector( <Segment> ); PerpendicularVector( <Vector> ); PerpendicularVector( <Plane> )",
    "description": "法向量",
    "searchTextEn": "PerpendicularVector OrthogonalVector 法向量 PerpendicularVector( <Line> ); <Segment> <Vector> <Plane> )",
    "examples": [],
    "tags": [
      "category:vector-and-matrix",
      "capability:cas-supported"
    ]
  },
  {
    "command": "PieChart",
    "localizedName": "扇形图",
    "syntax": "PieChart( <频数列表> ); PieChart( <频数列表>, <中心>, <半径> )",
    "syntaxEn": "PieChart( <List of Frequencies> ); PieChart( <List of Frequencies>, <Center>, <Radius> )",
    "description": "使用频率列表创建饼图。整个饼图给出 100%，提供的数据显示为饼图切片。",
    "searchTextEn": "PieChart 扇形图 PieChart( <List of Frequencies> ); Frequencies>, <Center>, <Radius> )",
    "examples": [
      "使用默认中心 (0,0) 和半径 3 的频率列表创建饼图",
      "使用频率列表创建具有给定中心和半径的饼图"
    ],
    "tags": [
      "category:chart"
    ]
  },
  {
    "command": "Plane",
    "localizedName": "平面",
    "syntax": "Plane( <多边形> ); Plane( <圆锥曲线> ); Plane( <点>, <平面> ); Plane( <点>, <直线> ); Plane( <直线>, <直线> ); Plane( <点>, <点>, <点> ); Plane( <点>, <向量>, <向量> )",
    "syntaxEn": "Plane( <Polygon> ); Plane( <Conic> ); Plane( <Point>, <Plane> ); Plane( <Point>, <Line> ); Plane( <Line>, <Line> ); Plane( <Point>, <Point>, <Point> ); Plane( <Point>, <Vector>, <Vector> )",
    "description": "基于各种几何输入（例如多边形、圆锥曲线、点、线或向量）创建平面。",
    "searchTextEn": "Plane 平面 Plane( <Polygon> ); <Conic> <Point>, <Plane> <Line> <Line>, <Point> <Vector>, <Vector> )",
    "examples": [
      "通过三点创建一个平面",
      "通过一点创建一个与另一个平面平行的平面"
    ],
    "tags": [
      "category:3d",
      "capability:create"
    ]
  },
  {
    "command": "PlaneBisector",
    "localizedName": "中垂面",
    "syntax": "PlaneBisector( <线段> ); PlaneBisector( <点>, <点> )",
    "syntaxEn": "PlaneBisector( <Segment> ); PlaneBisector( <Point>, <Point> )",
    "description": "创建两点或线段之间的平面正交平分线。",
    "searchTextEn": "PlaneBisector 中垂面 PlaneBisector( <Segment> ); <Point>, <Point> )",
    "examples": [],
    "tags": [
      "category:3d",
      "capability:create"
    ]
  },
  {
    "command": "PlaySound",
    "localizedName": "播放声音",
    "syntax": "PlaySound( <URL> ); PlaySound( <是否播放? true|false> ); PlaySound( <函数>, <最小值>, <最大值> ); PlaySound( <函数>, <最小值>, <最大值>, <采样率>, <样本深度> )",
    "syntaxEn": "PlaySound( <URL> ); PlaySound( <Boolean Play> ); PlaySound( <Function>, <Min Value>, <Max Value> ); PlaySound( <Function>, <Min Value>, <Max Value>, <Sample Rate>, <Sample Depth> )",
    "description": "从 URL 播放 MP3 文件、控制播放（播放/暂停）、通过功能生成声音或播放 MIDI 音符（仅限 GeoGebra Classic 5）。",
    "searchTextEn": "PlaySound 播放声音 PlaySound( <URL> ); <Boolean Play> <Function>, <Min Value>, <Max Value> <Sample Rate>, Depth> )",
    "examples": [
      "从 URL 播放 MP3 文件",
      "播放或暂停声音（不适用于 MP3 文件）",
      "从函数生成声音（例如，440 Hz 的正弦波 1 秒）",
      "弹奏 MIDI 音符（仅限 GeoGebra Classic 5）"
    ],
    "tags": [
      "category:scripting",
      "capability:interaction",
      "capability:script",
      "capability:audio",
      "risk:external-output"
    ]
  },
  {
    "command": "PlotSolve",
    "localizedName": "求解绘图",
    "syntax": "PlotSolve( <关于 x 的方程> )",
    "syntaxEn": "PlotSolve( <Equation in x> )",
    "description": "求解主变量的给定方程并返回所有解的列表以及图形视图中的图形输出。",
    "searchTextEn": "PlotSolve 求解绘图 PlotSolve( <Equation in x> )",
    "examples": [
      "PlotSolve(x2 = 4x) 产生 {(0, 0), (4, 0)} 并在图形视图中显示点 (0, 0) 和 (4, 0)。"
    ],
    "tags": [
      "category:algebra",
      "category:functions-and-calculus",
      "capability:cas-supported"
    ]
  },
  {
    "command": "Point",
    "localizedName": "描点",
    "syntax": "Point( <对象> ); Point( <对象>, <参数> ); Point( <点>, <向量> ); Point( <列表> )",
    "syntaxEn": "Point( <Object> ); Point( <Object>, <Parameter> ); Point( <Point>, <Vector> ); Point( <List> )",
    "description": "返回几何对象上的点。结果点可以沿着路径移动。返回具有给定路径参数的几何对象上的点。通过将向量添加到给定点来创建新点。将包含两个数字的列表转换为 Point。",
    "searchTextEn": "Point 描点 Point( <Object> ); <Object>, <Parameter> <Point>, <Vector> <List> )",
    "examples": [
      "将包含两个数字的列表转换为 Point"
    ],
    "tags": [
      "category:3d",
      "category:geometry",
      "capability:create"
    ]
  },
  {
    "command": "PointIn",
    "localizedName": "内点",
    "syntax": "PointIn( <区域> )",
    "syntaxEn": "PointIn( <Region> )",
    "description": "返回仅限于给定区域的点。",
    "searchTextEn": "PointIn 内点 PointIn( <Region> )",
    "examples": [],
    "tags": [
      "category:3d",
      "category:geometry",
      "capability:create"
    ]
  },
  {
    "command": "PointList",
    "localizedName": "点列",
    "syntax": "PointList( <列表> )",
    "syntaxEn": "PointList( <List> )",
    "description": "从二元素列表的列表创建点列表。",
    "searchTextEn": "PointList 点列 PointList( <List> )",
    "examples": [
      "PointList({{1,2},{3,4}}) 返回 {(1,2),(3,4)}"
    ],
    "tags": [
      "category:list"
    ]
  },
  {
    "command": "Poisson",
    "localizedName": "泊松分布",
    "syntax": "Poisson( <平均数> ); Poisson( <平均数>, <是否累积? true|false> ); Poisson( <平均数>, <变量值>, <是否累积? true|false> )",
    "syntaxEn": "Poisson( <Mean> ); Poisson( <Mean>, <Boolean Cumulative> ); Poisson( <Mean>, <Variable Value>, <Boolean Cumulative> )",
    "description": "返回具有给定均值 λ 的泊松分布的条形图，或计算泊松随机变量的概率。",
    "searchTextEn": "Poisson 泊松分布 Poisson( <Mean> ); <Mean>, <Boolean Cumulative> <Variable Value>, )",
    "examples": [
      "计算平均值为 3 的泊松分布的累积概率 P(X ≤ 1)",
      "计算平均值为 3 的泊松分布的概率 P(X = 1)",
      "使用简化语法计算平均值为 1 的泊松分布的概率 P(1 ≤ X ≤ 5)"
    ],
    "tags": [
      "category:probability",
      "capability:cas-supported"
    ]
  },
  {
    "command": "Polar",
    "localizedName": "极线",
    "syntax": "Polar( <点>, <圆锥曲线> ); Polar( <直线>, <圆锥曲线> )",
    "syntaxEn": "Polar( <Point>, <Conic> ); Polar( <Line>, <Conic> )",
    "description": "创建给定点相对于圆锥曲线的极线，或在给定极线和圆锥曲线的情况下创建极点。",
    "searchTextEn": "Polar 极线 Polar( <Point>, <Conic> ); <Line>, )",
    "examples": [
      "Polar((0,2), y = x2 - 3x + 5) 创建线 1.5x + 0.5y = 4",
      "Polar(1.5x+0.5y=4, y = x2 - 3x + 5) 创建点 (0, 2)"
    ],
    "tags": [
      "category:conic"
    ]
  },
  {
    "command": "Polygon",
    "localizedName": "多边形",
    "syntax": "Polygon( <点列> ); Polygon( <点>, ..., <点> ); Polygon( <点>, <点>, <顶点数> ); Polygon( <点>, <点>, <顶点数>, <方向> )",
    "syntaxEn": "Polygon( <List of Points> ); Polygon( <Point>, ..., <Point> ); Polygon( <Point>, <Point>, <Number of Vertices> ); Polygon( <Point>, <Point>, <Number of Vertices>, <Direction> )",
    "description": "返回由给定点定义的多边形。",
    "searchTextEn": "Polygon 多边形 Polygon( <List of Points> ); <Point>, ..., <Point> <Number Vertices> Vertices>, <Direction> )",
    "examples": [
      "从四个点创建一个四边形",
      "从两个点和顶点数创建正六边形",
      "从点列表创建一个三角形"
    ],
    "tags": [
      "category:3d",
      "category:geometry",
      "capability:create"
    ]
  },
  {
    "command": "Polyline",
    "localizedName": "折线",
    "syntax": "Polyline( <点列> ); Polyline( <点>, ..., <点> )",
    "syntaxEn": "Polyline( <List of Points> ); Polyline( <Point>, ..., <Point> )",
    "description": "创建一个开放的多边形链（即一系列连接的线段），其初始顶点位于列表的第一个点，最终顶点位于列表的最后一个点。",
    "searchTextEn": "Polyline PolyLine 折线 Polyline( <List of Points> ); <Point>, ..., <Point> )",
    "examples": [
      "从点列表创建开放的多边形链。",
      "从多个单独的点创建开放的多边形链。",
      "代数视图中具有特定点和结果长度的示例。"
    ],
    "tags": [
      "category:3d",
      "category:geometry",
      "capability:create"
    ]
  },
  {
    "command": "Polynomial",
    "localizedName": "多项式函数",
    "syntax": "Polynomial( <函数> ); Polynomial( <点列> ); Polynomial( <函数>, <变量> )",
    "syntaxEn": "Polynomial( <Function> ); Polynomial( <List of Points> ); Polynomial( <Function>, <Variable> )",
    "description": "生成展开多项式函数，从点创建插值多项式，或将函数展开为指定变量中的多项式。",
    "searchTextEn": "Polynomial 多项式函数 Polynomial( <Function> ); <List of Points> <Function>, <Variable> )",
    "examples": [
      "将函数展开为多项式形式",
      "将多元表达式展开为多项式形式",
      "从点创建插值多项式",
      "展开函数并写为 x 中的多项式（CAS 语法）",
      "将函数展开为指定变量中的多项式（CAS 语法）"
    ],
    "tags": [
      "category:algebra",
      "category:functions-and-calculus",
      "capability:cas-supported"
    ]
  },
  {
    "command": "PresentValue",
    "localizedName": "现值",
    "syntax": "PresentValue( <利率>, <期数>, <每期付款额>, <未来值(可选)>, <类型(可选) 1-期初|0-期末> )",
    "syntaxEn": "PresentValue( <Rate>, <Number of Periods>, <Payment>, <Future Value (optional)>, <Type (optional)> )",
    "description": "返回投资的支付总额。",
    "searchTextEn": "PresentValue 现值 PresentValue( <Rate>, <Number of Periods>, <Payment>, <Future Value (optional)>, <Type (optional)> )",
    "examples": [
      "计算期末到期付款的现值",
      "计算期初到期付款的现值"
    ],
    "tags": [
      "category:financial"
    ]
  },
  {
    "command": "PreviousPrime",
    "localizedName": "前一质数",
    "syntax": "PreviousPrime( <数字> )",
    "syntaxEn": "PreviousPrime( <Number> )",
    "description": "返回小于输入数字的最大素数。",
    "searchTextEn": "PreviousPrime 前一质数 PreviousPrime( <Number> )",
    "examples": [
      "PreviousPrime(10000) 产生 9973。"
    ],
    "tags": [
      "category:algebra",
      "capability:cas-supported"
    ]
  },
  {
    "command": "PrimeFactors",
    "localizedName": "质因数",
    "syntax": "PrimeFactors( <数字> )",
    "syntaxEn": "PrimeFactors( <Number> )",
    "description": "返回其乘积等于给定数字的素数列表。",
    "searchTextEn": "PrimeFactors 质因数 PrimeFactors( <Number> )",
    "examples": [
      "1024 的质因数分解",
      "42 的质因数分解"
    ],
    "tags": [
      "category:algebra",
      "capability:cas-supported"
    ]
  },
  {
    "command": "Prism",
    "localizedName": "棱柱",
    "syntax": "Prism( <多边形>, <点> ); Prism( <多边形>, <高度> ); Prism( <点>, <点>, ... )",
    "syntaxEn": "Prism( <Polygon>, <Point> ); Prism( <Polygon>, <Height value> ); Prism( <Point>, <Point>, ... )",
    "description": "返回由给定点或参数定义的棱镜。",
    "searchTextEn": "Prism 棱柱 Prism( <Polygon>, <Point> ); <Height value> <Point>, ... )",
    "examples": [
      "创建底部 ABC 和顶部 DEF 的棱镜。矢量 AD、BE、CF 相等。",
      "创建一个棱柱，以给定的多边形为底，该点作为第一个顶点。",
      "创建一个以多边形为底并给定高度的直棱柱。"
    ],
    "tags": [
      "category:3d",
      "capability:create"
    ]
  },
  {
    "command": "Product",
    "localizedName": "乘积",
    "syntax": "Product( <原始数据列表> ); Product( <数字列表>, <最前元素数量> ); Product( <数字列表>, <频数列表> ); Product( <代数式>, <变量>, <起始值>, <终止值> ); Product( <代数式列表> ); Product( <代数式>, <变量>, <起始索引>, <变量终止值> )",
    "syntaxEn": "Product( <List of Raw Data> ); Product( <List of Numbers>, <Number of Elements> ); Product( <List of Numbers>, <List of Frequencies> ); Product( <Expression>, <Variable>, <Start Value>, <End Value> ); Product( <List of Expressions> ); Product( <Expression>, <Variable>, <Start Index>, <End Index> )",
    "description": "使用各种语法形式计算数字或表达式的乘积，包括列表元素的乘积、部分列表乘积、按元素求幂以及整数范围内的乘积序列。",
    "searchTextEn": "Product 乘积 Product( <List of Raw Data> ); Numbers>, <Number Elements> Frequencies> <Expression>, <Variable>, <Start Value>, <End Value> Expressions> Index>, Index> )",
    "examples": [
      "列表中所有数字的乘积",
      "列表中前 n 个元素的乘积",
      "提高到相应频率的元素的乘积",
      "整数范围内变量替换表达式的乘积",
      "CAS 语法：列表元素的乘积",
      "CAS 语法：带变量替换的乘积"
    ],
    "tags": [
      "category:algebra",
      "category:functions-and-calculus",
      "category:list",
      "category:statistics",
      "capability:cas-supported"
    ]
  },
  {
    "command": "Prove",
    "localizedName": "证明",
    "syntax": "Prove( <布尔表达式> )",
    "syntaxEn": "Prove( <Boolean Expression> )",
    "description": "返回给定的布尔表达式一般是 true 还是 false。通常，GeoGebra 通过数值计算来判断布尔表达式是否为真。但是，Prove 命令通常使用符号方法 (https://en.wikipedia.org/wiki/Symbolic_computation) 来确定某个陈述是真还是假。如果 GeoGebra 无法确定答案，则结果未定义。",
    "searchTextEn": "Prove 证明 Prove( <Boolean Expression> )",
    "examples": [
      "我们定义三个自由点，A=(1,2)、B=(3,4)、C=(5,6)。命令 AreCollinear(A,B,C) 产生 true，因为对点的当前坐标使用了数字检查。使用 Prove(AreCollinear(A,B,C)) 你会得到 false 作为答案，因为这三个点通常不共线，即当我们改变点时。",
      "让我们定义一个具有顶点 A、B 和 C 的三角形，并定义 D=MidPoint(B,C)、E=MidPoint(A,C)、p=Line(A,B)、q=Line(D,E)。现在 p∥q 和 Prove(p∥q) 都得出 true，因为三角形的中线将始终平行于相应的边。另请参阅此示例的交互式版本 (https://www.geogebra.org/m/vhZETdtd)。"
    ],
    "tags": [
      "category:geometry",
      "capability:relation"
    ]
  },
  {
    "command": "ProveDetails",
    "localizedName": "证明过程",
    "syntax": "ProveDetails( <布尔表达式> )",
    "syntaxEn": "ProveDetails( <Boolean Expression> )",
    "description": "返回自动证明结果的一些详细信息。通常，GeoGebra 通过数值计算来判断布尔表达式是否为真。然而，ProveDetails 命令通常使用符号方法来确定语句是真还是假。该命令的工作方式类似于 Prove 命令，但也以列表形式返回结果的一些详细信息： • 如果 GeoGebra 无法确定答案，则返回空列表 {}。 • 包含一个元素的列表：{false}（如果该陈述通常不为真）。 • 包含一个元素的列表：{true}，如果该语句始终为真（在可以构建图表的所有情况下）。 • 一个包含更多元素的列表，包含布尔值 true 和另一个列表，用于某些所谓的非简并条件，如果该语句在某些条件下为 true，例如{true，{“AreCollinear(A,B,C)，AreEqual(C,D)”}}。这意味着如果没有一个条件为真（并且可以构建图表），则该语句将为真。 • 列表{true,{\"...\"}}，如果该语句在某些条件下为真，但由于某些原因这些条件无法转换为人类可读的形式。",
    "searchTextEn": "ProveDetails 证明过程 ProveDetails( <Boolean Expression> )",
    "examples": [
      "让我们定义一个具有顶点 A、B 和 C 的三角形，并定义 D=MidPoint(B,C)、E=MidPoint(A,C)、p=Line(A,B)、q=Line(D,E)。现在ProveDetails(p∥q)返回{true}，这意味着如果可以构造该图，则三角形的中线DE与边AB平行。",
      "设AB为线段a，并定义C=MidPoint(A,B)，b=PerpendicularBisector(A,B)，D=Intersect(a,b)。现在ProveDetails(C==D)返回{true,{\"AreEqual(A,B)\"}}：这意味着如果A点和B点不同，那么C点和D点将重合。",
      "设AB为线段a，并定义l=Line(A,B)。设C为直线l上的任意点，且设b=Segment(B,C)，c=Segment(A,C)。现在 ProveDetails(a==b+c) 返回 {true,{\"a+b==c\", \"b==a+c\"}}：这意味着如果既不是 a+b=c，也不是 b=a+c，则 a=b+c。非简并条件列表可能不是最简单的可能集合。对于上面的例子，最简单的集合是空集。"
    ],
    "tags": [
      "category:geometry",
      "capability:relation"
    ]
  },
  {
    "command": "Pyramid",
    "localizedName": "棱锥",
    "syntax": "Pyramid( <多边形>, <点> ); Pyramid( <多边形>, <高度> ); Pyramid( <点>, <点>, <点>, <点>, ... )",
    "syntaxEn": "Pyramid( <Polygon>, <Point> ); Pyramid( <Polygon>, <Height> ); Pyramid( <Point>, <Point>, <Point>, <Point>, ... )",
    "description": "返回由给定点定义的金字塔。",
    "searchTextEn": "Pyramid 棱锥 Pyramid( <Polygon>, <Point> ); <Height> <Point>, ... )",
    "examples": [
      "Pyramid(A, B, C, D) 创建底面为 ABC、顶点为 D 的金字塔。",
      "Pyramid(poly1, A) 创建一个底面 poly1 和顶点 A 的金字塔。",
      "Pyramid(poly1, 3) 创建一个底面为 poly1、高度为 3 的中心金字塔。"
    ],
    "tags": [
      "category:3d",
      "capability:create"
    ]
  },
  {
    "command": "QRDecomposition",
    "localizedName": "QR分解",
    "syntax": "QRDecomposition( <矩阵> )",
    "syntaxEn": "QRDecomposition( <Matrix> )",
    "description": "计算给定矩阵的 QR 分解 (https://en.wikipedia.org/wiki/QR_decomposition)。",
    "searchTextEn": "QRDecomposition QR分解 QRDecomposition( <Matrix> )",
    "examples": [
      "QRDecomposition({{1,2},{3,4}}) 返回矩阵茎:[\\begin{pmatrix}\\frac{1}{\\sqrt{10}}&\\frac{3/5}{\\sqrt{10}/ 5}\\\\\\frac{3}{\\sqrt{10}}&-\\frac{1/5}{\\sqrt{10}/5}\\end{pmatrix}]和茎：[\\begin{pmatrix}\\sqrt{10}&7/5\\sqrt{10}\\\\0&\\sqrt{10}/5\\end{pmatrix}]。"
    ],
    "tags": [
      "category:vector-and-matrix",
      "capability:cas-supported"
    ]
  },
  {
    "command": "Quartile1",
    "localizedName": "第一四分位数",
    "syntax": "Quartile1( <原始数据列表> ); Quartile1( <数字列表>, <频数列表> )",
    "syntaxEn": "Quartile1( <List of Raw Data> ); Quartile1( <List of Numbers>, <List of Frequencies> )",
    "description": "第一四分位数",
    "searchTextEn": "Quartile1 Q1 第一四分位数 Quartile1( <List of Raw Data> ); Numbers>, Frequencies> )",
    "examples": [],
    "tags": [
      "category:statistics"
    ]
  },
  {
    "command": "Quartile3",
    "localizedName": "第三四分位数",
    "syntax": "Quartile3( <原始数据列表> ); Quartile3( <数字列表>, <频数列表> )",
    "syntaxEn": "Quartile3( <List of Raw Data> ); Quartile3( <List of Numbers>, <List of Frequencies> )",
    "description": "第三四分位数",
    "searchTextEn": "Quartile3 Q3 第三四分位数 Quartile3( <List of Raw Data> ); Numbers>, Frequencies> )",
    "examples": [],
    "tags": [
      "category:statistics"
    ]
  },
  {
    "command": "Radius",
    "localizedName": "半径",
    "syntax": "Radius( <圆锥曲线> )",
    "syntaxEn": "Radius( <Conic> )",
    "description": "返回二次曲线的半径。",
    "searchTextEn": "Radius 半径 Radius( <Conic> )",
    "examples": [
      "返回圆 c 的半径（例如 c:(x - 1)² + (y - 1)² = 9）",
      "返回圆的半径公式"
    ],
    "tags": [
      "category:3d",
      "category:conic",
      "category:geometry",
      "capability:measure"
    ]
  },
  {
    "command": "RandomBetween",
    "localizedName": "区间随机数",
    "syntax": "RandomBetween( <最小整数>, <最大整数> ); RandomBetween( <最小整数>, <最大整数>, <样本数量> ); RandomBetween( <最小整数>, <最大整数>, <是否固定? true|false> )",
    "syntaxEn": "RandomBetween( <Minimum Integer>, <Maximum Integer> ); RandomBetween( <Minimum Integer>, <Maximum Integer>, <Number of Samples> ); RandomBetween( <Minimum Integer>, <Maximum Integer>, <Boolean Fixed> )",
    "description": "区间随机数",
    "searchTextEn": "RandomBetween Random 区间随机数 RandomBetween( <Minimum Integer>, <Maximum Integer> ); <Number of Samples> <Boolean Fixed> )",
    "examples": [],
    "tags": [
      "category:algebra",
      "category:probability",
      "capability:cas-supported"
    ]
  },
  {
    "command": "RandomBinomial",
    "localizedName": "随机二项分布数",
    "syntax": "RandomBinomial( <试验次数>, <概率> )",
    "syntaxEn": "RandomBinomial( <Number of Trials>, <Probability> )",
    "description": "从具有 n 次试验和概率 p 的二项式分布生成随机数。",
    "searchTextEn": "RandomBinomial 随机二项分布数 RandomBinomial( <Number of Trials>, <Probability> )",
    "examples": [
      "RandomBinomial(3, 0.1) 给出 j ∈ {0, 1, 2, 3}，其中得到 j 的概率是概率为 0.1 的事件在 3 次尝试中出现 j 次的概率。"
    ],
    "tags": [
      "category:probability",
      "capability:cas-supported"
    ]
  },
  {
    "command": "RandomDiscrete",
    "localizedName": "离散随机数",
    "syntax": "RandomDiscrete( <列表>, <列表> )",
    "syntaxEn": "RandomDiscrete( <List>, <List> )",
    "description": "根据第二个列表中定义的（相对）概率分布，从第一个列表返回随机数。这两个列表必须具有相同的长度，并且第二个列表中的值之和可能不为 1，因为概率已标准化。",
    "searchTextEn": "RandomDiscrete 离散随机数 RandomDiscrete( <List>, <List> )",
    "examples": [],
    "tags": [
      "category:probability"
    ]
  },
  {
    "command": "RandomElement",
    "localizedName": "随机元素",
    "syntax": "RandomElement( <列表> )",
    "syntaxEn": "RandomElement( <List> )",
    "description": "返回从列表中随机选择的元素（以均匀概率）。列表中的所有元素必须属于同一类型。",
    "searchTextEn": "RandomElement 随机元素 RandomElement( <List> )",
    "examples": [
      "从数字列表中随机选择",
      "从符号列表中随机选择"
    ],
    "tags": [
      "category:list",
      "capability:cas-supported"
    ]
  },
  {
    "command": "RandomNormal",
    "localizedName": "正态分布随机数",
    "syntax": "RandomNormal( <平均数>, <标准差> )",
    "syntaxEn": "RandomNormal( <Mean>, <Standard Deviation> )",
    "description": "根据给定均值和标准差的正态分布生成随机数。",
    "searchTextEn": "RandomNormal 正态分布随机数 RandomNormal( <Mean>, <Standard Deviation> )",
    "examples": [
      "RandomNormal(3, 0.1) 产生平均值为 3、标准差为 0.1 的正态分布的随机值。"
    ],
    "tags": [
      "category:probability",
      "capability:cas-supported"
    ]
  },
  {
    "command": "RandomPointIn",
    "localizedName": "随机内点",
    "syntax": "RandomPointIn( <区域> ); RandomPointIn( <点列> ); RandomPointIn( <x最小值>, <x最大值>, <y最小值>, <y最大值> )",
    "syntaxEn": "RandomPointIn( <Region> ); RandomPointIn( <List of Points> ); RandomPointIn( <xMin>, <xMax>, <yMin>, <yMax> )",
    "description": "在给定多边形、闭合圆锥曲线内或指定坐标区间内创建随机点。",
    "searchTextEn": "RandomPointIn 随机内点 RandomPointIn( <Region> ); <List of Points> <xMin>, <xMax>, <yMin>, <yMax> )",
    "examples": [
      "在给定多边形或闭合圆锥曲线内或从定义多边形的点列表中创建随机点。",
      "创建一个随机点，其 x 坐标来自区间 [xMin,xMax]，y 坐标来自区间 [yMin, yMax]。"
    ],
    "tags": [
      "category:geometry",
      "category:list",
      "category:probability"
    ]
  },
  {
    "command": "RandomPoisson",
    "localizedName": "泊松分布随机数",
    "syntax": "RandomPoisson( <平均数> )",
    "syntaxEn": "RandomPoisson( <Mean> )",
    "description": "根据给定均值的泊松分布生成随机数。",
    "searchTextEn": "RandomPoisson 泊松分布随机数 RandomPoisson( <Mean> )",
    "examples": [
      "RandomPoisson(3) 从均值为 3 的泊松分布中生成一个随机值。"
    ],
    "tags": [
      "category:probability",
      "capability:cas-supported"
    ]
  },
  {
    "command": "RandomPolynomial",
    "localizedName": "随机多项式",
    "syntax": "RandomPolynomial( <次数>, <最小系数>, <最大系数> ); RandomPolynomial( <变量>, <次数>, <最小系数>, <最大系数> )",
    "syntaxEn": "RandomPolynomial( <Degree>, <Minimum for Coefficients>, <Maximum for Coefficients> ); RandomPolynomial( <Variable>, <Degree>, <Minimum for Coefficients>, <Maximum for Coefficients> )",
    "description": "返回 x 中随机生成的 d 次多项式，其（整数）系数在从最小值到最大值的范围内（包括两者）。",
    "searchTextEn": "RandomPolynomial 随机多项式 RandomPolynomial( <Degree>, <Minimum for Coefficients>, <Maximum Coefficients> ); <Variable>, )",
    "examples": [
      "RandomPolynomial(0, 1, 2) 产生 1 或 2。",
      "RandomPolynomial(2, 1, 2) 生成次数为 2 且仅使用 1 和 2 作为系数的随机多项式，例如 2x2 + x + 1。"
    ],
    "tags": [
      "category:algebra",
      "category:functions-and-calculus",
      "category:probability",
      "capability:cas-supported"
    ]
  },
  {
    "command": "RandomUniform",
    "localizedName": "均匀分布随机数",
    "syntax": "RandomUniform( <最小值>, <最大值> ); RandomUniform( <最小值>, <最大值>, <样本数量> )",
    "syntaxEn": "RandomUniform( <Min>, <Max> ); RandomUniform( <Min>, <Max>, <Number of Samples> )",
    "description": "返回区间 [_min_, _max_] 上均匀分布的随机实数。",
    "searchTextEn": "RandomUniform 均匀分布随机数 RandomUniform( <Min>, <Max> ); <Max>, <Number of Samples> )",
    "examples": [
      "RandomUniform(0, 1) 返回 0 到 1 之间的随机数",
      "RandomUniform(0, 1, 3) 返回 0 到 1 之间的三个随机数的列表"
    ],
    "tags": [
      "category:probability",
      "capability:cas-supported"
    ]
  },
  {
    "command": "Rate",
    "localizedName": "利率",
    "syntax": "Rate( <期数>, <每期付款额>, <现值>, <未来值(可选)>, <类型(可选) 1-期初|0-期末>, <预期利率(可选) 0~1> )",
    "syntaxEn": "Rate( <Number of Periods>, <Payment>, <Present Value>, <Future Value (optional)>, <Type (optional)>, <Guess (optional)> )",
    "description": "返回年金每期的利率。",
    "searchTextEn": "Rate 利率 Rate( <Number of Periods>, <Payment>, <Present Value>, <Future Value (optional)>, <Type <Guess (optional)> )",
    "examples": [
      "计算贷款的月利率"
    ],
    "tags": [
      "category:financial"
    ]
  },
  {
    "command": "Rationalize",
    "localizedName": "有理化",
    "syntax": "Rationalize( <数字> )",
    "syntaxEn": "Rationalize( <Number> )",
    "description": "创建给定 Number 的分数，并对分母进行有理化（如果分母包含平方根）。",
    "searchTextEn": "Rationalize 有理化 Rationalize( <Number> )",
    "examples": [
      "将小数有理化",
      "用分母中的平方根对分数进行有理化"
    ],
    "tags": [
      "category:algebra",
      "capability:cas-supported",
      "capability:cas-only"
    ]
  },
  {
    "command": "Ray",
    "localizedName": "射线",
    "syntax": "Ray( <起始点>, <点> ); Ray( <起始点>, <方向向量> )",
    "syntaxEn": "Ray( <Start Point>, <Point> ); Ray( <Start Point>, <Direction Vector> )",
    "description": "创建从一点开始穿过一点的射线。",
    "searchTextEn": "Ray 射线 Ray( <Start Point>, <Point> ); <Direction Vector> )",
    "examples": [
      "创建从一点开始穿过一点的射线。",
      "创建一条从具有方向向量的给定点开始的射线。"
    ],
    "tags": [
      "category:3d",
      "category:geometry",
      "capability:create"
    ]
  },
  {
    "command": "ReadText",
    "localizedName": "阅读文本",
    "syntax": "ReadText( <文本> )",
    "syntaxEn": "ReadText( <Text> )",
    "description": "此命令允许作者包含针对视障用户的信息，使他们的小程序更易于访问。要听到输出，您需要安装屏幕阅读器，例如 NVDA (https://www.nvaccess.org/download/) 或 VoiceOver。目前仅GeoGebra网络版支持。",
    "searchTextEn": "ReadText 阅读文本 ReadText( <Text> )",
    "examples": [],
    "tags": [
      "category:scripting",
      "category:text",
      "capability:interaction",
      "capability:script"
    ]
  },
  {
    "command": "RectangleSum",
    "localizedName": "矩形法则",
    "syntax": "RectangleSum( <函数>, <x-起始值>, <x-终止值>, <矩形数量>, <矩形起始位置 0-左和~1-右和> )",
    "syntaxEn": "RectangleSum( <Function>, <Start x-Value>, <End x-Value>, <Number of Rectangles>, <Position for rectangle start> )",
    "description": "使用 n 个矩形，计算起始 x 值和结束 x 值之间左高度从每个间隔的分数 d (0 ≤ d ≤ 1) 开始的矩形的总和。当 d = 0 时，它相当于 LeftSum 命令，当 d = 1 时，它计算给定函数的正确总和。",
    "searchTextEn": "RectangleSum 矩形法则 RectangleSum( <Function>, <Start x-Value>, <End <Number of Rectangles>, <Position for rectangle start> )",
    "examples": [],
    "tags": [
      "category:functions-and-calculus"
    ]
  },
  {
    "command": "ReducedRowEchelonForm",
    "localizedName": "简化行梯阵式",
    "syntax": "ReducedRowEchelonForm( <矩阵> )",
    "syntaxEn": "ReducedRowEchelonForm( <Matrix> )",
    "description": "返回矩阵的简化梯形形式 (https://en.wikipedia.org/wiki/Row_echelon_form)。",
    "searchTextEn": "ReducedRowEchelonForm 简化行梯阵式 ReducedRowEchelonForm( <Matrix> )",
    "examples": [
      "ReducedRowEchelonForm({{1, 6, 4}, {2, 8, 9}, {4, 5, 6}}) 产生矩阵主干：[ \\begin{pmatrix} 1 & 0 & 0 \\ 0 & 1 & 0 \\ 0 & 0 & 1 \\end{pmatrix}]。",
      "ReducedRowEchelonForm({{2, 10, 11, 4}, {2, (-5), (-6), 12}, {2, 5, 3, 2}}) 产生矩阵主干：[ \\begin{pmatrix} 1 & 0 & 0 & 5\\\\ 0 & 1 & 0 & -2.8\\\\ 0 & 0 & 1 & 2\\end{pmatrix}]。",
      "ReducedRowEchelonForm({{2, 10, 11, 4}, {2, (-5), (-6), 12}, {2, 5, 3, 2}}) 产生矩阵主干：[ \\begin{pmatrix} 1 & 0 & 0 & 5\\\\ 0 & 1 & 0 & \\frac{-14}{5} \\\\ 0 & 0 & 1 & 2\\end{pmatrix}]。"
    ],
    "tags": [
      "category:vector-and-matrix",
      "capability:cas-supported"
    ]
  },
  {
    "command": "Reflect",
    "localizedName": "对称",
    "syntax": "Reflect( <对象>, <点> ); Reflect( <对象>, <直线> ); Reflect( <对象>, <圆> ); Reflect( <对象>, <平面> )",
    "syntaxEn": "Reflect( <Object>, <Point> ); Reflect( <Object>, <Line> ); Reflect( <Object>, <Circle> ); Reflect( <Object>, <Plane> )",
    "description": "对称",
    "searchTextEn": "Reflect Mirror 对称 Reflect( <Object>, <Point> ); <Line> <Circle> <Plane> )",
    "examples": [],
    "tags": [
      "category:transformation",
      "capability:transform"
    ]
  },
  {
    "command": "Relation",
    "localizedName": "关系",
    "syntax": "Relation( <列表> ); Relation( <对象>, <对象> )",
    "syntaxEn": "Relation( <List> ); Relation( <Object>, <Object> )",
    "description": "显示一个消息框，为您提供有关两个或多个（最多 4 个）对象之间关系的信息。此命令允许您确定两条线是否垂直、两条线是否平行、两个（或多个）对象相等、一个点位于一条直线或二次曲线上、一条线与二次曲线相切或通过线、三个点共线、三条线并发（或平行）、四个点共圆（或共线）。其中一些检查也可以象征性地执行。如果GeoGebra支持某个属性的符号检查，则会出现“更多”按钮。通过点击它，GeoGebra 可以提供更多信息，该属性总体上是否真实（最终在某些条件下）。",
    "searchTextEn": "Relation 关系 Relation( <List> ); <Object>, <Object> )",
    "examples": [],
    "tags": [
      "category:logic",
      "capability:relation"
    ]
  },
  {
    "command": "RemovableDiscontinuity",
    "localizedName": "可去间断点",
    "syntax": "RemovableDiscontinuity( <函数> )",
    "syntaxEn": "RemovableDiscontinuity( <Function> )",
    "description": "计算有理函数被破坏的点处的可移动不连续性（也用于预览）。",
    "searchTextEn": "RemovableDiscontinuity 可去间断点 RemovableDiscontinuity( <Function> )",
    "examples": [
      "计算可移除间断的示例"
    ],
    "tags": [
      "category:functions-and-calculus"
    ]
  },
  {
    "command": "Remove",
    "localizedName": "去除",
    "syntax": "Remove( <列表>, <列表> )",
    "syntaxEn": "Remove( <List>, <List> )",
    "description": "每次对象出现在第二个列表中时，都会将其从第一个列表中删除。",
    "searchTextEn": "Remove 去除 Remove( <List>, <List> )",
    "examples": [
      "Remove({1,3,4,4,9},{1,4,5}) 产生列表 {3,4,9}。"
    ],
    "tags": [
      "category:list"
    ]
  },
  {
    "command": "RemoveUndefined",
    "localizedName": "去除未定义对象",
    "syntax": "RemoveUndefined( <列表> )",
    "syntaxEn": "RemoveUndefined( <List> )",
    "description": "从列表中删除未定义的对象。",
    "searchTextEn": "RemoveUndefined 去除未定义对象 RemoveUndefined( <List> )",
    "examples": [
      "RemoveUndefined(Sequence((-1)^k, k, -3, -1, 0.5)) 删除序列的第二个和第四个元素，因为表达式 (-1)^{1.5} 和 (-1)^{2.5} 未定义，并生成列表 {-1, 1, -1}。"
    ],
    "tags": [
      "category:list"
    ]
  },
  {
    "command": "Rename",
    "localizedName": "重命名",
    "syntax": "Rename( <对象>, <名称> )",
    "syntaxEn": "Rename( <Object>, <Name> )",
    "description": "将给定对象的标签设置为给定名称。",
    "searchTextEn": "Rename 重命名 Rename( <Object>, <Name> )",
    "examples": [
      "设c：x2 + 2y2 = 2。Rename(c, \"ell\") 将标签设置为ell。"
    ],
    "tags": [
      "category:scripting",
      "capability:script",
      "capability:construction-control"
    ]
  },
  {
    "command": "Repeat",
    "localizedName": "重复",
    "syntax": "Repeat( <数字>, <脚本指令>, <脚本指令>, ... )",
    "syntaxEn": "Repeat( <Number>, <Scripting Command>, <Scripting Command>, ... )",
    "description": "重复执行脚本命令 n 次，其中 n 是给定的数字。",
    "searchTextEn": "Repeat 重复 Repeat( <Number>, <Scripting Command>, ... )",
    "examples": [
      "Turtle()，点击播放按钮执行。乌龟移动并画出一个正八边形。"
    ],
    "tags": [
      "category:scripting",
      "capability:script",
      "capability:script-execution",
      "risk:script-execution",
      "risk:bulk-mutation"
    ]
  },
  {
    "command": "ReplaceAll",
    "localizedName": "替换所有",
    "syntax": "ReplaceAll( <文本>, <要匹配的文本>, <要替换的文本> )",
    "syntaxEn": "ReplaceAll( <Text>, <Text to Match>, <Text to Replace> )",
    "description": "创建一个包含给定文本的新文本，其要匹配的文本已替换为要替换的给定文本。",
    "searchTextEn": "ReplaceAll 替换所有 ReplaceAll( <Text>, <Text to Match>, Replace> )",
    "examples": [
      "将字符串中的“cos”替换为“sin”",
      "在 FormulaText 中使用 ReplaceAll 创建 LaTeX 文本"
    ],
    "tags": [
      "category:text"
    ]
  },
  {
    "command": "ResidualPlot",
    "localizedName": "残差图",
    "syntax": "ResidualPlot( <点列>, <函数> )",
    "syntaxEn": "ResidualPlot( <List of Points>, <Function> )",
    "description": "返回一个点列表，其 x 坐标等于给定列表元素的 x 坐标，y 坐标是相对于 f 的残差。如果给定列表的第 i 个元素是点 (a,b)，则结果的第 i 个元素是 (a,b-f(a))。",
    "searchTextEn": "ResidualPlot 残差图 ResidualPlot( <List of Points>, <Function> )",
    "examples": [
      "设 list = {(-1, 1), (-0.51, 2), (0, 0.61), (0.51, -1.41), (0.54, 1.97), (1.11, 0.42), (1.21, 2.53), (-0.8, -0.12)} 为点列表，且 f(x) = x5 + x4 - x - 1 的功能。 ResidualPlot(list, f ) 命令产生 list1 = {(-1, 1), (-0.51, 2.46), (0, 1.61), (0.51, 0), (0.54, 3.38), (1.11, -0.66), (1.21, 0), (-0.8, 0)} 并创建相应的点在图形视图中。"
    ],
    "tags": [
      "category:chart"
    ]
  },
  {
    "command": "Reverse",
    "localizedName": "逆序排列",
    "syntax": "Reverse( <列表> )",
    "syntaxEn": "Reverse( <List> )",
    "description": "反转列表的顺序。",
    "searchTextEn": "Reverse 逆序排列 Reverse( <List> )",
    "examples": [
      "Reverse(list1) 将 list1 = {(1, 2), (3, 4), (5, 6)} 反转以创建 list2 = {(5, 6), (3, 4), (1, 2)}",
      "Reverse({1, 2, 3, 4}) 反转列表创建 {4, 3, 2, 1}"
    ],
    "tags": [
      "category:list"
    ]
  },
  {
    "command": "RightSide",
    "localizedName": "右边",
    "syntax": "RightSide( <方程> ); RightSide( <方程列表> ); RightSide( <方程列表>, <索引> )",
    "syntaxEn": "RightSide( <Equation> ); RightSide( <List of Equations> ); RightSide( <List of Equations>, <Index> )",
    "description": "给出简化方程或方程列表的右侧。",
    "searchTextEn": "RightSide 右边 RightSide( <Equation> ); <List of Equations> Equations>, <Index> )",
    "examples": [
      "获取单个方程的右侧",
      "获取单个方程的右侧（CAS 语法示例）",
      "从多个方程中获取右侧列表",
      "通过索引获取特定方程的右侧"
    ],
    "tags": [
      "category:algebra",
      "capability:cas-supported"
    ]
  },
  {
    "command": "RigidPolygon",
    "localizedName": "刚体多边形",
    "syntax": "RigidPolygon( <多边形> ); RigidPolygon( <多边形>, <x偏移量>, <y偏移量> ); RigidPolygon( <自由点>, ..., <自由点> )",
    "syntaxEn": "RigidPolygon( <Polygon> ); RigidPolygon( <Polygon>, <Offset x>, <Offset y> ); RigidPolygon( <Free Point>, ..., <Free Point> )",
    "description": "创建任何多边形的副本，该副本只能通过拖动其第一个顶点进行平移并通过拖动其第二个顶点进行旋转。创建具有给定偏移量的任何多边形的副本，该副本只能通过拖动其第一个顶点来平移，并通过拖动其第二个顶点来旋转。创建形状无法更改的多边形。该多边形可以通过拖动其第一个顶点来平移，并通过拖动其第二个顶点来旋转。",
    "searchTextEn": "RigidPolygon 刚体多边形 RigidPolygon( <Polygon> ); <Polygon>, <Offset x>, y> <Free Point>, ..., Point> )",
    "examples": [
      "创建任何多边形的副本，该副本只能通过拖动其第一个顶点进行平移并通过拖动其第二个顶点进行旋转。",
      "创建具有给定偏移量的任何多边形的副本，该副本只能通过拖动其第一个顶点来平移，并通过拖动其第二个顶点来旋转。",
      "创建形状无法更改的多边形。该多边形可以通过拖动其第一个顶点来平移，并通过拖动其第二个顶点来旋转。"
    ],
    "tags": [
      "category:geometry"
    ]
  },
  {
    "command": "Root",
    "localizedName": "零点",
    "syntax": "Root( <多项式> ); Root( <函数>, <x-初值> ); Root( <函数>, <x-起始值>, <x-终止值> )",
    "syntaxEn": "Root( <Polynomial> ); Root( <Function>, <Initial x-Value> ); Root( <Function>, <Start x-Value>, <End x-Value> )",
    "description": "生成多项式的所有根作为函数图和 x 轴的交点，或者使用具有可选初始值或区间值的数值迭代方法生成函数的一个根。",
    "searchTextEn": "Root 零点 Root( <Polynomial> ); <Function>, <Initial x-Value> <Start x-Value>, <End )",
    "examples": [
      "产生多项式的所有根作为交点",
      "使用初始 x 值得出函数的一个根",
      "得出函数在指定区间内的一个根",
      "以 CAS 语法的列表形式生成多项式的所有根"
    ],
    "tags": [
      "category:algebra",
      "category:functions-and-calculus",
      "capability:cas-supported"
    ]
  },
  {
    "command": "RootList",
    "localizedName": "零值点列",
    "syntax": "RootList( <列表> )",
    "syntaxEn": "RootList( <List> )",
    "description": "将给定的数字列表 {a1,a2,...,an} 转换为点列表 {(a1,0),(a2,0),...,(an,0)}，该列表也显示在图形视图中。",
    "searchTextEn": "RootList 零值点列 RootList( <List> )",
    "examples": [
      "将数字列表转换为 x 轴上的点"
    ],
    "tags": [
      "category:functions-and-calculus",
      "category:list",
      "capability:cas-supported"
    ]
  },
  {
    "command": "RootMeanSquare",
    "localizedName": "均方根",
    "syntax": "RootMeanSquare( <数字列表> )",
    "syntaxEn": "RootMeanSquare( <List of Numbers> )",
    "description": "返回给定数字列表的均方根 (https://en.wikipedia.org/wiki/Root_mean_square)。",
    "searchTextEn": "RootMeanSquare 均方根 RootMeanSquare( <List of Numbers> )",
    "examples": [
      "RootMeanSquare({3, 4, 5, 3, 2, 3, 4}) 的收益率为 3.5456。"
    ],
    "tags": [
      "category:statistics"
    ]
  },
  {
    "command": "Roots",
    "localizedName": "零值点",
    "syntax": "Roots( <函数>, <x-起始值>, <x-终止值> )",
    "syntaxEn": "Roots( <Function>, <Start x-Value>, <End x-Value> )",
    "description": "计算给定区间内函数的根。该函数必须在该区间上连续。由于该算法是数值算法，因此在某些情况下可能无法找到所有根。",
    "searchTextEn": "Roots 零值点 Roots( <Function>, <Start x-Value>, <End x-Value> )",
    "examples": [
      "Roots(f, -2, 1) 具有函数 f(x) = 3x³ + 3x² - x 得出 A = (-1.264, 0), B = (0, 0), C = (0.264, 0)"
    ],
    "tags": [
      "category:functions-and-calculus"
    ]
  },
  {
    "command": "Rotate",
    "localizedName": "旋转",
    "syntax": "Rotate( <对象>, <度|弧度> ); Rotate( <对象>, <度|弧度>, <点> ); Rotate( <对象>, <度|弧度>, <旋转轴> ); Rotate( <对象>, <度|弧度>, <轴上的点>, <轴向或平面> )",
    "syntaxEn": "Rotate( <Object>, <Angle> ); Rotate( <Object>, <Angle>, <Point> ); Rotate( <Object>, <Angle>, <Axis of Rotation> ); Rotate( <Object>, <Angle>, <Point on Axis>, <Axis Direction or Plane> )",
    "description": "将几何对象绕轴原点旋转一定角度。",
    "searchTextEn": "Rotate 旋转 Rotate( <Object>, <Angle> ); <Angle>, <Point> <Axis of Rotation> <Point on Axis>, Direction or Plane> )",
    "examples": [],
    "tags": [
      "category:transformation",
      "capability:transform"
    ]
  },
  {
    "command": "RotateText",
    "localizedName": "旋转文本",
    "syntax": "RotateText( <文本>, <度|弧度> )",
    "syntaxEn": "RotateText( <Text>, <Angle> )",
    "description": "创建一个新的 LaTeX 文本，旋转给定角度。",
    "searchTextEn": "RotateText 旋转文本 RotateText( <Text>, <Angle> )",
    "examples": [
      "RotateText(\"a = 5\", 45°) 命令示例。",
      "如果要将文本“GeoGebra”旋转 42° 放置在点 (6,6) 处，请使用命令 Text(RotateText(\"GeoGebra\", 42°), (6, 6),true,true)"
    ],
    "tags": [
      "category:text",
      "capability:style"
    ]
  },
  {
    "command": "Row",
    "localizedName": "行序",
    "syntax": "Row( <数据区单元格> )",
    "syntaxEn": "Row( <Spreadsheet Cell> )",
    "description": "返回电子表格单元格的行号（从 1 开始）。",
    "searchTextEn": "Row 行序 Row( <Spreadsheet Cell> )",
    "examples": [
      "Row(B3) 产生 r = 3。"
    ],
    "tags": [
      "category:spreadsheet"
    ]
  },
  {
    "command": "RSquare",
    "localizedName": "可决系数R方",
    "syntax": "RSquare( <点列>, <函数> )",
    "syntaxEn": "RSquare( <List of Points>, <Function> )",
    "description": "计算列表中点的 _y_ 值与列表中 _x_ 值的函数值之间的决定系数 (https://en.wikipedia.org/wiki/Coefficient_of_determination) R² = 1 - SSE / Syy。",
    "searchTextEn": "RSquare 可决系数R方 RSquare( <List of Points>, <Function> )",
    "examples": [
      "RSquare({(-3, 2), (-2, 1), (-1, 3), (0, 4), (1, 2), (2, 4), (3, 3), (4, 5), (6, 4)}, 0.5x + 2.5) 的收益率为 0.28。"
    ],
    "tags": [
      "category:statistics"
    ]
  },
  {
    "command": "RunClickScript",
    "localizedName": "运行单击脚本",
    "syntax": "RunClickScript( <对象> )",
    "syntaxEn": "RunClickScript( <Object> )",
    "description": "运行与 对象（如果有） 关联的单击脚本。",
    "searchTextEn": "RunClickScript 运行单击脚本 RunClickScript( <Object> )",
    "examples": [
      "设 A 和 B 为点。 B 的 OnClick 脚本是 SetValue(B,(1,1))。将A的OnClick脚本设置为RunClickScript(B)，当单击A点时，将B点移动到(1,1)。"
    ],
    "tags": [
      "category:scripting",
      "capability:script",
      "capability:script-execution",
      "risk:script-execution"
    ]
  },
  {
    "command": "RunUpdateScript",
    "localizedName": "运行更新脚本",
    "syntax": "RunUpdateScript( <对象> )",
    "syntaxEn": "RunUpdateScript( <Object> )",
    "description": "运行与 对象（如果有） 关联的更新脚本。",
    "searchTextEn": "RunUpdateScript 运行更新脚本 RunUpdateScript( <Object> )",
    "examples": [],
    "tags": [
      "category:scripting",
      "capability:script",
      "capability:script-execution",
      "risk:script-execution"
    ]
  },
  {
    "command": "Sample",
    "localizedName": "样本",
    "syntax": "Sample( <列表>, <容量> ); Sample( <列表>, <容量>, <是否重复选择? true|false> )",
    "syntaxEn": "Sample( <List>, <Size> ); Sample( <List>, <Size>, <With Replacement> )",
    "description": "返回列表中随机选择的 n 个元素的列表；元素可以被选择多次。",
    "searchTextEn": "Sample 样本 Sample( <List>, <Size> ); <Size>, <With Replacement> )",
    "examples": [
      "具有默认替换行为的示例",
      "具有显式替换参数的示例",
      "CAS 视图中混合类型的示例",
      "包含列表且无需替换的示例"
    ],
    "tags": [
      "category:list",
      "category:statistics",
      "capability:cas-supported"
    ]
  },
  {
    "command": "SampleSD",
    "localizedName": "样本标准差",
    "syntax": "SampleSD( <原始数据列表> ); SampleSD( <数字列表>, <频数列表> ); SampleSD( <数字列表> )",
    "syntaxEn": "SampleSD( <List of Raw Data> ); SampleSD( <List of Numbers>, <List of Frequencies> ); SampleSD( <List of Numbers> )",
    "description": "返回给定数字列表的样本标准差，可以选择包含频率。等效语法：stdev。",
    "searchTextEn": "SampleSD 样本标准差 SampleSD( <List of Raw Data> ); Numbers>, Frequencies> Numbers> )",
    "examples": [
      "计算简单列表的样本标准差",
      "计算样本标准差与频率",
      "在 CAS 视图中计算未定义变量的样本标准差"
    ],
    "tags": [
      "category:statistics",
      "capability:cas-supported"
    ]
  },
  {
    "command": "SampleSDX",
    "localizedName": "样本点横坐标标准差",
    "syntax": "SampleSDX( <点列> )",
    "syntaxEn": "SampleSDX( <List of Points> )",
    "description": "返回给定列表中点的 _x_ 坐标的样本标准差 (https://en.wikipedia.org/wiki/Standard_deviationEstimation)。",
    "searchTextEn": "SampleSDX 样本点横坐标标准差 SampleSDX( <List of Points> )",
    "examples": [
      "SampleSDX({(2, 3), (1, 5), (3, 6), (4, 2), (1, 1), (2, 5)}) 产生 a = 1.17。"
    ],
    "tags": [
      "category:statistics"
    ]
  },
  {
    "command": "SampleSDY",
    "localizedName": "样本点纵坐标标准差",
    "syntax": "SampleSDY( <点列> )",
    "syntaxEn": "SampleSDY( <List of Points> )",
    "description": "返回给定列表中点的 _y_ 坐标的样本标准差 (https://en.wikipedia.org/wiki/Standard_deviationEstimation)。",
    "searchTextEn": "SampleSDY 样本点纵坐标标准差 SampleSDY( <List of Points> )",
    "examples": [
      "SampleSDY({(2, 3), (1, 5), (3, 6), (4, 2), (1, 1), (2, 5)}) 产生 a = 1.97。"
    ],
    "tags": [
      "category:statistics"
    ]
  },
  {
    "command": "SampleVariance",
    "localizedName": "样本方差",
    "syntax": "SampleVariance( <原始数据列表> ); SampleVariance( <数字列表>, <频数列表> ); SampleVariance( <数字列表> )",
    "syntaxEn": "SampleVariance( <List of Raw Data> ); SampleVariance( <List of Numbers>, <List of Frequencies> ); SampleVariance( <List of Numbers> )",
    "description": "返回给定数字列表的样本方差。",
    "searchTextEn": "SampleVariance 样本方差 SampleVariance( <List of Raw Data> ); Numbers>, Frequencies> Numbers> )",
    "examples": [
      "计算数字列表的样本方差",
      "计算具有频率的数字列表的样本方差",
      "计算具有未定义变量的列表的样本方差（收益率公式）"
    ],
    "tags": [
      "category:statistics",
      "capability:cas-supported"
    ]
  },
  {
    "command": "ScientificText",
    "localizedName": "科学记数法",
    "syntax": "ScientificText( <数字> ); ScientificText( <数字>, <有效数字位数> )",
    "syntaxEn": "ScientificText( <Number> ); ScientificText( <Number>, <Precision> )",
    "description": "创建以科学记数法显示给定数字的文本，并使用可选的精度参数来四舍五入到指定的有效数字。",
    "searchTextEn": "ScientificText 科学记数法 ScientificText( <Number> ); <Number>, <Precision> )",
    "examples": [
      "以科学记数法显示数字",
      "以科学记数法显示数字，保留 5 位有效数字"
    ],
    "tags": [
      "category:text"
    ]
  },
  {
    "command": "SD",
    "localizedName": "标准差",
    "syntax": "SD( <原始数据列表> ); SD( <数字列表>, <频数列表> )",
    "syntaxEn": "SD( <List of Raw Data> ); SD( <List of Numbers>, <List of Frequencies> )",
    "description": "计算列表中数字的标准差，并可以选择使用频率进行加权标准差。",
    "searchTextEn": "SD 标准差 SD( <List of Raw Data> ); Numbers>, Frequencies> )",
    "examples": [
      "计算数字列表的标准差",
      "计算频率的加权标准差",
      "使用 stdevp 表示标准差的等效语法",
      "使用 stdevp 计算加权标准差的等效语法"
    ],
    "tags": [
      "category:statistics",
      "capability:cas-supported"
    ]
  },
  {
    "command": "SDX",
    "localizedName": "横坐标标准差",
    "syntax": "SDX( <点列> )",
    "syntaxEn": "SDX( <List of Points> )",
    "description": "返回给定列表中点的 _x_ 坐标的标准差。",
    "searchTextEn": "SDX 横坐标标准差 SDX( <List of Points> )",
    "examples": [
      "计算一组点的 x 坐标的标准差"
    ],
    "tags": [
      "category:statistics"
    ]
  },
  {
    "command": "SDY",
    "localizedName": "纵坐标标准差",
    "syntax": "SDY( <点列> )",
    "syntaxEn": "SDY( <List of Points> )",
    "description": "返回给定列表中点的 _y_ 坐标的标准差。",
    "searchTextEn": "SDY 纵坐标标准差 SDY( <List of Points> )",
    "examples": [
      "计算一组点的 y 坐标标准差"
    ],
    "tags": [
      "category:statistics"
    ]
  },
  {
    "command": "Sector",
    "localizedName": "扇形",
    "syntax": "Sector( <圆锥曲线>, <点>, <点> ); Sector( <圆锥曲线>, <参数值>, <参数值> )",
    "syntaxEn": "Sector( <Conic>, <Point>, <Point> ); Sector( <Conic>, <Parameter Value>, <Parameter Value> )",
    "description": "生成圆锥曲线上两点之间的圆锥扇形并计算其面积，或者生成圆锥曲线上 0 到 2π 之间的两个参数值之间的圆锥扇形并计算其面积。",
    "searchTextEn": "Sector 扇形 Sector( <Conic>, <Point>, <Point> ); <Parameter Value>, Value> )",
    "examples": [
      "设c: x2 + 2y2 = 8 为椭圆，椭圆上有D = (-2.83, 0) 和E = (0, -2) 两个点。",
      "设c: x2 + y2 = 9 为一个圆，圆上有A = (3, 0) 和B = (0, 3) 两个点。",
      "令c: x2 + y2 = 9 为一个圆。"
    ],
    "tags": [
      "category:conic",
      "category:geometry"
    ]
  },
  {
    "command": "Segment",
    "localizedName": "线段",
    "syntax": "Segment( <点>, <点> ); Segment( <点>, <长度> )",
    "syntaxEn": "Segment( <Point>, <Point> ); Segment( <Point>, <Length> )",
    "description": "在两点之间或从具有指定长度的点创建线段。",
    "searchTextEn": "Segment 线段 Segment( <Point>, <Point> ); <Length> )",
    "examples": [
      "此命令在英语变体中有所不同：Interval (Aus)、Segment (UK + US)。"
    ],
    "tags": [
      "category:3d",
      "category:geometry",
      "capability:create"
    ]
  },
  {
    "command": "SelectedElement",
    "localizedName": "选定的元素",
    "syntax": "SelectedElement( <列表> )",
    "syntaxEn": "SelectedElement( <List> )",
    "description": "返回下拉列表中选定的元素。",
    "searchTextEn": "SelectedElement 选定的元素 SelectedElement( <List> )",
    "examples": [
      "SelectedElement( <List> ) 命令示例。"
    ],
    "tags": [
      "category:list",
      "capability:query",
      "capability:selection"
    ]
  },
  {
    "command": "SelectedIndex",
    "localizedName": "选定索引",
    "syntax": "SelectedIndex( <列表> )",
    "syntaxEn": "SelectedIndex( <List> )",
    "description": "返回下拉列表中选定元素的索引。",
    "searchTextEn": "SelectedIndex 选定索引 SelectedIndex( <List> )",
    "examples": [
      "另请参见 SelectedElement 命令",
      "将 n 设置为下拉列表中所选元素的索引。"
    ],
    "tags": [
      "category:list",
      "capability:query",
      "capability:selection"
    ]
  },
  {
    "command": "SelectObjects",
    "localizedName": "选择",
    "syntax": "SelectObjects(); SelectObjects( <对象>, <对象>, ... )",
    "syntaxEn": "SelectObjects(); SelectObjects( <Object>, <Object>, ... )",
    "description": "取消选择所有选定的对象。如果将对象作为参数提供，它将取消选择所有对象并选择指定的对象，这些对象必须是标记对象。",
    "searchTextEn": "SelectObjects 选择 SelectObjects(); SelectObjects( <Object>, ... )",
    "examples": [
      "设 A、B 和 C 为点。 SelectObjects(A, B, C)选择A、B、C点。",
      "除了取消选择所有选定的对象之外，命令 SelectObjects(Midpoint(A, B)) 没有任何作用。"
    ],
    "tags": [
      "category:scripting",
      "capability:selection",
      "capability:script",
      "risk:bulk-mutation"
    ]
  },
  {
    "command": "Semicircle",
    "localizedName": "半圆",
    "syntax": "Semicircle( <点>, <点> )",
    "syntaxEn": "Semicircle( <Point>, <Point> )",
    "description": "在两点之间的线段上方创建一个半圆，并在代数视图中显示其长度。",
    "searchTextEn": "Semicircle 半圆 Semicircle( <Point>, <Point> )",
    "examples": [
      "Semicircle( <Point>, <Point> ) 命令示例。"
    ],
    "tags": [
      "category:conic",
      "category:geometry"
    ]
  },
  {
    "command": "SemiMajorAxisLength",
    "localizedName": "主半轴长",
    "syntax": "SemiMajorAxisLength( <圆锥曲线> )",
    "syntaxEn": "SemiMajorAxisLength( <Conic> )",
    "description": "主半轴长",
    "searchTextEn": "SemiMajorAxisLength FirstAxisLength 主半轴长 SemiMajorAxisLength( <Conic> )",
    "examples": [],
    "tags": [
      "category:conic"
    ]
  },
  {
    "command": "SemiMinorAxisLength",
    "localizedName": "副半轴长",
    "syntax": "SemiMinorAxisLength( <圆锥曲线> )",
    "syntaxEn": "SemiMinorAxisLength( <Conic> )",
    "description": "副半轴长",
    "searchTextEn": "SemiMinorAxisLength SecondAxisLength 副半轴长 SemiMinorAxisLength( <Conic> )",
    "examples": [],
    "tags": [
      "category:conic"
    ]
  },
  {
    "command": "Sequence",
    "localizedName": "序列",
    "syntax": "Sequence( <终止值> ); Sequence( <起始值>, <终止值> ); Sequence( <起始值>, <终止值>, <增量> ); Sequence( <代数式>, <变量>, <起始值>, <终止值> ); Sequence( <代数式>, <变量>, <起始值>, <终止值>, <增量> )",
    "syntaxEn": "Sequence( <End Value> ); Sequence( <Start Value>, <End Value> ); Sequence( <Start Value>, <End Value>, <Increment> ); Sequence( <Expression>, <Variable>, <Start Value>, <End Value> ); Sequence( <Expression>, <Variable>, <Start Value>, <End Value>, <Increment> )",
    "description": "根据指定参数创建整数或对象列表，并针对不同用例进行多个重载。",
    "searchTextEn": "Sequence 序列 Sequence( <End Value> ); <Start Value>, <Increment> <Expression>, <Variable>, )",
    "examples": [
      "创建 1 到 4 之间的整数列表",
      "创建 7 到 13 之间的整数列表",
      "创建从 18 到 14（递减）的整数列表",
      "创建从 -5 到 5 的整数列表",
      "创建一个从 7 到 13 的整数列表，增量为 2",
      "创建一个从 7 到 13 的整数列表，增量为 4",
      "创建 y 坐标从 1 到 5 的点列表",
      "创建从 x 到 x 的 x 幂列表",
      "创建 y 坐标从 1 到 3 且增量为 0.5 的点列表",
      "创建奇数指数为 1 到 10 的 x 幂列表"
    ],
    "tags": [
      "category:list",
      "capability:cas-supported"
    ]
  },
  {
    "command": "SetActiveView",
    "localizedName": "设置活动视图",
    "syntax": "SetActiveView( <视图编号 1或\"G\"-绘图区|2或\"D\"-绘图区2|-1或\"T\"-3D绘图区|\"A\"-代数区|\"S\"-数据区|\"C\"-CAS> ); SetActiveView( <平面> )",
    "syntaxEn": "SetActiveView( <View> ); SetActiveView( <Plane> )",
    "description": "使给定的视图处于活动状态。",
    "searchTextEn": "SetActiveView 设置活动视图 SetActiveView( <View> ); <Plane> )",
    "examples": [],
    "tags": [
      "category:scripting",
      "capability:view",
      "capability:script"
    ]
  },
  {
    "command": "SetAxesRatio",
    "localizedName": "设置坐标轴比例",
    "syntax": "SetAxesRatio( <数字>, <数字> ); SetAxesRatio( <数字>, <数字>, <数字> )",
    "syntaxEn": "SetAxesRatio( <Number>, <Number> ); SetAxesRatio( <Number>, <Number>, <Number> )",
    "description": "更改活动图形视图的轴比率，以便 x 轴上的 X 单位与 y 轴上的 Y 单位对应的像素数相同，并且点 (0,0) 保持在其坐标上。如果使用单一比率，则相关轴固定为单位值，而另一个轴则按指示进行调整。与上面的语法类似，适用于 3D 图形视图。",
    "searchTextEn": "SetAxesRatio 设置坐标轴比例 SetAxesRatio( <Number>, <Number> ); )",
    "examples": [
      "SetAxesRatio(1,2) 固定x轴并压缩y轴",
      "SetAxesRatio(2,1) 固定y轴并缩小x轴"
    ],
    "tags": [
      "category:scripting",
      "capability:view",
      "capability:script"
    ]
  },
  {
    "command": "SetBackgroundColor",
    "localizedName": "设置背景颜色",
    "syntax": "SetBackgroundColor( <Color> ); SetBackgroundColor( <对象>, <Color> ); SetBackgroundColor( <红色值 0~1>, <绿色值 0~1>, <蓝色值 0~1> ); SetBackgroundColor( <对象>, <红色值 0~1>, <绿色值 0~1>, <蓝色值 0~1> )",
    "syntaxEn": "SetBackgroundColor( <Color> ); SetBackgroundColor( <Object>, <Color> ); SetBackgroundColor( <Red>, <Green>, <Blue> ); SetBackgroundColor( <Object>, <Red>, <Green>, <Blue> )",
    "description": "更改给定对象或活动图形视图的背景颜色。用于电子表格中的文本和对象。颜色可以通过 RGB 值 (0-1) 或颜色名称/十六进制代码指定。",
    "searchTextEn": "SetBackgroundColor 设置背景颜色 SetBackgroundColor( <Color> ); <Object>, <Red>, <Green>, <Blue> )",
    "examples": [
      "使用对象的 RGB 值设置背景颜色",
      "使用具有透明度的十六进制代码设置背景颜色",
      "使用 RGB 设置活动图形视图的背景颜色",
      "使用颜色名称设置背景颜色"
    ],
    "tags": [
      "category:scripting",
      "capability:color",
      "capability:style",
      "capability:script"
    ]
  },
  {
    "command": "SetCaption",
    "localizedName": "设置标题",
    "syntax": "SetCaption( <对象>, <文本> )",
    "syntaxEn": "SetCaption( <Object>, <Text> )",
    "description": "更改给定对象的标题。文本必须用双引号引起来。",
    "searchTextEn": "SetCaption 设置标题 SetCaption( <Object>, <Text> )",
    "examples": [],
    "tags": [
      "category:scripting",
      "capability:label",
      "capability:label-content",
      "capability:script"
    ]
  },
  {
    "command": "SetColor",
    "localizedName": "设置颜色",
    "syntax": "SetColor( <对象>, <Color> ); SetColor( <对象>, <红色值 0~1>, <绿色值 0~1>, <蓝色值 0~1> )",
    "syntaxEn": "SetColor( <Object>, <Color> ); SetColor( <Object>, <Red>, <Green>, <Blue> )",
    "description": "更改给定对象的颜色。红、绿、蓝代表相应颜色分量的数量，0为最小，1为最大。超过此间隔的数字 t 使用函数 stem:[2\\left|\\frac{t}2-\\mathrm round\\left(\\frac{t}2\\right)\\right|] 映射到它。颜色也可以作为文本输入，可以是：英文颜色名称、AARRGGBB 或 RRGGBB 类型的十六进制字符串，其中 AA 定义透明度（01 完全透明到 FF 完全不透明），RR 定义红色分量，GG 绿色分量，BB 定义红色分量。蓝色的。",
    "searchTextEn": "SetColor 设置颜色 SetColor( <Object>, <Color> ); <Red>, <Green>, <Blue> )",
    "examples": [
      "使用具有透明度的十六进制字符串设置颜色"
    ],
    "tags": [
      "category:scripting",
      "capability:color",
      "capability:style",
      "capability:script"
    ]
  },
  {
    "command": "SetConditionToShowObject",
    "localizedName": "设置显示条件",
    "syntax": "SetConditionToShowObject( <对象>, <条件> )",
    "syntaxEn": "SetConditionToShowObject( <Object>, <Condition> )",
    "description": "设置显示给定对象的条件。",
    "searchTextEn": "SetConditionToShowObject 设置显示条件 SetConditionToShowObject( <Object>, <Condition> )",
    "examples": [],
    "tags": [
      "category:scripting",
      "capability:visibility",
      "capability:script",
      "capability:construction-control"
    ]
  },
  {
    "command": "SetConstructionStep",
    "localizedName": "设置作图步骤",
    "syntax": "SetConstructionStep( <数字> )",
    "syntaxEn": "SetConstructionStep( <Number> )",
    "description": "将构建步骤更改为给定值。您可以使用此命令创建替代或增强导航栏的按钮。",
    "searchTextEn": "SetConstructionStep 设置作图步骤 SetConstructionStep( <Number> )",
    "examples": [],
    "tags": [
      "category:geogebra",
      "category:scripting",
      "capability:script",
      "capability:construction-control"
    ]
  },
  {
    "command": "SetCoords",
    "localizedName": "设置坐标",
    "syntax": "SetCoords( <对象>, <x>, <y> ); SetCoords( <对象>, <x>, <y>, <z> )",
    "syntaxEn": "SetCoords( <Object>, <x>, <y> ); SetCoords( <Object>, <x>, <y>, <z> )",
    "description": "将 2D 视图或 3D 视图中自由对象的笛卡尔坐标设置为给定坐标。该命令使用坐标值，而不是它们的定义，因此对象保持自由。",
    "searchTextEn": "SetCoords 设置坐标 SetCoords( <Object>, <x>, <y> ); <y>, <z> )",
    "examples": [
      "将 2D 视图中自由对象的笛卡尔坐标设置为给定坐标。该命令使用坐标值，而不是它们的定义，因此对象保持自由。",
      "将 3D 视图中自由对象的笛卡尔坐标设置为给定坐标。该命令使用坐标值，而不是它们的定义，因此对象保持自由。"
    ],
    "tags": [
      "category:scripting",
      "capability:position",
      "capability:coordinates",
      "capability:script"
    ]
  },
  {
    "command": "SetDecoration",
    "localizedName": "设置标记",
    "syntax": "SetDecoration( <对象>, <数字> ); SetDecoration( <线段>, <数字>, <数字> )",
    "syntaxEn": "SetDecoration( <Object>, <Number> ); SetDecoration( <Segment>, <Number>, <Number> )",
    "description": "设置给定对象的装饰（另请参见对象“属性”窗口中的“样式”选项卡）。该对象必须是一个角度、一段或“可填充对象”。命令中的第二个参数是装饰/填充样式的数字代码，如下表所述。对于线段，它还可以用两个数字设置线段起点和终点的宽高比，其中第一个数字定义线段起点的样式，第二个设置线段终点的样式。",
    "searchTextEn": "SetDecoration 设置标记 SetDecoration( <Object>, <Number> ); <Segment>, <Number>, )",
    "examples": [],
    "tags": [
      "category:scripting",
      "capability:style",
      "capability:script"
    ]
  },
  {
    "command": "SetDynamicColor",
    "localizedName": "设置动态颜色",
    "syntax": "SetDynamicColor( <对象>, <红色值 0~1>, <绿色值 0~1>, <蓝色值 0~1> ); SetDynamicColor( <对象>, <红色值 0~1>, <绿色值 0~1>, <蓝色值 0~1>, <虚实 0~1> )",
    "syntaxEn": "SetDynamicColor( <Object>, <Red>, <Green>, <Blue> ); SetDynamicColor( <Object>, <Red>, <Green>, <Blue>, <Opacity> )",
    "description": "使用可选的不透明度参数设置对象的动态颜色。",
    "searchTextEn": "SetDynamicColor 设置动态颜色 SetDynamicColor( <Object>, <Red>, <Green>, <Blue> ); <Blue>, <Opacity> )",
    "examples": [
      "此命令在英语变体中有所不同：SetDynamicColor (US)、SetDynamicColour (UK + Aus)",
      "所有数字的范围从 0（关闭/透明）到 1（打开/不透明）。"
    ],
    "tags": [
      "category:scripting",
      "capability:color",
      "capability:style",
      "capability:script"
    ]
  },
  {
    "command": "SetFilling",
    "localizedName": "设置填充",
    "syntax": "SetFilling( <对象>, <数字> )",
    "syntaxEn": "SetFilling( <Object>, <Number> )",
    "description": "更改给定对象的不透明度。数字必须来自区间 [0,1]，其中 0 表示透明，1 表示 100% 不透明。其他数字将被忽略。",
    "searchTextEn": "SetFilling 设置填充 SetFilling( <Object>, <Number> )",
    "examples": [],
    "tags": [
      "category:scripting",
      "capability:fill",
      "capability:style",
      "capability:script"
    ]
  },
  {
    "command": "SetFixed",
    "localizedName": "设置固定",
    "syntax": "SetFixed( <对象>, <true | false> ); SetFixed( <对象>, <true | false>, <true | false> )",
    "syntaxEn": "SetFixed( <Object>, <true | false> ); SetFixed( <Object>, <true | false>, <true | false> )",
    "description": "使对象固定（对于 true）或不固定（对于 false）。",
    "searchTextEn": "SetFixed 设置固定 SetFixed( <Object>, <true | false> ); false>, )",
    "examples": [
      "将对象设置为固定",
      "将对象设置为不固定",
      "将对象设置为固定并允许选择",
      "将对象设置为不固定且不允许选择"
    ],
    "tags": [
      "category:scripting",
      "capability:interaction",
      "capability:script",
      "capability:construction-control"
    ]
  },
  {
    "command": "SetImage",
    "localizedName": "设置图片",
    "syntax": "SetImage( <对象>, <图片> ); SetImage( <对象>, <文本> )",
    "syntaxEn": "SetImage( <Object>, <Image> ); SetImage( <Object>, <Text> )",
    "description": "用图像填充给定的对象。该对象需要允许填充，例如多边形、闭合圆锥曲线、按钮。或者，使用 GeoGebra 的预定义动作图像之一填充对象，由特定文本字符串标识。",
    "searchTextEn": "SetImage 设置图片 SetImage( <Object>, <Image> ); <Text> )",
    "examples": [
      "在 button1 上显示 GeoGebra 的预定义暂停图标"
    ],
    "tags": [
      "category:scripting",
      "capability:style",
      "capability:script"
    ]
  },
  {
    "command": "SetLabelMode",
    "localizedName": "设置标签模式",
    "syntax": "SetLabelMode( <对象>, <数字> )",
    "syntaxEn": "SetLabelMode( <Object>, <Number> )",
    "description": "根据下表更改给定对象的标签模式。",
    "searchTextEn": "SetLabelMode 设置标签模式 SetLabelMode( <Object>, <Number> )",
    "examples": [
      "SetLabelMode( <Object>, <Number> )：根据下表更改给定对象的标签模式。"
    ],
    "tags": [
      "category:scripting",
      "capability:label",
      "capability:label-mode",
      "capability:script"
    ]
  },
  {
    "command": "SetLayer",
    "localizedName": "设置图层",
    "syntax": "SetLayer( <对象>, <图层编号 0~9> )",
    "syntaxEn": "SetLayer( <Object>, <Layer> )",
    "description": "设置给定对象的图层，其中图层编号必须是 0 到 9 之间的整数。",
    "searchTextEn": "SetLayer 设置图层 SetLayer( <Object>, <Layer> )",
    "examples": [],
    "tags": [
      "category:scripting",
      "capability:layer",
      "capability:script"
    ]
  },
  {
    "command": "SetLevelOfDetail",
    "localizedName": "设置细节级别",
    "syntax": "SetLevelOfDetail( <曲面>, <细节级别 0|1> )",
    "syntaxEn": "SetLevelOfDetail( <Surface>, <Level of Detail> )",
    "description": "设置是快速绘制较少细节的曲面（细节级别 = 0），还是缓慢但更准确地绘制曲面（细节级别 = 1）。",
    "searchTextEn": "SetLevelOfDetail 设置细节级别 SetLevelOfDetail( <Surface>, <Level of Detail> )",
    "examples": [],
    "tags": [
      "category:scripting",
      "capability:style",
      "capability:script"
    ]
  },
  {
    "command": "SetLineStyle",
    "localizedName": "设置线型",
    "syntax": "SetLineStyle( <对象>, <数字> )",
    "syntaxEn": "SetLineStyle( <Object>, <Number> )",
    "description": "根据下表更改给定对象的线条样式（超出范围 [0,4] 的数字被视为 0）。",
    "searchTextEn": "SetLineStyle 设置线型 SetLineStyle( <Object>, <Number> )",
    "examples": [
      "将线条样式设置为 Full (0)",
      "将线条样式设置为长虚线 (1)",
      "将线条样式设置为短虚线 (2)",
      "将线条样式设置为 Dotted (3)",
      "将线条样式设置为点划线 (4)"
    ],
    "tags": [
      "category:scripting",
      "capability:line-style",
      "capability:style",
      "capability:script"
    ]
  },
  {
    "command": "SetLineThickness",
    "localizedName": "设置线径",
    "syntax": "SetLineThickness( <对象>, <数字> )",
    "syntaxEn": "SetLineThickness( <Object>, <Number> )",
    "description": "将给定对象的线条粗细设置为 stem:[\\frac{N}2] 像素，其中 N 是给定数字。",
    "searchTextEn": "SetLineThickness 设置线径 SetLineThickness( <Object>, <Number> )",
    "examples": [],
    "tags": [
      "category:scripting",
      "capability:line-style",
      "capability:style",
      "capability:script"
    ]
  },
  {
    "command": "SetPerspective",
    "localizedName": "设置格局",
    "syntax": "SetPerspective( <文本> )",
    "syntaxEn": "SetPerspective( <Text> )",
    "description": "更改视图的布局和可见性。文本参数可以是布局的完整描述、要更改的单个视图的描述或标准透视图之一的 ID。",
    "searchTextEn": "SetPerspective 设置格局 SetPerspective( <Text> )",
    "examples": [
      "仅使图形视图可见",
      "使代数、图形和电子表格视图可见并水平对齐",
      "使电子表格和图形视图可见，电子表格位于顶部，图形视图位于下方",
      "与上面类似，屏幕的底部由左侧的图形视图和右侧的代数视图组成",
      "将图形视图 2 添加到右侧当前显示的图形视图",
      "从当前显示的图形视图中删除图形视图 2",
      "打开图形计算器中的侧边栏并将其切换到工具选项卡",
      "打开图形计算器中的侧边栏并将其切换到值表",
      "无论选择哪个选项卡，都关闭图形计算器中的侧边栏"
    ],
    "tags": [
      "category:scripting",
      "capability:view",
      "capability:script"
    ]
  },
  {
    "command": "SetPointSize",
    "localizedName": "设置点径",
    "syntax": "SetPointSize( <对象>, <数字> )",
    "syntaxEn": "SetPointSize( <Object>, <Number> )",
    "description": "将给定点的大小更改为给定数字。也适用于（未标记的）点列表，例如如果 list={(1, 2), (3, 4)}，则​​ SetPointSize(list,5) 更改列出的点的大小。",
    "searchTextEn": "SetPointSize 设置点径 SetPointSize( <Object>, <Number> )",
    "examples": [],
    "tags": [
      "category:scripting",
      "capability:point-style",
      "capability:style",
      "capability:script"
    ]
  },
  {
    "command": "SetPointStyle",
    "localizedName": "设置点型",
    "syntax": "SetPointStyle( <点>, <数字> )",
    "syntaxEn": "SetPointStyle( <Point>, <Number> )",
    "description": "根据下表更改给定点的点样式（超出范围 [0,10] 的数字将被视为 0）。",
    "searchTextEn": "SetPointStyle 设置点型 SetPointStyle( <Point>, <Number> )",
    "examples": [],
    "tags": [
      "category:scripting",
      "capability:point-style",
      "capability:style",
      "capability:script"
    ]
  },
  {
    "command": "SetSeed",
    "localizedName": "设置种子",
    "syntax": "SetSeed( <自然数> )",
    "syntaxEn": "SetSeed( <Integer> )",
    "description": "为随机数生成器提供种子，以便后续随机数将由种子确定。",
    "searchTextEn": "SetSeed 设置种子 SetSeed( <Integer> )",
    "examples": [
      "将种子设置为 33"
    ],
    "tags": [
      "category:scripting",
      "capability:script",
      "capability:randomization"
    ]
  },
  {
    "command": "SetSpinSpeed",
    "localizedName": "设置转速",
    "syntax": "SetSpinSpeed( <数字> )",
    "syntaxEn": "SetSpinSpeed( <Number> )",
    "description": "设置 3D 视图围绕当前在垂直位置显示的轴的旋转速度。输入数字的符号和值定义旋转，如下所示：如果数字大于 1，则 3D 视图逆时针旋转；如果Number小于-1，则3D视图顺时针旋转；如果 Number 介于 -1 和 1 之间，则旋转将被取消。",
    "searchTextEn": "SetSpinSpeed 设置转速 SetSpinSpeed( <Number> )",
    "examples": [],
    "tags": [
      "category:scripting",
      "capability:view",
      "capability:animation",
      "capability:script"
    ]
  },
  {
    "command": "SetTooltipMode",
    "localizedName": "设置工具提示模式",
    "syntax": "SetTooltipMode( <对象>, <数字> )",
    "syntaxEn": "SetTooltipMode( <Object>, <Number> )",
    "description": "根据下表更改给定对象的工具提示模式（超出范围 [0,4] 的值将被视为 0）。",
    "searchTextEn": "SetTooltipMode 设置工具提示模式 SetTooltipMode( <Object>, <Number> )",
    "examples": [],
    "tags": [
      "category:scripting",
      "capability:style",
      "capability:script"
    ]
  },
  {
    "command": "SetTrace",
    "localizedName": "设置跟踪",
    "syntax": "SetTrace( <对象>, <true | false> )",
    "syntaxEn": "SetTrace( <Object>, <true | false> )",
    "description": "打开/关闭指定对象的跟踪。",
    "searchTextEn": "SetTrace 设置跟踪 SetTrace( <Object>, <true | false> )",
    "examples": [
      "创建点 A，然后输入 SetTrace(A,true)。选择移动工具并拖动该点以显示其轨​​迹。"
    ],
    "tags": [
      "category:scripting",
      "capability:style",
      "capability:script"
    ]
  },
  {
    "command": "SetValue",
    "localizedName": "赋值",
    "syntax": "SetValue( <布尔值>, <0-false|1-true> ); SetValue( <对象>, <对象> ); SetValue( <列表>, <数字>, <对象> )",
    "syntaxEn": "SetValue( <Boolean>, <0|1> ); SetValue( <Object>, <Object> ); SetValue( <List>, <Number>, <Object> )",
    "description": "设置布尔/复选框的状态：1 = true，0 = false",
    "searchTextEn": "SetValue 赋值 SetValue( <Boolean>, <0|1> ); <Object>, <Object> <List>, <Number>, )",
    "examples": [
      "如果 b 是布尔值，则 SetValue(b,1) 将布尔值 b 设置为 true。"
    ],
    "tags": [
      "category:scripting",
      "capability:animation",
      "capability:script",
      "capability:construction-control",
      "risk:bulk-mutation"
    ]
  },
  {
    "command": "SetViewDirection",
    "localizedName": "设置视图方向",
    "syntax": "SetViewDirection(); SetViewDirection( <方向> ); SetViewDirection( <方向>, <布尔动画> )",
    "syntaxEn": "SetViewDirection(); SetViewDirection( <Direction> ); SetViewDirection( <Direction>, <Boolean animate> )",
    "description": "根据给定对象设置 3D 视图方向。",
    "searchTextEn": "SetViewDirection 设置视图方向 SetViewDirection(); SetViewDirection( <Direction> ); <Direction>, <Boolean animate> )",
    "examples": [
      "根据给定对象设置 3D 视图方向。",
      "将 3D 视图方向设置为默认位置。",
      "根据给定对象设置 3D 视图方向，并带有可选动画。"
    ],
    "tags": [
      "category:scripting",
      "capability:view",
      "capability:animation",
      "capability:script"
    ]
  },
  {
    "command": "SetVisibleInView",
    "localizedName": "设置可见性",
    "syntax": "SetVisibleInView( <对象>, <视图编号 1-绘图区|2-绘图区2>, <布尔值> )",
    "syntaxEn": "SetVisibleInView( <Object>, <View Number 1|2>, <Boolean> )",
    "description": "使对象在给定的图形视图中可见或隐藏。对 3D 视图使用 -1",
    "searchTextEn": "SetVisibleInView 设置可见性 SetVisibleInView( <Object>, <View Number 1|2>, <Boolean> )",
    "examples": [
      "您还可以使用这些特殊对象名称：xAxis、yAxis、zAxis、xOyPlane"
    ],
    "tags": [
      "category:scripting",
      "capability:visibility",
      "capability:view",
      "capability:script"
    ]
  },
  {
    "command": "Shear",
    "localizedName": "切变",
    "syntax": "Shear( <对象>, <直线>, <比> )",
    "syntaxEn": "Shear( <Object>, <Line>, <Ratio> )",
    "description": "剪切对象，使线上的点保持固定，距线距离为 d 的点沿线方向移动 d * 比率（半平面相对于线的移动方向不同）。剪切后的平面图形保持其原始面积。",
    "searchTextEn": "Shear 切变 Shear( <Object>, <Line>, <Ratio> )",
    "examples": [],
    "tags": [
      "category:transformation",
      "capability:transform"
    ]
  },
  {
    "command": "ShortestDistance",
    "localizedName": "最短距离",
    "syntax": "ShortestDistance( <线段列表>, <起始点>, <终止点>, <是否加权? true|false> )",
    "syntaxEn": "ShortestDistance( <List of Segments>, <Start Point>, <End Point>, <Boolean Weighted> )",
    "description": "在由线段列表给出的图中查找起点和终点之间的最短路径。如果weighted为假，则每条边的权重应该为1（即我们正在寻找边数最少的路径），否则它是给定线段的长度（我们正在寻找几何最短路径）。",
    "searchTextEn": "ShortestDistance 最短距离 ShortestDistance( <List of Segments>, <Start Point>, <End <Boolean Weighted> )",
    "examples": [],
    "tags": [
      "category:discrete-math"
    ]
  },
  {
    "command": "ShowAxes",
    "localizedName": "显示坐标轴",
    "syntax": "ShowAxes(); ShowAxes( <布尔值> ); ShowAxes( <视图编号 1或\"G\"-绘图区|2或\"D\"-绘图区2|-1或\"T\"-3D绘图区|\"A\"-代数区|\"S\"-数据区|\"C\"-CAS>, <布尔值> )",
    "syntaxEn": "ShowAxes(); ShowAxes( <Boolean> ); ShowAxes( <View>, <Boolean> )",
    "description": "显示活动视图中的轴。显示/隐藏活动视图中的轴。显示/隐藏图形视图中由数字 1 或 2（或 3D 视图为 3）指定的轴。",
    "searchTextEn": "ShowAxes 显示坐标轴 ShowAxes(); ShowAxes( <Boolean> ); <View>, )",
    "examples": [
      "ShowAxes(true) 显示活动视图中的轴。",
      "ShowAxes(false) 隐藏活动视图中的轴。",
      "ShowAxes(1, true) 在图形视图中显示轴。",
      "ShowAxes(2, false) 隐藏图形 2 视图中的轴。"
    ],
    "tags": [
      "category:scripting",
      "capability:visibility",
      "capability:view",
      "capability:script"
    ]
  },
  {
    "command": "ShowGrid",
    "localizedName": "显示网格",
    "syntax": "ShowGrid(); ShowGrid( <布尔值> ); ShowGrid( <视图编号 1或\"G\"-绘图区|2或\"D\"-绘图区2|-1或\"T\"-3D绘图区|\"A\"-代数区|\"S\"-数据区|\"C\"-CAS>, <布尔值> )",
    "syntaxEn": "ShowGrid(); ShowGrid( <Boolean> ); ShowGrid( <View>, <Boolean> )",
    "description": "显示活动视图中的网格。显示/隐藏活动视图中的网格。显示/隐藏图形视图中由数字 1 或 2（或 3D 视图）指定的网格。",
    "searchTextEn": "ShowGrid 显示网格 ShowGrid(); ShowGrid( <Boolean> ); <View>, )",
    "examples": [
      "显示活动视图中的网格",
      "隐藏活动视图中的网格",
      "在图形视图中显示网格",
      "隐藏图形 2 视图中的网格"
    ],
    "tags": [
      "category:scripting",
      "capability:visibility",
      "capability:view",
      "capability:script"
    ]
  },
  {
    "command": "ShowLabel",
    "localizedName": "显示标签",
    "syntax": "ShowLabel( <对象>, <布尔值> )",
    "syntaxEn": "ShowLabel( <Object>, <Boolean> )",
    "description": "在图形视图中显示或隐藏给定对象的标签。",
    "searchTextEn": "ShowLabel 显示标签 ShowLabel( <Object>, <Boolean> )",
    "examples": [
      "令 f(x) = x2。 ShowLabel(f, true) 显示该函数的标签。"
    ],
    "tags": [
      "category:scripting",
      "capability:label",
      "capability:label-visibility",
      "capability:visibility",
      "capability:script"
    ]
  },
  {
    "command": "ShowLayer",
    "localizedName": "显示图层",
    "syntax": "ShowLayer( <数字> )",
    "syntaxEn": "ShowLayer( <Number> )",
    "description": "使给定图层中的所有对象可见。不覆盖条件可见性。",
    "searchTextEn": "ShowLayer 显示图层 ShowLayer( <Number> )",
    "examples": [
      "ShowLayer(2) 使第二层中的所有对象可见。"
    ],
    "tags": [
      "category:scripting",
      "capability:visibility",
      "capability:layer",
      "capability:script",
      "risk:bulk-mutation"
    ]
  },
  {
    "command": "Shuffle",
    "localizedName": "随机排列",
    "syntax": "Shuffle( <列表> )",
    "syntaxEn": "Shuffle( <List> )",
    "description": "返回具有相同元素的列表，但顺序随机。",
    "searchTextEn": "Shuffle 随机排列 Shuffle( <List> )",
    "examples": [
      "随机排列数字列表",
      "打乱数字序列"
    ],
    "tags": [
      "category:list",
      "category:statistics",
      "capability:cas-supported"
    ]
  },
  {
    "command": "Side",
    "localizedName": "侧面",
    "syntax": "Side( <二次曲面> )",
    "syntaxEn": "Side( <Quadric> )",
    "description": "侧面",
    "searchTextEn": "Side QuadricSide 侧面 Side( <Quadric> )",
    "examples": [],
    "tags": [
      "category:3d"
    ]
  },
  {
    "command": "SigmaXX",
    "localizedName": "SigmaXX",
    "syntax": "SigmaXX( <点列> ); SigmaXX( <原始数据列表> ); SigmaXX( <数字列表>, <频数列表> )",
    "syntaxEn": "SigmaXX( <List of Points> ); SigmaXX( <List of Raw Data> ); SigmaXX( <List of Numbers>, <List of Frequencies> )",
    "description": "计算给定点的 x 坐标的平方和、给定数字的平方和或给定数字与频率的加权平方和。",
    "searchTextEn": "SigmaXX SigmaXX( <List of Points> ); Raw Data> Numbers>, Frequencies> )",
    "examples": [
      "计算给定点的 x 坐标的平方和。",
      "计算给定数字的平方和，对于方差计算很有用。",
      "使用频率计算给定数字的加权平方和。"
    ],
    "tags": [
      "category:statistics"
    ]
  },
  {
    "command": "SigmaXY",
    "localizedName": "SigmaXY",
    "syntax": "SigmaXY( <点列> ); SigmaXY( <x坐标列表>, <y坐标列表> )",
    "syntaxEn": "SigmaXY( <List of Points> ); SigmaXY( <List of x-coordinates>, <List of y-coordinates> )",
    "description": "计算 x 坐标和 y 坐标的乘积之和。",
    "searchTextEn": "SigmaXY SigmaXY( <List of Points> ); x-coordinates>, y-coordinates> )",
    "examples": [
      "您可以使用 SigmaXY(list)/Length(list) - MeanX(list) * MeanY(list) 计算点列表的协方差。",
      "设 A = (-3, 4)、B = (-1, 4)、C = (-2, 3) 和 D = (1, 3) 为点。 {x(A), x(B), x(C), x(D)} 产生列表 list1 = {-3, -1, -2, 1} 中点的 x 坐标，而 {y(A), y(B), y(C), y(D)} 产生列表 list2 = {4, 4, 3, 3} 中点的 y 坐标。命令 SigmaXY(list1, list2) 产生 a = -19。"
    ],
    "tags": [
      "category:statistics"
    ]
  },
  {
    "command": "SigmaYY",
    "localizedName": "SigmaYY",
    "syntax": "SigmaYY( <点列> )",
    "syntaxEn": "SigmaYY( <List of Points> )",
    "description": "计算给定点的 _y_ 坐标的平方和。",
    "searchTextEn": "SigmaYY SigmaYY( <List of Points> )",
    "examples": [
      "令 list = {(-3, 4), (-1, 4), (-2, 3), (1, 3), (2, 2), (1, 5)} 为点列表。 SigmaYY(list) 产生 79。"
    ],
    "tags": [
      "category:statistics"
    ]
  },
  {
    "command": "Simplify",
    "localizedName": "化简",
    "syntax": "Simplify( <函数> ); Simplify( <文本> )",
    "syntaxEn": "Simplify( <Function> ); Simplify( <Text> )",
    "description": "简化给定函数的术语或通过删除重复的否定等来整理文本表达式。",
    "searchTextEn": "Simplify 化简 Simplify( <Function> ); <Text> )",
    "examples": [
      "Simplify(x + x + x) 产生函数 f(x) = 3x。",
      "对于 a = b = c = -1 Simplify(\"f(x) = \" + a + \"x² + \" + b + \"x + \" + c) 生成文本 f(x) = -x2 - x - 1。",
      "Simplify(3 * x + 4 * x + a * x) 产生 x + 7x。",
      "Assume(x<2,Simplify(sqrt(x-2sqrt(x-1)))) 产生 -sqrt(abs(x - 1)) + 1",
      "Assume(x>2,Simplify(sqrt(x-2sqrt(x-1)))) 得出 sqrt(x - 1) + 1"
    ],
    "tags": [
      "category:algebra",
      "category:functions-and-calculus",
      "category:text",
      "capability:cas-supported"
    ]
  },
  {
    "command": "Slider",
    "localizedName": "滑动条",
    "syntax": "Slider( <最小值>, <最大值>, <增量>, <速度>, <宽度(px)>, <角度? true|false>, <水平? true|false>, <启动动画? true|false>, <随机? true|false> )",
    "syntaxEn": "Slider( <Min>, <Max>, <Increment>, <Speed>, <Width>, <Is Angle>, <Horizontal>, <Animating>, <Random> )",
    "description": "创建一个滑块。参数设置可以如下： * Min、Max：设置滑块的范围 - 这些参数是强制性的。 * 增量：设置滑块值的增量 - 默认：0.1 * 速度：设置动画期间滑块的速度 - 默认：1 * 宽度：设置滑块宽度（以像素为单位） - 默认：100 * 是角度：设置滑块是否与角度相关。此参数可以为 true 或 false - 默认值：false * Horizontal：设置滑块是显示为水平 (_true_) 还是垂直 (_false_) 段 - 默认值：true * Animating：设置滑块的自动动画 - 默认值：false * Random：设置滑块是否采用 [Min, Max] 范围内的连续值 (_false_)，还是采用相同间隔内的随机值 (_true_) - 默认值：false",
    "searchTextEn": "Slider 滑动条 Slider( <Min>, <Max>, <Increment>, <Speed>, <Width>, <Is Angle>, <Horizontal>, <Animating>, <Random> )",
    "examples": [],
    "tags": [
      "category:scripting",
      "capability:animation",
      "capability:interaction",
      "capability:script"
    ]
  },
  {
    "command": "Slope",
    "localizedName": "斜率",
    "syntax": "Slope( <直线> )",
    "syntaxEn": "Slope( <Line> )",
    "description": "返回给定线的斜率。",
    "searchTextEn": "Slope 斜率 Slope( <Line> )",
    "examples": [
      "此命令还绘制倾斜三角形，其大小可以在“属性”对话框的“样式”选项卡上更改。",
      "另请参见坡度工具。"
    ],
    "tags": [
      "category:geometry",
      "capability:measure"
    ]
  },
  {
    "command": "SlopeField",
    "localizedName": "斜率场",
    "syntax": "SlopeField( <f(x, y)> ); SlopeField( <f(x, y)>, <数字 n> ); SlopeField( <f(x, y)>, <数字 n>, <长度倍增器a> ); SlopeField( <f(x, y)>, <数字 n>, <长度倍增器a>, <x最小值>, <y最小值>, <x最大值>, <y最大值> )",
    "syntaxEn": "SlopeField( <f(x, y)> ); SlopeField( <f(x, y)>, <Number n> ); SlopeField( <f(x, y)>, <Number n>, <Length Multiplier a> ); SlopeField( <f(x, y)>, <Number n>, <Length Multiplier a>, <Min x>, <Min y>, <Max x>, <Max y> )",
    "description": "绘制微分方程 dy/dx = f(x,y) 的斜率场。",
    "searchTextEn": "SlopeField 斜率场 SlopeField( <f(x, y)> ); y)>, <Number n> n>, <Length Multiplier a> a>, <Min x>, y>, <Max y> )",
    "examples": [
      "绘制微分方程 dy/dx = x+y 的斜率场。",
      "在 n × n 网格上绘制斜率场（如果图形视图是正方形，则默认为 40）。",
      "使用确定线段长度的长度乘数 a (0 < a ≤ 1) 绘制斜率场。",
      "在指定矩形内绘制斜率场（Min x、Min y、Max x、Max y）。"
    ],
    "tags": [
      "category:functions-and-calculus"
    ]
  },
  {
    "command": "SlowPlot",
    "localizedName": "缓慢绘制",
    "syntax": "SlowPlot( <函数> ); SlowPlot( <函数>, <是否重复? true|false> )",
    "syntaxEn": "SlowPlot( <Function> ); SlowPlot( <Function>, <Boolean Repeat> )",
    "description": "创建给定函数的动画图形，从左到右绘制，动画由由此命令创建的滑块控制。如果 Repeat 为 false，则图形仅绘制一次；如果为 true 或省略，则连续绘制。",
    "searchTextEn": "SlowPlot 缓慢绘制 SlowPlot( <Function> ); <Function>, <Boolean Repeat> )",
    "examples": [],
    "tags": [
      "category:geogebra",
      "capability:animation"
    ]
  },
  {
    "command": "Solutions",
    "localizedName": "解集",
    "syntax": "Solutions( <方程> ); Solutions( <方程>, <变量> ); Solutions( <方程列表>, <变量列表> )",
    "syntaxEn": "Solutions( <Equation> ); Solutions( <Equation>, <Variable> ); Solutions( <List of Equations>, <List of Variables> )",
    "description": "求解变量方程并返回所有解的列表。从版本 823 开始，其行为类似于 Solve 命令，但返回值列表而不是方程。",
    "searchTextEn": "Solutions 解集 Solutions( <Equation> ); <Equation>, <Variable> <List of Equations>, Variables> )",
    "examples": [
      "求解主变量的给定方程",
      "求解特定变量的方程",
      "求解多变量方程组",
      "求解另一个方程组",
      "需要进行操作才能使求解器工作的示例"
    ],
    "tags": [
      "category:algebra",
      "capability:cas-supported",
      "capability:cas-only"
    ]
  },
  {
    "command": "Solve",
    "localizedName": "精确解",
    "syntax": "Solve( <方程> ); Solve( <关于 x 的方程> ); Solve( <方程>, <变量> ); Solve( <方程列表>, <变量列表> ); Solve( <参数方程列表>, <变量列表> ); Solve( <方程>, <变量>, <假设列表> )",
    "syntaxEn": "Solve( <Equation> ); Solve( <Equation in x> ); Solve( <Equation>, <Variable> ); Solve( <List of Equations>, <List of Variables> ); Solve( <List of Parametric Equations>, <List of Variables> ); Solve( <Equation>, <Variable>, <List of assumptions> )",
    "description": "命令“求解”和“解”以符号方式求解实数上的方程或方程组。要以数值方式求解方程，请使用 NSolve 命令。要求解复数方程，请参阅 CSolve 命令。",
    "searchTextEn": "Solve 精确解 Solve( <Equation> ); <Equation in x> <Equation>, <Variable> <List of Equations>, Variables> Parametric <Variable>, assumptions> )",
    "examples": [
      "求解主变量的给定方程并返回所有解的列表。",
      "求解给定未知变量的方程并返回所有解的列表。",
      "求解方程 x，以假设为条件",
      "针对给定的一组未知变量求解一组方程并返回所有解的列表。",
      "使用假设列表求解给定未知变量的方程，并返回所有解的列表。",
      "求解给定的一组未知变量的一组参数方程并返回所有解的列表。"
    ],
    "tags": [
      "category:algebra",
      "capability:cas-supported",
      "capability:cas-only"
    ]
  },
  {
    "command": "SolveCubic",
    "localizedName": "解三次多项式",
    "syntax": "SolveCubic( <三次多项式> )",
    "syntaxEn": "SolveCubic( <Cubic Polynomial> )",
    "description": "求解给定的三次多项式并返回所有解的列表。",
    "searchTextEn": "SolveCubic 解三次多项式 SolveCubic( <Cubic Polynomial> )",
    "examples": [
      "CAS 语法示例：SolveCubic(x³ - 1) 产生包含复数根的解",
      "对于繁琐的答案，请考虑使用 Solve 或 CSolve 代替"
    ],
    "tags": [
      "category:algebra",
      "capability:cas-supported"
    ]
  },
  {
    "command": "SolveODE",
    "localizedName": "解常微分方程",
    "syntax": "SolveODE( <f'(x, y)> ); SolveODE( <f'(x, y)>, <f上的点> ); SolveODE( <f'(x, y)>, <起始 x>, <起始y>, <终止x>, <步长> ); SolveODE( <y'>, <x'>, <起始 x>, <起始y>, <终止t>, <步长> ); SolveODE( <b(x)>, <c(x)>, <f(x)>, <起始 x>, <起始y>, <起始y'>, <终止x>, <步长> ); SolveODE( <方程> ); SolveODE( <方程>, <f上的点> ); SolveODE( <方程>, <f上的点>, <f'上的点> ); SolveODE( <方程>, <因变量>, <自变量>, <f上的点> ); SolveODE( <方程>, <因变量>, <自变量>, <f上的点>, <f'上的点> )",
    "syntaxEn": "SolveODE( <f'(x, y)> ); SolveODE( <f'(x, y)>, <Point on f> ); SolveODE( <f'(x, y)>, <Start x>, <Start y>, <End x>, <Step> ); SolveODE( <y'>, <x'>, <Start x>, <Start y>, <End t>, <Step> ); SolveODE( <b(x)>, <c(x)>, <f(x)>, <Start x>, <Start y>, <Start y'>, <End x>, <Step> ); SolveODE( <Equation> ); SolveODE( <Equation>, <Point(s) on f> ); SolveODE( <Equation>, <Point(s) on f>, <Point(s) on f'> ); SolveODE( <Equation>, <Dependent Variable>, <Independent Variable>, <Point(s) on f> ); SolveODE( <Equation>, <Dependent Variable>, <Independent Variable>, <Point(s) on f>, <Point(s) on f'> )",
    "description": "精确或数值求解常微分方程 (ODEs)，支持一阶和二阶 ODEs 以及初始条件、数值求解和 CAS 语法的各种参数组合。",
    "searchTextEn": "SolveODE 解常微分方程 SolveODE( <f'(x, y)> ); y)>, <Point on f> <Start x>, y>, <End <Step> <y'>, <x'>, t>, <b(x)>, <c(x)>, <f(x)>, y'>, <Equation> <Equation>, <Point(s) f>, f'> <Dependent Variable>, <Independent )",
    "examples": [
      "求一阶ODE的精确解",
      "求解具有初始点的一阶 ODE（柯西问题）",
      "用起点、终点 x 和步长数值求解一阶 ODE",
      "以参数形式求解 ODE 以处理垂直点",
      "数值求解二阶 ODE",
      "CAS语法：精确求解一阶ODE",
      "CAS 语法：用初始点求解 ODE",
      "CAS 语法：以 y 和 y' 为初始条件求解二阶 ODE",
      "CAS 语法：使用指定的因变量和自变量求解 ODE",
      "CAS 语法：使用指定变量以及函数和导数的初始条件求解 ODE"
    ],
    "tags": [
      "category:functions-and-calculus",
      "capability:cas-supported"
    ]
  },
  {
    "command": "SolveQuartic",
    "localizedName": "解四次多项式",
    "syntax": "SolveQuartic( <四次多项式> )",
    "syntaxEn": "SolveQuartic( <Quartic Polynomial> )",
    "description": "求解给定的四次多项式并返回所有解的列表。",
    "searchTextEn": "SolveQuartic 解四次多项式 SolveQuartic( <Quartic Polynomial> )",
    "examples": [
      "求解四次多项式"
    ],
    "tags": [
      "category:algebra",
      "capability:cas-supported"
    ]
  },
  {
    "command": "Sort",
    "localizedName": "升序排列",
    "syntax": "Sort( <列表> ); Sort( <数值>, <关键字列表> )",
    "syntaxEn": "Sort( <List> ); Sort( <Values>, <Keys> )",
    "description": "对数字、文本对象或点的列表进行排序。也可以根据对应的第二列表Keys对第一列表Values进行排序。",
    "searchTextEn": "Sort 升序排列 Sort( <List> ); <Values>, <Keys> )",
    "examples": [
      "对数字列表进行排序",
      "按字母顺序对文本对象列表进行排序",
      "按 x 坐标对点列表进行排序",
      "使用从属列表按次数对多项式排序",
      "绘制一个多边形，其顶点作为按参数排序的复数根"
    ],
    "tags": [
      "category:list"
    ]
  },
  {
    "command": "Spearman",
    "localizedName": "Spearman秩相关系数",
    "syntax": "Spearman( <点列> ); Spearman( <数字列表>, <数字列表> )",
    "syntaxEn": "Spearman( <List of Points> ); Spearman( <List of Numbers>, <List of Numbers> )",
    "description": "返回列表或两个数字列表的点的 x 坐标和 y 坐标的斯皮尔曼等级相关系数。",
    "searchTextEn": "Spearman Spearman秩相关系数 Spearman( <List of Points> ); Numbers>, Numbers> )",
    "examples": [
      "计算点列表的斯皮尔曼等级相关性",
      "计算两个数字列表的斯皮尔曼等级相关性"
    ],
    "tags": [
      "category:statistics"
    ]
  },
  {
    "command": "Sphere",
    "localizedName": "球面",
    "syntax": "Sphere( <点>, <半径> ); Sphere( <点>, <点> )",
    "syntaxEn": "Sphere( <Point>, <Radius> ); Sphere( <Point>, <Point> )",
    "description": "创建一个具有中心和半径的球体，或者中心位于第一个点到第二个点的球体。",
    "searchTextEn": "Sphere 球面 Sphere( <Point>, <Radius> ); <Point> )",
    "examples": [
      "创建一个具有中心和半径的球体。",
      "创建一个以第一个点到第二个点为中心的球体。",
      "Sphere((0, 0, 0), (1, 1, 1)) 产生 x² + y² + z² = 3"
    ],
    "tags": [
      "category:3d",
      "capability:create"
    ]
  },
  {
    "command": "Spline",
    "localizedName": "样条曲线",
    "syntax": "Spline( <点列> ); Spline( <点列>, <阶数 ≥ 3> ); Spline( <点列>, <阶数 ≥ 3>, <权重函数> )",
    "syntaxEn": "Spline( <List of Points> ); Spline( <List of Points>, <Order ≥ 3> ); Spline( <List of Points>, <Order ≥ 3>, <Weight Function> )",
    "description": "创建通过所有点的三次样条，并提供用于指定自定义行为的顺序和权重函数的选项。",
    "searchTextEn": "Spline 样条曲线 Spline( <List of Points> ); Points>, <Order ≥ 3> 3>, <Weight Function> )",
    "examples": [],
    "tags": [
      "category:functions-and-calculus"
    ]
  },
  {
    "command": "Split",
    "localizedName": "拆分",
    "syntax": "Split( <文本>, <要拆分的文本列表> )",
    "syntaxEn": "Split( <Text>, <List of Texts to split on> )",
    "description": "创建通过在给定分隔符处分割给定文本而获得的文本列表（不包括在列表中）。",
    "searchTextEn": "Split 拆分 Split( <Text>, <List of Texts to split on> )",
    "examples": [
      "按指定分隔符分割文本"
    ],
    "tags": [
      "category:text"
    ]
  },
  {
    "command": "StartAnimation",
    "localizedName": "启动动画",
    "syntax": "StartAnimation(); StartAnimation( <布尔值> ); StartAnimation( <滑动条|点>, <滑动条|点>, ... ); StartAnimation( <滑动条|点>, <滑动条|点>, ..., <布尔值> )",
    "syntaxEn": "StartAnimation(); StartAnimation( <Boolean> ); StartAnimation( <Slider or Point>, <Slider or Point>, ... ); StartAnimation( <Slider or Point>, <Slider or Point>, ..., <Boolean> )",
    "description": "如果所有动画暂停，则恢复它们。当布尔值为 false 时，暂停所有动画，否则恢复它们。开始为给定点和滑块设置动画，这些点必须位于路径上。 开始（boolean = true）或永久停止（boolean = false）为给定点和滑块设置动画，这些点必须位于路径上。",
    "searchTextEn": "StartAnimation 启动动画 StartAnimation(); StartAnimation( <Boolean> ); <Slider or Point>, ... ..., )",
    "examples": [
      "如果动画暂停则恢复所有动画",
      "当布尔值为 false 时，暂停所有动画，否则恢复它们",
      "开始为给定点和滑块设置动画，这些点必须位于路径上",
      "开始（boolean = true）或永久停止（boolean = false）为给定点和滑块设置动画，这些点必须位于路径上"
    ],
    "tags": [
      "category:scripting",
      "capability:animation",
      "capability:script"
    ]
  },
  {
    "command": "StartRecord",
    "localizedName": "开始记录",
    "syntax": "StartRecord(); StartRecord( <布尔值> )",
    "syntaxEn": "StartRecord(); StartRecord( <Boolean> )",
    "description": "如果暂停，则恢复电子表格的所有记录（并为每个对象存储一个值）。当布尔值为 false 时，暂停对电子表格的所有记录，否则恢复记录（并为每个对象存储一个值）。",
    "searchTextEn": "StartRecord 开始记录 StartRecord(); StartRecord( <Boolean> )",
    "examples": [
      "如果暂停，则恢复电子表格的所有记录（并为每个对象存储一个值）",
      "当布尔值为 false 时，暂停对电子表格的所有记录，否则恢复记录（并为每个对象存储一个值）"
    ],
    "tags": [
      "category:scripting",
      "capability:interaction",
      "capability:script",
      "capability:record",
      "risk:external-output"
    ]
  },
  {
    "command": "stdev",
    "localizedName": "stdev",
    "syntax": "stdev( <原始数据列表> ); stdev( <数字列表>, <频数列表> )",
    "syntaxEn": "stdev( <List of Raw Data> ); stdev( <List of Numbers>, <List of Frequencies> )",
    "description": "stdev",
    "searchTextEn": "stdev stdev( <List of Raw Data> ); Numbers>, Frequencies> )",
    "examples": [],
    "tags": [
      "category:statistics"
    ]
  },
  {
    "command": "stdevp",
    "localizedName": "stdevp",
    "syntax": "stdevp( <原始数据列表> ); stdevp( <数字列表>, <频数列表> )",
    "syntaxEn": "stdevp( <List of Raw Data> ); stdevp( <List of Numbers>, <List of Frequencies> )",
    "description": "stdevp",
    "searchTextEn": "stdevp stdevp( <List of Raw Data> ); Numbers>, Frequencies> )",
    "examples": [],
    "tags": [
      "category:statistics"
    ]
  },
  {
    "command": "StemPlot",
    "localizedName": "茎叶图",
    "syntax": "StemPlot( <列表> ); StemPlot( <列表>, <调节 -1-默认茎单位除以10|0-没变化|1-默认茎单位乘以10> )",
    "syntaxEn": "StemPlot( <List> ); StemPlot( <List>, <Adjustment -1|0|1> )",
    "description": "返回给定数字列表的茎图。异常值将从图中删除并单独列出。离群值定义为区间 [ Q1 - 1.5 (Q3 - Q1) 、 Q3 + 1.5 (Q3 - Q1) ] 之外的值。对于带调整的变体： * 如果调整 = -1，则默认词干单位除以 10 * 如果调整 = 0，则不做任何更改 * 如果调整 = 1，则默认词干单位乘以 10",
    "searchTextEn": "StemPlot 茎叶图 StemPlot( <List> ); <List>, <Adjustment -1|0|1> )",
    "examples": [
      "该命令在英语变体中有所不同： • StemPlot (US) • StemAndLeaf (UK + Aus)"
    ],
    "tags": [
      "category:chart"
    ]
  },
  {
    "command": "StepGraph",
    "localizedName": "阶梯图",
    "syntax": "StepGraph( <点列> ); StepGraph( <点列>, <是否连接? true|false> ); StepGraph( <x坐标列表>, <y坐标列表> ); StepGraph( <点列>, <是否连接? true|false>, <点型0--10> ); StepGraph( <x坐标列表>, <y坐标列表>, <是否连接? true|false> ); StepGraph( <x坐标列表>, <y坐标列表>, <是否连接? true|false>, <点型0--10> )",
    "syntaxEn": "StepGraph( <List of Points> ); StepGraph( <List of Points>, <Boolean Join> ); StepGraph( <List of x-coordinates>, <List of y-coordinates> ); StepGraph( <List of Points>, <Boolean Join>, <Point Style> ); StepGraph( <List of x-coordinates>, <List of y-coordinates>, <Boolean Join> ); StepGraph( <List of x-coordinates>, <List of y-coordinates>, <Boolean Join>, <Point Style> )",
    "description": "绘制给定点列表的步骤图。每个点都通过水平线段连接到列表中的下一个点。可选参数控制是否绘制垂直线段以及如何设置点的样式。",
    "searchTextEn": "StepGraph 阶梯图 StepGraph( <List of Points> ); Points>, <Boolean Join> x-coordinates>, y-coordinates> Join>, <Point Style> y-coordinates>, )",
    "examples": [
      "绘制带有点列表的步骤图",
      "绘制一个步骤图，其中点和连接参数设置为 true",
      "使用单独的 x 和 y 坐标列表绘制阶梯图",
      "使用坐标列表绘制步骤图并将连接参数设置为 true",
      "绘制带有坐标列表的步骤图，连接设置为 false，点样式为 1",
      "绘制带有点的阶梯图，连接设置为 false，点样式 1"
    ],
    "tags": [
      "category:chart"
    ]
  },
  {
    "command": "StickGraph",
    "localizedName": "棒图",
    "syntax": "StickGraph( <点列> ); StickGraph( <点列>, <是否水平? true|false> ); StickGraph( <x坐标列表>, <y坐标列表> ); StickGraph( <x坐标列表>, <y坐标列表>, <是否水平? true|false> )",
    "syntaxEn": "StickGraph( <List of Points> ); StickGraph( <List of Points>, <Boolean Horizontal> ); StickGraph( <List of x-coordinates>, <List of y-coordinates> ); StickGraph( <List of x-coordinates>, <List of y-coordinates>, <Boolean Horizontal> )",
    "description": "绘制给定点的棒图。对于每个点，从 x 轴到该点绘制一条垂直线段。如果 Horizo​​ntal = true，则从 y 轴到每个点绘制水平线段。如果 Horizo​​ntal = false，则从 x 轴到每个点绘制垂直线段。",
    "searchTextEn": "StickGraph 棒图 StickGraph( <List of Points> ); Points>, <Boolean Horizontal> x-coordinates>, y-coordinates> y-coordinates>, )",
    "examples": [
      "用垂直线绘制给定点的棒图",
      "用垂直线绘制给定点的棒图（水平= false）",
      "绘制由两个带有垂直线的坐标列表创建的点的棒状图",
      "绘制由两个带有水平线的坐标列表创建的点的棒图（Horizontal = true）"
    ],
    "tags": [
      "category:chart"
    ]
  },
  {
    "command": "Stretch",
    "localizedName": "伸缩",
    "syntax": "Stretch( <对象>, <向量> ); Stretch( <对象>, <直线>, <比> )",
    "syntaxEn": "Stretch( <Object>, <Vector> ); Stretch( <Object>, <Line>, <Ratio> )",
    "description": "对象平行于给定向量按向量大小给定的比率拉伸（即垂直于向量（通过其起点）的线上的点保持在其位置，其他点到线的距离乘以给定的比率。）或者，对象按给定的比率垂直于线拉伸（即线上的点不移动，其他点到线的距离乘以给定的比率。）",
    "searchTextEn": "Stretch 伸缩 Stretch( <Object>, <Vector> ); <Line>, <Ratio> )",
    "examples": [
      "平行于向量拉伸对象",
      "以特定比例垂直于直线拉伸物体"
    ],
    "tags": [
      "category:transformation",
      "capability:transform"
    ]
  },
  {
    "command": "Substitute",
    "localizedName": "替换",
    "syntax": "Substitute( <代数式>, <赋值列表> ); Substitute( <代数式>, <被替换对象>, <替换对象> )",
    "syntaxEn": "Substitute( <Expression>, <Substitution List> ); Substitute( <Expression>, <from>, <to> )",
    "description": "将表达式中所有出现的 from 替换为 to，并在变量替换为值时计算结果，或者在表达式中将替换列表中变量的每次出现替换为相应的项或值，并计算数值替换。",
    "searchTextEn": "Substitute 替换 Substitute( <Expression>, <Substitution List> ); <from>, <to> )",
    "examples": [
      "将 m 替换为 in 表达式",
      "将表达式中的 m 替换为 2",
      "使用列表语法替换多个变量",
      "使用参数语法替换多个变量"
    ],
    "tags": [
      "category:algebra",
      "capability:cas-supported",
      "capability:cas-only"
    ]
  },
  {
    "command": "Sum",
    "localizedName": "总和",
    "syntax": "Sum( <列表> ); Sum( <列表>, <最前元素数量> ); Sum( <列表>, <频数列表> ); Sum( <代数式>, <变量>, <起始值>, <终止值> )",
    "syntaxEn": "Sum( <List> ); Sum( <List>, <Number of Elements> ); Sum( <List>, <List of Frequencies> ); Sum( <Expression>, <Variable>, <Start Value>, <End Value> )",
    "description": "计算列表中元素的总和或计算求和表达式。",
    "searchTextEn": "Sum 总和 Sum( <List> ); <List>, <Number of Elements> <List Frequencies> <Expression>, <Variable>, <Start Value>, <End Value> )",
    "examples": [
      "列表中数字的总和",
      "函数总和",
      "序列之和",
      "积分总和",
      "文本元素的总和",
      "前 n 个元素的总和",
      "与频率相加",
      "CAS 变量求和",
      "CAS 与公式结果求和",
      "CAS 求和至无穷大"
    ],
    "tags": [
      "category:algebra",
      "category:functions-and-calculus",
      "category:list",
      "category:statistics",
      "capability:cas-supported"
    ]
  },
  {
    "command": "SumSquaredErrors",
    "localizedName": "误差平方和",
    "syntax": "SumSquaredErrors( <点列>, <函数> )",
    "syntaxEn": "SumSquaredErrors( <List of Points>, <Function> )",
    "description": "计算列表中点的 y 值与列表中 x 值的函数值之间的平方误差总和 SSE。",
    "searchTextEn": "SumSquaredErrors 误差平方和 SumSquaredErrors( <List of Points>, <Function> )",
    "examples": [
      "计算 SSE 进行线性和二次多项式拟合，以证明哪种拟合效果更好"
    ],
    "tags": [
      "category:statistics"
    ]
  },
  {
    "command": "SurdText",
    "localizedName": "根式文本",
    "syntax": "SurdText( <点> ); SurdText( <数字> ); SurdText( <数字>, <列表> )",
    "syntaxEn": "SurdText( <Point> ); SurdText( <Number> ); SurdText( <Number>, <List> )",
    "description": "以 stem:[\\frac{a+b\\sqrt{c}}{d}] 形式或使用指定常量创建点或数字的文本表示形式。",
    "searchTextEn": "SurdText 根式文本 SurdText( <Point> ); <Number> <Number>, <List> )",
    "examples": [
      "创建点的文本表示形式，其坐标格式为 stem:[\\frac{a+b\\sqrt{c}}{d}]。",
      "以stem:[\\frac{a+b\\sqrt{c}}{d}] 的形式创建数字的文本表示形式。",
      "创建数字的文本表示形式，重写为列表中常量的倍数。如果列表为空，则该命令使用公共常量列表。"
    ],
    "tags": [
      "category:text"
    ]
  },
  {
    "command": "Surface",
    "localizedName": "曲面",
    "syntax": "Surface( <函数>, <度|弧度> ); Surface( <曲线>, <度|弧度>, <直线> ); Surface( <代数式>, <代数式>, <代数式>, <参变量1>, <起始值>, <终止值>, <参变量2>, <起始值>, <终止值> )",
    "syntaxEn": "Surface( <Function>, <Angle> ); Surface( <Curve>, <Angle>, <Line> ); Surface( <Expression>, <Expression>, <Expression>, <Parameter Variable 1>, <Start Value>, <End Value>, <Parameter Variable 2>, <Start Value>, <End Value> )",
    "description": "使用给定间隔 [<起始值>、<结束值>] 内的两个 <参数变量>，生成给定 x 表达式（第一个 <表达式>）、y 表达式（第二个 <表达式>）和 z 表达式（第三个 <表达式>）的笛卡尔参数化 3D 曲面。",
    "searchTextEn": "Surface 曲面 Surface( <Function>, <Angle> ); <Curve>, <Angle>, <Line> <Expression>, <Parameter Variable 1>, <Start Value>, <End 2>, Value> )",
    "examples": [
      "令 r 和 R 为两个正实数：Surface((R + r cos( u)) cos(v), (R + r cos( u)) sin(v), r sin(u ), u, 0, 2 π, v, 0, 2 π) 创建由半径为 r 的圆生成的圆环，该圆的中心绕 zAxis 以距离 R 旋转。"
    ],
    "tags": [
      "category:3d",
      "capability:create"
    ]
  },
  {
    "command": "SVD",
    "localizedName": "奇异值分解",
    "syntax": "SVD( <矩阵> )",
    "syntaxEn": "SVD( <Matrix> )",
    "description": "返回矩阵的奇异值 Decomposition (https://en.wikipedia.org/wiki/Singular_value_decomposition)（作为 3 个矩阵的列表）。",
    "searchTextEn": "SVD 奇异值分解 SVD( <Matrix> )",
    "examples": [
      "矩阵的 SVD 生成包含三个矩阵的列表。"
    ],
    "tags": [
      "category:vector-and-matrix",
      "capability:cas-supported"
    ]
  },
  {
    "command": "Sxx",
    "localizedName": "Sxx",
    "syntax": "Sxx( <数字列表> ); Sxx( <点列> )",
    "syntaxEn": "Sxx( <List of Numbers> ); Sxx( <List of Points> )",
    "description": "计算统计量 Σx² - (Σx)²/n。",
    "searchTextEn": "Sxx SXX Sxx( <List of Numbers> ); Points> )",
    "examples": [],
    "tags": [
      "category:statistics"
    ]
  },
  {
    "command": "Sxy",
    "localizedName": "Sxy",
    "syntax": "Sxy( <点列> ); Sxy( <数字列表>, <数字列表> )",
    "syntaxEn": "Sxy( <List of Points> ); Sxy( <List of Numbers>, <List of Numbers> )",
    "description": "使用给定点的坐标计算统计茎：[\\sum xy - \\frac{(\\sum x) (\\sum y)}{n}]。",
    "searchTextEn": "Sxy SXY Sxy( <List of Points> ); Numbers>, Numbers> )",
    "examples": [
      "计算统计词干：[\\sum xy - \\frac{(\\sum x) (\\sum y)}{n}]，其中 x 是第一个列表中的值，y 是第二个给定列表中的值。"
    ],
    "tags": [
      "category:statistics"
    ]
  },
  {
    "command": "Syy",
    "localizedName": "Syy",
    "syntax": "Syy( <点列> )",
    "syntaxEn": "Syy( <List of Points> )",
    "description": "使用给定点的 _y_ 坐标计算统计茎：[ \\sum y2 -\\frac{ (\\sum y)2}{n}]。",
    "searchTextEn": "Syy SYY Syy( <List of Points> )",
    "examples": [],
    "tags": [
      "category:statistics"
    ]
  },
  {
    "command": "TableText",
    "localizedName": "表格文本",
    "syntax": "TableText( <列表>, <列表>, ... ); TableText( <列表>, <列表>, ..., <对齐方式 \"v\"-垂直|\"h\"-水平|\"l\"-左对齐|\"r\"-右对齐|\"c\"-居中|...> ); TableText( <列表>, <列表>, ..., <对齐方式 \"v\"-垂直|\"h\"-水平|\"l\"-左对齐|\"r\"-右对齐|\"c\"-居中|...>, <单元格最小宽度> ); TableText( <列表>, <列表>, ..., <对齐方式 \"v\"-垂直|\"h\"-水平|\"l\"-左对齐|\"r\"-右对齐|\"c\"-居中|...>, <单元格最小宽度>, <单元格最小高度> )",
    "syntaxEn": "TableText( <List>, <List>, ... ); TableText( <List>, <List>, ..., <Alignment of Text> ); TableText( <List>, <List>, ..., <Alignment of Text>, <Minimum Cell Width> ); TableText( <List>, <List>, ..., <Alignment of Text>, <Minimum Cell Width>, <Minimum Cell Height> )",
    "description": "创建包含列表对象的表格的文本。",
    "searchTextEn": "TableText 表格文本 TableText( <List>, ... ); ..., <Alignment of Text> Text>, <Minimum Cell Width> Width>, Height> )",
    "examples": [
      "TableText({x2, 4}, {x3, 8}, {x4, 16}) 创建一个表格作为三行两列的文本对象。表中的所有项目均左对齐。",
      "TableText(Sequence(i2, i, 1, 10)) 创建一个表格作为一行文本对象。表中的所有项目均左对齐。",
      "TableText({1, 2, 3, 4}, {1, 4, 9, 16}, \"v\") 创建一个两列四行的文本，其元素左对齐。",
      "TableText({1, 2, 3, 4}, {1, 4, 9, 16}, \"h\") 创建一个两行四列的文本，其元素左对齐。",
      "TableText({11.2, 123.1, 32423.9, \"234.0\"}, \"vr\") 创建一列文本，其元素右对齐。",
      "TableText({A1:A10, B1:B10, C1:C10}, \"vl\") 创建一个包含三列的文本，其元素（左对齐）是给定电子表格单元格中的对象。",
      "TableText({{2011.56, 2, 3.7, 4}, {1, 4.2, 9, 16.365}}, \"v.\") 创建元素按小数点对齐的文本。",
      "TableText({{2011.56, 2, 3.7, 4}, {1, 4.2, 9, 16.365}}, \"v%\") 创建一个文本，其元素转换为百分比，并按小数点对齐。",
      "TableText({x², 4}, {x³, 8}, {x⁴, 16}, \"c\", 50) 创建一个三行两列的表。表中的所有项目均居中，单元格宽度为 50 像素。",
      "TableText({{\"left\", \"center\", \"right\"}, {\"l\", \"c\", \"r\"}}, \"lcr\", 45, 80) 创建一个两行三列的表。表中的所有项目都有不同的对齐方式。表格的每个单元格宽 45 像素，高 80 像素。",
      "TableText({1, 2}, {3, 4}, \"c()\") 创建文本主干：[\\begin{pmatrix}{} 1 & 2 \\\\ 3 & 4 \\\\ \\end{pmatrix} ]",
      "TableText({1, 2}, {3, 4}, \"c|_\") 创建文本",
      "TableText({1, 2}, {3, 4}, \"||\") 创建文本主干：[ \\begin{vmatrix}{} 1 & 2 \\\\ 3 & 4 \\\\ \\end{vmatrix} ]",
      "TableText({1, 2}, {3, 4}, \"||||\") 创建文本主干：[\\begin{Vmatrix}{} 1 & 2 \\\\ 3 & 4 \\\\ \\end{Vmatrix} ]",
      "TableText({{\"2x+3y=5\",\"5x+8y=12\"}},\"{v\") 创建文本主干：[ \\left\\{\\begin{matrix} 2x+3y=5\\\\ 5x+8y=12 \\end{matrix}\\right.]",
      "TableText({{1, 2, 3, 4}, {1, 2, 3, 4}, {1, 2, 3, 4}, {1, 2, 3, 4}, {1, 2, 3, 4}}, \"-/|_v\") 创建一个有边框且没有分隔线的表格。",
      "TableText({{1, 2, 3, 4}, {1, 2, 3, 4}, {1, 2, 3, 4}, {1, 2, 3, 4}, {1, 2, 3, 4}}, \"|11001 _110001 h\") 在第一列右侧和第一行内容下方创建一个带有边框和一条分隔线的表格。语法中的值 1 表示数字之间有分隔线，值 0 表示没有分隔线或边框。",
      "TableText({{\"\\blue{0, 1, 2, 3, 4}\", \"\\red{4, 3, 2, 1, 0}\"}}, \"v\") 创建一个表，其中第一行中的对象为蓝色，第二行中的对象为红色。"
    ],
    "tags": [
      "category:text",
      "capability:alignment"
    ]
  },
  {
    "command": "Take",
    "localizedName": "提取",
    "syntax": "Take( <列表>, <起始位置>, <终止位置> ); Take( <列表>, <起始位置> ); Take( <文本>, <起始位置>, <终止位置> ); Take( <文本>, <起始位置> )",
    "syntaxEn": "Take( <List>, <Start Position>, <End Position> ); Take( <List>, <Start Position> ); Take( <Text>, <Start Position>, <End Position> ); Take( <Text>, <Start Position> )",
    "description": "返回包含从开始位置到结束位置或初始列表或文本的开始位置和结束位置之间的元素的列表或文本。",
    "searchTextEn": "Take 提取 Take( <List>, <Start Position>, <End Position> ); <Text>, )",
    "examples": [
      "获取从位置 3 到列表末尾的元素",
      "取位置 3 到文本末尾的字符",
      "从列表的位置 3 到 4 获取元素",
      "从文本的位置 3 到 6 获取字符"
    ],
    "tags": [
      "category:list",
      "category:text",
      "capability:cas-supported"
    ]
  },
  {
    "command": "Tangent",
    "localizedName": "切线",
    "syntax": "Tangent( <点>, <圆锥曲线> ); Tangent( <点>, <函数> ); Tangent( <曲线上的点>, <曲线> ); Tangent( <横坐标x值>, <函数> ); Tangent( <直线>, <圆锥曲线> ); Tangent( <圆锥曲线>, <圆锥曲线> ); Tangent( <数字>, <函数> ); Tangent( <点>, <对象> )",
    "syntaxEn": "Tangent( <Point>, <Conic> ); Tangent( <Point>, <Function> ); Tangent( <Point on Curve>, <Curve> ); Tangent( <x-Value>, <Function> ); Tangent( <Line>, <Conic> ); Tangent( <Conic>, <Conic> ); Tangent( <Number>, <Function> ); Tangent( <Point>, <Object> )",
    "description": "根据不同的输入组合创建切线，例如从点到二次曲线或函数、从直线到二次曲线、圆之间或到样条曲线或隐式曲线等曲线。",
    "searchTextEn": "Tangent 切线 Tangent( <Point>, <Conic> ); <Function> <Point on Curve>, <Curve> <x-Value>, <Line>, <Conic>, <Number>, <Object> )",
    "examples": [
      "从一点到圆锥曲线的切线",
      "与点的 x 坐标处的函数相切",
      "与曲线上给定点处的曲线相切",
      "与特定 x 值处的函数相切",
      "平行于给定线的圆锥曲线的切线",
      "两个圆的公切线",
      "与给定点处的样条线相切",
      "与给定点处的隐式曲线相切"
    ],
    "tags": [
      "category:conic",
      "category:functions-and-calculus",
      "category:geometry"
    ]
  },
  {
    "command": "TaylorPolynomial",
    "localizedName": "泰勒公式",
    "syntax": "TaylorPolynomial( <函数>, <横坐标x值>, <阶数> ); TaylorPolynomial( <代数式>, <横坐标x值>, <阶数> ); TaylorPolynomial( <代数式>, <变量>, <变量值>, <阶数> )",
    "syntaxEn": "TaylorPolynomial( <Function>, <x-Value>, <Order Number> ); TaylorPolynomial( <Expression>, <x-Value>, <Order Number> ); TaylorPolynomial( <Expression>, <Variable>, <Variable Value>, <Order Number> )",
    "description": "泰勒公式",
    "searchTextEn": "TaylorPolynomial TaylorSeries 泰勒公式 TaylorPolynomial( <Function>, <x-Value>, <Order Number> ); <Expression>, <Variable>, <Variable Value>, )",
    "examples": [],
    "tags": [
      "category:functions-and-calculus",
      "capability:cas-supported"
    ]
  },
  {
    "command": "TDistribution",
    "localizedName": "t分布",
    "syntax": "TDistribution( <自由度>, <变量值> ); TDistribution( <自由度>, <变量值>, <是否累积? true|false> ); TDistribution( <自由度>, x, <是否累积? true|false> )",
    "syntaxEn": "TDistribution( <Degrees of Freedom>, <Variable Value> ); TDistribution( <Degrees of Freedom>, <Variable Value>, <Boolean Cumulative> ); TDistribution( <Degrees of Freedom>, x, <Boolean Cumulative> )",
    "description": "评估变量值 v 处 t 分布的累积分布函数，即计算概率 P(X ≤ v)，其中 X 是具有给定自由度的 t 分布的随机变量。",
    "searchTextEn": "TDistribution t分布 TDistribution( <Degrees of Freedom>, <Variable Value> ); Value>, <Boolean Cumulative> x, )",
    "examples": [
      "TDistribution(10, 0) 收益率 0.5"
    ],
    "tags": [
      "category:probability",
      "capability:cas-supported"
    ]
  },
  {
    "command": "Tetrahedron",
    "localizedName": "正四面体",
    "syntax": "Tetrahedron( <等边三角形> ); Tetrahedron( <点>, <点>, <点> ); Tetrahedron( <点>, <点>, <方向> )",
    "syntaxEn": "Tetrahedron( <Equilateral Triangle> ); Tetrahedron( <Point>, <Point>, <Point> ); Tetrahedron( <Point>, <Point>, <Direction> )",
    "description": "使用各种输入组合创建一个四面体：以等边三角形为底；用两个点和一个方向来确定其他顶点；三点形成等边三角形；或者有两个点，其中第三个点自动在圆上生成以围绕第一条边旋转。",
    "searchTextEn": "Tetrahedron 正四面体 Tetrahedron( <Equilateral Triangle> ); <Point>, <Point> <Direction> )",
    "examples": [
      "Tetrahedron(A, B) 是 Tetrahedron(A, B, C) 的缩写，其中 C = Point(Circle(Midpoint(A, B), Distance(A, B) sqrt(3) / 2, Segment(A, B)))",
      "另请参见立方体、八面体、二十面体、十二面体命令"
    ],
    "tags": [
      "category:3d"
    ]
  },
  {
    "command": "Text",
    "localizedName": "文本",
    "syntax": "Text( <对象> ); Text( <对象>, <是否替换变量? true|false> ); Text( <对象>, <点> ); Text( <对象>, <点>, <是否替换变量? true|false> ); Text( <对象>, <点>, <是否替换变量? true|false>, <LaTeX 公式布尔值> ); Text( <对象>, <点>, <是否替换变量? true|false>, <LaTeX 公式布尔值>, <水平对齐 -1|0|1> ); Text( <对象>, <点>, <是否替换变量? true|false>, <LaTeX 公式布尔值>, <水平对齐 -1|0|1>, <垂直对齐 -1|0|1> )",
    "syntaxEn": "Text( <Object> ); Text( <Object>, <Boolean for Substitution of Variables> ); Text( <Object>, <Point> ); Text( <Object>, <Point>, <Boolean for Substitution of Variables> ); Text( <Object>, <Point>, <Boolean for Substitution of Variables>, <Boolean for LaTeX formula> ); Text( <Object>, <Point>, <Boolean for Substitution of Variables>, <Boolean for LaTeX formula>, <Horizontal alignment -1|0|1> ); Text( <Object>, <Point>, <Boolean for Substitution of Variables>, <Boolean for LaTeX formula>, <Horizontal alignment -1|0|1>, <Vertical alignment -1|0|1> )",
    "description": "创建包含给定对象的公式的文本，并带有用于位置、变量替换、LaTeX 渲染和对齐的可选参数。",
    "searchTextEn": "Text 文本 Text( <Object> ); <Object>, <Boolean for Substitution of Variables> <Point> <Point>, Variables>, LaTeX formula> formula>, <Horizontal alignment -1|0|1> -1|0|1>, <Vertical )",
    "examples": [
      "创建包含给定对象的公式的文本，并使用默认值替换。",
      "创建带有布尔值的文本来控制变量替换。",
      "在指定点创建文本。",
      "在具有变量替换控制的点处创建文本。",
      "在具有变量替换和 LaTeX 渲染的点处创建文本。",
      "在具有变量替换、LaTeX 渲染和对齐控制的点处创建文本。"
    ],
    "tags": [
      "category:text",
      "capability:create",
      "capability:position",
      "capability:text-position",
      "capability:alignment"
    ]
  },
  {
    "command": "TextToUnicode",
    "localizedName": "文本转换为统一码",
    "syntax": "TextToUnicode( <文本> )",
    "syntaxEn": "TextToUnicode( <Text> )",
    "description": "将文本转换为 Unicode 数字列表，每个字符对应一个数字。",
    "searchTextEn": "TextToUnicode 文本转换为统一码 TextToUnicode( <Text> )",
    "examples": [
      "TextToUnicode(\"Some text\") 为您提供 Unicode 编号 {83, 111, 109, 101, 32, 116, 101, 120, 116} 的列表。",
      "如果 text1 是“hello”，则 TextToUnicode(text1) 将为您提供 Unicode 编号 {104, 101, 108, 108, 111} 的列表。"
    ],
    "tags": [
      "category:text"
    ]
  },
  {
    "command": "TiedRank",
    "localizedName": "平秩列表",
    "syntax": "TiedRank( <列表> )",
    "syntaxEn": "TiedRank( <List> )",
    "description": "返回一个列表，其第_i_个元素是给定列表L (rank of element is its position in Sort(L))的第_i_个元素的排名。如果 L 中有更多相等的元素占据了 Sort[L] 中从 k 到 l 的位置，则从 k 到 l 的排名的平均值与这些元素相关联。",
    "searchTextEn": "TiedRank 平秩列表 TiedRank( <List> )",
    "examples": [
      "列表示例 {4, 1, 2, 3, 4, 2}",
      "列表示例 {3, 2, 2, 1}"
    ],
    "tags": [
      "category:list"
    ]
  },
  {
    "command": "TMean2Estimate",
    "localizedName": "双样本均值t估计",
    "syntax": "TMean2Estimate( <样本数据1列表>, <样本数据2列表>, <置信水平>, <是否合并? true|false> ); TMean2Estimate( <样本1平均数>, <样本1标准差>, <样本1容量>, <样本2平均数>, <样本2标准差>, <样本2容量>, <置信水平>, <是否合并? true|false> )",
    "syntaxEn": "TMean2Estimate( <List of Sample Data 1>, <List of Sample Data 2>, <Confidence Level>, <Boolean Pooled> ); TMean2Estimate( <Sample Mean 1>, <Sample Standard Deviation 1>, <Sample Size 1>, <Sample Mean 2>, <Sample Standard Deviation 2>, <Sample Size 2>, <Confidence Level>, <Boolean Pooled> )",
    "description": "使用样本数据集或样本统计数据和置信水平计算两个总体均值之间差异的 t 置信区间估计值。如果 Pooled = true，则假定总体方差相等并合并样本标准差；如果 Pooled = false，则不假定它们相等且不合并。结果以{置信下限、置信上限}的形式返回。",
    "searchTextEn": "TMean2Estimate 双样本均值t估计 TMean2Estimate( <List of Sample Data 1>, 2>, <Confidence Level>, <Boolean Pooled> ); <Sample Mean Standard Deviation Size )",
    "examples": [],
    "tags": [
      "category:statistics"
    ]
  },
  {
    "command": "TMeanEstimate",
    "localizedName": "单均值t估计",
    "syntax": "TMeanEstimate( <样本数据列表>, <置信水平> ); TMeanEstimate( <样本平均数>, <样本标准差>, <样本容量>, <置信水平> )",
    "syntaxEn": "TMeanEstimate( <List of Sample Data>, <Confidence Level> ); TMeanEstimate( <Sample Mean>, <Sample Standard Deviation>, <Sample Size>, <Confidence Level> )",
    "description": "使用给定的样本数据和置信水平计算总体平均值的 t 置信区间估计值。结果以列表形式返回，形式为{置信下限、置信上限}。",
    "searchTextEn": "TMeanEstimate 单均值t估计 TMeanEstimate( <List of Sample Data>, <Confidence Level> ); <Sample Mean>, Standard Deviation>, Size>, )",
    "examples": [],
    "tags": [
      "category:statistics"
    ]
  },
  {
    "command": "ToBase",
    "localizedName": "转换进制",
    "syntax": "ToBase( <数字>, <进制(基数) 2~36> )",
    "syntaxEn": "ToBase( <Number>, <Base> )",
    "description": "将给定数字转换为不同的基数（https://en.wikipedia.org/wiki/Radix）。基数必须介于 2 到 36 之间。数字必须是整数。",
    "searchTextEn": "ToBase 转换进制 ToBase( <Number>, <Base> )",
    "examples": [
      "ToBase(255,16) 返回“FF”。",
      "ToBase(256, 2) 返回“100000000”。"
    ],
    "tags": [
      "category:algebra"
    ]
  },
  {
    "command": "ToComplex",
    "localizedName": "转换为复数",
    "syntax": "ToComplex( <向量> )",
    "syntaxEn": "ToComplex( <Vector> )",
    "description": "将向量或点转换为代数形式的复数。",
    "searchTextEn": "ToComplex 转换为复数 ToComplex( <Vector> )",
    "examples": [
      "ToComplex((3, 2)) 产生 3 + 2ί。"
    ],
    "tags": [
      "category:functions-and-calculus",
      "category:vector-and-matrix",
      "capability:cas-supported",
      "capability:cas-only"
    ]
  },
  {
    "command": "ToExponential",
    "localizedName": "转换为指数",
    "syntax": "ToExponential( <复数> )",
    "syntaxEn": "ToExponential( <Complex Number> )",
    "description": "将复数转换为其指数形式。",
    "searchTextEn": "ToExponential 转换为指数 ToExponential( <Complex Number> )",
    "examples": [
      "ToExponential(1 + ί) 产生词干：[\\sqrt{2}e{\\frac{i\\pi}{4}}]。"
    ],
    "tags": [
      "category:functions-and-calculus",
      "capability:cas-supported",
      "capability:cas-only"
    ]
  },
  {
    "command": "ToolImage",
    "localizedName": "工具图标",
    "syntax": "ToolImage( <数字> ); ToolImage( <数字>, <点> ); ToolImage( <数字>, <点>, <点> )",
    "syntaxEn": "ToolImage( <Number> ); ToolImage( <Number>, <Point> ); ToolImage( <Number>, <Point>, <Point> )",
    "description": "在图形视图中创建具有给定编号的工具图标的 32x32 像素图像，可以选择锚定到一个点或由两个点定义为定向正方形。",
    "searchTextEn": "ToolImage 工具图标 ToolImage( <Number> ); <Number>, <Point> <Point>, )",
    "examples": [
      "在图形视图中创建具有给定编号的工具图标的 32x32 像素图像。",
      "在图形视图中创建工具图标的 32x32 像素图像，锚定到给定点。",
      "在图形视图中创建工具图标的图像。两个给定点定义了包含图像的定向正方形边的两个相邻顶点。"
    ],
    "tags": [
      "category:geogebra"
    ]
  },
  {
    "command": "Top",
    "localizedName": "上底",
    "syntax": "Top( <二次曲面> )",
    "syntaxEn": "Top( <Quadric> )",
    "description": "创建有限二次曲面的顶部。",
    "searchTextEn": "Top 上底 Top( <Quadric> )",
    "examples": [
      "Top( cylinder ) 产生一个圆。",
      "Top( cone ) 产生锥体末端（点）。"
    ],
    "tags": [
      "category:3d"
    ]
  },
  {
    "command": "ToPoint",
    "localizedName": "转换为点",
    "syntax": "ToPoint( <复数> )",
    "syntaxEn": "ToPoint( <Complex Number> )",
    "description": "从复数创建一个点。",
    "searchTextEn": "ToPoint 转换为点 ToPoint( <Complex Number> )",
    "examples": [
      "ToPoint(3 + 2ί) 创建一个坐标为 (3, 2) 的点。"
    ],
    "tags": [
      "category:functions-and-calculus",
      "capability:cas-supported",
      "capability:cas-only"
    ]
  },
  {
    "command": "ToPolar",
    "localizedName": "转换为极坐标",
    "syntax": "ToPolar( <复数> ); ToPolar( <向量> )",
    "syntaxEn": "ToPolar( <Complex Number> ); ToPolar( <Vector> )",
    "description": "将向量或复数转换为其极坐标。",
    "searchTextEn": "ToPolar 转换为极坐标 ToPolar( <Complex Number> ); <Vector> )",
    "examples": [
      "将向量转换为极坐标",
      "将复数转换为极坐标"
    ],
    "tags": [
      "category:functions-and-calculus",
      "category:vector-and-matrix",
      "capability:cas-supported",
      "capability:cas-only"
    ]
  },
  {
    "command": "Translate",
    "localizedName": "平移",
    "syntax": "Translate( <对象>, <向量> ); Translate( <向量>, <起始点> )",
    "syntaxEn": "Translate( <Object>, <Vector> ); Translate( <Vector>, <Start Point> )",
    "description": "通过向量平移几何对象。",
    "searchTextEn": "Translate 平移 Translate( <Object>, <Vector> ); <Vector>, <Start Point> )",
    "examples": [
      "平移多边形时，也会创建变换后的新顶点和线段。"
    ],
    "tags": [
      "category:transformation",
      "capability:transform"
    ]
  },
  {
    "command": "Transpose",
    "localizedName": "转置",
    "syntax": "Transpose( <矩阵> )",
    "syntaxEn": "Transpose( <Matrix> )",
    "description": "转置数据（通常是矩阵或表格），交换行和列。 转置矩阵。",
    "searchTextEn": "Transpose 转置 Transpose( <Matrix> )",
    "examples": [
      "转置 3x3 矩阵",
      "转置 2x2 矩阵（CAS 语法）"
    ],
    "tags": [
      "category:vector-and-matrix",
      "capability:cas-supported"
    ]
  },
  {
    "command": "TrapezoidalSum",
    "localizedName": "梯形法则",
    "syntax": "TrapezoidalSum( <函数>, <x-起始值>, <x-终止值>, <梯形数量> )",
    "syntaxEn": "TrapezoidalSum( <Function>, <Start x-Value>, <End x-Value>, <Number of Trapezoids> )",
    "description": "使用 n 个梯形计算区间 [Start x-Value, End x-Value] 内函数的梯形和。",
    "searchTextEn": "TrapezoidalSum 梯形法则 TrapezoidalSum( <Function>, <Start x-Value>, <End <Number of Trapezoids> )",
    "examples": [
      "使用 5 个梯形计算 x^2 从 -2 到 3 的梯形和"
    ],
    "tags": [
      "category:functions-and-calculus"
    ]
  },
  {
    "command": "TravelingSalesman",
    "localizedName": "旅行商问题",
    "syntax": "TravelingSalesman( <点列> )",
    "syntaxEn": "TravelingSalesman( <List of Points> )",
    "description": "返回经过每个点一次的最短闭合路径。返回的对象是一个轨迹，因此它是辅助的。",
    "searchTextEn": "TravelingSalesman 旅行商问题 TravelingSalesman( <List of Points> )",
    "examples": [],
    "tags": [
      "category:discrete-math"
    ]
  },
  {
    "command": "TriangleCenter",
    "localizedName": "三角形中心",
    "syntax": "TriangleCenter( <点>, <点>, <点>, <数字> )",
    "syntaxEn": "TriangleCenter( <Point>, <Point>, <Point>, <Number> )",
    "description": "给出三角形 ABC 的第 _n_ 个三角形中心 (https://en.wikipedia.org/wiki/Triangle_center)。适用于 n < 3054。",
    "searchTextEn": "TriangleCenter 三角形中心 TriangleCenter( <Point>, <Number> )",
    "examples": [
      "令 A = (1, -2)、B = (6, 1) 且 C = (4, 3)。 TriangleCenter(A, B, C, 2) 产生三角形 ABC 的质心 D = (3.67, 0.67)。"
    ],
    "tags": [
      "category:geometry"
    ]
  },
  {
    "command": "TriangleCurve",
    "localizedName": "三角曲线",
    "syntax": "TriangleCurve( <点>, <点>, <点>, <方程> )",
    "syntaxEn": "TriangleCurve( <Point>, <Point>, <Point>, <Equation> )",
    "description": "创建隐式多项式，其关于点 P、Q、R 的重心坐标 (https://en.wikipedia.org/wiki/Barycentric_coordinate_system_(mathematics)) 方程由第四个参数给出；重心坐标称为 A、B、C。",
    "searchTextEn": "TriangleCurve 三角曲线 TriangleCurve( <Point>, <Equation> )",
    "examples": [
      "如果 P、Q、R 是点，则 TriangleCurve(P, Q, R, (A - B)*(B - C)*(C - A) = 0) 给出由三角形 PQR 的中线组成的三次曲线。",
      "TriangleCurve(A, B, C, A*C = 1/8) 创建一条双曲线，通过 A 或 C 与此双曲线相切，将三角形 ABC 分成面积相等的两部分。",
      "TriangleCurve(A, B, C, A² + B² + C² - 2B C - 2C A - 2A B = 0) 创建三角形 ABC 的斯坦纳内椭圆 (https://en.wikipedia.org/wiki/Steiner_inellipse)，而 TriangleCurve(A, B, C, B C + C A + A B = 0) 创建三角形 ABC 的斯坦纳外接椭圆 (https://en.wikipedia.org/wiki/Steiner_ellipse)。"
    ],
    "tags": [
      "category:functions-and-calculus",
      "category:geometry"
    ]
  },
  {
    "command": "Triangular",
    "localizedName": "三角形分布",
    "syntax": "Triangular( <下界>, <上界>, <模式>, <变量值> ); Triangular( <下界>, <上界>, <模式>, <变量值>, <是否累积? true|false> ); Triangular( <下界>, <上界>, <模式>, x, <是否累积? true|false> )",
    "syntaxEn": "Triangular( <Lower Bound>, <Upper Bound>, <Mode>, <Variable Value> ); Triangular( <Lower Bound>, <Upper Bound>, <Mode>, <Variable Value>, <Boolean Cumulative> ); Triangular( <Lower Bound>, <Upper Bound>, <Mode>, x, <Boolean Cumulative> )",
    "description": "评估变量值 v 处三角分布的累积分布函数，即计算概率 P(X ≤ v)，其中 X 是具有给定模式的 [_下界_，_上界_] 内三角分布的随机变量。",
    "searchTextEn": "Triangular 三角形分布 Triangular( <Lower Bound>, <Upper <Mode>, <Variable Value> ); Value>, <Boolean Cumulative> x, )",
    "examples": [
      "三角分布评估示例"
    ],
    "tags": [
      "category:probability"
    ]
  },
  {
    "command": "TrigCombine",
    "localizedName": "三角合并",
    "syntax": "TrigCombine( <代数式> ); TrigCombine( <代数式>, <目标函数> )",
    "syntaxEn": "TrigCombine( <Expression> ); TrigCombine( <Expression>, <Target Function> )",
    "description": "将三角项的乘积合并为和，或将三角项的和合并为仅包含三角函数的表达式。对于目标函数，它将术语组合成仅包含该函数的等效表达式。",
    "searchTextEn": "TrigCombine 三角合并 TrigCombine( <Expression> ); <Expression>, <Target Function> )",
    "examples": [
      "将乘积 sin(x) cos(3x) 合并为和",
      "将 sum sin(x) + cos(x) 组合成仅包含三角函数的表达式",
      "将 sin(x) + cos(x) 组合成仅包含 sin(x) 的表达式",
      "使用未定义变量 p 将乘积 sin(p) cos(3p) 合并为和"
    ],
    "tags": [
      "category:functions-and-calculus",
      "capability:cas-supported",
      "capability:cas-only"
    ]
  },
  {
    "command": "TrigExpand",
    "localizedName": "三角展开",
    "syntax": "TrigExpand( <代数式> ); TrigExpand( <代数式>, <目标函数> ); TrigExpand( <代数式>, <目标函数>, <目标变量> ); TrigExpand( <代数式>, <目标函数>, <目标变量>, <目标变量> )",
    "syntaxEn": "TrigExpand( <Expression> ); TrigExpand( <Expression>, <Target Function> ); TrigExpand( <Expression>, <Target Function>, <Target Variable> ); TrigExpand( <Expression>, <Target Function>, <Target Variable>, <Target Variable> )",
    "description": "将变量之和的三角函数展开为单个变量的三角函数，或将三角函数的乘积展开为线性表达式。还可以扩展到包含特定目标函数和变量的表达式。",
    "searchTextEn": "TrigExpand 三角展开 TrigExpand( <Expression> ); <Expression>, <Target Function> Function>, Variable> Variable>, )",
    "examples": [
      "将 tan(x + y) 展开为基本三角函数",
      "将 sin(x)sin(x/3) 展开为线性表达式",
      "以 tan(x) 作为目标函数展开 tan(x + y)",
      "以 sin(x) 作为目标函数，以 x/2 作为目标变量展开 sin(x)",
      "以 tan(x) 作为目标函数，以 x/2 作为目标变量展开 sin(x)/(1+cos(x))",
      "以 tan(x) 作为目标函数，以 x/2, y/2 作为目标变量，展开 csc(x) - cot(x) + csc(y) - cot(y)"
    ],
    "tags": [
      "category:functions-and-calculus",
      "capability:cas-supported",
      "capability:cas-only"
    ]
  },
  {
    "command": "TrigSimplify",
    "localizedName": "三角化简",
    "syntax": "TrigSimplify( <代数式> )",
    "syntaxEn": "TrigSimplify( <Expression> )",
    "description": "简化给定的三角表达式。",
    "searchTextEn": "TrigSimplify 三角化简 TrigSimplify( <Expression> )",
    "examples": [
      "化简 1 - sin(x)²",
      "化简 sin(x)² - cos(x)² + 1"
    ],
    "tags": [
      "category:functions-and-calculus",
      "capability:cas-supported",
      "capability:cas-only"
    ]
  },
  {
    "command": "Trilinear",
    "localizedName": "三线坐标点",
    "syntax": "Trilinear( <点>, <点>, <点>, <数字>, <数字>, <数字> )",
    "syntaxEn": "Trilinear( <Point>, <Point>, <Point>, <Number>, <Number>, <Number> )",
    "description": "创建一个点，其三线坐标（https://en.wikipedia.org/wiki/Trilinear_coordinates）是相对于具有给定点的三角形的给定数字。",
    "searchTextEn": "Trilinear 三线坐标点 Trilinear( <Point>, <Number>, <Number> )",
    "examples": [
      "创建具有三线坐标 (1, 0, 0) 的点 A",
      "使用三线坐标 (0, 1, 0) 创建点 B",
      "创建具有三线坐标 (0, 0, 1) 的点 C",
      "使用三线坐标创建外心（cos(A)、cos(B)、cos(C)）",
      "使用三线坐标 (1, 1, 1) 创建内圆圆心",
      "使用三线坐标 (-1, 1, 1) 创建与 [BC] 相切的外圆中心",
      "使用三线坐标 (1, -1, 1) 创建与 [AC] 相切的外圆中心",
      "使用三线坐标 (1, 1, -1) 创建与 [AB] 相切的外圆中心",
      "使用三线坐标（1/a、1/b、1/c）创建质心",
      "使用三线坐标创建正交中心 (cos(B)cos(C)、cos(A)cos(C)、cos(A)cos(B))"
    ],
    "tags": [
      "category:geometry"
    ]
  },
  {
    "command": "TTest",
    "localizedName": "t检验",
    "syntax": "TTest( <样本数据列表>, <假设平均数>, <尾部 \"＜\"-总体均值小于假设平均数|\"＞\"-总体均值大于假设平均数|\"≠\"-总体均值不等于假设平均数> ); TTest( <样本平均数>, <样本标准差>, <样本容量>, <假设平均数>, <尾部 \"＜\"-总体均值小于假设平均数|\"＞\"-总体均值大于假设平均数|\"≠\"-总体均值不等于假设平均数> )",
    "syntaxEn": "TTest( <List of Sample Data>, <Hypothesized Mean>, <Tail> ); TTest( <Sample Mean>, <Sample Standard Deviation>, <Sample Size>, <Hypothesized Mean>, <Tail> )",
    "description": "使用样本数据或样本统计量执行总体平均值的单样本 t 检验。假设平均值是原假设中假设的总体平均值。 Tail 指定备择假设：“<”= 总体平均值 < 假设平均值，“>”= 总体平均值 > 假设平均值，“≠”= 总体平均值 ≠ 假设平均值。结果以列表形式返回，形式为{概率值，t 检验统计量}。",
    "searchTextEn": "TTest t检验 TTest( <List of Sample Data>, <Hypothesized Mean>, <Tail> ); <Sample Standard Deviation>, Size>, )",
    "examples": [
      "使用样本数据列表、假设均值 3 和左尾替代执行 t 检验",
      "使用样本统计数据、假设平均值 4 和双尾替代执行 t 检验"
    ],
    "tags": [
      "category:statistics"
    ]
  },
  {
    "command": "TTest2",
    "localizedName": "双总体t检验",
    "syntax": "TTest2( <样本数据1列表>, <样本数据2列表>, <尾部 \"＜\"-总体均值小于假设平均数|\"＞\"-总体均值大于假设平均数|\"≠\"-总体均值不等于假设平均数>, <是否合并? true|false> ); TTest2( <样本1平均数>, <样本1标准差>, <样本1容量>, <样本2平均数>, <样本2标准差>, <样本2容量>, <尾部 \"＜\"-总体均值小于假设平均数|\"＞\"-总体均值大于假设平均数|\"≠\"-总体均值不等于假设平均数>, <是否合并? true|false> )",
    "syntaxEn": "TTest2( <List of Sample Data 1>, <List of Sample Data 2>, <Tail>, <Boolean Pooled> ); TTest2( <Sample Mean 1>, <Sample Standard Deviation 1>, <Sample Size 1>, <Sample Mean 2>, <Sample Standard Deviation 2>, <Sample Size 2>, <Tail>, <Boolean Pooled> )",
    "description": "使用给定的样本数据列表对两个总体均值之间的差异执行 t 检验。 Tail 具有可能的值“<”、“\">”、“≠”，用于确定以下替代假设：“<”= 总体均值差异 < 0，\">”= 总体均值差异 > 0，“≠”= 总体均值差异 ≠ 0。如果 Pooled = true，则假定总体方差相等，并在计算中合并样本标准差。如果 Pooled = false，则不假定总体方差相等，并且不合并样本标准差。结果以列表形式返回，形式为{概率值，t 检验统计量}。",
    "searchTextEn": "TTest2 双总体t检验 TTest2( <List of Sample Data 1>, 2>, <Tail>, <Boolean Pooled> ); <Sample Mean Standard Deviation Size )",
    "examples": [],
    "tags": [
      "category:statistics"
    ]
  },
  {
    "command": "TTestPaired",
    "localizedName": "配对样本t检验",
    "syntax": "TTestPaired( <样本数据1列表>, <样本数据2列表>, <尾部 \"＜\"-总体均值小于假设平均数|\"＞\"-总体均值大于假设平均数|\"≠\"-总体均值不等于假设平均数> )",
    "syntaxEn": "TTestPaired( <List of Sample Data 1>, <List of Sample Data 2>, <Tail> )",
    "description": "使用给定的配对样本数据列表执行配对 t 检验。 Tail 具有可能的值“<”、“\">”、“≠”，它们确定以下替代假设：“<”= μ < 0、\">”= μ > 0、“≠”= μ ≠ 0（μ 是总体的平均配对差）。结果以列表形式返回，形式为{概率值，t 检验统计量}。",
    "searchTextEn": "TTestPaired 配对样本t检验 TTestPaired( <List of Sample Data 1>, 2>, <Tail> )",
    "examples": [
      "TTestPaired 带样本数据和尾部“<”"
    ],
    "tags": [
      "category:statistics"
    ]
  },
  {
    "command": "Turtle",
    "localizedName": "海龟",
    "syntax": "Turtle()",
    "syntaxEn": "Turtle()",
    "description": "在坐标原点创建一只海龟。",
    "searchTextEn": "Turtle 海龟 Turtle()",
    "examples": [],
    "tags": [
      "category:scripting",
      "capability:interaction",
      "capability:script"
    ]
  },
  {
    "command": "TurtleBack",
    "localizedName": "后退",
    "syntax": "TurtleBack( <海龟>, <距离> )",
    "syntaxEn": "TurtleBack( <Turtle>, <Distance> )",
    "description": "海龟向后移动给定的距离。",
    "searchTextEn": "TurtleBack 后退 TurtleBack( <Turtle>, <Distance> )",
    "examples": [
      "如果海龟位于坐标原点并且显示“暂停”按钮，则命令 TurtleBack(turtle, 2) 会将海龟移动到点 (-2, 0)。否则，您必须按“播放”按钮才能实现位移。"
    ],
    "tags": [
      "category:scripting",
      "capability:interaction",
      "capability:script"
    ]
  },
  {
    "command": "TurtleDown",
    "localizedName": "落笔",
    "syntax": "TurtleDown( <海龟> )",
    "syntaxEn": "TurtleDown( <Turtle> )",
    "description": "授权指定的海龟从现在开始追踪其移动。",
    "searchTextEn": "TurtleDown 落笔 TurtleDown( <Turtle> )",
    "examples": [
      "授权指定的海龟从现在开始追踪其移动。"
    ],
    "tags": [
      "category:scripting",
      "capability:interaction",
      "capability:script"
    ]
  },
  {
    "command": "TurtleForward",
    "localizedName": "前进",
    "syntax": "TurtleForward( <海龟>, <距离> )",
    "syntaxEn": "TurtleForward( <Turtle>, <Distance> )",
    "description": "海龟向前移动给定的距离。",
    "searchTextEn": "TurtleForward 前进 TurtleForward( <Turtle>, <Distance> )",
    "examples": [
      "如果海龟位于坐标原点并且显示“暂停”按钮，则命令 TurtleForward(turtle, 2) 会将海龟移动到点 (2, 0)。否则，您必须按“播放”按钮才能实现位移。"
    ],
    "tags": [
      "category:scripting",
      "capability:interaction",
      "capability:script"
    ]
  },
  {
    "command": "TurtleLeft",
    "localizedName": "左转",
    "syntax": "TurtleLeft( <海龟>, <度|弧度> )",
    "syntaxEn": "TurtleLeft( <Turtle>, <Angle> )",
    "description": "海龟向左转动给定的角度。",
    "searchTextEn": "TurtleLeft 左转 TurtleLeft( <Turtle>, <Angle> )",
    "examples": [
      "如果显示“暂停”按钮，TurtleLeft(turtle, 1) 将海龟向左转动 1 rad。否则，您必须按“播放”按钮才能实现旋转。",
      "如果输入 TurtleLeft(turtle, 1°)，海龟将向左转 1 度。"
    ],
    "tags": [
      "category:scripting",
      "capability:interaction",
      "capability:script"
    ]
  },
  {
    "command": "TurtleRight",
    "localizedName": "右转",
    "syntax": "TurtleRight( <海龟>, <度|弧度> )",
    "syntaxEn": "TurtleRight( <Turtle>, <Angle> )",
    "description": "海龟向右转向给定的角度。",
    "searchTextEn": "TurtleRight 右转 TurtleRight( <Turtle>, <Angle> )",
    "examples": [
      "如果显示“暂停”按钮，TurtleRight(turtle, 1) 将海龟向右转动 1 rad。否则，您必须按“播放”按钮才能实现旋转。",
      "如果输入 TurtleRight(turtle, 1°)，海龟将向右旋转 1 度。",
      "另请参见 Turtle、TurtleBack、TurtleForward 和 TurtleLeft 命令。"
    ],
    "tags": [
      "category:scripting",
      "capability:interaction",
      "capability:script"
    ]
  },
  {
    "command": "TurtleUp",
    "localizedName": "抬笔",
    "syntax": "TurtleUp( <海龟> )",
    "syntaxEn": "TurtleUp( <Turtle> )",
    "description": "指示指定的乌龟从现在开始不要追踪其移动。",
    "searchTextEn": "TurtleUp 抬笔 TurtleUp( <Turtle> )",
    "examples": [
      "TurtleUp( <Turtle> ) 命令示例。"
    ],
    "tags": [
      "category:scripting",
      "capability:interaction",
      "capability:script"
    ]
  },
  {
    "command": "Type",
    "localizedName": "类型",
    "syntax": "Type( <对象> )",
    "syntaxEn": "Type( <Object> )",
    "description": "对于二次曲线和二次曲线，此命令根据下表返回代表二次曲线/二次曲线类型的数字。在这种情况下，空二次曲线（或二次曲线）是定义了系数但不包含任何实点的二次曲线，例如_x_2 + _y_2 = -1。对于二次曲线，GeoGebra 区分双线（距离为 0 的平行线的特殊情况）和单线（直径无限大的圆的特殊情况，可能是圆反转的结果）。对于二次曲面来说，没有这样的区别。",
    "searchTextEn": "Type 类型 Type( <Object> )",
    "examples": [
      "Type(x²+y²=1) 产生 4，代表圆形。"
    ],
    "tags": [
      "category:conic",
      "category:geometry"
    ]
  },
  {
    "command": "UnicodeToLetter",
    "localizedName": "统一码转换为字母",
    "syntax": "UnicodeToLetter( <自然数> )",
    "syntaxEn": "UnicodeToLetter( <Integer> )",
    "description": "将整数 Unicode 数字转换回字母，该字母在图形视图中显示为文本对象。",
    "searchTextEn": "UnicodeToLetter 统一码转换为字母 UnicodeToLetter( <Integer> )",
    "examples": [
      "UnicodeToLetter(97) 生成文本“a”。"
    ],
    "tags": [
      "category:text"
    ]
  },
  {
    "command": "UnicodeToText",
    "localizedName": "统一码转换为文本",
    "syntax": "UnicodeToText( <统一字符编码整数列表> )",
    "syntaxEn": "UnicodeToText( <List of Integers> )",
    "description": "将整数 Unicode 数字转换回文本。",
    "searchTextEn": "UnicodeToText 统一码转换为文本 UnicodeToText( <List of Integers> )",
    "examples": [
      "UnicodeToText({104, 101, 108, 108, 111}) 生成文本“hello”。"
    ],
    "tags": [
      "category:text"
    ]
  },
  {
    "command": "Uniform",
    "localizedName": "均匀分布",
    "syntax": "Uniform( <下界>, <上界>, <变量值> ); Uniform( <下界>, <上界>, <变量值>, <是否累积? true|false> ); Uniform( <下界>, <上界>, x, <是否累积? true|false> )",
    "syntaxEn": "Uniform( <Lower Bound>, <Upper Bound>, <Variable Value> ); Uniform( <Lower Bound>, <Upper Bound>, <Variable Value>, <Boolean Cumulative> ); Uniform( <Lower Bound>, <Upper Bound>, x, <Boolean Cumulative> )",
    "description": "评估或创建均匀分布的累积分布函数 (CDF) 或概率密度函数 (PDF)。",
    "searchTextEn": "Uniform 均匀分布 Uniform( <Lower Bound>, <Upper <Variable Value> ); Value>, <Boolean Cumulative> x, )",
    "examples": [
      "计算变量值 v 处均匀分布的累积分布函数",
      "如果 Cumulative = true，则评估 CDF，否则以变量值评估 PDF",
      "如果 Cumulative 为 true，则创建 CDF，否则创建均匀分布的 PDF"
    ],
    "tags": [
      "category:probability"
    ]
  },
  {
    "command": "Union",
    "localizedName": "并集",
    "syntax": "Union( <列表>, <列表> ); Union( <多边形>, <多边形> )",
    "syntaxEn": "Union( <List>, <List> ); Union( <Polygon>, <Polygon> )",
    "description": "连接两个列表并删除多次出现的元素，或在特定条件下查找两个多边形的并集。",
    "searchTextEn": "Union 并集 Union( <List>, <List> ); <Polygon>, <Polygon> )",
    "examples": [
      "两个列表的并集",
      "两个多边形的并集"
    ],
    "tags": [
      "category:geometry",
      "category:list"
    ]
  },
  {
    "command": "Unique",
    "localizedName": "互异",
    "syntax": "Unique( <列表> )",
    "syntaxEn": "Unique( <List> )",
    "description": "按升序返回给定列表的元素列表，重复元素仅包含一次。适用于数字列表和文本列表。",
    "searchTextEn": "Unique 互异 Unique( <List> )",
    "examples": [
      "Unique({1, 2, 4, 1, 4}) 产生 {1, 2, 4}。",
      "Unique({\"a\", \"b\", \"Hello\", \"Hello\"}) 产生 {\"'Hello\", \"a\", \"b\"}。",
      "Unique({1, x, x, 1, a}) 产生 {1, x, a}。"
    ],
    "tags": [
      "category:list",
      "capability:cas-supported"
    ]
  },
  {
    "command": "UnitPerpendicularVector",
    "localizedName": "单位法向量",
    "syntax": "UnitPerpendicularVector( <直线> ); UnitPerpendicularVector( <线段> ); UnitPerpendicularVector( <向量> ); UnitPerpendicularVector( <平面> )",
    "syntaxEn": "UnitPerpendicularVector( <Line> ); UnitPerpendicularVector( <Segment> ); UnitPerpendicularVector( <Vector> ); UnitPerpendicularVector( <Plane> )",
    "description": "单位法向量",
    "searchTextEn": "UnitPerpendicularVector UnitOrthogonalVector 单位法向量 UnitPerpendicularVector( <Line> ); <Segment> <Vector> <Plane> )",
    "examples": [],
    "tags": [
      "category:vector-and-matrix",
      "capability:cas-supported"
    ]
  },
  {
    "command": "UnitVector",
    "localizedName": "单位向量",
    "syntax": "UnitVector( <对象> ); UnitVector( <向量> )",
    "syntaxEn": "UnitVector( <Object> ); UnitVector( <Vector> )",
    "description": "生成长度为 1 的向量，该向量与给定向量具有相同的方向和方向。必须首先定义向量。也适用于直线和线段，以产生长度为 1 的方向向量。",
    "searchTextEn": "UnitVector 单位向量 UnitVector( <Object> ); <Vector> )",
    "examples": [
      "UnitVector 与矢量",
      "UnitVector 带直线方程",
      "UnitVector 带一段",
      "UnitVector 与符号 2D 向量",
      "UnitVector 带 3D 矢量"
    ],
    "tags": [
      "category:vector-and-matrix",
      "capability:cas-supported"
    ]
  },
  {
    "command": "UpdateConstruction",
    "localizedName": "更新作图",
    "syntax": "UpdateConstruction(); UpdateConstruction( <更新次数> )",
    "syntaxEn": "UpdateConstruction(); UpdateConstruction( <Number of times> )",
    "description": "重新计算所有对象（重新生成随机数）。与 F9 或 Ctrl + R 相同。",
    "searchTextEn": "UpdateConstruction 更新作图 UpdateConstruction(); UpdateConstruction( <Number of times> )",
    "examples": [
      "重新计算所有对象（重新生成随机数）。与 F9 或 Ctrl + R 相同。",
      "多次执行命令 UpdateConstruction()，例如，将几次掷骰子记录到电子表格中。"
    ],
    "tags": [
      "category:scripting",
      "capability:animation",
      "capability:script",
      "capability:construction-control",
      "risk:bulk-mutation"
    ]
  },
  {
    "command": "UpperSum",
    "localizedName": "上和",
    "syntax": "UpperSum( <函数>, <x-起始值>, <x-终止值>, <矩形数量> )",
    "syntaxEn": "UpperSum( <Function>, <Start x-Value>, <End x-Value>, <Number of Rectangles> )",
    "description": "使用 n 个矩形计算区间 [Start x-Value, End x-Value] 上函数的上总和。",
    "searchTextEn": "UpperSum 上和 UpperSum( <Function>, <Start x-Value>, <End <Number of Rectangles> )",
    "examples": [
      "使用 6 个矩形计算 x² 从 -2 到 4 的上限总和"
    ],
    "tags": [
      "category:functions-and-calculus"
    ]
  },
  {
    "command": "Variance",
    "localizedName": "方差",
    "syntax": "Variance( <原始数据列表> ); Variance( <数字列表>, <频数列表> )",
    "syntaxEn": "Variance( <List of Raw Data> ); Variance( <List of Numbers>, <List of Frequencies> )",
    "description": "计算列表元素的方差。",
    "searchTextEn": "Variance 方差 Variance( <List of Raw Data> ); Numbers>, Frequencies> )",
    "examples": [
      "Variance({1, 2, 3}) 的收益率为 0.67。",
      "Variance({1, 2, 3}, {1, 2, 1}) 的收益率为 0.5。",
      "Variance({1, 2, a}) 产生词干：[\\frac{2}{9} a{2} - \\frac{2}{3} a + \\frac{2}{3}]。"
    ],
    "tags": [
      "category:statistics",
      "capability:cas-supported"
    ]
  },
  {
    "command": "Vector",
    "localizedName": "向量",
    "syntax": "Vector( <点> ); Vector( <起始点>, <终止点> )",
    "syntaxEn": "Vector( <Point> ); Vector( <Start Point>, <End Point> )",
    "description": "返回给定点的位置向量或创建从起点到终点的向量。",
    "searchTextEn": "Vector 向量 Vector( <Point> ); <Start Point>, <End Point> )",
    "examples": [
      "来自单个点的向量产生其位置向量",
      "来自两点的向量产生从起点到终点的向量"
    ],
    "tags": [
      "category:vector-and-matrix",
      "capability:create"
    ]
  },
  {
    "command": "Vertex",
    "localizedName": "顶点",
    "syntax": "Vertex( <圆锥曲线> ); Vertex( <不等式> ); Vertex( <多边形> ); Vertex( <多边形>, <索引> ); Vertex( <线段>, <索引> )",
    "syntaxEn": "Vertex( <Conic> ); Vertex( <Inequality> ); Vertex( <Polygon> ); Vertex( <Polygon>, <Index> ); Vertex( <Segment>, <Index> )",
    "description": "返回几何对象的顶点，例如圆锥曲线、不等式、多边形或线段，并根据输入参数而变化。",
    "searchTextEn": "Vertex 顶点 Vertex( <Conic> ); <Inequality> <Polygon> <Polygon>, <Index> <Segment>, )",
    "examples": [
      "返回圆锥曲线的所有顶点。",
      "返回不等式边界的交点。",
      "示例：Vertex((x + y < 3) && (x - y > 1)) 返回点 A = (2, 1)。",
      "示例：{Vertex((x + y < 3) ∧ (x - y > 1) && (y > - 2))} 返回 list1 = {(2, 1), (5, -2), (-1, -2)}。",
      "示例：Vertex((y > x²) ∧ (y < x)) 返回两个点 A = (0, 0) 和 B = (1, 1)。",
      "示例：{Vertex((y > x²) ∧ (y < x))} 返回 list1 = {(0, 0), (1, 1)}。",
      "返回多边形的所有顶点。",
      "返回多边形的第_n_个顶点。",
      "返回段的起点 (Index = 1) 或终点 (Index = 2)。"
    ],
    "tags": [
      "category:3d",
      "category:algebra",
      "category:conic",
      "category:geometry"
    ]
  },
  {
    "command": "VerticalText",
    "localizedName": "竖排文本",
    "syntax": "VerticalText( <文本> ); VerticalText( <文本>, <点> )",
    "syntaxEn": "VerticalText( <Text> ); VerticalText( <Text>, <Point> )",
    "description": "创建 LaTeX 文本，其中包含逆时针旋转 90° 的给定文本。",
    "searchTextEn": "VerticalText 竖排文本 VerticalText( <Text> ); <Text>, <Point> )",
    "examples": [
      "文本需要用双引号 \" 括起来。旋转文本，以便包含文本的框的左上角（也称为角 4）放置在坐标系的原点处。"
    ],
    "tags": [
      "category:text",
      "capability:position",
      "capability:text-position",
      "capability:style"
    ]
  },
  {
    "command": "Volume",
    "localizedName": "体积",
    "syntax": "Volume( <立体图形> )",
    "syntaxEn": "Volume( <Solid> )",
    "description": "计算给定固体的体积。",
    "searchTextEn": "Volume 体积 Volume( <Solid> )",
    "examples": [
      "Volume( <Pyramid> ) 计算给定金字塔的体积。",
      "Volume( <Prism> ) 计算给定棱柱的体积。",
      "Volume( <Cone> ) 计算给定圆锥体的体积。",
      "Volume( <Cylinder> ) 计算给定圆柱体的体积。"
    ],
    "tags": [
      "category:3d",
      "capability:measure"
    ]
  },
  {
    "command": "Voronoi",
    "localizedName": "Voronoi图",
    "syntax": "Voronoi( <点列> )",
    "syntaxEn": "Voronoi( <List of Points> )",
    "description": "绘制给定点列表的 Voronoi 图 (https://en.wikipedia.org/wiki/Voronoi_diagram)。返回的对象是一个轨迹，因此它是辅助的。",
    "searchTextEn": "Voronoi Voronoi图 Voronoi( <List of Points> )",
    "examples": [],
    "tags": [
      "category:discrete-math"
    ]
  },
  {
    "command": "Weibull",
    "localizedName": "威布尔分布",
    "syntax": "Weibull( <形状参数k>, <尺度参数λ>, <变量值> ); Weibull( <形状参数k>, <尺度参数λ>, <变量值>, <是否累积? true|false> ); Weibull( <形状参数k>, <尺度参数λ>, x, <是否累积? true|false> )",
    "syntaxEn": "Weibull( <Shape>, <Scale>, <Variable Value> ); Weibull( <Shape>, <Scale>, <Variable Value>, <Boolean Cumulative> ); Weibull( <Shape>, <Scale>, x, <Boolean Cumulative> )",
    "description": "评估变量值 v 处威布尔分布的累积分布函数，即计算概率 P(X ≤ v)，其中 X 是随机变量，具有由给定参数形状和尺度定义的威布尔分布。",
    "searchTextEn": "Weibull 威布尔分布 Weibull( <Shape>, <Scale>, <Variable Value> ); Value>, <Boolean Cumulative> x, )",
    "examples": [
      "Weibull(0.5, 1, 0) 产生 0。",
      "Weibull(0.5, 1, 1) 产生词干：[1 - \\frac{1} { e } ]。"
    ],
    "tags": [
      "category:probability",
      "capability:cas-supported"
    ]
  },
  {
    "command": "Zip",
    "localizedName": "映射",
    "syntax": "Zip( <代数式>, <变量1>, <列表1>, <变量2>, <列表2>, ... )",
    "syntaxEn": "Zip( <Expression>, <Var1>, <List1>, <Var2>, <List2>, ... )",
    "description": "创建通过将表达式中的变量替换为相应列表的元素而获得的对象列表。如果变量的数量与列表的数量匹配，则每个变量都从以下列表中获取。如果变量的数量超过列表的数量，最后一个变量将从 1, 2, 3,..., k 中取值，其中 k 是最短列表的长度。结果列表的长度是输入列表长度的最小值。",
    "searchTextEn": "Zip 映射 Zip( <Expression>, <Var1>, <List1>, <Var2>, <List2>, ... )",
    "examples": [
      "设 P、Q、R、S 为一些点。 Zip(Midpoint(A, B), A, {P, Q}, B, {R, S}) 返回包含线段 PR 和 QS 中点的列表。",
      "令 list1={x2, x3, x6} 为多项式列表。 Zip(Degree(a), a, list1) 返回列表 {2, 3, 6}。",
      "令 list1={1, 2, 5} 为数字列表。 Zip(Simplify(a*x(b-1)), a, list1,b) 返回列表 {1, 2x, 5x²}。",
      "变量也可以是函数：Zip(f(2), f, {x+1,x+3}) 返回列表 {3, 5}。"
    ],
    "tags": [
      "category:list"
    ]
  },
  {
    "command": "Zipf",
    "localizedName": "齐普夫分布",
    "syntax": "Zipf( <最前元素数量>, <指数> ); Zipf( <最前元素数量>, <指数>, <是否累积? true|false> ); Zipf( <最前元素数量>, <指数>, <变量值>, <是否累积? true|false> )",
    "syntaxEn": "Zipf( <Number of Elements>, <Exponent> ); Zipf( <Number of Elements>, <Exponent>, <Boolean Cumulative> ); Zipf( <Number of Elements>, <Exponent>, <Variable Value>, <Boolean Cumulative> )",
    "description": "返回 Zipf 分布的条形图或计算 Zipf 随机变量的概率，具体取决于提供的参数。",
    "searchTextEn": "Zipf 齐普夫分布 Zipf( <Number of Elements>, <Exponent> ); <Exponent>, <Boolean Cumulative> <Variable Value>, )",
    "examples": [
      "返回包含 10 个元素、指数为 1 的 Zipf 分布的条形图。",
      "返回包含 10 个元素和指数 1 的 Zipf 分布的条形图，累积设置为 false。",
      "计算具有 10 个元素和指数 1 的 Zipf 随机变量的 P(X = 5)，累积设置为 false，在代数视图中生成 0.07，在 CAS 视图中生成分数。"
    ],
    "tags": [
      "category:probability",
      "capability:cas-supported"
    ]
  },
  {
    "command": "ZMean2Estimate",
    "localizedName": "双样本均值z估计",
    "syntax": "ZMean2Estimate( <样本数据1列表>, <样本数据2列表>, <标准差1>, <标准差2>, <置信水平> ); ZMean2Estimate( <样本1平均数>, <标准差1>, <样本1容量>, <样本2平均数>, <标准差2>, <样本2容量>, <置信水平> )",
    "syntaxEn": "ZMean2Estimate( <List of Sample Data 1>, <List of Sample Data 2>, <σ1>, <σ2>, <Confidence Level> ); ZMean2Estimate( <Sample Mean 1>, <σ1>, <Sample Size 1>, <Sample Mean 2>, <σ2>, <Sample Size 2>, <Confidence Level> )",
    "description": "使用给定的样本数据集、总体标准差和置信水平计算两个总体均值之间差异的 Z 置信区间估计值。结果以列表形式返回，形式为{置信下限、置信上限}。",
    "searchTextEn": "ZMean2Estimate 双样本均值z估计 ZMean2Estimate( <List of Sample Data 1>, 2>, <σ1>, <σ2>, <Confidence Level> ); <Sample Mean Size )",
    "examples": [
      "给出两个样本数据list1 = {1, 4, 5, 4, 1, 3, 4, 2}，list2 = {2, 1, 3, 1, 2, 5, 2, 4}。 list1 的标准差为 σ_1 = sqrt(2)，list2 的标准差为 σ_2 = sqrt(1.75)，置信水平为 0.75。",
      "使用给定的样本均值、总体标准差和置信水平计算两个总体均值之间差异的 Z 置信区间估计值。"
    ],
    "tags": [
      "category:statistics"
    ]
  },
  {
    "command": "ZMean2Test",
    "localizedName": "双样本均值z检验",
    "syntax": "ZMean2Test( <样本数据1列表>, <标准差1>, <样本数据2列表>, <标准差2>, <尾部 \"＜\"-总体均值小于假设平均数|\"＞\"-总体均值大于假设平均数|\"≠\"-总体均值不等于假设平均数> ); ZMean2Test( <样本1平均数>, <标准差1>, <样本1容量>, <样本2平均数>, <标准差2>, <样本2容量>, <尾部 \"＜\"-总体均值小于假设平均数|\"＞\"-总体均值大于假设平均数|\"≠\"-总体均值不等于假设平均数> )",
    "syntaxEn": "ZMean2Test( <List of Sample Data 1>, <σ1>, <List of Sample Data 2>, <σ2>, <Tail> ); ZMean2Test( <Sample Mean 1>, <σ1>, <Sample Size 1>, <Sample Mean 2>, <σ2>, <Sample Size 2>, <Tail> )",
    "description": "使用样本数据和总体标准差列表或样本统计数据和总体标准差对两个总体均值之间的差异执行 Z 检验。 Tail 确定备择假设：'<' 表示差异 < 0，'>' 表示差异 > 0，'≠' 表示差异 ≠ 0。结果以 {概率值，Z 检验统计量} 的形式返回。",
    "searchTextEn": "ZMean2Test 双样本均值z检验 ZMean2Test( <List of Sample Data 1>, <σ1>, 2>, <σ2>, <Tail> ); <Sample Mean Size )",
    "examples": [],
    "tags": [
      "category:statistics"
    ]
  },
  {
    "command": "ZMeanEstimate",
    "localizedName": "单均值z估计",
    "syntax": "ZMeanEstimate( <样本数据列表>, <标准差>, <置信水平> ); ZMeanEstimate( <样本平均数>, <标准差>, <样本容量>, <置信水平> )",
    "syntaxEn": "ZMeanEstimate( <List of Sample Data>, <σ>, <Confidence Level> ); ZMeanEstimate( <Sample Mean>, <σ>, <Sample Size>, <Confidence Level> )",
    "description": "使用样本数据或样本统计量以及总体标准差和置信水平计算总体平均值的 Z 置信区间估计值。结果以列表形式返回，形式为{置信下限、置信上限}。",
    "searchTextEn": "ZMeanEstimate 单均值z估计 ZMeanEstimate( <List of Sample Data>, <σ>, <Confidence Level> ); <Sample Mean>, Size>, )",
    "examples": [
      "使用样本数据列表、总体标准差和置信水平计算 Z 置信区间估计值。",
      "使用样本均值、总体标准差、样本大小和置信水平计算 Z 置信区间估计值。"
    ],
    "tags": [
      "category:statistics"
    ]
  },
  {
    "command": "ZMeanTest",
    "localizedName": "单均值z检验",
    "syntax": "ZMeanTest( <样本数据列表>, <标准差>, <假设平均数>, <尾部 \"＜\"-总体均值小于假设平均数|\"＞\"-总体均值大于假设平均数|\"≠\"-总体均值不等于假设平均数> ); ZMeanTest( <样本平均数>, <标准差>, <样本容量>, <假设平均数>, <尾部 \"＜\"-总体均值小于假设平均数|\"＞\"-总体均值大于假设平均数|\"≠\"-总体均值不等于假设平均数> )",
    "syntaxEn": "ZMeanTest( <List of Sample Data>, <σ>, <Hypothesized Mean>, <Tail> ); ZMeanTest( <Sample Mean>, <σ>, <Sample Size>, <Hypothesized Mean>, <Tail> )",
    "description": "使用给定的样本数据列表和总体标准差对总体均值执行单样本 Z 检验。假设平均值是原假设中假设的总体平均值。 Tail 可能的值有“<”、“\">”、“≠”。它们指定备择假设如下：“<”= 总体平均值 < 假设平均值，\">\" = 总体平均值 > 假设平均值，“≠”= 总体平均值 ≠ 假设平均值。结果以列表形式返回为{概率值，Z 检验统计量}。",
    "searchTextEn": "ZMeanTest 单均值z检验 ZMeanTest( <List of Sample Data>, <σ>, <Hypothesized Mean>, <Tail> ); <Sample Size>, )",
    "examples": [],
    "tags": [
      "category:statistics"
    ]
  },
  {
    "command": "ZoomIn",
    "localizedName": "放大",
    "syntax": "ZoomIn(); ZoomIn( <缩放因子> ); ZoomIn( <缩放因子>, <视图中心坐标(x, y)|视图中心点> ); ZoomIn( <x最小值>, <y最小值>, <x最大值>, <y最大值> ); ZoomIn( <x最小值>, <y最小值>, <z最小值>, <x最大值>, <y最大值>, <z最大值> )",
    "syntaxEn": "ZoomIn(); ZoomIn( <Scale Factor> ); ZoomIn( <Scale Factor>, <Center Point> ); ZoomIn( <Min x>, <Min y>, <Max x>, <Max y> ); ZoomIn( <Min x>, <Min y>, <Min z>, <Max x>, <Max y>, <Max z> )",
    "description": "通过各种方法缩放图形视图：恢复为默认值、使用可选中心按因子缩放、缩放到 2D 矩形或缩放到 3D 长方体。",
    "searchTextEn": "ZoomIn 放大 ZoomIn(); ZoomIn( <Scale Factor> ); Factor>, <Center Point> <Min x>, y>, <Max y> z>, z> )",
    "examples": [
      "将图形视图恢复到默认的初始位置",
      "使用屏幕中心作为中心点，将图形视图相对于当前缩放比例放大 2 倍",
      "使用 (0, 0) 作为中心点，将图形视图相对于当前缩放比例放大 2 倍",
      "将图形视图缩放到顶点 (0, 1), (5, 6) 指定的矩形",
      "使视图的缩放取决于滑块",
      "将 3D 图形视图缩放到由顶点 (-5, -5, -5), (5, 5, 5) 指定的长方体"
    ],
    "tags": [
      "category:scripting",
      "capability:view",
      "capability:script"
    ]
  },
  {
    "command": "ZoomOut",
    "localizedName": "缩小",
    "syntax": "ZoomOut( <缩放因子> ); ZoomOut( <缩放因子>, <视图中心坐标(x, y)|视图中心点> )",
    "syntaxEn": "ZoomOut( <Scale Factor> ); ZoomOut( <Scale Factor>, <Center Point> )",
    "description": "根据当前缩放的给定因子缩放图形视图，屏幕中心用作缩放的中心点。根据当前缩放的给定因子缩放图形视图，第二个参数指定缩放的中心点。",
    "searchTextEn": "ZoomOut 缩小 ZoomOut( <Scale Factor> ); Factor>, <Center Point> )",
    "examples": [
      "ZoomOut(2) 缩小视图。",
      "ZoomOut 带比例因子和中心点"
    ],
    "tags": [
      "category:scripting",
      "capability:view",
      "capability:script"
    ]
  },
  {
    "command": "ZProportion2Estimate",
    "localizedName": "双样本比例z估计",
    "syntax": "ZProportion2Estimate( <样本比例1>, <样本1容量>, <样本比例2>, <样本2容量>, <置信水平> )",
    "syntaxEn": "ZProportion2Estimate( <Sample Proportion 1>, <Sample Size 1>, <Sample Proportion 2>, <Sample Size 2>, <Confidence Level> )",
    "description": "使用给定的样本统计数据和置信水平计算两个比例之间差异的 Z 置信区间估计值。结果以列表形式返回，形式为{置信下限、置信上限}。",
    "searchTextEn": "ZProportion2Estimate 双样本比例z估计 ZProportion2Estimate( <Sample Proportion 1>, Size 2>, <Confidence Level> )",
    "examples": [],
    "tags": [
      "category:statistics"
    ]
  },
  {
    "command": "ZProportion2Test",
    "localizedName": "双样本比例z检验",
    "syntax": "ZProportion2Test( <样本比例1>, <样本1容量>, <样本比例2>, <样本2容量>, <尾部 \"＜\"-总体均值小于假设平均数|\"＞\"-总体均值大于假设平均数|\"≠\"-总体均值不等于假设平均数> )",
    "syntaxEn": "ZProportion2Test( <Sample Proportion 1>, <Sample Size 1>, <Sample Proportion 2>, <Sample Size 2>, <Tail> )",
    "description": "使用给定的样本统计数据对两个总体比例之间的差异进行检验。 Tail 可能的值有“<”、“\">”、“≠”。它们指定备择假设如下：“<”= 总体比例差异 < 0，“\">”= 总体比例差异 > 0，“≠”= 总体比例差异 ≠ 0。结果以列表形式返回为 {概率值，Z 检验统计量}。",
    "searchTextEn": "ZProportion2Test 双样本比例z检验 ZProportion2Test( <Sample Proportion 1>, Size 2>, <Tail> )",
    "examples": [],
    "tags": [
      "category:statistics"
    ]
  },
  {
    "command": "ZProportionEstimate",
    "localizedName": "单比例z估计",
    "syntax": "ZProportionEstimate( <样本比例>, <样本容量>, <置信水平> )",
    "syntaxEn": "ZProportionEstimate( <Sample Proportion>, <Sample Size>, <Confidence Level> )",
    "description": "使用给定的样本统计数据和置信水平计算总体比例的 Z 置信区间估计。结果以列表形式返回，形式为{置信下限、置信上限}。",
    "searchTextEn": "ZProportionEstimate 单比例z估计 ZProportionEstimate( <Sample Proportion>, Size>, <Confidence Level> )",
    "examples": [],
    "tags": [
      "category:statistics"
    ]
  },
  {
    "command": "ZProportionTest",
    "localizedName": "单比例z检验",
    "syntax": "ZProportionTest( <样本比例>, <样本容量>, <假设比例>, <尾部 \"＜\"-总体均值小于假设平均数|\"＞\"-总体均值大于假设平均数|\"≠\"-总体均值不等于假设平均数> )",
    "syntaxEn": "ZProportionTest( <Sample Proportion>, <Sample Size>, <Hypothesized Proportion>, <Tail> )",
    "description": "使用给定的样本统计量执行一定比例的单样本 Z 检验。假设比例是零假设中假设的人口比例。 Tail 可能的值有“<”、“\">”、“≠”。这些指定备择假设如下：“<” = 人口比例 < 假设比例，\">” = 人口比例 > 假设比例，“≠” = 人口比例 ≠ 假设比例。结果以列表形式返回为{概率值，Z 检验统计量}。",
    "searchTextEn": "ZProportionTest 单比例z检验 ZProportionTest( <Sample Proportion>, Size>, <Hypothesized <Tail> )",
    "examples": [],
    "tags": [
      "category:statistics"
    ]
  }
] satisfies readonly GeoGebraCommandReferenceEntry[];
