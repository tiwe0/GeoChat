# GeoChat 架构与代码质量全面优化计划

状态：已完成；Phase 0–5 均已通过本地实现与验证门禁
最后更新：2026-09-29
Owner area：Desktop architecture / backend platform / renderer state
适用范围：`/Users/ivory/Project/GeoChat` 当前 Tauri + React + Bun + SQLite 桌面项目
不适用范围：兄弟仓库 `GeoChatDesktop`、官网视觉改版、未明确授权的线上发布
停止条件：所有阶段性验收项有实现与自动化证据；完整类型、测试、Rust、安装包 smoke 门禁通过；无法本地证明的签名、公证、真实 provider 和真实桌面视觉验收被明确列为外部证据缺口。

## 0. 执行状态

| 阶段 | 状态 | 当前证据边界 |
| --- | --- | --- |
| Phase 0：安全边界 | 已完成 | loopback API 鉴权、严格 CORS、CSP/provider 响应边界已有回归测试 |
| Phase 1：凭据与配置 | 已完成 | 原生凭据库、dev/prod 命名空间隔离、事务式 `renderer-state.json` 配置存储已落地 |
| Phase 2：数据一致性 | 已完成 | backend/SQLite 会话与 GeoGebra 文档权威、画布事务、WebView 持久化和历史迁移运行面已删除 |
| Phase 3：状态所有权 | 已完成 | session controller、run lease、assistant workspace 拆分及行为回归已落地 |
| Phase 4：后端与契约 | 已完成 | native chat 最小端口、lifecycle/transport/persistence 拆分、共享 contract facade 与版本化 SQLite migration 已落地 |
| Phase 5：质量与发布 | 已完成 | 严格静态门禁、结构化日志、package CI、真实桌面重启 E2E、`.app`/DMG smoke 已闭环 |

本表只描述当前执行状态，不替代下文各阶段的验收标准。每次状态变化必须由新鲜验证结果支撑。

## 1. 执行摘要

GeoChat 已经具备可工作的桌面产品骨架：Tauri 负责桌面生命周期与系统能力，React renderer 负责交互，Bun sidecar 负责 Agent、HTTP 和 SQLite，共享包承载跨边界契约。当前最需要解决的不是“再做一轮目录整理”，而是收敛安全边界、状态所有权、数据权威源和验证可信度。

本计划按以下顺序推进：

1. 先收敛当前 assistant-ui / Fusion 迁移，禁止在同一脏工作树交错实施架构 PR。
2. 再封闭本机 HTTP、密钥和网络资源边界。
3. 然后解决会话与画布的一致性，消除已经可复现的数据丢失和半恢复状态。
4. 接着收敛前后端关键流程的状态所有权与依赖端口。
5. 最后补齐静态质量门、真实 UI 行为测试和安装包验收。

总原则：

```text
Correctness before decomposition.
One authority per state.
Explicit ports at process boundaries.
Behavioral proof before release proof.
```

## 2. 当前基线与证据边界

### 2.1 实施前工作树基线（历史记录）

当前工作树包含尚未提交的 assistant-ui / Fusion Mode 迁移。该迁移已经删除多条旧消息、composer 和滚动实现，但 `AssistantPanel` 仍承担大部分应用编排职责。本计划把这批改动视为进行中的迁移，不要求回退，也不把临时删除或未跟踪文件误判为仓库长期缺陷。

执行约束：架构优化 PR 不得与这批改动在同一工作树交错推进。实施前必须二选一：

1. 先按 `docs/internal/assistant-ui-migration-plan.md` 完成、验证并提交当前迁移，再从其已知提交继续。
2. 若安全修复必须并行，基于干净、已记录的提交创建隔离 worktree；安全分支不得复制或选择性携带当前未提交 UI 改动。

无论选择哪条路径，都要在首个实施 PR 记录 base commit、工作树状态和采用的迁移策略。不得在当前脏工作树直接穿插下文 PR 1–5。

### 2.2 实施前已通过的本地门禁（历史记录）

- `bun run typecheck`
- `bun test tests --max-concurrency=1`：609 pass，0 fail
- `cargo check --manifest-path src-tauri/Cargo.toml`
- `cargo fmt --manifest-path src-tauri/Cargo.toml -- --check`
- `cargo test --manifest-path src-tauri/Cargo.toml`：38 pass，0 fail
- `bun run benchmark:validate`
- `git diff --check`

这些结果只代表实施前基线，证明当时代码可通过既有类型、单元和局部集成门禁，但不证明：

- 本机 backend 已正确鉴权。
- 真实 Tauri UI、GeoGebra、sidecar 和 renderer 的完整用户路径可用。
- macOS/Windows 安装包启动与资源布局正确。
- 安装包已签名、公证或具备安全更新链。
- UI 交互、焦点、滚动、portal 和动画行为已被真实运行测试覆盖。

### 2.3 审计结论摘要

| 领域 | 当前判断 | 主要证据 |
| --- | --- | --- |
| 本机 HTTP 安全 | 高风险 | backend token 未接入生产 handler，CORS 反射任意 origin |
| Provider 密钥 | 高风险 | API key 明文进入 localStorage，Tauri CSP 关闭 |
| 会话一致性 | 高风险 | SQLite 与 localStorage 双权威，缓存读回丢 metadata |
| 画布恢复 | 高风险 | 会话切换回放非原子，失败可留下部分新画布 |
| 前端编排 | 中高风险 | `AssistantPanel` 同时拥有会话、模型、窗口、Fusion 等状态 |
| 后端编排 | 中风险 | `native-chat.ts` 同时承担领域生命周期、持久化与 SSE 协议 |
| Schema 管理 | 中风险 | Drizzle schema 与手写启动 DDL 双重维护 |
| 测试可信度 | 中高风险 | 后端测试扎实，UI 大量依赖源码字符串断言 |
| 发布可信度 | 中高风险 | 已有 packaged smoke 未接入平台 package job |
| 基础代码卫生 | 中风险 | 缺 lint/unused/coverage/Clippy 门禁，日志行号大量失真 |

## 3. 目标架构

### 3.1 目标边界

```text
┌──────────────────────────────────────────────────────────────┐
│ Tauri shell                                                  │
│ lifecycle · window · OS keychain · signed runtime authority │
└──────────────┬──────────────────────────────┬────────────────┘
               │ typed commands               │ process env
               ▼                              ▼
┌───────────────────────────────┐  ┌───────────────────────────┐
│ React renderer                │  │ Bun backend               │
│ view composition             │  │ authenticated loopback API│
│ session controller           │  │ agent application services│
│ canvas transaction adapter   │  │ repositories / SQLite     │
└──────────────┬────────────────┘  └──────────────┬────────────┘
               │                                  │
               └──────── typed contracts ─────────┘
                         @geochat-ai/app
```

