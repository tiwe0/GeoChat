# GeoChat Clean-Slate 架构与工程质量改进计划

> 版本：v1.0（核验修订版）
>
> 日期：2026-10-01
>
> 状态：已实施并完成本地验收
>
> 适用版本：v0.6.1+

## 1. 文档定位

本计划是对现有架构治理工作的增量补充，不重复
`docs/internal/architecture-code-quality-optimization-plan.md` 已完成的安全、凭据、会话、
数据库迁移、工作区和后端端口治理。

本文只保留能够由当前代码验证、且有明确收益与验收方式的事项。以下原则贯穿所有阶段：

- 先建立现状基线和回归测试，再修改结构。
- 以当前契约为唯一入口；不兼容旧数据库、旧 HTTP 路由、旧字段或无版本 payload。
- 优先提取纯函数、端口和适配器，不为拆分而增加抽象。
- 不以文件行数作为唯一重构依据。
- 新增质量工具必须叠加到现有门禁，不能替代类型检查和依赖检查。
- 性能收益必须先测量再承诺，不写未经验证的百分比目标。

## 2. 已确认的改进事项

| 编号 | 优先级 | 改进项 | 当前事实 | 预期收益 |
| --- | --- | --- | --- | --- |
| C-01 | P1 | 收紧会话消息持久化契约 | 持久化消息必须使用显式版本和当前字段；解析失败不得静默降级 | 明确 SQLite 数据边界并降低升级风险 |
| S-01 | P1 | 移除 GeoGebra 控制器的隐式全局依赖 | 控制器通过模块级单例向 ToolWorker、选择场景等消费者暴露 | 明确所有权、生命周期和可测试边界 |
| R-01 | P1 | 补齐后端 sidecar 运行期退出感知 | 启动期健康检查和 `try_wait` 已存在，但启动后的异常退出缺少统一通知与恢复链路 | 避免桌面仍显示可用而后端已经退出 |
| M-01 | P2 | 收敛 `useAgentRunChat` 的职责 | Hook 同时处理请求构造、重试、上传、运行恢复、租约和聊天状态协调 | 缩小变更影响面，提升单元测试能力 |
| M-02 | P2 | 按职责拆分 Rust 应用包服务 | `app_bundle.rs` 同时承担清单、签名、下载、安装和回滚职责 | 降低发布链路修改风险 |
| R-02 | P2 | 建立跨进程关联日志 | 已有 `runId`，但 HTTP、Tauri、broker 和渲染端日志尚未形成统一关联链路 | 缩短故障定位时间 |
| G-01 | P2 | 引入统一格式化与源码规则检查 | 当前 `lint` 主要由 TypeScript 未使用检查和依赖检查组成，缺少全量格式化/源码规则工具 | 减少低价值差异并统一基础规则 |
| G-02 | P3 | 核对依赖分类 | 根包运行时依赖为空，依赖集中在 `devDependencies`；桌面打包是否受影响需用构建验证 | 让依赖意图更清晰，避免发布遗漏 |
| G-03 | P3 | 小范围去重与命名统一 | 存在局部重复的数值钳制和格式转换逻辑，但未形成全局重复模式 | 减少局部漂移，避免制造通用工具垃圾桶 |

### 2.1 实施结果（2026-10-01）

