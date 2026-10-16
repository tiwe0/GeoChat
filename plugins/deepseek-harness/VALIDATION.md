# 验证记录

日期：2026-10-16。插件源码：`dsh-geochat-plugin@0.1.5`。本页分别记录本轮验证和保留的基础验证；旧 HTTP/MCP、桌面截图预览和旧安装包哈希不构成当前证明。

## 0.1.5 场景读回、布局与多帧验收

- 新增 `geochat_sceneReport`、`geochat_checkLayout`、`geochat_captureFrames`、`geochat_setTextStyle`，共 20 个公开工具。入口及全部 55 个数学技能增加使用时机、测量覆盖范围与未覆盖不可当作通过的指引；生成产物由构建脚本统一输出。
- 对照官方 Apps API、Corner 文档及打包 vendor 的实际导出核对实现：视口和样式通过公共 getter 读取；命名文字通过真实 Corner 框测量；字号使用实际存在的 Applet `setFont`，不虚构 `SetTextSize` 命令。依赖 XML 仅解析可确认的命名输入，不宣称完整图。
- 插件 `npm run check` 通过：Biome、Host/Client TypeScript、构建、65/65 项测试（含发布前新增的嵌套 Biome 配置回归）。真实 ToolRuntime 与附件存储测试验证多帧投射为多个原生图片块、保留采样时间，历史不含 base64 文本；该测试模拟 Applet 回复，不是模型视觉理解证明。
- 共享代码相关 7 个测试文件共 55/55 项通过，覆盖场景读取、字体批次校验和回滚、文字框碰撞与越界、列表上限、隐藏列表/Graphics2 过滤、清理失败、帧采样及既有事务/动画/重置行为。仓库完整 TypeScript 与差异检查通过。
- 独立真实 Applet 浏览器验收通过（`scripts/smoke-readback.mjs`）：使用插件构建出的同一 runtime 与离线资源，不连接用户的 Harness；检测到 3 个命名文字框中的重叠和越界，2 个列表文字框，缩小字号后实际文字框缩小；检查对象清单无临时探针残留。业务动画仍在运行，3 张定时 PNG 画面互异；页面无脚本错误、无外部网络请求。
- 可通过环境提供的 Playwright 执行：`PLAYWRIGHT_MODULE=/absolute/path/to/playwright/index.mjs CHROME_PATH='/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' node scripts/smoke-readback.mjs`。脚本打印临时证据目录，包含 JSON、完整画布截图和 3 帧 PNG；不新增 Playwright 生产依赖。
- 局限：真实浏览器验收不经过本轮完整 Harness Remote 载体或模型决策循环；未自动重启或安装到用户正在运行的 Harness。普通对象名称标签、屏幕固定文字、3D 遮挡、整段动画碰撞均未覆盖。列表文字通过 Element 别名测量，仍需真实截图复核。空碰撞不等于全场景合格；不把内置事务 XML 恢复当成完整资源快照功能。
- 本节是源码与构建验证，不复用 `.artifacts/RELEASE_MANIFEST.json` 中旧 0.1.4 包的哈希作为 0.1.5 证明。

## 0.1.4 全部工具能力声明

- 统一 16 个公开工具的“返回 / 使用 / 边界”描述，补齐所有输入参数的用途和实际默认行为；不改变工具名称、执行逻辑或默认值。
- 对照共享 controller、动画 runtime、原生 broker/opener 及图片渲染核实契约。明确请求回显不等于回读、存在/可见标志不等于视口验收、命令失败摘要可能先于外层恢复，以及写操作清理插件动画等边界；不承诺固定本地截图路径、标签越界摘要或自动提醒字段。
- 新增真实 ToolRuntime 注册回归，覆盖全部描述三段式、所有参数说明、关键默认值及跨工具引用确实存在。先确认新增测试在旧描述上失败，再更新实现；独立只读复核未发现错误能力承诺。
- 完整 `npm run check` 通过：Biome 检查 36 个文件、Host/Client TypeScript、构建、63/63 项测试。`git diff --check` 通过。
- 本轮通过 prepack 门禁重新生成独立版本安装包，避免同版本缓存复用；最终归档哈希、资源清单核对和本地安装状态以包外 `.artifacts/RELEASE_MANIFEST.json` 为准。不把构建、安装或 ToolRuntime 测试等同于真实模型作图/工具选择验收；本轮不自动重启用户正在使用的 Harness。

## 0.1.3 截图工具语义与视觉验收指引