### 3.2 状态所有权

| 状态 | 唯一权威源 | 可有的派生/缓存 | 禁止事项 |
| --- | --- | --- | --- |
| 已提交会话与消息 | SQLite/backend repository | renderer 只读快照、带 revision 的短期缓存 | 以 localStorage 写入时间覆盖 backend |
| 未提交 composer 草稿 | assistant-ui runtime | 可持久化草稿缓存 | 与已提交消息混在同一 localStorage 记录 |
| 当前会话选择 | renderer session controller | URL/UI 投影 | `PanelChatState`、React state、runtime 各自维护副本 |
| Agent run 生命周期 | backend agent-run service | renderer 状态投影 | renderer 猜测服务端最终状态 |
| GeoGebra 画布 | GeoGebra runtime | 切换事务快照 | 回放一半后保留部分结果 |
| Provider 密钥 | Tauri/OS secret store | renderer 仅持 credential reference | 明文写入 localStorage、日志或持久化 ledger |
| 桌面非敏感配置 | versioned desktop config | renderer 内存快照 | 任一字段损坏导致全量静默重置 |

### 3.3 依赖方向

允许：

```text
renderer ───────► @geochat-ai/app ◄────── backend
   │                                          │
   ▼                                          ▼
desktop bridge                           repository ports
   │                                          │
   ▼                                          ▼
Tauri commands                              SQLite
```

禁止：

- renderer 直接 import backend 源码。
- backend 依赖 renderer 类型或组件。
- 共享包读取 localStorage、文件系统、数据库或 Tauri 全局对象。
- 领域服务依赖完整 HTTP context，只因为其中包含所需 repository。
- UI feature 通过模块级可变单例互相同步状态。

## 4. 工作流 A：本机 HTTP 与密钥边界

优先级：P0（A3 必须直接切换到新凭据边界，不保留历史凭据迁移运行面；架构决策与 CSP 不得后置）
目标：在继续扩大 Agent、技能和远程 provider 能力前，先让桌面本机服务真正具备最小可信边界。

### A1. 接通 backend token

现状：

- Tauri 创建 `local_backend_auth_token`。
- renderer 可从 `get_runtime_info` 获得 token。
- `start_backend` 未把 token 注入 Bun sidecar。
- backend 默认 `authenticatedDataScope` 不验证请求，直接返回离线 owner scope。

要求：

1. Tauri 启动 backend 时注入 `GEOCHAT_DESKTOP_BACKEND_AUTH_TOKEN`。
2. backend 启动时读取并保存在不可变 runtime config 中。
3. 在顶层 router、进入具体 route handler 前统一鉴权；默认策略是拒绝，不能继续依赖各 route 主动调用 `authenticatedDataScope`。
4. 维护可测试的 `method + path pattern + access class` 路由矩阵。唯一公开例外是 `GET /health` 与 GeoGebra 静态资源的 `GET/HEAD`；`OPTIONS` 仅在 CORS 校验通过后返回。`/v1/skills`、`/v1/provider-fetch`、题库导入及全部读写 API 均属于 authenticated。
5. token 比较使用固定时间比较，错误响应不泄露 token 是否存在、长度或来源。
6. browser-only dev 模式必须显式开启，不得通过“缺少 token”隐式降级为开放服务。
7. desktop MCP 继续使用同一 backend token，但不得把 token 写入日志或工具输出。
8. `runtime info → renderer client → Authorization header` 使用共享 runtime schema；缺字段、字段类型错误和未授权三类失败有稳定错误码。

Phase 0 路由矩阵基线：

| Method | Path pattern | Access class | 说明 |
| --- | --- | --- | --- |
| `GET` | `/health` | public | 只返回最小健康状态，不暴露路径、token 或用户数据 |
| `GET/HEAD` | `/tools/geogebra-assets/**`、`/tools/geogebra-assets-v2/**` | public asset | 仅允许经过路径穿越校验的只读打包资源 |
| `OPTIONS` | 已登记 route | cors-preflight | 先校验 origin、method、headers；拒绝 origin 不返回允许头 |
| all supported | `/v1/**` | authenticated | 在业务 handler 前统一 Bearer 校验，包括 skills、provider、migration、benchmark 与全部读接口 |
| any | 未登记 path/method | not-routable | 不进入业务 handler；返回不含内部细节的 404/405 |

实现时 route catalog 是 router 的输入和测试源，不允许维护一份只用于文档、与实际分派分离的手工白名单。

验收：

- 无 token、错误 token、正确 token 分别得到 401、401、业务响应。
- 路由矩阵测试逐项证明所有非公开路由均在进入 handler 前被拒绝；新增路由若未登记 access class，测试必须失败。
- `/v1/conversations`、`/v1/chat`、`/v1/skills`、provider proxy、题库导入和删除接口均有无 token/错误 token/正确 token 测试。
- Tauri runtime info 返回的 token 能访问 backend；随机 token 不能访问。
- 进程列表、普通日志和持久化数据库不出现 token。

### A2. 收紧 CORS 与 Origin

要求：

1. 不再反射任意 `Origin`。
2. 生产桌面模式只允许已知 Tauri origin/custom protocol；无浏览器 origin 的受信客户端依赖 Bearer token，而不是 `*`。
3. 实施前用 macOS、Windows 的 dev 与 package smoke 记录 WebView 实际 `Origin`。候选值 `http://127.0.0.1:1421`、`http://localhost:1421`、`tauri://localhost`、`https://tauri.localhost`、`geochat-bundle://localhost` 不得凭猜测全部放行，只把实测需要的值加入对应 profile。
4. dev origin 使用显式 allowlist 配置，production/dev/browser-only 三套 profile 分离。
5. `Access-Control-Allow-Headers` 使用固定 allowlist。
6. 未允许 origin 的预检与实际请求都必须失败。

验收：

- 恶意网页 origin 无法读取 `/v1/conversations`。
- 被拒绝 origin 即使携带格式正确但错误的 token 也不能得到差异化信息。
- CORS 单元测试覆盖无 origin、允许 origin、拒绝 origin和预检。

### A3. 移出 provider 密钥

选定架构：Tauri 是凭据唯一所有者，Bun backend 通过进程内不可见于 renderer 的本机 credential broker 按引用兑换，renderer 永远不读取明文密钥。