| 编号 | 结果 | 验收摘要 |
| --- | --- | --- |
| C-01 | 完成 | v1 持久化契约已统一编码/解码；无版本或未知版本数据会被拒绝，严格校验行与 payload 一致性，并限制可渲染 URL 协议。 |
| S-01 | 完成 | 移除模块级控制器单例，React 与非 React 消费者均显式注入；StrictMode、快速卸载和陈旧 callback 有行为测试。 |
| R-01 | 完成 | managed sidecar 由 supervisor 独占并有限自动重启，更新与退出统一 stop/reap；external backend 使用带 jitter 的有界指数退避，渲染端在失联时失效当前 generation/lease。 |
| M-01 | 完成 | 请求准备和生命周期协调已从 Hook 提取；submission lease 使用所有权 token，activation、监听重建、失联恢复和陈旧回调均有回归测试。 |
| M-02 | 完成 | Rust 应用包服务按 manifest/signature/downloader/installer 拆分；生产安装路径覆盖下载、校验、staging、切换失败自动恢复和恢复失败诊断。 |
| R-02 | 完成 | runId/correlationId 已贯穿 renderer HTTP、backend、credential resolver 与 Rust broker；失败链回归同时验证日志脱敏。 |
| G-01 | 完成首批范围 | 固定 Biome 2.5.15，新增 `format`、`format:check` 和源码 lint；首批架构边界文件纳入 formatter，避免本次混入 400 余文件的全量格式化。 |
| G-02 | 完成核对，无需迁移 | 依赖已逐类记录；renderer/backend 均在安装前打包，根包不发布且成品不运行时读取 `node_modules`，故保持当前分类。 |
| G-03 | 完成 | 三处相同数值钳制逻辑已收敛到领域内 `numbers.ts`，并有回归测试。 |

Renderer 持久化边界也已收口：会话、消息、黑板、运行账本、GeoGebra 文档和题库等业务
数据以 SQLite 为唯一权威源；语言、模型选择、思考开关、面板、onboarding 和 installation ID
等明确偏好写入 Tauri 应用数据目录中的原生 `renderer-state.json`；Provider 密钥只进入
系统安全凭据库。原生 JSON 写入具备大小上限、临时文件替换、父目录同步、内核文件锁和
跨实例读刷新，配置提交等待自己的 durable write，不使用共享队列错误推断提交结果。

运行期不再以 WebView 的 `localStorage`、`sessionStorage`、IndexedDB、Cache Storage、
Service Worker 或 OPFS 作为持久化介质。旧 WebView 数据迁移、journal、backup、legacy
conversation import 和明文凭据 import 运行面已破坏性删除；启动过程不会读取或复制旧 WebView
数据。仅保留当前版本损坏配置的严格、限额隔离，它不参与旧 schema 升级。`localStorage` 与
`sessionStorage` 仅保留进程内 vendor 兼容语义，其余 WebView 持久化 API 被清理并禁用；原生
WebView 同时启用 incognito。

依赖分类的逐项依据见 `docs/internal/dependency-classification.md`。本轮验证覆盖冻结安装、全量
TypeScript/Bun/Rust 测试、renderer/backend 构建、Tauri `.app` 构建、资源布局、打包后端和
macOS 应用启动。Windows 安装器安装与真实 Tauri WebView 的人工交互不在本地验收结论内。

## 3. Phase 1：会话消息契约与持久化边界

### 3.1 目标

建立一个与当前 AI SDK UI 消息语义一致、可版本化、可往返验证的持久化契约。重点不是给
`unknown[]` 强行套一个过窄结构，而是明确“已知字段校验、未知扩展保留、旧数据拒绝”的边界。

### 3.2 实施要求

契约至少覆盖当前项目实际使用的内容：

- `text`、`reasoning`、`file`、`step-start` 等消息 part。
- 工具 part 的完整状态：
  `input-streaming`、`input-available`、`approval-requested`、
  `approval-responded`、`output-available`、`output-error`、`output-denied`。
- 已知字段执行严格校验；未知但合法的扩展字段在往返过程中保留。
- 编码器、解码器、领域适配器分离，不用一个“解析失败则原样返回”的通用兜底掩盖错误。
- 缺失或未知 `schemaVersion` 的消息在解码边界直接拒绝，不做运行时升级。
- provider 临时策略、请求头和凭据不得进入持久化消息。

建议的模块边界：

- `packages/app/src/conversation-message-contract.ts`：版本化持久化类型及校验。
- `backend/src/agent/conversation-message-encoder.ts`：AI SDK/UIMessage 到持久化结构。
- `src/renderer-react/src/features/conversations/messageDecoder.ts`：持久化结构到 UI 消息。
- 现有 `messageAdapter.ts`：只保留展示层适配。

