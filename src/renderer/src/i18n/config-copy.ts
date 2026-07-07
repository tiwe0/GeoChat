export const zhCNConfig = {
    eyebrow: "GeoChat",
    title: "工作台设置",
    close: "关闭设置",
    tabs: {
      model: "模型",
      skills: "技能",
      externalMcp: "MCP",
      memory: "记忆",
      runs: "任务",
      about: "关于",
      credits: "致谢",
      debug: "调试"
    },
    modelProvider: "主模型",
    model: "模型",
    customModelId: "模型名称（可手动输入）",
    capabilityOverviewTitle: "当前能力状态",
    capabilityOverviewBody: "根据当前 Agent 模型和视觉理解模型推导，保存后会按这些能力处理题目与附件。",
    solvingAbilityTitle: "解题能力",
    solvingAbilityReady: "可理解题目并调用 GeoGebra 工具。",
    solvingAbilityBlocked: "当前 Agent 模型未声明工具调用能力。",
    visionAbilityTitle: "识图能力",
    visionAbilityReady: "可处理题图和图片输入。",
    visionAbilityBlocked: "需要多模态 Agent 模型，或支持图片输入的视觉理解模型。",
    fileParsingAbilityTitle: "文件解析能力",
    fileParsingAbilityReady: "Agent 模型可直接解析上传文件并参与解题。",
    fileParsingAbilityBlocked: "当前配置不支持文件解析；视觉理解模型只用于题图识别。",
    textModelTitle: "Agent 模型",
    textModelBody: "用于理解题目、规划作图步骤、调用工具和生成解释。先配置这里即可开始使用文字题目。",
    maxToolStepsLabel: "最大工具步数",
    maxToolStepsNote: "留空跟随模型默认值；当前生效 {count} 步。",
    imageUnderstandingTitle: "视觉理解模型",
    imageUnderstandingBody: "当前 Agent 模型不能直接处理图片。上传题图时，会自动使用这里配置的视觉理解模型。",
    advancedEndpointTitle: "高级接口",
    advancedEndpointBody: "手动模型 ID 和自定义接口地址适合 OpenAI 兼容服务、代理或本地网关。",
    skillConfigTitle: "技能配置",
    skillConfigBody: "按初高中数学课程模块组织的技能包。Agent 会按题型加载对应方法，再规划作图、解释和验证。",
    skillConfigEnabled: "已启用",
    skillConfigDisabled: "已关闭",
    skillCurriculumCoverageTitle: "课程技能覆盖",
    skillCurriculumCoverageBody: "默认覆盖数与式、方程不等式、函数、几何、统计概率等常见课程模块。建议保持全部启用，让 Agent 按题型自动选择最合适的技能。",
    skillSystemTitle: "技能系统",
    skillSystemBody: "关闭后，本轮对话不会列出、检索或加载技能，Agent 只使用基础工具链。",
    skillAutoActivateTitle: "自动加载",
    skillAutoActivateBody: "开启后，Agent 会先列出或检索技能，再按题型决定是否加载最匹配的允许技能。",
    skillAutoActivateOn: "自动",
    skillAutoActivateOff: "手动",
    skillVisualProfileTitle: "可视化表达策略",
    skillVisualProfileBody: "第四层只控制呈现方式，例如标签密度、对比方式、动画节奏和 3D 视角，不参与数学判断。",
    skillBuiltinTitle: "内置技能",
    skillBuiltinBody: "已启用 {enabled}/{total} 个内置数学技能。",
    skillEnableAll: "全部启用",
    skillGroupCount: "{enabled}/{total} 已启用",
    skillItemOn: "启用",
    skillItemOff: "关闭",
    skillGroups: {
      algebra: {
        title: "基础代数",
        body: "对应初高中数与式、方程不等式、数列和向量，重点处理条件、变形和符号结构。"
      },
      functions: {
        title: "函数图像",
        body: "覆盖一次/二次/多项式、指数对数、三角函数和导数应用，重点做数形结合。"
      },
      geometry: {
        title: "几何可视化",
        body: "覆盖平面几何、图形变换、立体几何、棱柱、球和解析几何，重点把关系画清楚。"
      },
      dataApplication: {
        title: "应用与数据",
        body: "覆盖线性规划、统计与概率，重点展示可行域、样本空间、数据图表和结果验证。"
      },
      presentation: {
        title: "呈现后处理",
        body: "覆盖构图完成后的摄像机、视角、缩放、居中和画面留白，重点避免遮挡和裁剪。"
      }
    },
    visualProfiles: {
      "exam-clean": {
        title: "考试草图",
        body: "少标签、少装饰，突出必要对象和最终结论。"
      },
      "teaching-demo": {
        title: "教学演示",
        body: "逐步展开辅助线和依据，适合讲解概念来源。"
      },
      "choice-comparison": {
        title: "选择题对比",
        body: "按选项拆场景，高亮成立、失败和边界条件。"
      },
      "dynamic-exploration": {
        title: "动态探索",
        body: "优先使用滑块、轨迹和关键状态观察参数变化。"
      },
      "proof-highlight": {
        title: "证明高亮",
        body: "强调相等、平行、垂直、相似等证明链条。"
      },
      "spatial-3d": {
        title: "3D 空间关系",
        body: "突出投影、截面、二面角和空间视角切换。"
      }
    },
    skillCatalog: {
      "number-expression": {
        title: "数与式",
        body: "处理实数、数轴、代数式、整式分式、根式、因式分解和限制条件。",
        tags: ["实数", "代数式", "因式分解"]
      },
      "factorization-formulas": {
        title: "因式分解",
        body: "处理公因式、平方差、完全平方、十字相乘、分组分解和配方。",
        tags: ["乘法公式", "配方", "结构识别"]
      },
      "equations-inequalities": {
        title: "方程与不等式",
        body: "处理方程、方程组、不等式组、区间解集、增根和含参数讨论。",
        tags: ["方程", "不等式", "参数"]
      },
      "quadratic-equation": {
        title: "一元二次方程",
        body: "处理判别式、求根公式、根与系数关系、参数根和零点图像解释。",
        tags: ["判别式", "根与系数", "零点"]
      },
      "inequality-interval": {
        title: "不等式区间",
        body: "处理符号表、数轴分区、端点取舍、分式不等式和参数临界点。",
        tags: ["区间", "符号表", "临界点"]
      },
      "function-graph": {
        title: "函数与图像",
        body: "处理一次函数、反比例函数、二次函数、图像性质和参数变化。",
        tags: ["一次函数", "反比例", "二次函数"]
      },
      "quadratic-function": {
        title: "二次函数",
        body: "处理顶点、对称轴、开口、零点、闭区间最值和参数图像变化。",
        tags: ["顶点", "对称轴", "最值"]
      },
      "plane-geometry": {
        title: "平面几何",
        body: "处理点线圆、角关系、相似全等、辅助线和选择题逐项验证。",
        tags: ["圆", "三角形", "辅助线"]
      },
      "triangle-circle-geometry": {
        title: "三角形与圆",
        body: "处理圆周角、切线、外接圆、内切圆、相似全等和常见辅助线。",
        tags: ["圆周角", "切线", "相似"]
      },
      "geometric-transformations": {
        title: "图形变换",
        body: "处理平移、旋转、轴对称、中心对称、位似、相似变换和尺规作图。",
        tags: ["旋转", "对称", "位似"]
      },
      "geometric-construction": {
        title: "尺规作图",
        body: "处理垂直平分线、角平分线、作圆、作切线和作图依据说明。",
        tags: ["作图", "垂直平分线", "角平分线"]
      },
      "solid-geometry": {
        title: "立体几何",
        body: "处理空间点线面、截面、投影、体积、距离和角度可视化。",
        tags: ["3D", "截面", "投影"]
      },
      "solid-section": {
        title: "空间截面",
        body: "处理截面平面、多面体交线、截面多边形顺序和空间辅助线。",
        tags: ["截面", "交线", "多面体"]
      },
      prism: {
        title: "棱柱",
        body: "聚焦棱柱、长方体、正方体的顶点、棱、面、截面和展开关系。",
        tags: ["棱柱", "截面", "体积"]
      },
      sphere: {
        title: "球",
        body: "处理球心定位、半径关系、截面圆、内切外接和空间距离。",
        tags: ["球心", "截面圆", "外接球"]
      },
      "pyramid-circumsphere": {
        title: "棱锥与外接球",
        body: "处理三棱锥、四面体、外接球、内切球、球心定位和等距关系。",
        tags: ["棱锥", "外接球", "等距"]
      },
      "polynomial-function": {
        title: "多项式函数",
        body: "处理二次、三次和高次函数图像、零点、极值、单调性与参数变化。",
        tags: ["函数图像", "零点", "参数"]
      },
      "exponential-logarithmic-function": {
        title: "指数与对数",
        body: "处理指数函数、对数函数、幂函数、增长模型、定义域和单调性。",
        tags: ["指数", "对数", "增长"]
      },
      "exponential-log-transform": {
        title: "指数对数变换",
        body: "处理底数限制、真数定义域、渐近线、单调性和图像交点比较。",
        tags: ["定义域", "渐近线", "单调性"]
      },
      "linear-programming": {
        title: "线性规划",
        body: "处理不等式组、可行域、目标函数等值线和最优顶点验证。",
        tags: ["可行域", "等值线", "最值"]
      },
      "linear-programming-feasible-region": {
        title: "可行域与目标函数",
        body: "处理边界直线、半平面、可行域顶点、目标函数平移和最优位置。",
        tags: ["半平面", "顶点", "平移"]
      },
      "trigonometric-function": {
        title: "三角函数",
        body: "处理周期、振幅、相位、单位圆和三角恒等变形的可视化。",
        tags: ["周期", "单位圆", "相位"]
      },
      "trigonometric-unit-circle": {
        title: "单位圆三角",
        body: "处理任意角、象限符号、参考角、三角函数值和诱导公式。",
        tags: ["单位圆", "任意角", "诱导公式"]
      },
      sequence: {
        title: "数列",
        body: "处理等差、等比、递推、通项、前 n 项和和离散函数图像。",
        tags: ["等差", "等比", "递推"]
      },
      vector: {
        title: "向量",
        body: "处理平面/空间向量、线性表示、数量积、投影、共线和垂直。",
        tags: ["数量积", "投影", "坐标"]
      },
      "analytic-geometry-conic": {
        title: "解析几何",
        body: "处理直线与圆、椭圆、双曲线、抛物线、切线、弦长和轨迹。",
        tags: ["圆锥曲线", "切线", "轨迹"]
      },
      "conic-focus-directrix": {
        title: "焦点准线",
        body: "处理圆锥曲线焦点、准线、离心率、切线、弦长和轨迹生成。",
        tags: ["焦点", "准线", "离心率"]
      },
      "derivative-application": {
        title: "导数应用",
        body: "处理切线、单调性、极值最值、零点、恒成立和参数讨论。",
        tags: ["导数", "极值", "切线"]
      },
      "derivative-tangent": {
        title: "导数与切线",
        body: "处理切点、切线方程、过定点切线、公切线、法线和斜率条件。",
        tags: ["切点", "斜率", "法线"]
      },
      "probability-statistics": {
        title: "概率统计",
        body: "处理样本数据、频率分布、随机事件、古典概型、独立性和分布。",
        tags: ["统计", "概率", "分布"]
      },
      "classical-probability": {
        title: "古典概率",
        body: "处理样本空间、排列组合、树状图、条件概率、独立事件和等可能判断。",
        tags: ["样本空间", "排列组合", "条件概率"]
      },
      "statistical-distribution": {
        title: "统计图表",
        body: "处理频率分布、条形图、直方图、箱线图、平均数、中位数和方差。",
        tags: ["频率分布", "方差", "图表"]
      },
      "visual-post-processing": {
        title: "视觉后处理",
        body: "处理主体构造完成后的视图、标签、辅助对象和画面可读性收尾。",
        tags: ["后处理", "标签", "辅助对象"]
      },
      "camera-framing": {
        title: "3D 摄像机",
        body: "处理 3D 图形的视角、遮挡、裁剪和取景，让关键点线面同时可见。",
        tags: ["摄像机", "视角", "3D"]
      },
      "viewport-scale-composition": {
        title: "视野缩放",
        body: "处理整体缩放、居中、留白和坐标轴等比例，避免图形过大或过小。",
        tags: ["缩放", "居中", "留白"]
      }
    },
    externalMcpTitle: "MCP",
    externalMcpBody: "用于让 Agent 调用你配置的 MCP Server，扩展检索、计算或业务系统工具。该配置正在开发中。",
    externalMcpStatus: "开发中",
    externalMcpStatusTitle: "开发中",
    externalMcpStatusBody: "将支持 MCP Server 列表、工具白名单和凭据策略。",
    memoryConfigTitle: "记忆配置",
    memoryConfigBody: "用于管理 Agent 的工作记忆、上下文保留策略和跨对话引用能力。该配置正在开发中。",
    memoryConfigStatus: "开发中",
    memoryConfigStatusTitle: "开发中",
    memoryConfigStatusBody: "将支持记忆范围、保留时长、自动摘要和手动清理策略。",
    visionModelTitle: "视觉辅助模型",
    visionModelBody: "当主模型不支持图片输入时，图片任务会自动使用这里配置的视觉辅助模型。",
    visionModelProvider: "视觉辅助模型提供方",
    visionModel: "视觉辅助模型",
    visionCustomModelId: "视觉辅助模型名称（可手动输入）",
    customModelPrefix: "自定义：{model}",
    toolCallingUnverified: "需要试运行验证",
    supportsImages: "支持图片输入",
    textOnly: "仅支持文本输入",
    customModelDescription: "这个模型不在内置列表中。GeoChat 会先按兼容模式尝试作图，图片上传会暂时关闭。",
    imageModelDescription: "该模型可启用题目图片上传。",
    textModelDescription: "普通文本模型不会显示上传能力，请切换到多模态模型后再上传图片。",
    visionCustomModelDescription: "这个视觉辅助模型不在内置列表中。GeoChat 会尝试兼容调用，但图片能力需要实际验证。",
    visionImageModelDescription: "图片任务会使用该视觉辅助模型进行题图理解，再继续生成 GeoGebra 构造。",
    visionTextModelDescription: "请选择支持图片输入的视觉辅助模型，否则主模型为文本模型时仍无法上传图片。",
    apiKeyLabel: "模型密钥",
    visionApiKeyLabel: "视觉辅助模型密钥",
    localKeyNote: "密钥仅保存在当前设备",
    apiKeyPlaceholder: "只保存在当前设备",
    customBaseUrl: "接口地址（可选）",
    visionCustomBaseUrl: "视觉模型接口地址（可选）",
    visionUsesPrimaryKey: "与主模型相同，使用上方密钥",
    visionUsesPrimaryEndpoint: "与主模型相同，使用上方接口地址",
    improvementPlanTitle: "加入改进计划",
    improvementPlanBody: "开启后会上传脱敏后的对话文本、工具调用概况和错误摘要，用于改进 agent 编排和画板稳定性。不会上传模型密钥、本地配置或图片原始数据。",
    improvementPlanOn: "已加入",
    improvementPlanOff: "未加入",
    languageTitle: "界面语言",
    languageBody: "切换工作台显示语言，设置会保存到本机。",
    zhLanguage: "中文界面",
    zhLanguageHint: "中文提示与桌面界面",
    enLanguage: "English UI",
    enLanguageHint: "English prompts and desktop UI",
    mcpTitle: "本机调试 MCP",
    mcpBody: "启动一个只监听 127.0.0.1 的 HTTP MCP，用于只读查看本机 SQLite、会话黑板、Agent 运行和错误记录。",
    mcpOn: "已开启",
    mcpOff: "已关闭",
    mcpEndpointLabel: "HTTP 端点",
    mcpRunning: "正在运行：{endpoint}",
    mcpStopped: "MCP 服务未运行。",
    mcpUnavailable: "本机调试 MCP 仅在开发/测试构建中可用。",
    mcpProcessHint: "进程 PID {pid}，端口 {port}。关闭开关会停止该进程。",
    debugRuntimeTitle: "运行诊断",
    debugRuntimeBody: "调整模型单步预算，并根据最近任务记录查看 provider / model 的实际响应耗时。",
    modelStepTimeoutLabel: "模型单步超时（秒）",
    modelStepTimeoutHint: "当前 {seconds} 秒，可填 {range} 秒。慢模型可设为 180 或 240。",
    modelLatencyTitle: "模型延迟健康",
    modelLatencyTimeoutBudget: "单步预算 {seconds} 秒",
    modelLatencyLoading: "正在读取最近模型过程...",
    modelLatencyEmpty: "暂无可统计的模型过程。跑一次题目后，这里会显示 p50 / p95 和超时次数。",
    modelLatencyP50: "p50 {value}",
    modelLatencyP95: "p95 {value}",
    modelLatencySamples: "{count} 次",
    modelLatencyTimeouts: "超时 {count} 次",
    updateTitle: "应用更新",
    updateBody: "打包版会检查整包更新，下载完成后可重启安装。",
    updateCheck: "检查更新",
    updateChecking: "检查中",
    updateRecommendationTitle: "推荐更新路径",
    updateRecommendationBody: "一次检查整包壳更新和工作台逻辑更新，并按兼容性给出下一步。",
    updateRecommendationCheck: "检查全部更新",
    updateDownload: "下载更新",
    updateInstall: "重启安装",
    updateOn: "已开启",
    updateOff: "已关闭",
    updateAutoCheckTitle: "启动后自动检查",
    updateAutoCheckBody: "打开应用后在后台连接更新源，只更新状态，不会打断当前工作。",
    updateAutoDownloadTitle: "发现更新后自动下载",
    updateAutoDownloadBody: "检测到新版本后自动下载整包；关闭后需要手动点击下载更新。",
    updateInstallOnQuitTitle: "退出时静默安装",
    updateInstallOnQuitBody: "更新包下载完成后，下次退出应用时自动安装；关闭后需要手动重启安装。",
    updateCurrentVersion: "当前版本",
    updateAvailability: "更新状态",
    updateNextVersion: "可用版本",
    updateReleaseDate: "发布日期",
    updateCheckedAt: "最近检查",
    updateUnavailable: "自动更新仅在打包后的桌面应用中可用。",
    updateDownloadProgress: "正在下载更新：{percent}%。",
    updateStatuses: {
      idle: "未检查",
      checking: "检查中",
      available: "发现更新",
      not_available: "已是最新",
      downloading: "下载中",
      downloaded: "已下载",
      error: "更新失败",
      disabled: "不可用"
    },
    updateStatusBodies: {
      idle: "还没有检查过更新。",
      checking: "正在连接更新服务。",
      available: "发现新版本，GeoChat 会在后台下载。",
      availableManual: "发现新版本。你已关闭自动下载，可以手动下载更新包。",
      not_available: "当前已经是最新版本。",
      downloading: "正在下载更新包。",
      downloaded: "更新包已下载，重启后会安装。",
      downloadedSilent: "更新包已下载。你已开启静默更新，退出应用时会自动安装。",
      error: "更新检查失败。",
      disabled: "当前环境不支持自动更新。"
    },
    updateErrorMessages: {
      network_unavailable: "无法连接更新服务，请检查网络或稍后重试。",
      metadata_missing: "更新源缺少版本元数据或安装包，请稍后再检查。",
      signature_error: "更新包签名校验失败。为安全起见，请从官网重新下载安装。",
      permission_denied: "当前系统权限不足，无法写入更新文件。请关闭应用后重新打开再试。",
      server_error: "更新服务暂时不可用，请稍后重试。",
      shell_update_required: "这个工作台逻辑包需要更新桌面应用壳后才能安装。请先安装新版应用。",
      unknown: "更新失败。请稍后重试，或从官网下载最新安装包。"
    },
    updateRecommendationStatuses: {
      none: "无需更新",
      app_bundle: "更新逻辑",
      shell: "更新应用",
      both_shell_first: "先更新应用",
      shell_required_for_app_bundle: "需要新版应用",
      error: "检查失败"
    },
    updateRecommendations: {
      none: "当前没有可安装更新。若工作台逻辑更新源未配置，只会显示整包更新状态。",
      appBundle: "建议只安装工作台逻辑更新；它不会替换 Tauri 壳或 Bun runtime，安装后重启启用。",
      shell: "建议安装完整应用更新；这会替换桌面壳和随包 runtime。",
      bothShellFirst: "整包壳和工作台逻辑都有更新，建议先安装完整应用更新，再检查逻辑包。",
      shellRequiredForAppBundle: "工作台逻辑包需要新版桌面应用壳，当前版本不能直接安装。",
      error: "更新检查失败。"
    },
    appBundleUpdateTitle: "工作台逻辑更新",
    appBundleUpdateBody: "更新前端、后端编排、harness 和画板资源，不替换 Tauri 壳或 Bun runtime。",
    appBundleUpdateInstall: "安装并重启",
    appBundleUpdateRollback: "恢复上一版",
    appBundleUpdateCurrentVersion: "当前逻辑版本",
    appBundleUpdateNextVersion: "可用逻辑版本",
    appBundleUpdateCheckedAt: "最近检查",
    appBundleUpdateInstalledAt: "最近安装",
    appBundleUpdateUnavailable: "未配置工作台逻辑更新源。",
    appBundleUpdateStatuses: {
      idle: "未检查",
      checking: "检查中",
      available: "发现更新",
      not_available: "已是最新",
      blocked: "需要新版应用",
      downloading: "安装中",
      installed: "已安装",
      error: "更新失败",
      disabled: "不可用"
    },
    appBundleUpdateStatusBodies: {
      idle: "还没有检查过工作台逻辑更新。",
      checking: "正在读取工作台逻辑更新清单。",
      available: "发现新的工作台逻辑版本。安装后需要重启应用才会启用。",
      not_available: "当前工作台逻辑已经是最新版本。",
      blocked: "这个工作台逻辑包需要新版桌面应用壳，当前版本不能直接安装。",
      downloading: "正在下载并校验工作台逻辑包。",
      installed: "工作台逻辑包已安装，正在重启应用以启用新版。",
      error: "工作台逻辑更新失败。",
      disabled: "当前环境未启用工作台逻辑更新。"
    },
    cancel: "取消",
    save: "保存设置"
  };