固定实现选型：生产 Rust adapter 使用 `keyring` 4.x 的 `v1` API，并在 `Cargo.lock` 固定解析版本；macOS 后端为 Keychain Services，Windows 后端为 Windows Credential Manager。业务逻辑只依赖仓库自定义 `CredentialStore` port，单元测试注入内存 fake；不能把 `keyring-core` mock 与 `keyring::v1` 默认 store 混用。真实 Keychain/Credential Manager 只在对应平台 integration smoke 中验证，并使用专用 service/account 前缀后清理。当前桌面发布只覆盖 macOS/Windows，因此本阶段不引入 Stronghold，也不新增 Linux secret-store 分支；若以后恢复 Linux 发布支持，另立平台存储决策。参考：[keyring 4.2 API](https://docs.rs/keyring/4.2.0/keyring/)、[`v1` 平台后端](https://docs.rs/keyring/4.2.0/keyring/v1/)。

要求：

1. 定义 `CredentialStore` port（put/get/delete/exists）；生产 Tauri adapter 封装 `keyring::v1::Entry`，单元测试 adapter 是仓库内存 fake。production service 固定为 `cafe.ivory.geochat.provider`，account 使用随机 UUID `credentialRef`，不得把 provider 名或 key 片段编码进 reference。
2. renderer 只可调用 write/delete/status 命令；读取命令不注册到 Tauri invoke allowlist。可见配置仅保存 provider、model、用于展示的 base URL 和 `credentialRef`，其中 base URL 不得作为 backend 请求授权依据。
3. keyring entry 保存不可拆分的版本化 envelope：`schemaVersion`、`secret`、`provider`、`protocol`、`canonicalBaseUrl`。`credentialRef` 与 provider/protocol/origin/base path 创建后不可变；替换密钥或 endpoint 必须创建新 reference，禁止用旧 reference 指向新目的地。
4. endpoint canonicalization 必须拒绝 URL credentials、fragment 与非必要 query，规范化 scheme/host/default port/base path；默认只允许 HTTPS，仅 loopback 开发 provider 可使用 HTTP。旧的远程 HTTP 配置必须失败关闭并要求重新录入，不得静默升级或继续使用。
5. Tauri 启动仅绑定 loopback 的 credential broker，生成独立的每次启动随机 broker token，并把 broker endpoint/token 注入 Bun 子进程环境；不得注入 provider key。
6. Bun `CredentialResolver` 仅接受 `credentialRef`，通过 broker token 兑换到请求作用域内存；broker 返回的可信 envelope 是 provider/protocol/endpoint 的唯一来源，不接受 renderer 覆写 URL、headers 或 provider。密钥不得持久化、记录或返回 renderer。broker 只接受 Bun 子进程所需的 resolve 操作，响应设置禁止缓存，并限制请求体、并发和频率。
7. backend 必须用可信 envelope 构造最终 URL 与鉴权头，所有上游请求设置 `redirect: "error"`，每次发送前重新 resolve，不跨请求缓存 secret。chat 与模型发现 DTO 必须拒绝 legacy `apiKey`、`url`、`headers` 和 `customBaseUrl`；模型发现迁入 backend，renderer 只提交 reference 并接收规范化 model ID。
8. create/replace/delete 由 Tauri command 执行；delete 成功后 reference 立即失效，Bun 不保留跨请求 key cache。若以后为性能引入缓存，必须有短 TTL、显式清零和撤销通知测试。
9. 威胁边界明确为：防止网页 origin、renderer XSS、普通日志/配置/数据库泄露；不声称抵御已取得同用户调试、进程内存读取或操作系统管理员权限的攻击者。
10. 新版本不读取或迁移历史明文凭据。检测到配置内嵌 `apiKey`、`secret`、`token` 或 `authorization` 时必须失败关闭，并要求用户重新录入；不得保留 migration journal、backup 或 legacy import command。
11. production 使用 `cafe.ivory.geochat.provider`，dev 使用独立的 `cafe.ivory.geochat.provider.dev`；两个 profile 的同名 `credentialRef` 必须互不可见、互不可删除。
12. 配置引用更新必须通过串行事务：写入新 secret、验证、持久化新 reference，最后删除旧 secret；配置提交失败时删除未提交的新 secret，且其他设置写入不能复制未提交 reference。
13. 禁止在日志、错误 ledger、migration export 和诊断包中输出密钥。

验收：

- localStorage 和导出的普通桌面配置中不存在 API key。
- 应用重启后可继续使用已保存凭据。
- 删除 provider 凭据后 backend 无法继续调用该 provider。
- renderer 网络请求、React state snapshot、backend 数据库和 broker 日志均不出现明文 key。
- broker 缺 token、错误 token、未知/已删除 reference 均失败；成功响应不会跨请求缓存。
- fixture 覆盖事务写回失败、并发配置更新、Keychain 写入成功但配置提交失败；任何失败都不留下配置可见的悬空 reference。
- 日志脱敏测试覆盖常见 bearer/API key 形态。

### A4. 建立 CSP

要求：

- 为生产 renderer 设置最小 CSP。
- 脚本默认仅允许本地打包资源。
- 网络连接仅允许 loopback backend 和由 provider proxy 代表访问的上游。
- 图片/data URL、字体、GeoGebra worker 等例外必须逐项记录理由。
- dev CSP 与 production CSP 分离。

验收：

- 生产构建不再是 `csp: null`。
- renderer、GeoGebra、字体、markdown 和 assistant-ui 在 CSP 下可用。
- 内联未知脚本和任意远程脚本无法执行。

### A5. Provider 响应有界读取

要求：

1. 在读取响应流时累计字节数，超过上限立即取消 reader/abort 请求。
2. `Content-Length` 可用于提前拒绝，但不能代替流式上限。
3. 超限、超时、连接失败和 provider 非 2xx 状态必须保持不同错误码。

验收：

- 超限测试证明 backend 没有先分配完整响应。
- chunked 响应无 `Content-Length` 时仍能被限制。
- 正常流、临界值和超限值均有测试。

## 5. 工作流 B：会话、缓存与画布一致性

优先级：P0/P1
目标：让一次会话操作具备明确的权威源、版本和失败语义。

### B1. 收敛会话权威源

决策：已提交会话、消息、usage 和工具结果以 SQLite/backend 为唯一权威源。

要求：

- localStorage 不再保存完整已提交会话副本，优先删除双写。
- 如离线启动确实需要缓存，缓存必须携带 backend revision/etag，而不是本地写入时间。
- 草稿、待上传附件和未提交输入使用独立 key 与 schema。
- 新版本不读取、导入或备份历史 WebView 会话缓存；旧迁移模块、journal、quarantine、backup 和 import API 全部删除。
- `localStorage`、`sessionStorage` 仅作为进程内 vendor 兼容层；IndexedDB、Cache Storage、Service Worker 注册和 OPFS 禁用。
- GeoGebra 用户文档通过显式可等待 API 写入 SQLite，不能把同步 Storage 返回当作持久化成功。

验收：

- `metadata.tokenUsage`、tool state、attachments 和 reasoning 状态 round-trip 无损。
- 改模型或标题不会制造“比 backend 更新”的伪版本。
- backend 暂时不可用时，不会用旧缓存静默覆盖更新数据。
- 静态门禁证明生产代码不存在 legacy WebView conversation import 路径。
- SQLite 会话与 GeoGebra 文档 repository 均具备作用域隔离和往返测试。

### B2. 删除语义

推荐语义：backend 删除成功后再清理本地派生缓存；若需要即时 UI，使用可回滚 optimistic state。

验收：

- backend 删除失败时，会话仍能恢复显示。
- 重试删除不会重复破坏状态。
- 删除当前会话与删除后台会话分别有测试。
- 后续若加入离线删除，必须使用 tombstone/revision，而不是仅删除本地记录。

### B3. 原子画布回放

并发模型：所有 canvas mutation 进入单一串行事务队列；事务开始后拥有唯一 mutation lease。新的选择只能先取消排队任务或标记当前事务取消，必须等待当前事务提交/回滚并释放 lease 后才能开始。

要求：

1. 开始切换前保存完整 XML 快照。
2. 清空、perspective、所有命令批次作为一个逻辑事务执行；每个 `await` 前后检查 cancellation 和 lease ownership。
3. 全部成功后才提交当前会话、消息和标题。
4. 事务失败或被 supersede 时，仍持有 lease 的事务先恢复自己的原快照并释放 lease；失去 ownership 的 generation 绝不能再写画布或执行恢复。
5. 新 generation 只能在前一事务完成提交/回滚后获取 lease，因此不存在新回放已开始、旧 generation 又覆盖画布的窗口。
6. 恢复失败进入唯一的 `canvasRecoveryRequired` 状态，冻结后续 mutation，提供重试恢复/导出诊断/重载画布动作；不能仅写 console 或继续下一事务。

验收：

- 第二批命令失败后画布完全回到切换前状态。
- 快速连续选择 A/B/C 时，A/B 在 C 开始前完成取消与回滚；只有当前 lease owner 能提交或恢复，最终只能提交 C。
- 文本会话不清空现有画布。
- restore XML 不可用时有明确降级和用户提示。

### B4. 配置恢复

要求：

- 桌面配置使用带版本的 runtime schema。
- 采用字段级容错，而不是任一 JSON 错误导致整份配置重置。
- 原生 JSON 文件使用跨进程锁、临时文件、文件同步、原子替换和父目录同步。
- 损坏主文件隔离到独立文件；存在有效 `.previous` 时恢复最近一次已同步版本，否则失败关闭到默认配置。
- renderer 启动失败必须展示可重试、可打开日志目录的 React 错误界面，不回退到 WebView 存储。

验收：

- 单一字段损坏不丢失其他 provider、locale、interaction 设置。
- 无效版本和截断 JSON 有确定性行为。
- 配置写入失败时不会发布未提交快照，后续事务仍可从最近一次已提交值继续。

## 6. 工作流 C：前端状态与模块边界

优先级：P1
目标：把 `AssistantPanel` 从应用控制器降为 composition root，同时保持当前 assistant-ui 迁移的不变量。

### C1. 先完成当前 assistant-ui 迁移

必须保持 `docs/internal/assistant-ui-migration-plan.md` 中的不变量：

- `UIMessage<ChatMessageMetadata>` 仍是 transport/persistence message source。
- 一次提交只创建一次 native run，一次 renderer tool call 只执行一次。
- window、fusion 和 transcript 共享一个 assistant runtime。
- fusion 空间导航保留自身 height-window owner，不引入第二个滚动 owner。
- 删除旧路径必须在行为等价验证后进行。

本阶段禁止把安全、数据同步和大规模目录移动混入同一提交。

### C2. 引入 session controller

建议端口：

```ts
type SessionController = {
  snapshot(): SessionSnapshot;
  newConversation(): Promise<void>;
  selectConversation(id: string): Promise<void>;
  deleteConversation(id: string): Promise<void>;
  submit(input: AssistantSubmission): Promise<SubmissionResult>;
  retry(): Promise<SubmissionResult>;
  stop(): Promise<void>;
};
```

controller 统一拥有：

- 当前 conversation ID/title/revision。
- 当前 model/thinking snapshot。
- select/replay generation。
- native run 恢复与终结协调。
- assistant runtime 消息投影。

UI 仅订阅 snapshot 并发送 intent。不得让 `PanelChatState`、React state 和 assistant runtime 分别维护可变的 conversation/model 副本。

### C3. 拆分 `AssistantPanel`

按职责拆分，而不是按 JSX 长度拆分：

1. `AssistantWorkspaceController`：会话、运行和模型状态。
2. `AssistantWindowShell`：拖放、尺寸、折叠、上下文菜单。
3. `AssistantWindowSurface`：window 模式组合。
4. `FusionAssistantSurface`：fusion 模式组合与 panel projection。
5. `AssistantOverlays`：history、blackboard、problem bank、settings。
6. `useOnboardingState`：onboarding 版本与完成状态。

目标不是强制每个文件低于固定行数，而是让每个模块只有一个变化理由。

验收：

- new/select/delete/restore/submit 状态转移只在一个 controller 中实现。
- window 和 fusion 不再各自同步 conversation/model 状态。
- `AssistantPanel` 主要负责依赖装配和 surface 选择。
- 模式切换不重建 runtime，不丢消息、草稿、附件或 active run。

### C4. 模型与凭据配置边界

- model catalog、provider capability 和可见配置保留在 renderer models 模块。
- credential reference 的读取通过 secret port，不由组件直接读取 localStorage。
- 请求时形成不可变 `RunModelSnapshot`，run 开始后不受 UI 后续改动影响。

## 7. 工作流 D：后端 Agent 应用服务

优先级：P1/P2
目标：将 `native-chat.ts` 从“HTTP + Agent + persistence 全能模块”拆成可独立测试的应用端口。

### D1. 收窄依赖

定义最小 `NativeChatDependencies`，仅包含实际需要的能力，例如：

```ts
type NativeChatDependencies = {
  runs: AgentRunStore;
  conversations: ConversationStore;
  blackboard: BlackboardStore;
  tools: BackendToolExecutor;
  skills: SkillRuntime;
  clock: Clock;
  ids: IdGenerator;
};
```

禁止 Agent service 接收完整 `BackendHttpContext`。

验收：

- 单元测试不再使用 `as unknown as BackendHttpContext`。
- 测试只构造被用到的 ports。
- HTTP route 负责 request/response，应用服务负责 run 生命周期。

### D2. 拆分生命周期与 transport

建议模块：

- `native-chat-request.ts`：输入验证与不可变 run request。
- `agent-run-lifecycle.ts`：创建、lease/CAS、取消、终结。
- `agent-tool-orchestrator.ts`：backend/renderer tool coordination。
- `agent-run-persistence.ts`：消息、ledger、error event 串行写入。
- `ai-sdk-sse-transport.ts`：SSE gate、terminal event 和响应编码。

验收：

- run 状态机有显式状态转换表。
- terminal write 幂等且 stale revision 无法覆盖 terminal state。
- SSE 断流、客户端取消、provider 失败和 persistence 失败分别有测试。

### D3. 消除 import-time 数据库副作用

现状：导入 `backend/src/http/context.ts` 会立即创建数据库，导入 `backend/src/http.ts` 会立即创建默认 handler。

要求：

- entrypoint 显式执行 `createBackendHttpContext()`。
- 纯模块导入不创建目录、打开 SQLite 或执行 migration。
- backend shutdown 具备显式 database close 生命周期。

验收：

- import 单元测试不会创建 `data/geochat-desktop.sqlite`。
- harness 不会隐式创建第二个数据库连接。
- sidecar 退出时数据库和活动任务有确定性清理。

## 8. 工作流 E：共享包、契约与数据库 Schema

优先级：P2
目标：保留共享包的正确依赖方向，同时减少宽 barrel 和双重 schema 维护。

### E1. 共享包出口

要求：

- 按领域维护稳定 subpath exports：contracts、agent-run、functioncalls、geometry、models、problem-bank、migration。
- 根 `@geochat-ai/app` 仅保留高频稳定 API；新增代码优先从明确 subpath 导入。
- 生成的大型 GeoGebra command reference 保持 opaque，不进入人工复杂度统计。
- 禁止导出内部 registry 可变对象；所有公开 snapshot 返回隔离副本。

验收：

- export policy 测试覆盖 public/internal/generated 三类。
- backend/renderer 不直接 import `packages/app/src/*`。
- 公共出口无循环依赖，renderer chunk safety 继续通过。

### E2. 跨边界 runtime schema

- 关键请求/响应不能只共享 TypeScript type，必须共享 runtime schema 或显式解析器。
- route 不再重复手写与共享 contract 平行的验证逻辑。
- schema decode 错误统一生成稳定错误码，不输出敏感 payload。
- 本项整体属于 P2，但 `runtime info / auth` schema 是 A1 的组成部分，提升为 Phase 0/P0，不得等到通用 contract 整理阶段。

优先迁移：

1. backend runtime info / auth。
2. conversation message upsert/restore。
3. native chat request。
4. provider proxy request/response。
5. migration package。

### E3. SQLite schema 单一来源

现状：17 张 Drizzle 表与 `client.ts` 手写 `CREATE TABLE` 同时维护。

目标：

- 新 schema 变更通过版本化 migration 文件执行。
- Drizzle schema 是查询/类型源；migration 是历史变更源。
- 启动路径只运行 migration runner，不再复制整套最新 DDL。
- `ensureColumn` 仅作为受控旧版本迁移，不作为长期 schema 管理策略。

验收：

- 空数据库迁移到最新版本后与 Drizzle schema 一致。
- 选定的旧版本 fixture 可逐级升级。
- migration 可重复执行且失败保持原数据库可恢复。
- schema parity 测试比较表、列、索引和关键约束。

## 9. 工作流 F：代码卫生与可观测性

优先级：P2
目标：让问题在提交时被机器发现，而不是在大文件审查时靠人肉扫描。

### F1. 最小静态门禁

推荐先使用现有 TypeScript/生态能力，避免一次引入多套重型工具：

1. 增加 lint 命令，覆盖 backend、renderer、shared、tools 和 scripts。
2. 开启 unused import/variable/parameter 检查，并定义少量有理由的例外。
3. Rust CI 增加 `cargo fmt --check` 与 `cargo clippy --all-targets -- -D warnings`。
4. 增加 unused dependency 检查；先清理无源码引用的 `canvas-confetti` 及类型包。
5. `tsconfig.node.json` 纳入实际 `vite.react.config.ts`，删除已不存在的旧配置名。

验收：

- 本地和 CI 使用同一命令。
- 新 warning 不能在 CI 中被静默忽略。
- generated/vendor/fixtures 使用显式排除，而不是全局放宽规则。

### F2. 结构化日志

问题：全仓存在大量 `Caught exception at path:line`，重构后行号已经失真；预期解析失败也会污染测试输出。

要求：

- 日志字段至少包含 `module`、`event`、`severity`、`errorCode` 和必要关联 ID。
- 禁止手写源码行号。
- 预期用户输入验证失败返回结果，不记录 ERROR stack。
- 可注入 logger，使测试能断言事件并静默预期错误。
- 所有日志经过统一敏感信息脱敏。

验收：

- 正常 609-test run 不再充斥预期失败堆栈。
- runId、conversationId、toolCallId 可关联一次 Agent 故障。
- token、API key、cookie、Authorization 不进入日志。

### F3. 目录与文档卫生

- 删除跟踪的 `.DS_Store` 等平台垃圾；保持 ignore 规则。
- 过期架构文档必须标记 archived 或刷新，避免仍描述 SolidJS/旧 Vite 配置。
- 内部计划使用 `status`、`last refreshed`、`owner area` 和 stop condition。
- 自动生成文件顶部写明生成源和校验命令。

## 10. 工作流 G：测试策略

优先级：P1/P2
目标：降低“测试数量多但关键行为仍不可证明”的风险。

### G1. 测试金字塔

| 层级 | 目标 | 主要内容 |
| --- | --- | --- |
| 纯函数/契约 | 快、确定 | schema、policy、normalization、state reducer |
| 服务集成 | 真实边界 | SQLite、HTTP handler、provider fake、migration |
| React 行为 | 用户交互 | render、click、keyboard、focus、scroll、portal |
| 桌面 E2E | 核心路径 | Tauri launch、sidecar、GeoGebra、持久化、重启 |
| 安装包验收 | 发布证据 | packaged resources、backend health、真实启动 |

### G2. 减少源码字符串测试

源码/结构测试仅保留以下用途：

- 禁止依赖或禁止 import 边界。
- 生成物/出口/配置文件静态契约。
- 防止被明确删除的旧模块回归。

以下行为必须使用渲染或 E2E 测试：

- composer 键盘历史。
- window/fusion 模式切换。
- focus restore、drawer/portal、滚动 owner。
- stop/retry/submitted/error 状态。
- attachment 生命周期。
- onboarding 和 reduced-motion 行为。

迁移顺序：优先替换当前 assistant-ui 改动直接相关的高风险字符串测试，不要求一次删除全部 53 个相关测试文件。

### G3. 必须新增的回归用例

1. backend token：无 token/错误 token/正确 token。
2. CORS：恶意 origin 无法读取会话。
3. local cache：metadata/usage round-trip 或移除完整消息缓存。
4. 删除失败：本地会话不会永久消失。
5. 画布切换：中途失败恢复原 XML。
6. 并发选择：旧 generation 无法覆盖新选择。
7. provider response：chunked 超限提前 abort。
8. config corruption：字段级恢复和 quarantine。
9. session controller：显式状态转移表。
10. packaged backend：安装包资源内 runtime 启动并通过 health/auth。

### G4. 覆盖率策略

覆盖率不是单独 KPI，但应用于关键模块的分支缺口发现：

- auth/CORS。
- session controller/replay transaction。
- native run lifecycle。
- migration runner。
- update/install rollback。

不得用全仓单一百分比替代上述场景验收。

## 11. 工作流 H：CI、打包与发布

优先级：P1/P2
目标：把“编译成功”升级为“产物可启动且边界明确”。

### H1. CI 门禁顺序

```text
install frozen
  → format/lint/typecheck/clippy
  → unit/integration tests
  → benchmark validation
  → renderer/backend build
  → platform package
  → packaged layout smoke
  → packaged backend auth/health smoke
  → GUI smoke where supported
  → artifact manifest/hash
  → publish
```

### H2. 冻结依赖

- 保留现有 `bun.lock`，清理遗留 workspace 条目，使其与当前 workspace 和各级 `package.json` 一致；不得重新生成后丢失当前迁移需要的依赖锁定。
- CI 使用 frozen install；`--no-save` 不能作为可复现安装的替代。
- assistant-ui 引起的依赖与 lockfile 更新保留在迁移 PR；其后的遗留条目清理作为独立提交，不与业务重构混合。

验收：

- 干净 checkout 执行 `bun install --frozen-lockfile` 通过且 `git status --short` 不产生 lockfile 变化。
- package.json 与 lockfile 漂移会在 CI 早期失败。

### H3. 接入现有 package smoke

- Windows/macOS package job 构建后运行 `tauri:package:smoke`。
- 在可执行平台运行 `package:backend-smoke`，并验证 auth 而不仅是 `/health`。
- smoke 通过后才上传 artifact。
- release job 只消费已通过 smoke 的 artifact。

### H4. 最小桌面 E2E

至少建立一条发布前 happy path：

```text
launch app
→ backend ready
→ GeoGebra ready
→ submit prompt with fake/local provider
→ one renderer tool updates canvas
→ conversation persists
→ restart app
→ conversation and canvas can be restored
```

真实 provider 调用不应成为 CI 必需条件；使用确定性本地 fake。

### H5. 发布边界声明

在签名、公证和 updater artifacts 未实现前，发布报告必须明确：

- 本地构建/测试通过不等于平台安装接受。
- artifact 上传不等于签名或公证。
- `createUpdaterArtifacts: false` 意味着没有可验证的自动更新链。
- macOS、Windows 结论分别以各平台产物验证为准。

## 12. 分阶段落地计划

### Phase -1：建立可实施基线

预计范围：当前 assistant-ui 迁移收尾，或一个独立安全 worktree 的基线记录；不新增架构行为。

任务：

- 按 2.1 的二选一策略隔离工作树。
- 若走顺序路线，完成 C1 的现有迁移 stop condition、行为测试与提交。
- 若走并行安全路线，从干净 base commit 创建隔离 worktree，并记录与 UI 迁移的后续合并顺序。
- 保存 typecheck、现有测试、Rust check/test 和 benchmark 基线。

退出条件：实施分支不包含来源不明的未提交改动；每个后续 PR 都有明确 base commit，UI 迁移与安全/数据 PR 不在同一脏工作树交错。

### Phase 0：冻结风险面

预计范围：2–4 个小型 PR。

任务：

- A1 backend token、顶层默认拒绝和完整路由 access matrix。
- E2 的 runtime info/auth schema 子集。
- A2 实测各平台 WebView Origin 后建立分 profile allowlist。
- A4 production/dev CSP 基线；先覆盖现有打包资源、GeoGebra 与 loopback backend，不等待 UI 大重构。
- A5 provider 有界读取。
- 对应回归测试。

退出条件：除明确公开矩阵外所有路由默认鉴权；任意网页不能读取本机会话；production CSP 非空；超限 provider 响应不会先完整进入内存。

### Integration Gate I：汇合 UI 与安全基线

本门禁不是可跳过的文档检查，而是后续配置、会话和画布改动的共同提交基线。

若 Phase -1 采用顺序路线，只需确认 assistant-ui 迁移提交已经包含 Phase 0 的安全提交，并记录汇合 commit。若采用隔离安全 worktree，则必须：

1. 先完成并提交 assistant-ui / Fusion 迁移。
2. 创建临时 integration branch，以 assistant-ui 完成提交为基线，按 PR 1（auth）→ PR 2（CORS/CSP）→ PR 3（bounded response）的顺序 merge/cherry-pick 安全提交；不得把整棵脏工作树复制过来。
3. 显式解决 `AssistantPanel`、GeoGebra controller、desktop config、Tauri runtime/config 和 lockfile 冲突；lockfile 以 package manifest 重新 frozen install 验证，不手工拼接。
4. 重新执行 assistant-ui migration plan 的 runtime、single-run、single-tool-call、scroll owner、window/fusion 状态保留测试，以及 Phase 0 的 auth/CORS/CSP/provider 回归测试。
5. 将通过测试的 integration commit 记为后续 PR 的唯一 base；原 UI 与安全分支停止继续接收功能提交。

退出条件：存在一个同时满足 C1 不变量与 Phase 0 安全门禁的已知 integration commit。没有该 commit，不得开始 A3 renderer 配置迁移、B1/B3 或 C2。

### Phase 1：移出 provider 密钥

预计范围：2–3 个 PR。

任务：

- 实现 A3 的 Tauri credential store 与 backend-only credential broker。
- 将 renderer/provider 配置改为 `credentialRef`。
- 删除明文凭据迁移入口，并补充失败关闭、事务提交和日志脱敏测试。

退出条件：明文 provider key 不再持久化或跨 renderer/backend HTTP 传递；删除凭据后 reference 立即失效；历史明文配置被拒绝且不会进入兼容迁移流程。

### Phase 2：修复一致性

预计范围：2–4 个 PR。

任务：

- B1 会话唯一权威源。
- B2 删除失败语义。
- B3 原子画布回放。
- B4 配置恢复。

退出条件：会话数据无损、删除可恢复、切换失败不污染画布。

### Phase 3：收敛前端控制面

预计范围：3–6 个 PR。

任务：

- 确认 Integration Gate I 的 assistant-ui migration stop condition 持续成立。
- C2 session controller。
- C3 拆分 AssistantPanel。
- G2 替换关键 UI 字符串测试。

退出条件：会话状态转移只有一个实现，window/fusion 共享 runtime 且真实交互测试通过。

### Phase 4：后端与数据层边界

预计范围：3–5 个 PR。

任务：

- D1 最小依赖端口。
- D2 Agent lifecycle/transport 拆分。
- D3 移除 import-time DB 副作用。
- E2 除 auth 外的 runtime contract。
- E3 versioned migrations。

退出条件：Agent service 不依赖完整 HTTP context，数据库升级路径可验证。

### Phase 5：工程门禁与发布证据

预计范围：2–4 个 PR。

任务：

- F1 lint/unused/clippy。
- F2 结构化日志。
- H2 frozen install。
- H3 package smoke。
- H4 最小桌面 E2E。

退出条件：干净 checkout 到已验证安装包形成可重复流水线。

## 13. PR 切分原则

每个 PR 应满足：

- 只解决一个边界或一个状态所有权问题。
- 先增加能失败的回归测试，再修改实现。
- 不在同一 PR 同时做目录搬迁、格式化和行为修改。
- 删除旧路径时给出全仓引用证明。
- 描述本地证据与未验证的真实平台证据。
- 涉及 persistence/schema 时提供升级和回滚说明。
- 涉及 UI 状态时同时验证视觉顺序与键盘焦点顺序。

推荐 PR 序列：

| 顺序 | PR 主题 | 主要依赖 |
| --- | --- | --- |
| B0 | assistant-ui migration completion，或隔离 safety worktree 基线 | 必须先完成，不与下列 PR 混入同一脏工作树 |
| 1 | backend auth route matrix + runtime auth schema | B0 |
| 2 | verified CORS profiles + CSP baseline | B0、PR 1 |
| 3 | provider bounded response | B0 |
| G1 | Integration Gate I 汇合提交 | assistant-ui 完成提交、PR 1–3；这是门禁，不是可并行功能 PR |
| 4 | Tauri `keyring` credential store + backend broker | G1 |
| 5 | renderer credentialRef + transactional config cutover | PR 4、G1 |
| 6 | conversation authority + delete legacy WebView cache paths | G1 |
| 7 | serialized atomic canvas replay | G1；与 PR 6 相邻改动需顺序合并 |
| 8 | session controller | G1、PR 6、7 |
| 9 | AssistantPanel composition split | PR 8 |
| 10 | native chat dependency ports | PR 1 |
| 11 | native lifecycle/transport split | PR 10 |
| 12 | versioned database migrations | PR 6、11 |
| 13 | UI behavior tests + package smoke | 前述行为稳定后 |
| 14 | lint/logging/frozen install | 可拆分；lockfile 清理不得吞掉 B0/G1 的变更 |

## 14. 质量指标与验收看板

指标用于判断风险是否下降，不作为机械 KPI。

| 指标 | 当前基线 | 目标 |
| --- | --- | --- |
| 缺少 token 校验的数据路由 | 生产默认多数开放 | 0；`/health` 与登记的静态 GET/HEAD 不计入 |
| 明文持久化 provider key | 已归零 | 0 |
| 已提交会话权威源 | SQLite | 1 个 |
| 会话切换事务 | 非原子 | 原子，可恢复 |
| `AssistantPanel` 状态所有权 | 多领域混合 | composition only |
| Agent service 依赖 | 完整 HTTP context | 最小 ports |
| DB schema 来源 | Drizzle + 最新 DDL 双写 | schema + versioned migrations |
| UI 关键路径测试 | 多数源码断言 | render/E2E 行为证据 |
| 平台 package smoke | 未接入 package job | 上传前必须通过 |
| 主项目依赖安装 | `--no-save` | frozen lockfile |
| 手写源码行号日志 | 约 60 处 | 0 |

## 15. 风险与控制

### 风险：安全修复破坏 dev 浏览器模式

控制：显式区分 desktop production、desktop dev 和 browser-only dev profile；不同 profile 使用独立 auth/origin 配置，禁止隐式开放。

### 风险：破坏性删除旧 WebView 存储会损失用户历史

控制：本轮已取得明确的数据丢弃授权。发布说明必须标明旧 WebView 本地数据不会自动升级；运行时代码不再保留迁移、backup 或 quarantine 分支。

### 风险：session controller 成为新的 god object

控制：controller 只持状态机和端口，不渲染 UI、不访问具体 storage、不直接拼 provider 请求。

### 风险：数据库 migration 重构破坏旧用户数据

控制：保留旧版本 SQLite fixtures，执行复制后升级验证，不在真实用户库上进行首次验证。

### 风险：真实 UI 测试变慢或 flaky

控制：纯状态和 reducer 留在快速测试层；仅把必须依赖 DOM/桌面边界的场景提升到行为/E2E 层，避免把所有断言都变成端到端测试。

### 风险：一次性引入过多质量工具

控制：先选择一套 TypeScript lint/format 路径；规则从错误、安全和 unused 开始，禁止大规模纯格式化与业务重构混合。

## 16. 明确不做的事情

- 不以“所有文件低于 N 行”为目标。
- 不引入 DI 框架来替代几个明确的 TypeScript ports。
- 不因架构整改重写 React、Bun、Tauri 或 SQLite 技术栈。
- 不把共享包拆成大量发布包，除非独立版本和发布确有需求。
- 不用全仓覆盖率百分比替代关键风险场景。
- 不在当前 assistant-ui 迁移未收敛时并行重写全部 UI。
- 不把本地 smoke、mock provider 或静态测试描述为真实生产验收。

## 17. 每阶段 Definition of Done

每个阶段完成前必须满足：

1. 行为目标和失败语义已写入测试。
2. 相关类型检查、lint、测试和构建通过。
3. `git diff --check` 通过。
4. 未引入未解释的新依赖、全局单例或跨层 import。
5. 数据迁移有回滚或恢复路径。
6. 安全边界没有依赖“只监听 localhost 所以安全”的假设。
7. UI 变更验证视觉顺序、键盘焦点和 reduced-motion。
8. 发布结论区分源码、构建、安装包、签名、公证和线上状态。
9. 文档中的路径、命令和状态与当前仓库一致。
10. 当前阶段 stop condition 全部满足，未完成项明确进入下一阶段，而不是隐藏在“后续优化”。

## 18. 总停止条件

当以下条件全部成立，可认为本轮架构与代码质量优化完成：

- 本机 backend 默认鉴权，CORS 不允许任意网页读取数据。
- Provider 密钥不再明文持久化于 renderer storage，生产 CSP 生效。
- 会话只有一个已提交权威源，metadata/usage/tool state 无损。
- 会话切换失败可完整恢复原画布。
- session controller 是唯一会话状态转移入口。
- `AssistantPanel` 退化为薄 composition root。
- native Agent service 使用最小依赖端口，transport 与 lifecycle 可独立测试。
- 数据库采用版本化 migration，Drizzle schema 与实际数据库有 parity 验证。
- 关键 UI 行为由真实渲染测试覆盖，不再主要依赖源码字符串。
- 平台安装包在上传前通过 layout、backend auth/health 和最小启动验证。
- lint、typecheck、test、Clippy、format 和 frozen install 在 CI 中稳定执行。
- 所有剩余未知边界均在发布说明中显式披露。

## 19. 2026-09-29 最终执行记录

本轮 Phase 0–5 已在当前集成分支完成。最终验证以同一工作树的新鲜结果为准：

- `bun install --frozen-lockfile`：检查 639 个安装项、759 个包，无变更。
- `bun run quality:check`：通过；包含严格 unused 检查、三套 TypeScript 配置和直接依赖使用检查。
- `bun test tests`：861 pass，0 fail，覆盖 122 个测试文件、5710 个断言。
- `bun run benchmark:validate`：`geochat-core-smoke@1.0.0` 的 12 个 case 通过，内容哈希为 `fnv1a64:d55b62a2c4fdb9d7`。
- `cargo fmt --manifest-path src-tauri/Cargo.toml -- --check`：通过。
- `cargo clippy --manifest-path src-tauri/Cargo.toml --all-targets -- -D warnings`：通过。
- `cargo test --manifest-path src-tauri/Cargo.toml`：55 pass，0 fail。
- `git diff --check`：通过。
- `bun run e2e:desktop:debug`：真实 Tauri + WebView + backend + MCP + 本地 OpenAI-compatible fake provider 链路通过；真实 textarea 输入与发送按钮、输入清空、用户/助手消息 DOM、window/fusion 草稿与 conversation ID 连续性、aria-live、transcript/settings dialog 和 focus trap 双向循环均通过；provider 收到临时 Skill policy，但持久化消息、run prompt、blackboard 和重启 UI 均精确保留用户原文；重启后恢复 2 条消息并精确回放点 `A = (1, 2)`，配置与临时凭据清理全部成功，结束后无残留进程。证据写入 `.artifacts/desktop-debug-e2e.json`。
- `bun run tauri:package:smoke`：macOS `.app` 资源布局通过。
- `bun run package:backend-smoke`：构建目录与 `.app` 内 packaged backend 均通过鉴权运行 smoke。
- `bun run package:launch-smoke`：直接启动 `.app` 内 arm64 主程序，`/health` 返回 200，受保护路由缺失/错误 token 均返回 401，应用、后端、端口与隔离数据均完成清理。
- `hdiutil verify src-tauri/target/release/bundle/dmg/GeoChat_0.6.1_aarch64.dmg`：校验通过；最终当前源码构建的 DMG SHA-256 为 `bae132307b3b3768cd774e0bd7084e57ae90a67322f3a86fb55272f111bc73bc`。
- `.app` 主程序为 arm64 Mach-O，SHA-256 为 `d74be4dfb2894883d151f1a25e1e3abf80cbcbe1c82b918842131d8ab645eb61`；bundle id 为 `ai.geochat.desktop`，版本为 `0.6.1`。

证据边界：本轮证明本地源码、构建、真实桌面 debug 链路、macOS 应用包与 DMG 完整性；当前 `.app` 仅为 ad-hoc/linker-signed，未证明 Developer ID 签名、公证、Windows NSIS/MSI 安装及安装后启动、真实线上 provider 或完整人工视觉/屏幕阅读器验收。Windows CI 的 launch smoke 只启动 release-build executable，并在证据中显式标记安装器未验证。宿主 WebView 的 `prefers-reduced-motion` 环境未被测试 runner 强行伪造，代码与静态门禁覆盖该分支，但不将其记为本轮真实 WebView 证据。上述边界同时写入 `docs/release-boundaries.md`，tag 发布流程会把它们加入新建或既有 Release 的说明。

## 20. 2026-10-01 原生持久化收口

应用运行期的数据所有权进一步收口为三类：业务数据以 backend SQLite 为唯一权威源；轻量
配置与偏好写入 Tauri 应用数据目录中的 `renderer-state.json`；Provider 密钥写入操作系统安全
凭据库。WebView 不再承担应用持久化。

- 历史 WebView conversation/config/credential migration、journal、backup 和 import API 已全部
  删除；启动过程不会读取或复制旧 WebView 数据。仅保留当前版本损坏配置的严格、限额隔离，
  不包含任何旧 schema 升级逻辑。
- `localStorage` 与 `sessionStorage` 均为进程内 vendor 兼容实现；IndexedDB、Cache Storage、
  Service Worker 注册与 OPFS 被禁用。静态门禁禁止第一方模块新增 WebView 持久化路径。
- 会话、运行内容和 GeoGebra 文档由 backend SQLite repository 独占；`renderer-state.json` 只接受
  固定白名单内的语言、模型选择、思考开关、面板、onboarding 和 installation ID 等偏好，
  Provider secret 仅写入按 dev/prod 隔离的系统凭据库。
- `renderer-state.json` 使用原子替换、父目录同步、系统 advisory file lock、跨实例读刷新、
  单项/总量上限和 Windows 中断恢复。配置凭据引用使用单次 durable write 的独立 Promise，
  不会被前序或后续无关缓存写入错误污染提交结果。
- dev 与 production 使用不同 bundle identifier，因此 SQLite、配置和安全凭据命名空间互不
  污染。

本次 clean-slate 验证：`bun run quality:check` 通过；`bun test tests --max-concurrency=1` 为
883 pass、0 fail；Rust 为 83 pass、0 fail，Clippy `-D warnings`、格式检查和 `cargo check`
通过；backend/renderer 生产构建通过，Cargo 重新生成 ACL 后静态门禁仍通过。安装包、签名、
公证、Windows 安装器和真实 provider 不在本次验证范围内。