- 对模型只暴露 `geochat_capture_canvas`，不保留旧名称别名；内部仍使用已有 Applet `getPNGBase64` 执行接口，原生图片附件保存、规范化与渲染逻辑不变。
- 描述明确返回可直接查看的图片附件、构造和批量样式调整后的使用时机，以及颜色、标签重叠、遮挡、网格和布局检查；截图不替代定义、坐标、数值及动画状态验证，单帧不证明动画连续性。
- 入口技能及全部 55 个数学技能加入相同的视觉验收指引；模型实际无法读取附件时必须说明限制，不能未经尝试就认定无法截图，也不能未读图便声称完成视觉验收。
- 完整插件检查通过：Biome、Host/Client TypeScript、构建和 62/62 项测试。先验证新名称与技能指引测试在改动前失败，再完成实现。注册测试验证旧名称不再暴露；PNG/WebP 测试通过新名称调用，核对其仍派发原有内部命令，并验证原生图片附件可保存、读取和渲染。
- 本轮没有重新执行真实模型看图或 Applet 浏览器验收；上述图片测试使用真实 Harness ToolRuntime 与附件服务、模拟的 Applet 图片回复，不把它等同于模型视觉理解证明。

## 0.1.2 元信息验证（同日上一轮）

- 完整插件检查通过：Host/Client TypeScript、构建和 61/61 项测试；新增测试锁定官方 manifest 声明、语言文件导出、图标类型/大小和既有产品图标一致性。语言文件也纳入 Biome 检查。
- 使用已安装的官方 Harness `0.2.0-rc.2` `dsh-app-boot.readPluginMeta` 读取插件资源，得到英文 `GeoChat Canvas`、中文 `GeoChat 画布`、双语简介和 PNG data URL；没有元信息诊断错误。该读取不执行插件代码，也不依赖外网图片。
- 仅补充官方支持的顶层 `icon`、`engines.dsh`、`dsh.manifestVersion`、导出的 `locale/*.json` 以及标准 npm 项目信息，没有添加自定义 `dsh.metadata` 或把目录投稿分类混入运行 manifest。
- 本轮不新增画布交互；真实模型、Electron 窗口展示和社区市场收录仍不在本轮证明范围内。未向 Awesome DSH Plugin 提交条目，未发布 npm。

## 0.1.1 画布交互验证（同日上一轮）

- 完整 `npm pack` 的 prepack 门禁通过：Biome 检查 33 个文件、Host/Client TypeScript、构建和 59/59 项测试均通过。新增回归覆盖主动打开、精确 draft 错误重试、切换/取消/超时、重复打开、同 session 多窗口歧义和隐藏旧画布 owner 不匹配。
- 通过 Harness `0.2.0-rc.2` 官方 CLI 在独立临时 profile 运行真实 Web carrier。先确认页面没有任何画布 iframe，再通过真实 ToolRuntime 调用 `geochat_open_canvas`；返回实际 Applet `ready=true` 后作图。重复打开仍只有一个 iframe，滑块值保持 `2`，没有重置构造。
- 真实鼠标拖动 Applet 原生滑块后，`geochat_getValue(t)` 从 `2` 变为 `6.9`，`geochat_getValueString(P)` 返回关联点 `(6.9, 1)`。画布与 iframe 不再禁止 pointer events，但没有添加聊天、额外工具栏或配置界面。
- 真实 Harness 的新标签页引导入口显示 GeoChat 已有产品图标；图片加载完成且 naturalWidth 非零，并保留官方按钮结构和尺寸。使用 Impeccable 的现有表面规范约束此次视觉改动，4 个 Client 文件 detector 结果为 `[]`。
- 本轮页面 `errors=[]`、`external=[]`，Host `stderr` 为空；官方 `/api/remote.mux` 捕获到 `geochatCanvas/connectUi` 和 `geochatCanvas/connect`。UI 控制流先于 Applet 存在，不引入自建 HTTP/MCP 或自建 socket 工具通道。
- 安装测试前逐一核对 Host/Client 构建哈希与实际临时 profile 安装代码相同，避免同版本同路径压缩包的包管理缓存造成测试旧代码。
- `clientId` 是同一页面两条 Remote 流的关联标识，不是独立安全凭据；会话权限仍由官方 Agent lookup 约束。多窗口误归属当前有回归测试和只读审查证据，本轮未做真实双窗口 UI 验收。

本地临时验收证据（不随包分发）：`native-open-browser.json`、`native-open-result.json`、`native-open-drag.json`；截图：`native-open-after-drag.png`、`native-open-narrow.png`、`native-open-product-icon.png`。

## 0.1.0 基础验证（2026-10-15，非本轮重复执行）