export const enUSConfig: typeof zhCNConfig = {
    eyebrow: "GeoChat",
    title: "Workspace settings",
    close: "Close settings",
    tabs: {
      model: "Model",
      skills: "Skills",
      externalMcp: "MCP",
      memory: "Memory",
      runs: "Tasks",
      about: "About",
      credits: "Credits",
      debug: "Debug"
    },
    modelProvider: "Primary model",
    model: "Model",
    customModelId: "Model name (editable)",
    capabilityOverviewTitle: "Current capabilities",
    capabilityOverviewBody: "Derived from the current Agent model and vision understanding model. Saved runs use these capabilities for problems and attachments.",
    solvingAbilityTitle: "Problem solving",
    solvingAbilityReady: "Can understand problems and call GeoGebra tools.",
    solvingAbilityBlocked: "The current Agent model does not declare tool-calling capability.",
    visionAbilityTitle: "Image understanding",
    visionAbilityReady: "Can process problem images and image input.",
    visionAbilityBlocked: "Needs a multimodal Agent model, or an image-capable vision understanding model.",
    fileParsingAbilityTitle: "File parsing",
    fileParsingAbilityReady: "The Agent model can parse uploaded files directly during solving.",
    fileParsingAbilityBlocked: "File parsing is not available; the vision model is only used for problem-image recognition.",
    textModelTitle: "Agent model",
    textModelBody: "Used to understand problems, plan drawing steps, call tools, and write explanations. Configure this first for text problems.",
    maxToolStepsLabel: "Max tool steps",
    maxToolStepsNote: "Leave blank to use the model default. Current effective limit: {count}.",
    imageUnderstandingTitle: "Vision understanding model",
    imageUnderstandingBody: "The current Agent model cannot process images directly. Image uploads will use this vision understanding model.",
    advancedEndpointTitle: "Advanced endpoint",
    advancedEndpointBody: "Manual model IDs and custom base URLs are for OpenAI-compatible services, proxies, or local gateways.",
    skillConfigTitle: "Skill configuration",
    skillConfigBody: "Skill packs organized by middle and high school math curriculum modules. The Agent loads the matching method before drawing, explaining, and verifying.",
    skillConfigEnabled: "Enabled",
    skillConfigDisabled: "Off",
    skillCurriculumCoverageTitle: "Curriculum coverage",
    skillCurriculumCoverageBody: "Covers common modules such as numbers and expressions, equations and inequalities, functions, geometry, statistics, and probability. Keep all skills enabled so the Agent can choose by problem type.",
    skillSystemTitle: "Skill system",
    skillSystemBody: "When off, the run will not list, search, or load skills, and the Agent uses only the base toolchain.",
    skillAutoActivateTitle: "Auto loading",
    skillAutoActivateBody: "When on, the Agent lists or searches skills first, then decides whether to load the closest allowed skill by problem type.",
    skillAutoActivateOn: "Auto",
    skillAutoActivateOff: "Manual",
    skillVisualProfileTitle: "Visual profile",
    skillVisualProfileBody: "The fourth layer only controls presentation, such as label density, comparison layout, animation rhythm, and 3D viewpoint. It does not decide mathematical facts.",
    skillBuiltinTitle: "Built-in skills",
    skillBuiltinBody: "{enabled}/{total} built-in math skills enabled.",
    skillEnableAll: "Enable all",
    skillGroupCount: "{enabled}/{total} enabled",
    skillItemOn: "On",
    skillItemOff: "Off",
    skillGroups: {
      algebra: {
        title: "Core algebra",
        body: "Covers expressions, equations, inequalities, sequences, and vectors, focusing on constraints, transformations, and symbolic structure."
      },
      functions: {
        title: "Function graphs",
        body: "Covers linear, quadratic, polynomial, exponential, logarithmic, trigonometric, and derivative topics through graph-based reasoning."
      },
      geometry: {
        title: "Geometry visualization",
        body: "Covers plane geometry, transformations, solid geometry, prisms, spheres, and analytic geometry, focusing on visible relationships."
      },
      dataApplication: {
        title: "Applications and data",
        body: "Covers linear programming, statistics, and probability, focusing on feasible regions, sample spaces, charts, and verification."
      },
      presentation: {
        title: "Presentation pass",
        body: "Covers post-construction camera, viewpoint, zoom, centering, and padding so diagrams avoid occlusion and cropping."
      }
    },
    visualProfiles: {
      "exam-clean": {
        title: "Exam sketch",
        body: "Low label density and minimal decoration, focused on required objects and the final conclusion."
      },
      "teaching-demo": {
        title: "Teaching demo",
        body: "Reveals auxiliary objects and reasons step by step for concept explanation."
      },
      "choice-comparison": {
        title: "Choice comparison",
        body: "Splits scenarios by option and highlights truth, failure, and boundary conditions."
      },
      "dynamic-exploration": {
        title: "Dynamic exploration",
        body: "Prefers sliders, loci, and key states to inspect parameter changes."
      },
      "proof-highlight": {
        title: "Proof highlight",
        body: "Emphasizes equalities, parallelism, perpendicularity, similarity, and proof chains."
      },
      "spatial-3d": {
        title: "3D spatial",
        body: "Highlights projections, sections, dihedral angles, and viewpoint changes."
      }
    },
    skillCatalog: {
      "number-expression": {
        title: "Numbers and expressions",
        body: "Handles real numbers, number lines, expressions, polynomials, fractions, radicals, factoring, and constraints.",
        tags: ["Real numbers", "Expressions", "Factoring"]
      },
      "factorization-formulas": {
        title: "Factoring formulas",
        body: "Handles common factors, difference of squares, perfect squares, grouping, cross factoring, and completing the square.",
        tags: ["Formulas", "Completing square", "Structure"]
      },
      "equations-inequalities": {
        title: "Equations and inequalities",
        body: "Handles equations, systems, inequalities, interval solutions, extraneous roots, and parameter cases.",
        tags: ["Equations", "Inequalities", "Parameters"]
      },
      "quadratic-equation": {
        title: "Quadratic equations",
        body: "Handles discriminants, formulas, root relations, parameter roots, and zero-intercept graph explanations.",
        tags: ["Discriminant", "Roots", "Zeros"]
      },
      "inequality-interval": {
        title: "Inequality intervals",
        body: "Handles sign charts, number-line intervals, endpoint inclusion, rational inequalities, and parameter breakpoints.",
        tags: ["Intervals", "Sign chart", "Breakpoints"]
      },
      "function-graph": {
        title: "Functions and graphs",
        body: "Handles linear, inverse proportional, quadratic functions, graph properties, and parameter changes.",
        tags: ["Linear", "Inverse", "Quadratic"]
      },
      "quadratic-function": {
        title: "Quadratic functions",
        body: "Handles vertices, axes of symmetry, opening direction, zeros, interval extrema, and parameter graph changes.",
        tags: ["Vertex", "Axis", "Extrema"]
      },
      "plane-geometry": {
        title: "Plane geometry",
        body: "Handles points, lines, circles, angle relations, similarity, congruence, auxiliary lines, and option-by-option checks.",
        tags: ["Circles", "Triangles", "Auxiliary"]
      },
      "triangle-circle-geometry": {
        title: "Triangles and circles",
        body: "Handles inscribed angles, tangents, circumcircles, incircles, similarity, congruence, and common auxiliary lines.",
        tags: ["Inscribed angle", "Tangent", "Similarity"]
      },
      "geometric-transformations": {
        title: "Transformations",
        body: "Handles translation, rotation, reflection, central symmetry, dilation, similarity, and ruler-compass constructions.",
        tags: ["Rotation", "Symmetry", "Dilation"]
      },
      "geometric-construction": {
        title: "Geometric construction",
        body: "Handles perpendicular bisectors, angle bisectors, circles, tangents, and construction-step justification.",
        tags: ["Construction", "Bisector", "Tangent"]
      },
      "solid-geometry": {
        title: "Solid geometry",
        body: "Handles spatial points, lines, planes, sections, projections, volume, distances, and angle visualization.",
        tags: ["3D", "Sections", "Projection"]
      },
      "solid-section": {
        title: "Solid sections",
        body: "Handles section planes, polyhedron intersections, section polygon order, and spatial auxiliary lines.",
        tags: ["Section", "Intersection", "Polyhedron"]
      },
      prism: {
        title: "Prism",
        body: "Focuses on prisms, cuboids, cubes, vertices, edges, faces, sections, and net relationships.",
        tags: ["Prism", "Section", "Volume"]
      },
      sphere: {
        title: "Sphere",
        body: "Handles sphere centers, radius relations, section circles, inscribed/circumscribed shapes, and spatial distances.",
        tags: ["Center", "Section", "Circumsphere"]
      },
      "pyramid-circumsphere": {
        title: "Pyramids and circumspheres",
        body: "Handles triangular pyramids, tetrahedra, circumspheres, inspheres, sphere centers, and equal-distance relations.",
        tags: ["Pyramid", "Circumsphere", "Equidistant"]
      },
      "polynomial-function": {
        title: "Polynomial functions",
        body: "Handles quadratic, cubic, and higher-order graphs, roots, extrema, monotonicity, and parameter changes.",
        tags: ["Graphs", "Roots", "Parameters"]
      },
      "exponential-logarithmic-function": {
        title: "Exponential and logarithmic",
        body: "Handles exponential, logarithmic, power functions, growth models, domains, and monotonicity.",
        tags: ["Exponential", "Logarithmic", "Growth"]
      },
      "exponential-log-transform": {
        title: "Exp-log transformations",
        body: "Handles base restrictions, logarithm domains, asymptotes, monotonicity, and graph-intersection comparisons.",
        tags: ["Domain", "Asymptote", "Monotonicity"]
      },
      "linear-programming": {
        title: "Linear programming",
        body: "Handles inequalities, feasible regions, objective level lines, and optimal vertex checks.",
        tags: ["Feasible region", "Level lines", "Optimum"]
      },
      "linear-programming-feasible-region": {
        title: "Feasible regions",
        body: "Handles boundary lines, half-planes, feasible vertices, objective-line translation, and optimum location.",
        tags: ["Half-plane", "Vertices", "Translation"]
      },
      "trigonometric-function": {
        title: "Trigonometric functions",
        body: "Handles period, amplitude, phase, unit-circle reasoning, and trigonometric identity visualization.",
        tags: ["Period", "Unit circle", "Phase"]
      },
      "trigonometric-unit-circle": {
        title: "Unit-circle trigonometry",
        body: "Handles arbitrary angles, quadrant signs, reference angles, trigonometric values, and reduction formulas.",
        tags: ["Unit circle", "Angles", "Formulas"]
      },
      sequence: {
        title: "Sequences",
        body: "Handles arithmetic, geometric, recursive sequences, general terms, partial sums, and discrete graphs.",
        tags: ["Arithmetic", "Geometric", "Recursive"]
      },
      vector: {
        title: "Vectors",
        body: "Handles plane and spatial vectors, linear representation, dot products, projections, collinearity, and perpendicularity.",
        tags: ["Dot product", "Projection", "Coordinates"]
      },
      "analytic-geometry-conic": {
        title: "Analytic geometry",
        body: "Handles lines, circles, ellipses, hyperbolas, parabolas, tangents, chord lengths, and loci.",
        tags: ["Conics", "Tangents", "Loci"]
      },
      "conic-focus-directrix": {
        title: "Focus and directrix",
        body: "Handles conic foci, directrices, eccentricity, tangents, chord lengths, and locus generation.",
        tags: ["Focus", "Directrix", "Eccentricity"]
      },
      "derivative-application": {
        title: "Derivatives",
        body: "Handles tangents, monotonicity, extrema, zeros, always-true inequalities, and parameter cases.",
        tags: ["Derivative", "Extrema", "Tangent"]
      },
      "derivative-tangent": {
        title: "Derivative tangents",
        body: "Handles tangent points, tangent equations, tangents through fixed points, common tangents, normals, and slopes.",
        tags: ["Tangent point", "Slope", "Normal"]
      },
      "probability-statistics": {
        title: "Probability and statistics",
        body: "Handles sample data, frequency distributions, random events, classical probability, independence, and distributions.",
        tags: ["Statistics", "Probability", "Distribution"]
      },
      "classical-probability": {
        title: "Classical probability",
        body: "Handles sample spaces, combinatorics, tree diagrams, conditional probability, independent events, and equally likely checks.",
        tags: ["Sample space", "Combinatorics", "Conditional"]
      },
      "statistical-distribution": {
        title: "Statistical charts",
        body: "Handles frequency distributions, bar charts, histograms, box plots, means, medians, and variance.",
        tags: ["Frequency", "Variance", "Charts"]
      },
      "visual-post-processing": {
        title: "Visual post-processing",
        body: "Handles view, labels, auxiliary objects, and readability cleanup after the main construction is complete.",
        tags: ["Post pass", "Labels", "Auxiliary"]
      },
      "camera-framing": {
        title: "3D camera",
        body: "Handles 3D viewpoint, occlusion, cropping, and framing so key points, lines, and faces stay visible.",
        tags: ["Camera", "Viewpoint", "3D"]
      },
      "viewport-scale-composition": {
        title: "Viewport scale",
        body: "Handles uniform zoom, centering, padding, and axis ratio so diagrams are neither too large nor too small.",
        tags: ["Zoom", "Centering", "Padding"]
      }
    },
    externalMcpTitle: "MCP",
    externalMcpBody: "Allows the Agent to call configured MCP Servers for retrieval, computation, or business-system tools. This configuration is in development.",
    externalMcpStatus: "In development",
    externalMcpStatusTitle: "In development",
    externalMcpStatusBody: "Will support MCP Server lists, tool allowlists, and credential policy.",
    memoryConfigTitle: "Memory configuration",
    memoryConfigBody: "Manages Agent working memory, context retention policy, and cross-conversation references. This configuration is in development.",
    memoryConfigStatus: "In development",
    memoryConfigStatusTitle: "In development",
    memoryConfigStatusBody: "Will support memory scope, retention period, automatic summaries, and manual cleanup policy.",
    visionModelTitle: "Vision assist model",
    visionModelBody: "When the primary model cannot accept images, image tasks automatically use this vision assist model.",
    visionModelProvider: "Vision assist provider",
    visionModel: "Vision assist model",
    visionCustomModelId: "Vision assist model name (editable)",
    customModelPrefix: "Custom: {model}",
    toolCallingUnverified: "Needs a test run",
    supportsImages: "Image input supported",
    textOnly: "Text input only",
    customModelDescription: "This model is not in the built-in list. GeoChat will try compatible drawing first, and image upload stays off until verified.",
    imageModelDescription: "This model can accept uploaded problem images.",
    textModelDescription: "Text-only models hide image upload. Switch to a multimodal model before uploading images.",
    visionCustomModelDescription: "This vision assist model is not in the built-in list. GeoChat will try compatible calls, but image capability needs a real test.",
    visionImageModelDescription: "Image tasks use this vision assist model to understand the problem image before continuing with GeoGebra construction.",
    visionTextModelDescription: "Choose an image-capable vision assist model, otherwise text-only primary models still cannot receive images.",
    apiKeyLabel: "Model key",
    visionApiKeyLabel: "Vision assist model key",
    localKeyNote: "Key is stored only on this device",
    apiKeyPlaceholder: "Stored only on this device",
    customBaseUrl: "Endpoint (optional)",
    visionCustomBaseUrl: "Vision endpoint (optional)",
    visionUsesPrimaryKey: "Same as primary model, using the key above",
    visionUsesPrimaryEndpoint: "Same as primary model, using the endpoint above",
    improvementPlanTitle: "Join improvement program",
    improvementPlanBody: "When enabled, GeoChat uploads redacted chat text, tool-call summaries, and error summaries to improve agent orchestration and canvas stability. Model keys, local configuration, and raw image data are never uploaded.",
    improvementPlanOn: "Joined",
    improvementPlanOff: "Not joined",
    languageTitle: "Interface language",
    languageBody: "Switch the workspace display language. The setting is saved locally.",
    zhLanguage: "Chinese UI",
    zhLanguageHint: "Chinese prompts and desktop UI",
    enLanguage: "English UI",
    enLanguageHint: "English prompts and desktop UI",
    mcpTitle: "Local debug MCP",
    mcpBody: "Start a 127.0.0.1-only HTTP MCP for read-only inspection of local SQLite, blackboard entries, Agent runs, and error records.",
    mcpOn: "On",
    mcpOff: "Off",
    mcpEndpointLabel: "HTTP endpoint",
    mcpRunning: "Running: {endpoint}",
    mcpStopped: "MCP service is not running.",
    mcpUnavailable: "The local debug MCP is only available in development or test builds.",
    mcpProcessHint: "Process PID {pid}, port {port}. Turning the switch off stops this process.",
    debugRuntimeTitle: "Runtime diagnostics",
    debugRuntimeBody: "Tune the per-step model budget and inspect recent provider / model latency from task records.",
    modelStepTimeoutLabel: "Model step timeout (seconds)",
    modelStepTimeoutHint: "Current {seconds}s. Allowed range: {range}s. Slow models can use 180 or 240.",
    modelLatencyTitle: "Model latency health",
    modelLatencyTimeoutBudget: "{seconds}s step budget",
    modelLatencyLoading: "Reading recent model steps...",
    modelLatencyEmpty: "No model-step samples yet. Run one problem to show p50 / p95 and timeout counts here.",
    modelLatencyP50: "p50 {value}",
    modelLatencyP95: "p95 {value}",
    modelLatencySamples: "{count} samples",
    modelLatencyTimeouts: "{count} timeouts",
    updateTitle: "App updates",
    updateBody: "Packaged builds check full-app updates and can install them after download.",
    updateCheck: "Check updates",
    updateChecking: "Checking",
    updateRecommendationTitle: "Recommended update path",
    updateRecommendationBody: "Checks the full app shell and workspace logic tracks together, then recommends the compatible next action.",
    updateRecommendationCheck: "Check all updates",
    updateDownload: "Download update",
    updateInstall: "Restart to install",
    updateOn: "On",
    updateOff: "Off",
    updateAutoCheckTitle: "Check on startup",
    updateAutoCheckBody: "Connect to the update source in the background after launch. This updates status without interrupting work.",
    updateAutoDownloadTitle: "Auto-download updates",
    updateAutoDownloadBody: "Download the full update package after a new version is found. Turn this off to download manually.",
    updateInstallOnQuitTitle: "Silent install on quit",
    updateInstallOnQuitBody: "After the package is downloaded, install it automatically the next time the app quits. Turn this off to restart manually.",
    updateCurrentVersion: "Current version",
    updateAvailability: "Update state",
    updateNextVersion: "Available version",
    updateReleaseDate: "Release date",
    updateCheckedAt: "Last checked",
    updateUnavailable: "Automatic updates are only available in packaged desktop builds.",
    updateDownloadProgress: "Downloading update: {percent}%.",
    updateStatuses: {
      idle: "Not checked",
      checking: "Checking",
      available: "Update found",
      not_available: "Up to date",
      downloading: "Downloading",
      downloaded: "Downloaded",
      error: "Update failed",
      disabled: "Unavailable"
    },
    updateStatusBodies: {
      idle: "No update check has run yet.",
      checking: "Connecting to the update service.",
      available: "A new version is available. GeoChat will download it in the background.",
      availableManual: "A new version is available. Auto-download is off, so download the package manually.",
      not_available: "This is the latest version.",
      downloading: "Downloading the update package.",
      downloaded: "The update package is ready. Restart to install it.",
      downloadedSilent: "The update package is ready. Silent update is on, so it will install when the app quits.",
      error: "Update check failed.",
      disabled: "Automatic updates are not supported in this environment."
    },
    updateErrorMessages: {
      network_unavailable: "Cannot reach the update service. Check your network or try again later.",
      metadata_missing: "The update source is missing version metadata or installer files. Check again later.",
      signature_error: "The update package failed signature verification. For safety, download the latest installer from the website.",
      permission_denied: "The system blocked writing update files. Quit and reopen the app, then try again.",
      server_error: "The update service is temporarily unavailable. Try again later.",
      shell_update_required: "This workspace logic bundle requires a newer desktop app shell before it can be installed. Install the full app update first.",
      unknown: "Update failed. Try again later, or download the latest installer from the website."
    },
    updateRecommendationStatuses: {
      none: "No update",
      app_bundle: "Update logic",
      shell: "Update app",
      both_shell_first: "App first",
      shell_required_for_app_bundle: "New app required",
      error: "Check failed"
    },
    updateRecommendations: {
      none: "No installable update is available. If the workspace logic source is not configured, only the full-app track is shown.",
      appBundle: "Install the workspace logic update only. It does not replace the Tauri shell or Bun runtime, and takes effect after restart.",
      shell: "Install the full app update. This replaces the desktop shell and packaged runtime.",
      bothShellFirst: "Both tracks have updates. Install the full app update first, then check the workspace logic bundle again.",
      shellRequiredForAppBundle: "The workspace logic bundle requires a newer desktop app shell and cannot be installed on this version.",
      error: "Update check failed."
    },
    appBundleUpdateTitle: "Workspace logic updates",
    appBundleUpdateBody: "Updates the frontend, backend orchestration, harness, and canvas resources without replacing the Tauri shell or Bun runtime.",
    appBundleUpdateInstall: "Install and restart",
    appBundleUpdateRollback: "Restore previous",
    appBundleUpdateCurrentVersion: "Current logic version",
    appBundleUpdateNextVersion: "Available logic version",
    appBundleUpdateCheckedAt: "Last checked",
    appBundleUpdateInstalledAt: "Last installed",
    appBundleUpdateUnavailable: "No workspace logic update source is configured.",
    appBundleUpdateStatuses: {
      idle: "Not checked",
      checking: "Checking",
      available: "Update found",
      not_available: "Up to date",
      blocked: "New app required",
      downloading: "Installing",
      installed: "Installed",
      error: "Update failed",
      disabled: "Unavailable"
    },
    appBundleUpdateStatusBodies: {
      idle: "No workspace logic update check has run yet.",
      checking: "Reading the workspace logic update manifest.",
      available: "A new workspace logic version is available. It will be used after install and restart.",
      not_available: "The workspace logic is already up to date.",
      blocked: "This workspace logic bundle requires a newer desktop app shell and cannot be installed on this version.",
      downloading: "Downloading and verifying the workspace logic bundle.",
      installed: "The workspace logic bundle is installed. The app is restarting to use it.",
      error: "Workspace logic update failed.",
      disabled: "Workspace logic updates are not enabled in this environment."
    },
    cancel: "Cancel",
    save: "Save settings"
  };
