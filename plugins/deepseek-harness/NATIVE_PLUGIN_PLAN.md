# Harness 原生画布插件清理与迁移计划

本文保留原生插件替换旧传输时的实施计划。0.1.5 在原有 16 个工具上新增场景报告、布局检查、多帧截图与文字样式，共 20 个工具（17 个画布工具）；当前行为与验证以 README.md、VALIDATION.md 为准。下文的初始工具数量是历史验收基线，不是当前公开工具清单。

## 已确认决策

Harness 插件自己的右侧页签在每个 session 的同源隔离 iframe 中承载一个 GeoGebra Applet。Host 侧注册的 `geochat_*` 工具通过 Harness 官方原生 Remote 的 Typert 双向流派发到同一 session 的 Client Applet，由插件内的 `GeoGebraController` 执行。插件不自建 HTTP/MCP 工具通道，不访问 GeoChat 桌面应用，也不使用 loopback endpoint、bearer token、desktop action 队列或 PNG 轮询。官方 carrier 的内部 HTTP/WS 等传输属于 Harness 实现边界，不在本计划中另作承诺。

GeoGebra 离线资源是例外边界：Harness 没有 `client.assets`，因此沿用宿主现有 Web 载体，通过 `ctx.webServer.register` 在固定前缀下只读提供 vendor 静态文件。这个 HTTP 路径只传文件，不接收工具调用、session 命令或凭据。

保持以下产品约束：

- 画布是页签内唯一主要内容；不复制聊天区、工具栏、设置、桌面调试面板或第二套业务导航。
- 工具执行与用户看到的画布属于同一个 Applet；不再同步或镜像外部画布。
- 画面完整填充可用区域并保持 Applet 自身响应式尺寸；不为迁移增加卡片、横幅、阴影或装饰动画。
- 对外提供 16 个工具：13 个画布工具、`geochat_open_canvas`、`geochat_status` 和 `geochat_search_commands`。删除依赖旧动作队列的 `geochat_wait_action`。
- `geochat_capture_canvas` 是一次显式工具调用，返回原生图片附件用于视觉检查；内部通过 Applet 的 `getPNGBase64` 导出。必须删除的是展示页的 PNG 截图轮询，不是截图能力本身。
- `configureGeoGebraAnimation` 对齐原生 controller，支持 `once`、`loop`、`ping_pong` 和 `continuous`；动画只保证当前页面存活期间运行。
- Harness `keepMounted` 保证同一页面内切换页签或 session 时不卸载已打开画布。画布仍只存在于当前浏览器 session 的内存中；关闭页签、刷新或关闭页面、卸载 Client 或重启 Harness 会清空对应画布，当前版本不宣称自动持久化或恢复。

## 官方 SDK 契约

新实现使用已确认的 Harness SDK 机制：

1. ToolRuntime 在 `execute` 的 `exec.agent.id` 提供调用方 `SessionId`。缺少 agent 的调用 fail closed。
2. Host 通过 agent lookup 校验该 `SessionId` 仍对应一个可用 agent/session，不能接受 Client 自报的未验证 session。
3. Host 声明 Typert `RemoteStream<CanvasCommand, CanvasReply>`。这是 Client 主动打开的一条双向逻辑流，不存在 Host → Client 函数 RPC。
4. Host stream 向下游 yield `CanvasCommand`，并通过 `ctx.invocation.uplink<CanvasReply>()` 读取同一逻辑流上的回复。
5. Client 持有生成的 stream handle，迭代 Host 命令，并用 `clientHandle.send(reply)` 返回带 correlation id 的结果；`end()` 半关闭上行，`dispose()` 取消整条流。
6. 每条命令携带经过验证的 `SessionId`、调用 id、工具名和参数。Client 只处理与自身 session 匹配的命令；Host 只接受匹配的 reply。
7. ToolRuntime 的 `exec.signal` 负责调用取消。Host 在取消或 `timeoutMs` 到期时结束 pending command；Client 对应终止 controller 操作，迟到 reply 被丢弃。
8. 插件配置只保留 `timeoutMs` 和 `skills`。删除 `endpoint`、`pollIntervalMs` 与 `authTokenEnv`。
9. draft session 在 Agent 创建前只对首次 Remote 订阅做有限退避重试，且错误必须精确匹配官方 `RemoteError`：`code=gateway/lookup-not-found`、`details.endpoint=geochatCanvas/connect`、`details.field=agentId`。其他握手前失败立即停止并显示错误。收到 `hello` 后禁止自动重连和命令重放。若真实网络断开时已有写操作被派发且未收到 settled ACK，broker 保持该 session fail closed，直到 Host 重启。

