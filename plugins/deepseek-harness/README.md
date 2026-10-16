# GeoChat × DeepSeek Harness

Harness 原生插件：Harness 模型直接控制插件右侧页签内的 GeoGebra Applet，复用 GeoChat 的数学技能、命令参考和画布 controller。画布执行与展示发生在同一个浏览器 Applet 中；不连接 GeoChat 桌面，不启动第二个推理循环。

## 当前支持范围

- **目标版本：DeepSeek Harness `0.2.0-rc.2`，Node.js 24+。** SDK 使用明确版本；部分 SDK 的 npm `latest` 仍指向旧版本，不要省略版本安装。
- 20 个工具：17 个画布工具、主动打开画布、Applet 状态和离线命令搜索。没有异步动作队列或 `wait_action`。
- 55 个内置数学技能投射为 Harness 原生 `geochat-*` 技能，另有入口技能 `geochat`。命令参考直接复用仓库实现，构建时打包，不依赖源码路径。
- Harness Web 原生右侧“GeoChat 画布”页签直接挂载一个 Applet；不添加聊天框、工具栏、设置或第二块画布。
- Applet 资源随插件离线打包；不依赖 GeoChat 桌面、MCP、外部 CDN 或模型 Key。
- 不暴露数据库、历史会话、密钥、SQL、任意调试工具或内部 `__restoreCanvasXml`。

## 插件元信息

