# Harness 原生画布页签

模式：Operate。这是现有产品的窄范围展示扩展，保留仓库根 DESIGN.md，不修改主应用视觉规则。

范围：Harness 原生右侧页签在每个 session 的同源隔离 iframe 中承载一个 GeoGebra Applet。工具修改的就是当前可见画布；不连接 GeoChat 桌面，不显示截图镜像，也不增加聊天、toolbar、设置或第二块画布。

## Direction contract

- THESIS：只看并操作同一块可见画布，不复制聊天和画板操作面板。用户在 Harness 对话中提出问题，在右侧直接查看构造结果。
- OWN-WORLD：继承 GeoChat 的画布优先原则与 Harness 原生页签容器。白色数学画布、系统字体、石墨色状态文字；不加卡片、阴影、品牌横幅或装饰动画。
- STORY：打开“GeoChat 画布”页签后加载当前 session 的 Applet；不同 session 各自隔离。Harness `keepMounted` 保留页面内的页签/session 切换状态；关闭页签、刷新或关闭页面、卸载或重启仍会清空，不宣称自动持久化或恢复。
- FIRST VIEWPORT：Applet 填满页签可用空间并保持响应式尺寸。初次加载时只有居中短提示；异常提示使用不遮挡主要内容的小型状态区。没有聊天框、外部 toolbar、设置或额外写入按钮。
- FORM：用户已指定的纯画布窄范围扩展，直接代码实现；seed key 为 user-pinned-canvas-only，不引入概念选择或视觉重设计。
- FINISH：以原生流、session 隔离、生命周期、取消与超时、离线资源和目标分发许可确认作为验收门槛；fixture 横幅与合成几何不是产品样式，也不把已知缺陷写入规范。

## 实现和验证约束

- Host 与 Client 使用 `RemoteStream<CanvasCommand, CanvasReply>` 双向流。Host 从 `exec.agent.id` 取得 `SessionId` 并通过 agent lookup 校验；不存在 Host → Client 函数 RPC。
- Client 迭代 Host 命令，通过插件内 controller 执行，并用 `clientHandle.send(reply)` 返回带 correlation id 的结果。取消、deadline、stream 断开或 Client 卸载会结束 pending 调用，迟到回复被丢弃。
- draft session 在 Agent 创建前只对官方 Remote 的 `gateway/lookup-not-found` + `geochatCanvas/connect` + `agentId` 精确错误重试首次订阅；其他永久错误停止并显示失败。收到 `hello` 后禁止自动重连或重放。真实网络断开且已派发写操作收不到 settled ACK 时，session 保持 fail closed，必须先检查画布并重启 Host。
- 对外提供 17 个画布工具、主动打开、状态和离线命令搜索，共 20 个工具；不提供 `wait_action`。主动打开使用当前会话的原生 UI 控制订阅，等待 Applet 就绪；不自动切换会话、不清空、不向多个窗口广播。显式 PNG 导出只用于附件结果，不承担页签展示。
- 页签使用现有 GeoChat 产品图标。保留画布直接指针交互，包括拖动滑块和几何对象，不添加额外控件。
- 每个 session 独立持有同源 iframe、Applet、controller 和 pending 状态；iframe 只隔离 Applet 的 DOM、样式与全局变量，不作为安全沙箱。缺少 agent、lookup 失败、没有匹配 Client 或 session 不一致时 fail closed。
- GeoGebra vendor 文件通过 `ctx.webServer.register` 的固定前缀离线提供；该静态 HTTP 路径不是插件自建的工具通道。工具逻辑使用 Harness 官方原生 Remote，不自建 HTTP/MCP、loopback endpoint 或 bearer token 通道；官方 carrier 的内部传输由 Harness 管理。
- 原生 controller 支持 `continuous`；动画只保证当前页面存活期间运行，并受浏览器后台帧调度影响。
- 验证宽面板与窄面板、加载/错误/空画布状态、session 隔离、取消、超时、隐藏、卸载、断网首次加载、资产清单和第三方 notice。测试横幅与合成几何只作为 fixture，不写入产品规范。