### 3.3 验收条件

- 富消息经过“保存 → SQLite → 重启 → 加载”后内容与工具状态保持一致。
- 无版本和未知版本消息均被拒绝，并返回可观测错误。
- 单条损坏消息只隔离该消息，并返回可观测错误，不破坏整个会话列表。
- 编码/解码往返测试覆盖所有已使用 part 和工具状态。

## 4. Phase 2：GeoGebra 显式依赖与生命周期

### 4.1 目标

消除模块级可变单例，但保持 App 作为 applet 生命周期所有者，避免同时存在多个控制器实例。

### 4.2 实施要求

- 定义最小的 `GeoGebraRuntimePort`，只暴露调用方真正需要的能力。
- React 消费者通过 Provider/hook 获取端口。
- ToolWorker、选择场景、回放和 MCP 等非 React 消费者通过构造参数或工厂注入。
- 保留现有卸载、挂载中止、epoch 防陈旧回调和 canvas lease 行为。
- 不用 `any` 或新的 service locator 代替旧单例。

迁移顺序：

1. 为 ToolWorker 增加显式端口参数，并补无 applet/过期 applet 测试。
2. 迁移选择场景、回放和 MCP 调用链。
3. 由 App 统一创建并注入唯一运行时端口。
4. 删除全局 setter/getter，并增加禁止重新引入的依赖边界测试。

### 4.3 验收条件

- React StrictMode、HMR、快速挂载/卸载下只有一个有效控制器。
- applet 未就绪和已销毁时，工具调用返回明确错误。
- 现有 canvas lease、选择和命令执行回归测试通过。

## 5. Phase 3：sidecar 韧性与跨进程可观测性

### 5.1 后端退出感知

当前已有启动期健康检查和进程状态检查。本阶段补齐启动后的运行期行为：

- 对内置 sidecar 建立子进程退出监听，并通过 Tauri 状态事件通知渲染端。
- 对外置后端使用带抖动/退避的健康检查，避免短暂网络波动触发错误恢复。
- 后端失联时取消相关请求和 lease，结束活动 run，并让 UI 进入可恢复状态。
- 自动重启是否启用、最大次数和退避策略必须显式配置；未启用时提供明确的重试入口。
- 测试启动失败、启动后崩溃、主动退出、外置后端短暂失联和恢复。

### 5.2 关联日志

- 优先复用现有 `runId`；没有 run 的请求再生成 `correlationId`。
- 在 HTTP header、Tauri command/event、broker 消息和结构化日志中透传。
- 如新增自定义 header，同步更新 CORS allowlist。
- 日志只记录标识符、阶段、耗时和错误分类，不记录凭据、签名 URL 或完整用户内容。

### 5.3 验收条件

- 任一失败请求可从渲染端日志追踪到 Tauri、后端和 broker。
- 人工终止 sidecar 后，UI 在限定时间内显示可恢复错误，且不遗留活动 generation/lease。
- 外置后端短暂抖动不会产生重启风暴。

## 6. Phase 4：高风险模块的保守拆分

### 6.1 `useAgentRunChat`

先为现有行为补测试，再按稳定边界逐步提取：

- 请求体、请求头和 provider 提示增强的纯函数。
- 重试判定与延迟计算状态机。
- 附件上传协调。
- SQLite run ledger 查询、恢复和取消协调。

以下共享状态暂时保留在 facade 内统一协调：active run、generation、abort controller、
canvas lease 和 chat 生命周期。只有出现清晰的所有权边界时才继续拆 Hook。

验收条件：

- 首次发送、重试、取消、恢复、附件上传和工具调用行为不变。
- 提取模块可以不挂载 React 组件直接测试。
- 不增加并行 run、重复提交或陈旧回调。

### 6.2 Rust `app_bundle`

建议按以下职责拆分：

- `app_bundle/mod.rs`：公开编排入口。
- `manifest.rs`：清单读取与校验。
- `signature.rs`：签名验证。
- `downloader.rs`：下载、并发和校验。
- `installer.rs`：staging、切换和回滚。