- 显示名称：中文 **GeoChat 画布** / English **GeoChat Canvas**。
- 作者： [tiwe0](https://github.com/tiwe0)；[官方网站](https://chat-with-geogebra.com)；[问题反馈](https://github.com/tiwe0/GeoChat/issues)。
- `package.json` 声明作者、项目仓库及子目录、简介、关键词、`icon` 和 `dsh.manifestVersion: 1`；仅声明已验证的 Harness `0.2.0-rc.2` 兼容版本，不承诺所有未来版本。
- 中英文介绍通过官方 `locale/en.json`、`locale/zh.json` 资源导出，供 Harness 插件管理页读取。图标从 GeoChat 的既有 128px 产品图标构建到 `dist/icon.png`，不依赖外网图片。
- 遵循 [Awesome DSH Plugin](https://github.com/awesome-dsh-plugin/awesome-dsh-plugin/blob/main/contributing.md) 的发现与安装约定；目录的分类/投稿 YAML 与插件自身元信息不同。通过 GitHub Release 分发预构建包，不依赖 npm 发布。

## 下载已构建版本

[下载 dsh-geochat-plugin 0.1.5](https://github.com/tiwe0/GeoChat/releases/download/dsh-plugin-v0.1.5/dsh-geochat-plugin-0.1.5.tgz)，并在 Release 中核对 SHA-256 校验文件。该版本只更新 Harness 插件，不替换 GeoChat 桌面版。

```sh
dsh plugin --profile web add https://github.com/tiwe0/GeoChat/releases/download/dsh-plugin-v0.1.5/dsh-geochat-plugin-0.1.5.tgz
```

安装后重新启动对应 Harness profile。重启会清空当前内存画布，请先保存需要保留的构造。适用版本和载体限制见上文。

![GeoChat 在 DeepSeek Harness 中展示太阳系画布](https://raw.githubusercontent.com/tiwe0/GeoChat/dsh-plugin-v0.1.5/docs/media/geochat-dsh-plugin.png)

## 构建与安装

需要 Node.js 24 或更高版本。以下命令以 Harness `0.2.0-rc.2` 的公开 CLI 语法为准，并安装到 Web profile：

```sh
cd /absolute/path/to/GeoChat/plugins/deepseek-harness
node --version
npm ci
npm run build
npm pack
dsh plugin --profile web add /absolute/path/to/GeoChat/plugins/deepseek-harness/dsh-geochat-plugin-0.1.5.tgz
```

`node --version` 应显示 `v24` 或更高版本。`npm pack` 会执行 `prepack`，因此会再次运行完整 `npm run check`。若使用自定义 Web profile，将命令中的 `web` 替换为对应 profile 名称。当前插件只支持 Harness Web 载体；不要把该安装说明用于 Desktop carrier。

## 配置

默认安装 patch 保持插件 id `geochat`。插件配置只接受：

```yaml
timeoutMs: 30000
skills: true
```

- `timeoutMs`：单次原生画布调用的总 deadline。
- `skills`：是否注册内置数学技能。

旧版 `endpoint`、`pollIntervalMs` 和 `authTokenEnv` 已删除。插件不连接 loopback MCP，也不读取桌面 bearer token。

## 使用示例

Harness 需要启用原生 skills 服务及其 `skill` 工具（标准 profile 中提供），才能按需读取技能。先读取 `geochat` 技能，再开始作图。

可以向 Harness 提问：

> 在 GeoChat 画布上绘制 f(x)=x² 和 y=2x+3，求交点并标注。保留已有对象，完成后检查交点是否同时位于两条曲线上。

> 用 If 建立分段函数，再用 Sequence 生成采样点，说明定义域边界。先查语法，最后检查实际对象。

> 绘制单位圆上的点，以滑块参数驱动一圈动画，给出播放、暂停与重置方式。

典型调用顺序：`geochat_open_canvas` → `geochat_getCanvasContext` → `geochat_search_commands` → `geochat_executeGeoGebraCommands` → `geochat_inspectGeoGebraObjects`。

`geochat_open_canvas` 无参数，自动使用工具所属 session，展开并选中右侧画布，等 Applet 就绪后才返回 `opened: true, ready: true`。重复调用只展开/聚焦，不清空已有构造。它不会切换到另一段对话；当前会话没有连接中的界面，或同时显示在多个窗口时会明确报错，不广播打开、不替换画布。超时或取消后不保留等待下次重连的打开请求。

## 原生调用架构

插件不自建 HTTP/MCP 工具通道，也不使用 Host → Client 函数 RPC；它使用 Harness 官方原生 Remote 的 Typert 双向流把 Host 工具与当前 session 的 Canvas Client 连接起来。官方 carrier 的内部传输由 Harness 管理，不在本文中假定为无 HTTP/WS：

1. ToolRuntime 从 `exec.agent.id` 取得 `SessionId`，并通过 agent lookup 校验该 session。
2. Client 根层先为屏幕上的 session 建立轻量 `connectUi` 控制订阅，不依赖 Applet 挂载；主动打开工具通过此流调用 Harness 的 `sidebarRight.openTab`。Applet 就绪后才建立 `connect` 画布流，Host 向流中发送带 correlation id 的命令。
3. Client 内的 `GeoGebraController` 直接执行命令，并通过 `clientHandle.send(reply)` 返回结果。
4. Host 通过 `ctx.invocation.uplink()` 读取匹配回复。取消、deadline、stream 断开或 Client 卸载会结束 pending 调用；迟到回复会被丢弃。

命令和回复都按经过验证的 `SessionId` 隔离。缺少 agent、lookup 失败、没有匹配 Client 或 session 不一致时，工具调用直接失败，不回退到共享画布或其他传输通道。

新建 draft session 在 Agent 尚未创建时，Client 只对首次 Remote 订阅做有限退避重试，而且只接受官方 `RemoteError` 的精确缺失身份信号：`code=gateway/lookup-not-found`、`details.endpoint=geochatCanvas/connect`、`details.field=agentId`。其他握手前错误属于永久错误，立即停止并显示连接失败；这期间没有工具命令可重放。收到 `hello` 完成握手后，任何断线都不会自动重连或重放命令。若真实网络断开时已有写操作被派发，且 Host 没有收到 Client 的 settled ACK，该 session 会保持 fail closed：结果状态未知，必须先检查画布并重启 Host，不能自动重试该写操作。

## 画布页签

Agent 可调用 `geochat_open_canvas`，也可手动在 Harness 原生右侧面板中选择带 GeoChat 产品图标的“GeoChat 画布”。每个 session 都在同源隔离 iframe 中挂载自己的 GeoGebra Applet；工具修改的就是用户正在查看的画布，不存在桌面画布、隐藏的第二个 Applet 或 PNG 镜像。iframe 用于隔离 Applet 的 DOM、样式和全局变量，不是安全沙箱。

- 每个 Client session 独立持有 iframe、Applet、controller、pending reply 和取消状态。Harness 的 `keepMounted` 保证在同一页面内切换右侧页签或 session 时，不卸载已经打开的对应画布。
- 画布只保存在当前浏览器 session 的内存中。关闭画布页签、刷新或关闭页面、卸载 Client 或重启 Harness 会清空对应画布；当前版本不提供自动保存或恢复。
- 页签只包含画布、简短加载状态和必要的错误状态；不添加聊天框、外部 toolbar、设置或额外写入按钮。
- 保留 Applet 原生鼠标/触控交互，包括拖动滑块和几何对象；没有屏蔽指针事件的展示层。
- 动画由页面内 controller 执行；`continuous` 受浏览器后台帧调度影响，不保证隐藏页面中的常驻实时播放。

## 0.1.5：场景读回与视觉自检

优先补齐读回与验证，不添加一组细碎 getter 工具。新增调用示例：

```json
{"tool":"geochat_sceneReport","arguments":{"include":["viewport","style","deps"]}}
{"tool":"geochat_setTextStyle","arguments":{"objects":["title","caption"],"fontSize":14}}
{"tool":"geochat_checkLayout","arguments":{"objects":["title","caption","labels"]}}
{"tool":"geochat_captureFrames","arguments":{"count":6,"intervalMs":500,"transparent":false}}
```

- `sceneReport`：读取主 2D 视口范围、横纵像素密度、对象可见性、颜色/填充/线型/粗细/点样式/字体 XML，以及业务动画状态。`include` 默认全部；最多 100 个对象，截断明确标记。`deps` 只解析 Applet 算法 XML 中可确认的命名输入；表达式和常量留为 unresolved，不能冒充完整依赖图。`bbox` 返回能力状态，不伪造普通对象/标签矩形。
- `checkLayout`：用 Applet 的 `Corner(text,1/3)` 测量真实文字容器框，报告像素重叠和越界；命名 text 直接测量，文字列表通过 `Element` 临时别名测量（每列表最多 16 项，总检查上限 100）。跳过主绘图区隐藏对象。临时探针在 finally 中删除，清理失败触发外层事务恢复；该操作可能更新内部边界缓存，不是无副作用纯读取。
- 布局结果包含 `coverage.unknown/truncated`，始终不宣称全局 `verified`。普通几何对象名称标签、绝对屏幕定位文字、字形墨迹、文字盖住几何对象、3D 遮挡未覆盖。检测为当前帧；动画运行时各对象测量并非原子快照。列表依赖别名的框仍需截图复核，空碰撞数组不等于全场景合格。
- `setTextStyle`：批量调用 Applet `setFont`，支持命名 text 的 8–96 目标字号与粗体/斜体/衬线；返回写后的样式 XML。不是修改普通点/圆的名称标签，也不直接设置匿名列表元素。省略三个风格开关会设为 false。它与场景/布局/截图工具均不删除业务动画配置。
- `captureFrames`：默认 4 帧、间隔 500ms；支持 2–8 帧、100–2000ms，返回多张原生图片附件及实际 elapsedMs。总编码体积上限 12MiB，失败不返回部分成功；不自动改参数或暂停动画。有限帧不能证明没有帧间闪烁、全部时刻无碰撞或连续流畅。
- 命令批次成功后返回 `visualCheckHint`，提醒场景读回和看图；入口及全部 55 个技能也写明这些工具的使用时机。不会强制每次写入都塞图。

尚未实现：完整资源快照/恢复、无副作用命令干跑、含所有标签框的自动 fitView、全动态依赖图和整段动画碰撞区间。这些需要独立设计与验证，不使用 XML 回滚或近似几何来冒充。

## 工具语义与限制

所有 20 个公开工具的描述统一按“返回 / 使用 / 边界”说明：模型会拿到什么结果、何时应调用，以及结果不能证明什么；参数描述注明用途、实际默认行为及必要的副作用。不承诺固定本地截图路径或完整普通对象标签检测。

- 作图或样式批次后，先用 `geochat_inspectGeoGebraObjects` / `geochat_getValue` 验证对象，再用 `geochat_capture_canvas` 读取真实图片。命令执行成功、连接就绪、对象存在均不等于视觉验收通过。
- `geochat_capture_canvas` 可以不带参数调用：实际默认 `exportScale=1`、`transparent=true`，省略 `dpi` 时交由 Applet 决定。`exportScale=0.25` 仅用于布局粗看，不替代最终文字清晰度验收；检查不透明底色时可显式设 `transparent=false`。返回的是原生图片内容块，不是要求模型自行解码的文本；不承诺固定本地路径或宿主具备某个特定看图工具。
- `geochat_getValueString` 返回格式化值字符串，不仅是文本对象正文；`geochat_setValue` 返回请求回显，需回读确认，且会移除所有插件动画配置。命令批次也会移除这些配置，后续需要动画时重新配置。
- 命令失败后的摘要可能在外层事务恢复前采集；`restoreOnError=false` 不表示禁用外层回滚。失败后重新读取画布，XML 恢复也不等于恢复插件动画。

- `executeTool` 返回完成结果，不生成 desktop action UUID，不轮询动作状态，也不提供 `geochat_wait_action`。
- 已握手连接断开后不自动重连。若错误提示操作状态未知，先检查当前画布；按提示重启 Host 后，也只在确认不会重复写入时重新发起操作。
- `configureGeoGebraAnimation` 支持 `once`、`loop`、`ping_pong` 和 `continuous`。
- `geochat_capture_canvas` 返回当前画布截图的原生图片附件，可直接用于视觉检查，无需自行解码或将图片数据当作文本读取。完成构造、批量样式调整后，以及需要检查颜色对比、标签重叠、遮挡、网格和布局时调用；页签展示不依赖截图轮询。
- 截图不替代 `geochat_inspectGeoGebraObjects` / `geochat_getValue` 等工具对定义、坐标、数值及动画状态的验证，也不能凭单帧证明动画连续性或数学正确性。图片由 Harness 附件服务校验、规范化并保存，格式可能改变；模型若实际无法读取附件，应明确说明限制，不得声称完成视觉验收。
- 内置技能中的高级 recipe、教学卡片、工作记忆和任务状态等内部工具不是本插件工具。教学说明直接在 Harness 回复中呈现，不能伪造成功调用。
- 不提供 JavaScript / XML 注入接口；采用原生表达式、If、Sequence 与 Applet 公共 API。执行前拒绝命令目录中标记 `risk:script-execution` 的调用，覆盖目录中的英文名、中文别名和嵌套形式（不宣称覆盖其他界面语言）；命令搜索过滤这些条目。已有对象更新仍可能触发其原有脚本，这不是脚本隔离沙箱。
- 工具可修改当前画布；`resetCanvas` / `resetBefore` 会清空构造，只应按用户明确要求使用。本插件不是沙箱，也不替代 Harness 的工具授权策略。

## 离线资源与许可证

Harness 没有 `client.assets`。插件通过宿主现有的 Web 载体，在 `ctx.webServer.register` 注册的固定 `/geochat-assets` 前缀下提供清单内的 GeoGebra vendor 静态文件。该只读 `GET`/`HEAD` 路径不是插件自建的工具调用通道，不接收 session 命令或凭据；工具逻辑使用 Harness 官方原生 Remote。

插件运行时不依赖 GeoChat 桌面或外部 CDN。Apache-2.0 只覆盖项目自身代码；构建包随附 GeoGebra 相关第三方 NOTICE 与 attribution。本预构建资源包按 GeoGebra 非商业条款免费提供，不授予商业使用或商业分发权；商业场景需要另行取得适用许可，不能仅凭本项目的 Apache-2.0 声明使用完整 GeoGebra 资源。

## 验证边界

当前验证记录见 [VALIDATION.md](./VALIDATION.md)。已完成本地检查、真实 Harness 中的离线 Applet 加载、ToolRuntime → Remote → Applet → 结果/附件回传，以及多 session 隔离、页面内回切保留和窄面板显示。联调 fixture 直接调用 ToolRuntime，没有经过模型 API，因此不证明模型的工具选择或决策链。

完整验收范围包括：20 个工具的 schema 与结果、Typert stream 的命令/回复关联、主动打开和 session 隔离、取消与超时、Client/Host 生命周期清理、滑块拖动、静态资源清单、断网首次加载以及第三方 NOTICE 和目标分发许可确认。实现验证完成前，以 [NATIVE_PLUGIN_PLAN.md](./NATIVE_PLUGIN_PLAN.md) 的门槛为准；不要把合成 fixture、测试横幅或模拟几何记录为产品样式或真实作图证据。

## 参考

- [GeoGebra Apps API](https://geogebra.github.io/docs/reference/en/GeoGebra_Apps_API/)
- [Corner：文字容器角点与限制](https://geogebra.github.io/docs/manual/en/commands/Corner/)

- [Harness 工具开发](https://deepseek-harness.github.io/deepseek-harness/en/develop/basic/tool)
- [Harness 插件配置](https://deepseek-harness.github.io/deepseek-harness/en/develop/basic/config)
- [Harness 打包与安装](https://deepseek-harness.github.io/deepseek-harness/en/develop/basic/publish)

Apache-2.0；数学技能与命令参考来自本仓库，构建包包含许可证及适用的 NOTICE。