## 目标架构

1. Harness Host 插件注册 16 个工具和 56 个技能入口，保留输入校验、危险命令过滤、结果渲染与附件投影。`geochat_open_canvas` 通过 Applet 挂载前的原生控制订阅展开当前会话页签，并等待实际画布就绪；会话不可见或多窗口歧义时不跳转、不广播。
2. Canvas stream broker 按 `SessionId` 维护一条已认证 Client 流和 pending command 表；session 关闭、stream 断开或插件卸载时统一拒绝未完成调用。
3. Canvas Client 为每个 session 创建一个同源隔离 iframe，在 iframe 内 `mountGeoGebra` 并持有一个 `GeoGebraController`；iframe 隔离 DOM、样式和全局变量，但不作为安全沙箱。Client 仅分派 13 个公开画布工具和状态读取。
4. Client 调用 `controller.executeTool` 后通过 uplink reply 返回结果。Host 在需要时把显式 PNG 结果保存为 attachment，原始 base64 不进入普通文本历史。
5. Applet 静态资源随插件离线打包，通过固定 `/geochat-assets` 前缀读取；运行时不依赖 GeoChat 桌面或 CDN。

首选复用现有成熟实现，不复制一个缩水版控制器：

- `src/renderer-react/src/geogebra/controller.ts`
- `src/renderer-react/src/geogebra/ggbdeploy-wrapper.ts`
- `src/renderer-react/src/geogebra/canvas-context.ts`
- `src/renderer-react/src/geogebra/canvas-controls.ts`
- `src/renderer-react/src/geogebra/canvas-transactions.ts`
- `src/renderer-react/src/geogebra/command-executor.ts`
- `src/renderer-react/src/geogebra/animation-runtime.ts`
- `packages/app/src/geogebra-command-normalization.ts`
- `packages/app/src/structured-logger.ts`

`src/renderer-react/src/geogebra/runtime.ts` 只增加 React Context，不属于最小复用闭包。构建应将 controller 的 barrel 导入定向到纯浏览器模块，避免把模型注册、数据库或桌面运行时带入 Client bundle。

## 实施顺序

### 1. 先锁定回归测试

在删除旧实现前建立原生链路的失败测试，覆盖：

- 13 个画布工具保持当前 schema、命令安全校验与结果形状；未知工具和内部 `__restoreCanvasXml` 不可远程调用。
- ToolRuntime 从 `exec.agent.id` 取得 session；缺少 agent、lookup 失败、Client 未连接或 session 不匹配时 fail closed。
- 工具调用只影响发起调用的 session/Applet；两个并行 Client 不共享 controller、对象、pending reply 或取消状态。
- `timeoutMs`、调用取消、stream dispose 和 Client 卸载均结束对应工作；迟到 reply 不污染后续调用。
- draft Agent 尚未创建时只对上述精确 lookup-not-found 分类重试初始订阅；无关 lookup 字段、未知错误和握手前正常结束均停止并显示错误。握手后断线不重连、不重放。覆盖已派发写操作在 transport loss 时收不到 settled ACK 的 fail-closed 与 Host 重启恢复边界。
- Host 和 Client 卸载后没有注册、监听器、动画帧、定时器或 Applet DOM 残留。
- 右侧页签只有画布、加载文案和必要的失败状态；没有聊天、toolbar 或写入控件。
- vendor 资源断网可加载；运行时不请求 CDN 或 GeoChat 桌面。

这些测试先红后绿。现有 HTTP/MCP 测试只用于证明旧链路待删除，不能作为新架构验收。

### 2. 建立插件自有 Applet 运行时