- 插件目录完整 `npm run prepack` 再次通过：Biome 检查 28 个文件、Host/Client TypeScript、构建和 46/46 项测试均通过。回归覆盖 iframe reload generation、取消与 settled ACK、资源哈希完整性、注册顺序与 namespace 授权，以及 draft Agent 创建前的初始订阅退避与错误分类。
- 根项目共享 GeoGebra mount lifecycle 的 8 项测试、26 次断言通过；主项目三个 `tsconfig` 的 TypeScript 检查和 `git diff --check` 通过。
- 完整 `npm audit` 包含开发依赖，报告 0 个已知漏洞。
- Impeccable detector 检查 3 个 Client 变更文件，结果为 `[]`。
- 在独立临时环境运行真实 DeepSeek Harness `0.2.0-rc.2`，插件成功加载实际离线 GeoGebra Applet。加载期间外部网络请求为 0，证明当前首次 Applet 加载不依赖 GeoChat 桌面或外部 CDN。
- 在干净的官方 Harness baseline 中，Cordis namespace DI 异常已消失；真实官方 `/api/remote.mux` 捕获到 `geochatCanvas/connect` 的 open 帧。
- 真实 ToolRuntime → Remote → Applet → 结果回传已打通：fixture 在当前 session 创建 2 个点和 1 个圆，返回的 `context.element_count=3`；`getValueString` 返回 `HarnessProbeA = (1, 2)`。`getPNGBase64` 经 Harness 官方附件服务返回 `image/png` 附件，尺寸 645 × 960、大小 43,715 bytes，并带 SHA-256 摘要。对应页面 `errors=[]`、`consoleErrors=[]`、`external=[]`，Host `stderr` 为空；官方 Remote WebSocket 记录 sent 19、received 18。
- 多 session 真实 E2E 证明会话隔离和 `keepMounted`：会话 A 的 `HarnessProbeA` 为 `(1, 2)`，会话 B 的同名点为 `(2, 2)`；B 执行后再次调用 A 仍返回 `(1, 2)`，切回 A 时原有圆和点仍保留。页面同时保有 2 个 session iframe，当前会话显示、另一会话隐藏。980 × 760 窄屏下 iframe 为 523 × 722，并正常显示。该轮 `errors=[]`、`external=[]`、Host `stderr` 为空；官方 `/api/remote.mux` WebSocket 记录 sent 38、received 36。iframe 是 DOM、样式和全局变量隔离边界，不是安全沙箱。
- 独立 designer finish review 结论为 SHIP：真实 Applet 在宽面板和 523 × 722 窄面板中没有裁剪或畸变，没有额外聊天、toolbar 或写入控件；双 session 画布没有串写。
- GeoGebra 静态资源只通过 Harness Web carrier 的 `/geochat-assets` 固定前缀提供；该路径不承载插件工具调用。工具逻辑使用官方原生 Remote，未自建 HTTP/MCP 工具通道；官方 carrier 的内部传输不在此项证明范围内。
- 构建产物中的 269 个 GeoGebra 静态资源均完成逐文件 SHA-256 与 size 核验。
- 技能产物包含 55 个数学技能文件和 1 个入口技能，共 56 个技能；包内包含 `LICENSE`、`NOTICE` 和 `THIRD_PARTY_NOTICES.md` 副本。
- 连接回归证明：draft session 只在收到 `hello` 前，且官方 `RemoteError` 精确匹配 `gateway/lookup-not-found` / `geochatCanvas/connect` / `agentId` 时重试初始订阅；其他永久错误停止并显示失败。握手后断线不自动重连或重放。真实 transport loss 发生在已派发写操作期间且没有 settled ACK 时，broker 保持 session fail closed。

## 当前尚未证明

- 尚未完成真实模型 API → Harness 工具选择 → 当前 session Applet → 结果回传的完整决策链验收。当前成功的 fixture 直接调用 ToolRuntime，不经过模型 API，因此只证明原生工具传输、session 隔离和画布执行链。
- 本轮没有完成 390 px 手机视口的真实视觉验收；loading/error 状态只有源码和回归测试证据，没有真实 Harness 截图。523 × 722 窄面板结论不能替代这两项证据。
- 当前只验证 Harness Web carrier。Desktop carrier 的资源入口和运行行为未验证，也不在本插件当前支持范围内。
- `keepMounted` 只保持当前页面内的切换状态。关闭画布页签、刷新或关闭页面、卸载 Client 或重启 Harness 会清空对应画布；没有自动持久化或恢复证明。
- 命令安全门不是 JavaScript 沙箱；更新已有对象仍可能触发对象原有脚本。
- 构建包随附第三方 NOTICE 与 attribution，但目标分发场景的许可仍需发布前确认；当前记录不表示已经获得商业分发授权。

## 交付状态

最终安装包的 SHA-256 不写入包内文档，避免修改文档后重新打包造成自指变化；交付时以包外本地 `.artifacts/RELEASE_MANIFEST.json` 的文件名、大小和 SHA-256 记录为准。完成剩余验收并生成该外部清单前，不记录为发布验收通过。
