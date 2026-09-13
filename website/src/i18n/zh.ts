import type { Content } from "./types";

export const zh: Content = {
  htmlLang: "zh-Hans",
  isCJK: true,

  nav: {
    skipToContent: "跳到主要内容",
    features: "能做什么",
    how: "怎么运作",
    download: "下载",
    source: "源码",
    switchTo: "EN",
    switchToLabel: "Switch to English"
  },

  hero: {
    given: "已知",
    construct: "作图",
    conclude: "结论",
    lede: "GeoChat 是一款把 AI 和 GeoGebra 放在一起的桌面数学工具。输入一道题，它会规划构造步骤，把 GeoGebra 命令写入画板，并说明每一步的依据。",
    ctaDownload: "下载桌面版",
    ctaDownloadFor: "下载 {platform} 版",
    ctaDemo: "看它跑一遍",
    metaLicense: "Apache-2.0 开源",
    metaLocal: "数据留在本机",
    metaPlatforms: "macOS 与 Windows",
    figureAlt:
      "尺规作图动画：黑色三点 A、B、C 落位，蓝色中垂线扫出并交于外心 O，红色外接圆闭合。"
  },

  legend: {
    title: "图例",
    ink: "已知条件与陈述",
    construct: "作图过程与中间量",
    result: "结论与求解结果"
  },

  selling: {
    title: "GeoChat 能做什么",
    lede: "下面是桌面版目前已经支持的功能。",
    items: [
      {
        id: "local",
        role: "ink",
        title: "数据留在本机",
        body: "对话、画板状态和运行记录保存在本机的 SQLite 文件中。不需要账号，也不做云端同步。",
        literal: "./data/geochat-desktop.sqlite"
      },
      {
        id: "byok",
        role: "ink",
        title: "用你自己的模型密钥",
        body: "在设置中填写模型供应商的 API key。请求从你的电脑直接发往供应商，不经过 GeoChat。",
        literal: "OpenAI · Anthropic · Google · DeepSeek · 阿里云百炼 · OpenRouter"
      },
      {
        id: "real-construction",
        role: "construct",
        title: "把命令写入 GeoGebra",
        body: "GeoChat 会向内置的 GeoGebra 画板写入真实命令。生成的图形可以拖动、度量和继续编辑。",
        literal: "O = Intersect(m_1, m_2)"
      },
      {
        id: "canvas",
        role: "construct",
        title: "平面与立体在同一块画板",
        body: "内置 GeoGebra 运行环境，平面几何、解析几何、函数图像和立体几何都可以在同一个工作区中完成。"
      },
      {
        id: "reasoning",
        role: "result",
        title: "查看每一步",
        body: "构造计划、工具调用和思考过程会按顺序显示在对话中，你可以逐条检查。"
      },
      {
        id: "export",
        role: "result",
        title: "题库与导出",
        body: "可以导入本地题库批量过题，画板随时导出为 .ggb 文件，交给学生或同事在他们自己的 GeoGebra 里继续用。",
        literal: "*.ggb"
      }
    ]
  },

  pipeline: {
    title: "一道题如何在画板中完成",
    lede: "读题、规划、写入命令、讲解，四个阶段都由桌面端负责，只有模型推理需要联网。",
    problem: "已知 △ABC，求作它的外接圆。",
    scrollHint: "继续滚动",
    steps: [
      {
        label: "读题",
        caption: "识别题目中的已知条件、限制和目标。"
      },
      {
        label: "规划",
        caption: "确定构造顺序，以及每一步需要使用的几何对象。"
      },
      {
        label: "编译",
        caption: "把构造方案转换为 GeoGebra 命令，并逐条写入画板。",
        code: [
          "A = (-3, -1)",
          "B = (3, -1)",
          "C = (1, 3)",
          "m_1 = PerpendicularBisector(A, B)",
          "m_2 = PerpendicularBisector(B, C)",
          "O = Intersect(m_1, m_2)",
          "k = Circle(O, A)",
          'SetCaption(O, "外心")'
        ]
      },
      {
        label: "讲解",
        caption: "说明这些对象为什么能得到题目要求的结论。"
      }
    ]
  },

  demo: {
    title: "完整演示",
    lede: "从输入题目到画板完成，按实际速度播放。",
    play: "播放演示",
    posterAlt: "GeoChat 桌面版演示视频封面",
    fallback: "你的浏览器无法播放这段视频。"
  },

  shots: {
    title: "桌面版界面",
    lede: "画板是主视图，对话面板可以收起和移动。模型配置和其他选项都在本机的设置页面中。",
    alt: "GeoChat 桌面版界面：左侧 GeoGebra 画板，右侧浮动 AI 对话面板。"
  },

  closing: {
    title: "装上，给它一道题",
    lede: "开源、免费、不需要注册。你需要准备的只有一个模型供应商的 API key。",
    cta: "下载桌面版",
    secondary: "在 GitHub 上查看源码"
  },

  faq: {
    title: "常见问题",
    items: [
      {
        q: "必须联网吗？",
        a: "画板、数据库和其他本地功能都不需要联网。只有模型推理需要联网，请求会从你的电脑直接发往已配置的供应商。"
      },
      {
        q: "要花钱吗？",
        a: "应用本身开源免费，采用 Apache-2.0 许可证。你只需要为自己的模型调用向供应商付费，费用和额度都在他们那边，我们看不到也收不到。"
      },
      {
        q: "我的题目会被上传给你们吗？",
        a: "不会。我们没有接收数据的服务器。题目会作为提示词发送给你自己配置的模型供应商，那部分数据受该供应商的隐私政策管辖。"
      },
      {
        q: "支持哪些模型供应商？",
        a: "内置 OpenAI、Anthropic、Google、DeepSeek、阿里云百炼和 OpenRouter 的配置，也可以在设置里手动添加兼容的自定义供应商和模型。"
      },
      {
        q: "有 Linux 版吗？",
        a: "目前的打包流水线只产出 macOS 和 Windows 安装包。Linux 可以从源码构建，仓库里有完整的构建说明。"
      },
      {
        q: "为什么打开时提示「无法验证开发者」？",
        a: "安装包没有做代码签名。这需要每年向 Apple 和证书机构付费，对一个独立开源项目来说暂时不划算。下载页有两个平台的具体处理步骤。"
      }
    ]
  },

  download: {
    title: "下载 GeoChat 桌面版",
    lede: "免费、开源，不需要注册账号。安装后在设置里填入你自己的模型 API key 即可开始。",
    version: "最新版本",
    versionUnknown: "最新版本",
    released: "发布于 {date}",
    detected: "看起来你在用 {platform}",
    otherPlatforms: "其他平台",
    platforms: {
      macos: {
        name: "macOS",
        requirement: "macOS 11 Big Sur 或更高版本 · Apple 芯片与 Intel 均可"
      },
      windows: {
        name: "Windows",
        requirement: "Windows 10 或更高版本 · 需要 WebView2 运行时"
      },
      linux: {
        name: "Linux",
        requirement: "需要 WebKitGTK 等 Tauri 依赖",
        unavailable: "暂无预编译安装包，请从源码构建。"
      }
    },
    downloadLabel: "下载",
    sizeLabel: "约 {size}",
    checksums: "校验和 (SHA-256)",
    checksumsNote: "安装包没有代码签名，校验和是你唯一能做的完整性检查。macOS 用 shasum -a 256 <文件>，Windows 用 certutil -hashfile <文件> SHA256。",
    loading: "正在获取最新版本…",
    error: "获取版本信息失败，可能是 GitHub 接口限流了。",
    errorAction: "前往 GitHub Releases 页面",
    unsigned: {
      title: "首次打开需要多一步",
      lede: "安装包未做代码签名，系统会拦一下。这不代表安装包有问题——你可以在 GitHub Actions 的构建记录里核对它确实由本仓库源码打出。",
      macos: [
        "把 GeoChat 拖进「应用程序」文件夹。",
        "在「应用程序」里右键点击 GeoChat，选择「打开」——注意是右键菜单里的「打开」，直接双击不行。",
        "在弹出的对话框里再次点击「打开」。之后就可以正常双击启动了。"
      ],
      windows: [
        "双击安装包后，若出现「Windows 已保护你的电脑」蓝色弹窗，点击「更多信息」。",
        "点击出现的「仍要运行」按钮。",
        "按安装向导完成安装。"
      ],
      why: "为什么不签名？"
    },
    source: {
      title: "从源码构建",
      body: "需要 Bun 1.3.11、Rust stable 工具链，以及你所在平台的 Tauri 构建依赖。Linux 用户目前需要走这条路。",
      cta: "查看构建说明"
    }
  },

  footer: {
    tagline: "本地优先的 AI 数学可视化工作台。",
    product: "产品",
    legal: "条款",
    privacy: "隐私政策",
    terms: "使用条款",
    source: "GitHub 源码",
    license: "Apache-2.0",
    author: "作者 Ivory",
    copyright: "© 2026 Ivory",
    noTracking: "本站不使用 Cookie，不加载任何追踪脚本。"
  },

  privacy: {
    title: "隐私政策",
    updated: "最后更新：2026 年 9 月 10 日",
    lede: "简短版：这个网站不收集你的任何信息；桌面应用把你的数据留在你自己的电脑上。下面是具体细节。",
    sections: [
      {
        heading: "这个网站",
        paragraphs: [
          "本站是一组静态页面。它不使用 Cookie，不使用 localStorage 记录你的身份，不加载 Google Analytics、百度统计或任何其他第三方追踪脚本，也不内嵌社交平台的追踪像素。",
          "我们没有为本站运行任何后端服务，因此不存在一个接收、存储或分析你个人信息的数据库。",
          "本站托管在 Cloudflare Pages 上。和任何网站托管服务一样，Cloudflare 会出于安全防护和服务运行的目的处理常规的访问请求信息（例如 IP 地址和请求时间）。这部分处理受 Cloudflare 自己的隐私政策管辖，我们不接触也不导出这些数据。",
          "下载页会向 GitHub 的公开 API 请求最新的发布版本信息。这个请求由你的浏览器直接发往 GitHub，受 GitHub 的隐私政策管辖。"
        ]
      },
      {
        heading: "桌面应用：数据存在哪里",
        paragraphs: [
          "GeoChat 桌面版是本地优先的。你的对话记录、画板状态和运行历史保存在你电脑上的一个 SQLite 数据库文件里，默认位于应用的本地数据目录。这些数据不会被上传到我们这里——事实上我们没有可供上传的服务器。",
          "你配置的模型供应商 API key 保存在本机的桌面配置中，只用于从你的机器直接向该供应商发起请求。",
          "应用没有账号系统，不需要注册或登录，也不做跨设备同步。"
        ]
      },
      {
        heading: "桌面应用：什么情况下会联网",
        paragraphs: [
          "模型请求。当你向 AI 提问时，你的题目、对话上下文以及必要的画板状态会作为提示词，由你的机器直接发送给你自己配置的模型供应商（例如 OpenAI、Anthropic、Google、DeepSeek、阿里云百炼或 OpenRouter）。这部分数据的处理受该供应商的隐私政策和你与他们之间的协议管辖。请在填入 API key 前了解对应供应商的条款。",
          "更新检查。应用可能会请求 GitHub 以获取新版本信息。",
          "开发者自行配置的可选端点。如果你作为开发者通过环境变量配置了自己的题库、模型注册表或调试端点，应用会访问你指定的地址。本仓库默认不配置任何此类端点。",
          "除上述情况外，应用不会主动向外部发送数据。"
        ]
      },
      {
        heading: "我们不做的事",
        paragraphs: [
          "我们不收集使用统计或遥测数据。我们不做用户画像。我们不投放广告。我们不向任何第三方出售或共享你的信息——因为我们本来就没有你的信息。",
          "如果将来加入任何形式的数据上报，它必须是默认关闭、需要你主动开启，并且清楚说明上报内容的。这是产品设计原则的一部分，不只是这份政策的承诺。"
        ]
      },
      {
        heading: "儿童隐私",
        paragraphs: [
          "本产品面向学习和讲授数学的一般用户，我们不收集任何用户的个人信息，因此也不会有意收集儿童的个人信息。"
        ]
      },
      {
        heading: "政策变更与联系方式",
        paragraphs: [
          "如果这份政策发生实质性变化，我们会更新本页顶部的日期。由于我们没有你的联系方式，无法逐一通知，建议在版本更新时留意本页。",
          "有任何隐私相关的问题，可以邮件联系 contact@ivory.cafe，或在 GitHub 仓库提交 issue。"
        ]
      }
    ]
  },

  terms: {
    title: "使用条款",
    updated: "最后更新：2026 年 9 月 10 日",
    lede: "GeoChat 是一个开源项目。下载或使用它，即表示你同意以下条款。",
    sections: [
      {
        heading: "许可与开源",
        paragraphs: [
          "GeoChat 自有的源代码和文档采用 Apache License 2.0 授权。完整条款见仓库中的 LICENSE 和 NOTICE 文件，你的权利和义务以那两个文件为准。",
          "在遵守 Apache-2.0 的前提下，你可以自由地使用、修改和分发本软件，包括用于商业用途。"
        ]
      },
      {
        heading: "第三方组件",
        paragraphs: [
          "本软件包含由第三方提供、按各自许可证授权的组件。其中特别需要注意的是 GeoGebra runtime：它没有、也不可能被重新授权为 GeoChat 自有的 Apache-2.0 代码，它仍然受 GeoGebra 自己的许可证条款约束。",
          "如果你打算重新分发包含 GeoGebra runtime 的构建产物，请先阅读仓库中的 THIRD_PARTY_NOTICES.md 以及 GeoGebra 官方的许可条款，并自行确认你的使用方式是被允许的。这一点我们无法代你判断。"
        ]
      },
      {
        heading: "模型服务由你自己承担",
        paragraphs: [
          "GeoChat 不提供 AI 模型服务，也不转售任何模型额度。你需要自行向模型供应商注册账号、获取 API key 并承担相应费用。",
          "你与模型供应商之间的关系由你和他们之间的协议管辖。你有责任遵守该供应商的使用条款，并对通过你的 API key 发出的所有请求负责。",
          "请妥善保管你的 API key。它保存在你自己的设备上，我们无法读取，也无法在泄露时为你撤销或补偿。"
        ]
      },
      {
        heading: "关于 AI 输出的准确性",
        paragraphs: [
          "这一点值得单独说明：AI 生成的构造步骤、图形和解释可能是错的。数学问题尤其容易出现看起来严谨、实际上不成立的推理。",
          "请不要在未经核对的情况下，把本软件的输出直接用于教学、考试、作业批改、工程计算或任何其他重要用途。软件展示构造过程和工具调用记录，正是为了让你能够核对它——请使用这个能力。",
          "对于因依赖 AI 输出而产生的任何后果，我们不承担责任。"
        ]
      },
      {
        heading: "无担保",
        paragraphs: [
          "本软件按「现状」提供，不附带任何形式的明示或默示担保，包括但不限于适销性、特定用途适用性和非侵权的担保。",
          "在适用法律允许的最大范围内，作者和版权持有人不对任何索赔、损害或其他责任负责，无论是合同之诉、侵权之诉还是其他方式，也无论是否因本软件或本软件的使用或其他交易而产生。完整免责条款见 Apache-2.0 许可证第 7、8 条。"
        ]
      },
      {
        heading: "安装包与代码签名",
        paragraphs: [
          "本站提供的安装包由 GitHub Actions 从公开仓库的源码自动构建，构建记录公开可查。这些安装包目前没有做代码签名，因此 macOS 和 Windows 在首次打开时会显示安全提示。",
          "请只从本站的下载页或本项目的 GitHub Releases 页面获取安装包。我们无法对通过其他渠道分发的构建产物负责。"
        ]
      },
      {
        heading: "条款变更与联系方式",
        paragraphs: [
          "这些条款可能会更新，更新时会修改本页顶部的日期。继续使用本软件即表示接受更新后的条款。",
          "有任何问题，可以邮件联系 contact@ivory.cafe，或在 GitHub 仓库提交 issue。"
        ]
      }
    ]
  },

  notFound: {
    title: "这条路径没有交点",
    body: "你要找的页面不存在，或者已经移动到了别处。",
    cta: "回到首页"
  }
};