- 将上述 GeoGebra 浏览器模块作为共享源码或明确的内部包接入插件 Client；不得复制后分叉业务逻辑。
- 为 `mountGeoGebra` 增加显式 `assetBaseUrl`，指向固定静态前缀，消除对桌面 `backendBaseUrl` 和 `import.meta.env.DEV` 路径推断的依赖。
- Applet ready 后调用 `controller.setApi(api)`；卸载前先 `controller.setApi(null)` 停止动画并解除事件，再调用 mount disposer。iframe reload 使用新 generation，旧 runtime 的回调不得覆盖新实例。
- 继续隐藏 GeoGebra 原生 toolbar、menu bar 与 algebra input；不额外堆叠交互面板。保留 Applet 的直接指针交互，允许拖动滑块和几何对象；工具能力和生命周期不依赖手动拖动。
- 一个 Client session 只创建一个 iframe/Applet。多窗口或多 session 使用官方 `SessionId` 建立一对一实例表，不使用文档级单例或“最后挂载实例”。注册页签时使用官方 `keepMounted: true`，使同一页面内的页签/session 切换不销毁实例。

### 3. 接入 Typert 双向流

- 用生成的 Typert 类型声明 `RemoteStream<CanvasCommand, CanvasReply>`；Host stream 以 agent lookup 验证 session 后才登记。
- Host 工具保留 `validateInput`、`validateCanvasCommands` 和 script-risk 拦截，再向匹配 session 的 stream yield 命令；Client 也只分派 `CANVAS_TOOLS` 白名单。
- 每条调用由 correlation id 配对。Host 总 deadline 使用配置 `timeoutMs`，Client 同时观察取消；任何 deadline 后的 reply 都被忽略。
- Client 在收到 `hello` 前只可为精确匹配 `gateway/lookup-not-found` / `geochatCanvas/connect` / `agentId` 的 draft Agent 初始订阅退避重试；其他错误立即结束连接循环并显示失败。握手后断线同样停止。任何已派发写操作都不能因断线自动重放。
- 原生 `executeTool` 完成即为工具完成，不再生成 desktop action UUID，也不再轮询 queued/claimed/succeeded 或提供 `wait_action`。
- `geochat_capture_canvas` 的显式结果继续执行格式、大小和附件保存检查，但不承担页签展示或存活探测。截图用于视觉验收，不替代数值和动画状态验证。
- `continuous` 使用原生 controller 能力；隐藏标签页会受浏览器帧调度影响，文档不得宣称后台常驻动画。

### 4. 删除插件旧传输与预览栈

原生调用测试通过后删除或重写以下旧实现：

| 当前文件 | 处理 |
| --- | --- |
| `src/bridge.ts` | 删除 `CanvasBridge`、loopback URL 校验、HTTP MCP client、动作轮询、bearer 环境变量和 desktop action 语义。 |
| `src/canvas-preview.ts` | 删除 PNG preview 缓存、并发合并、哈希 revision 与预览校验。 |
| `src/canvas-view.ts` | 删除 `/api/geochat/canvas` 路由与 Connection fetch 注册。 |
| `client/frame-loader.ts` | 删除 Connection RPC 帧加载器。 |
| `client/canvas-polling.ts` | 删除 5 秒轮询、失败退避与 stale frame 状态机。 |
| `client/canvas-image.ts` | 删除 data URL 帧切换与上一帧回退。 |
| `client/canvas-view.tsx` | 重写为直接挂载 Applet 的纯画布容器；不保留 `<img>` 镜像。 |
| `client/index.tsx` | 移除 `connection` 注入，接入 Typert Client stream 和 session-scoped Applet。 |
| `src/index.ts` | 移除 bridge/preview/view 初始化及旧配置；工具执行改为 stream broker dispatch。 |
| `src/index.d.ts` | 配置只保留 `timeoutMs`、`skills`。 |
| `package.json`、`scripts/build.mjs`、锁文件 | 移除 MCP/Connection 专属依赖，加入 Typert、agent lookup、Host Web Server 和离线资产构建依赖。 |

对应删除或重写 `tests/bridge.test.ts`、`tests/canvas-preview.test.ts`、`tests/canvas-view.test.ts`、`tests/canvas-client.test.ts` 和依赖临时 HTTP/MCP server 的 `tests/plugin.test.ts` 场景。保留与原生架构仍相关的工具 schema、命令安全、attachment 与技能打包测试。

### 5. 回退桌面 preview 改动

新插件不依赖 GeoChat 桌面后，删除本分支仅为 Harness 画布预览增加的桌面改动：

- 从 `tools/desktop-debug-mcp/debug-actions.ts` 删除 `CanvasPreviewRequest`、`CANVAS_PREVIEW_*`、`requestCanvasPreview`、专用 claim/complete/fail 分支及其定时器/取消状态。
- 从 `tools/desktop-debug-mcp/tools.ts` 删除 `get_canvas_preview` MCP 工具。
- 删除 `tests/desktop-canvas-preview.test.ts`。