现有 `app_bundle_protocol.rs` 已承担协议职责，应复用而不是重复创建。

拆分必须保持：

- 签名校验和路径安全规则。
- 当前下载并发上限。
- staging 清理。
- current/previous 切换与回滚语义。
- 现有 Rust 测试和应用包 smoke 测试。

## 7. Phase 5：工程卫生

### 7.1 格式化与源码规则

- 选用实施时的稳定版 Biome，并以该版本官方 schema 为准，不固定复制旧版配置。
- 先在小范围试运行，统计现有告警和格式差异，再确定首批规则。
- 增加独立的 `format`、`format:check` 和源码规则检查脚本。
- 保留现有 TypeScript 未使用检查和 `dependencies:check`；`quality:check` 仍为统一入口。
- 首次全量格式化使用独立提交，避免与行为修改混合。
- CI 是最终门禁，本地 hook 只作为反馈加速器。

### 7.2 依赖分类

不能仅根据 `dependencies` 为空就批量移动包。每个候选依赖都应回答：

1. 仅在构建时使用，还是运行时由 Node/Tauri sidecar 加载？
2. 打包器是否内联它？
3. 从干净环境构建和安装后是否仍可运行？

只有通过 renderer build、Tauri build 和安装包 smoke 测试后才调整分类。本阶段不包含
TypeScript 降级，也不把根 `tsconfig` 改成与当前多项目脚本冲突的聚合配置。

### 7.3 局部去重

- 只提取至少出现三次、语义完全一致、且已有测试的逻辑。
- 优先放回所属领域模块，例如布局数值工具或消息格式工具。
- 不创建无边界的 `utils.ts`，不为了减少几行代码跨包耦合。

## 8. 暂不立项的建议

以下事项目前缺少代码事实、复现步骤或测量数据，不应进入实施排期：

- XML 解析性能优化：先用真实大文件建立 CPU、内存和耗时基线。
- Fusion UI 引入弹簧动画：先稳定复现布局跳变并定位候选位置切换原因。
- 扩展几何 IR：只由真实产品缺口驱动，不能把已有字符串命令路径误判为失败回退。
- 继续按文件行数拆分 Workspace 或 native-chat：两者已经有子 Hook/端口/编排层。
- “存在内存泄漏”类整改：必须先提供 heap、监听器数量或可重复增长证据。
- TypeScript 降级和根配置重写：当前没有兼容性故障证据，且 CI 已使用冻结 lockfile。

## 9. 验证门禁

每个阶段至少运行与变更相关的目标测试，并在合入前运行：

```bash
bun run quality:check
bun test tests
cargo fmt --manifest-path src-tauri/Cargo.toml -- --check
cargo clippy --manifest-path src-tauri/Cargo.toml --all-targets -- -D warnings
cargo test --manifest-path src-tauri/Cargo.toml
git diff --check
```

按变更范围追加：

- 渲染端或消息契约：`bun run tauri:renderer:build`、会话 round-trip 测试。
- 应用包：构建、安装、升级、回滚和损坏包 smoke 测试。
- 生命周期变更：桌面 E2E、StrictMode/HMR 和 sidecar 崩溃恢复测试。
- 性能类改动：提交前后使用同一数据集、同一设备和同一采样方法对比。
- 数据库 schema：fresh baseline、幂等、事务回滚和未知历史拒绝测试。

## 10. 推荐实施顺序

1. C-01：会话消息契约与 round-trip 基线。
2. S-01：GeoGebra 显式依赖注入。
3. R-01：sidecar 运行期退出感知。
4. R-02：跨进程关联日志。
5. M-01：`useAgentRunChat` 纯逻辑和适配器提取。
6. M-02：Rust 应用包职责拆分。
7. G-01：Biome 试运行与工程门禁接入。
8. G-02/G-03：依赖分类和小范围去重。

每一项使用独立、可回滚的提交或 PR；前一项验收通过后再进入依赖它的下一项。未经基线验证的
性能、稳定性或维护性数字不得作为完成标准。
