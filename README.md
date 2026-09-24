<p align="center">
  <img src="build/icon.png" width="96" alt="GeoChat Desktop logo">
</p>

<h1 align="center">GeoChat Desktop</h1>

<p align="center">
  让 AI 对话真正融入 GeoGebra 画板。随处唤起、就地作图、空间化讲解。
</p>

<p align="center">
  <a href="README.en.md">English</a>
  ·
  <a href="https://chat-with-geogebra.com">官方网站</a>
  ·
  <a href="https://github.com/tiwe0/GeoChat/releases/latest">下载 GeoChat</a>
  ·
  <a href="#产品亮点">产品亮点</a>
</p>

<p align="center">
  <a href="LICENSE"><img alt="License" src="https://img.shields.io/github/license/tiwe0/GeoChat"></a>
  <a href="https://github.com/tiwe0/GeoChat/stargazers"><img alt="GitHub stars" src="https://img.shields.io/github/stars/tiwe0/GeoChat?style=social"></a>
  <img alt="macOS" src="https://img.shields.io/badge/macOS-supported-black">
  <img alt="Windows" src="https://img.shields.io/badge/Windows-supported-0078D4">
</p>

`v0.6.0` · 默认启用全新的融合模式

## 认识 GeoChat

GeoChat 是一款面向数学学习、教学与探索的 AI GeoGebra 助手。

你只需要描述题目、图形或作图意图，GeoChat 就会理解当前画板，完成构造、验证结果，
并把关键关系和解题过程展示在图形附近。对话不再与画板分离，而是成为画板的一部分。

## 产品预览

### 融合模式

<img src="docs/media/geochat-fusion-mode.png" alt="GeoChat v0.6.0 融合模式：对话、工具过程和输入框直接分布在 GeoGebra 画板上">

输入框可以在画板任意位置唤起。每轮回答会围绕对应的作图位置展开，较早的消息逐渐
淡出，既保留上下文，也尽量不遮挡正在观察的图形。

### 窗口模式

<img src="docs/media/geochat-desktop-zh.png" alt="GeoChat Desktop 窗口模式中文界面">

偏好传统聊天体验时，可以随时切换回窗口模式。当前对话、画板状态和正在使用的功能
都会继续保留。

### 视频演示

<video src="https://raw.githubusercontent.com/tiwe0/GeoChat/master/docs/media/geochat-desktop-demo-1080p.mp4" controls width="100%"></video>

[无法播放时打开演示视频](docs/media/geochat-desktop-demo-1080p.mp4)

## 产品亮点

### 对着画板直接提问

GeoChat 能读取当前画板和选中的对象。你可以直接说“让这条线经过 A 点”、
“解释这个交点为什么存在”或“把当前图形整理得更清楚”，无需反复描述整个场景。

### 用自然语言完成 2D 与 3D 作图

从基础函数、平面几何到空间几何，都可以通过自然语言发起构造。GeoChat 会组织作图
步骤、调用 GeoGebra、检查结果，再给出说明。

### 对话与图形保持空间关联

在融合模式中，输入框可以拖动，也可以在指定位置重新唤起。回答会固定在本轮问题附近，
可收起、固定、关闭或从原位置继续追问。

### 看得见的思考与工具过程

模型的思考状态、工具调用和结果验证会以紧凑的过程卡片显示。你可以看到 GeoChat 正在
读取画板、执行构造还是检查结果，而不必面对大段原始日志。

### 面向讲解的答案卡片

解题步骤、教学提示、动画操作说明、选项分析和关键对象会使用适合阅读的卡片展示，
数学公式支持 LaTeX 排版。

### 内置题库

在不离开画板的情况下浏览题库、查看题目与解析，并按需下载题库内容。题目可以作为
新的对话起点，继续作图、分析和讲解。

### 数学技能自动匹配

GeoChat 会根据题目自动选择相关的数学与 GeoGebra 技能，也允许你在设置中决定启用
哪些技能以及偏好的可视化风格。

### 多模型与自定义服务

支持 DeepSeek、OpenAI、Anthropic Claude、Google Gemini、OpenRouter、通义千问，
也可以添加兼容 OpenAI、Anthropic 或 Google 协议的自定义服务和模型。

### 中英文界面

应用支持中文和英文，可在使用过程中快速切换。

## 融合模式怎么用

1. 按 `⌘K`（macOS）或 `Ctrl+K`（Windows）在最近使用的位置唤起输入框。
2. 直接输入题目、作图要求或针对当前图形的问题。
3. 拖动输入框，或使用顶栏定位按钮，把下一轮对话放到合适位置。
4. 在回答卡片上收起、固定、关闭，或者从原位置继续追问。

顶栏可以随时打开完整对话、历史记录、黑板、题库和设置。你也可以一键切换到窗口模式。

## 适合这些场景

| 场景 | GeoChat 可以做什么 |
| --- | --- |
| 数学学习 | 把抽象题目变成可观察、可操作的图形，并逐步解释。 |
| 课堂教学 | 快速生成构造、动画与讲解步骤，帮助展示关键关系。 |
| 几何探索 | 修改条件、移动对象、比较多种构造并观察结果变化。 |
| 题目分析 | 从题库或自定义题目出发，结合图形完成推导与验证。 |
| GeoGebra 使用 | 用自然语言调用常用和高阶功能，减少查找命令的成本。 |

## 下载与开始使用

1. 前往 [GeoChat 下载页面](https://chat-with-geogebra.com) 或
   [GitHub Releases](https://github.com/tiwe0/GeoChat/releases/latest)。
2. 下载适用于 macOS 或 Windows 的版本并完成安装。
3. 在设置中填写你所使用的模型服务 API Key。
4. 回到画板，输入题目或作图需求即可开始。

GeoChat 采用自带密钥模式，模型费用由所选择的模型服务商按照其规则收取。

## 本地优先

GeoChat 的核心桌面功能不要求登录在线账户。模型密钥、对话记录、题库缓存和个人设置
由当前设备管理。只有在请求模型服务或主动获取在线内容时，相关数据才会发送到对应服务。

## 开源与致谢

GeoChat 自有源代码和文档使用
[Apache License 2.0](LICENSE)。项目内包含的第三方组件遵循各自的许可证，详情见
[THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)。

感谢 GeoGebra 提供强大的数学可视化能力，也感谢所有贡献者、测试者和支持者。

## 参与改进

欢迎通过 [GitHub Issues](https://github.com/tiwe0/GeoChat/issues) 提交问题和建议。
请不要在 issue、日志或截图中公开 API Key 等敏感信息。

## Star History

如果 GeoChat 对你有帮助，欢迎给项目一个 Star。

[![Star History Chart](https://api.star-history.com/chart?repos=tiwe0/GeoChat&type=date&legend=top-left&sealed_token=oLgvpSYDuR0sPwlHMJv5pUNWFalPacI6ExWrttKg2zYQ9hin9c-CxY9b18RI0rfy97R4_bA4Z56afgMTJ9_-k_p_MoBqB6A3-mU4YUchikyRgRfD7JJO4mX6tqwCINW-sm4HPupk3C0Ku5H0vRNrOhbombQb7PDykT-gzkXxFPKRf6zBljrBAfOEEL3V)](https://www.star-history.com/?type=date&repos=tiwe0%2FGeoChat)