只撤销这些 preview 专属增量，不改动既有普通 desktop debug actions、MCP 开关或其他用户工作。

### 6. 离线资源与许可证

- 完整打包 `vendor/geogebra` 资源并保持其相对目录；在没有加载清单证据前不做“最小裁剪”。
- 构建生成资源清单与校验值。`ctx.webServer.register` 只在固定前缀下允许清单内的 `GET`/`HEAD`，拒绝遍历、未知文件和写方法。
- 在断网环境执行首次加载、工具调用、视图切换和销毁测试；检测到 CDN 或 GeoChat 桌面请求即失败。
- 将 GeoGebra 的第三方声明与插件分发物一起交付，并保留 “Made with GeoGebra®” attribution 要求。仓库现有 `THIRD_PARTY_NOTICES.md` 记录了 GeoGebra 完整产品资源的非商业限制；发布前必须取得适用分发场景的许可证确认，不能把“文件已随包附带”当作许可通过。
- Apache-2.0 只覆盖项目自身代码；不得把 GeoGebra vendor 资源误标为 Apache-2.0。

### 7. 文档与发布

`README.md`、`DESIGN.md` 和 surface brief 记录已确认的 native 架构；`VALIDATION.md` 只记录实际完成的检查，并区分直接 ToolRuntime fixture、模型决策链与最终发布证据。发布文档必须明确：`keepMounted` 只覆盖当前页面内的切换，画布仍只在浏览器内存中存活，关页、刷新或重启会清空，不提供自动持久化。

## 验收门槛

以下条件必须全部满足，迁移才算完成：

- **工具传输：** 插件只使用 Harness 官方原生 Remote 的 Typert stream，不自建 HTTP/MCP 工具通道、loopback endpoint、bearer token、desktop action polling 或 PNG 展示轮询；不对官方 carrier 的内部 HTTP/WS 实现作额外断言。
- **静态资源边界：** 插件注册的 HTTP 路径仅用于 Harness Web Server 固定前缀下的清单内 vendor 文件；不能接受工具调用或 session 数据。
- **同画布执行：** Harness 工具调用改变的就是右侧页签当前显示的同源 iframe Applet；不存在截图镜像、第二个隐藏 Applet 或外部桌面依赖。
- **功能回归：** 13 个画布工具、状态、离线命令搜索、显式 PNG attachment、命令安全校验、事务恢复和 `continuous` 动画通过目标测试。
- **生命周期：** mount/ready/hide/show/iframe reload/unmount/session dispose 均有测试；`keepMounted` 切换保留对应 session 画布，销毁后无 Remote 注册、事件、动画、定时器或 DOM 泄漏。
- **会话隔离：** 并行 session 不串画布、reply 或取消；缺少 agent、lookup 失败或无 Client 时 fail closed。
- **取消与超时：** 调用前、执行中和 Host 卸载三种取消路径均可终止；超时和迟到结果不会造成重复执行或历史污染。
- **断线恢复：** draft Agent 创建前仅对精确的官方 lookup-not-found 身份错误重试初始订阅，其他错误停止并显示；`hello` 后不自动重连或重放。真实网络断开且已派发写操作收不到 settled ACK 时 session 保持 fail closed，提示状态未知并要求检查画布、重启 Host。
- **纯画布 UI：** 无聊天、toolbar、卡片、横幅或装饰控件；加载和错误状态不冒充可用画布。
- **内存边界：** 关页、卸载或重启后画布清空；没有未实现的自动保存或恢复声明。
- **离线资源：** 清空网络后仍可首次加载和执行；构建产物包含完整必需资源、资产清单和校验值。
- **许可证：** 第三方 NOTICE 与 attribution 随包；没有把 GeoGebra 资源并入项目 Apache-2.0 声明。目标分发许可仍是发布前门槛，当前文档不宣称已获商业分发授权。
- **清理完整：** desktop preview 增量及测试移除；旧配置和 `geochat_wait_action` 不再作为可用能力出现在源码、bundle 或用户配置说明中。

## 停止条件

若 agent lookup 无法可靠绑定 ToolRuntime session 与 Client stream，或 GeoGebra 资源许可不允许目标分发方式，则停止实现并上报阻塞；不得退回自建工具 HTTP/MCP、私有 `postMessage` 或 PNG 轮询作为生产方案。
