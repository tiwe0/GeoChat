# GeoChat 题库与媒体版本缓存方案

## 1. 目标

为桌面端提供统一的云端题库访问和本地版本缓存能力：

- 云端 release 不可变，本地能够识别、下载、校验和原子切换版本。
- 默认只缓存索引与用户实际访问的数据，不一次性下载完整题库和全部媒体。
- 离线时继续使用最近一次已验证的版本。
- 下载中断、校验失败或新版本损坏时，不影响当前可用版本。
- 题目 JSON、检索索引和媒体共享同一套版本状态，但使用独立容量策略。
- 缓存逻辑归后端所有，renderer 只消费状态和业务 API。

## 2. 已确认的云端结构

R2 bucket 根目录：

```text
geochat-problem-bank/
├── problem-bank/
│   └── v1/
│       ├── manifest.json
│       └── releases/
│           └── 2026-06-12.2/
│               ├── manifest.json
│               ├── datasets/
│               ├── records/
│               ├── reports/
│               ├── problem-banks/   # release manifest 引用
│               └── index/           # release manifest 引用
└── problem-media/
    ├── ecnu-icalk-cmm-math/
    ├── fanqingm-mmk12/
    ├── lizhongzhi2022-cmmath/
    └── thu-keg-mm-math/
```

`problem-bank/v1/manifest.json` 是轻量 current pointer，目前指向
`2026-06-12.2`。release manifest 描述：

- 4 个 dataset；
- 300,920 条题目；
- 23,517 个媒体对象，缺失数为 0；
- dataset manifests 和 JSONL record shards；
- problem-bank 索引、facets、posting lists；
- 按 problem id 前缀分片的 lookup；
- verification report；
- 独立的媒体域名和媒体对象路径。

这里必须区分两个版本概念：

- `schemaVersion`：文件协议版本，决定客户端是否能解析；
- `releaseId`：内容版本，决定本地应该缓存和激活哪批数据。

## 3. 当前代码的主要缺口

现有代码已经有 cloud problem contract 和转换函数，但实际查询链仍是本地
SQLite 导入：

- `packages/app/src/problem-bank.ts` 定义了云端 manifest、bank、page、record 和 media 类型；
- `backend/src/db/problem-bank-repository.ts` 只索引本地 `data/problem-cases`；
- `src/shared/desktop/problem-bank-cache.ts` 是未接入业务链的 renderer IndexedDB LRU；
- IndexedDB 缓存按 URL 存储、默认仅 64 MiB，没有 release 状态、原子切换、完整性校验或离线版本语义。

因此不继续扩展现有 IndexedDB 模块。新缓存由 Tauri 内的 Rust 库统一管理，
renderer 只通过 typed Tauri commands 访问；Bun sidecar 不再拥有题库版本缓存。
renderer 中的旧缓存模块在迁移完成后删除。

## 4. 推荐架构

采用混合缓存，而不是“全量导入 SQLite”或“纯远端 + IndexedDB”。

```text
Renderer (TypeScript)
   │ typed Tauri invoke/event
   ▼
Rust ProblemBankCache
   ├── ReleaseResolver       解析 current pointer 和 release manifest
   ├── SyncCoordinator       单任务同步、重试、取消、恢复、原子激活
   ├── ArtifactStore         文件缓存、校验、LRU、配额和 pin
   ├── ProblemBankCatalog    bank、facet、page 和 problem lookup
   ├── ProblemQueryService   统一查询本地内置题与云端题库
   └── MediaResolver         本地媒体优先，缺失时按需下载
          │
          ├── 原生状态目录：版本、激活指针、访问记录
          └── Filesystem：manifest、page、JSONL shard、图片和临时文件
```

### 为什么选混合方案

1. 30 万题全量展开进现有 `problems` 表会重复 JSONL 内容，导入和升级成本高。
2. 媒体约 4 GB，不适合 IndexedDB，也不应默认全量下载。
3. 云端已经提供 facets、postings 和 problem-id lookup，应复用现有发布产物。
4. 第一阶段使用 Rust 原生 JSON 状态与文件系统完成原子版本切换，避免为少量
   控制状态引入新的数据库依赖；当本地查询索引需要随机访问时，再由 Rust
   独占一个单独的 cache SQLite，而不是复用 Bun sidecar 的业务数据库。

## 5. 本地目录布局

目录位于 Tauri app data 目录，而不是仓库或 renderer storage：

```text
problem-bank-cache/
├── active.json                    # 当前已激活 release，原子替换
├── releases/
│   └── 2026-06-12.2/
│       ├── release.json           # 本地 release 状态
│       ├── manifest.json
│       ├── core/                  # bank index、facets、lookup
│       ├── records/               # 按需缓存 JSONL shard/page
│       └── reports/
├── media/
│   └── sha256/ab/cd/<digest>      # 内容寻址，跨 release 去重
├── staging/
│   └── <releaseId>-<uuid>/        # 下载和校验中的版本
└── tmp/
    └── *.part                     # 可恢复的临时下载
```

release 目录不可原地修改。新版本只能在 `staging` 完成校验后移动到
`releases`，最后原子替换 `active.json`。

## 6. Rust 原生元数据

第一阶段由 Rust 持有 `state.json` 和 `active.json`，并通过同目录临时文件、
`fsync` 和原子替换保证崩溃安全。release 目录只在 staging 校验完成后 rename。

当题库查询索引进入第二阶段时，可新增 Rust 独占的 `problem-bank-cache.sqlite`，
其规划表如下；该数据库不与 Bun sidecar 共享连接和迁移历史。

新增独立缓存表，不把同步状态塞进现有题目业务表：

### `problem_bank_releases`

- `release_id` 主键；
- `schema_version`、`channel`、`manifest_url`；
- `state`: `discovered | staging | ready | active | failed | evicted`；
- `manifest_etag`、`manifest_sha256`；
- `created_at`、`installed_at`、`activated_at`、`last_checked_at`；
- `total_bytes`、`last_error`。

### `problem_bank_banks`

- `release_id + bank_slug` 联合主键；
- title、description、dataset id、record count；
- access tier、reuse policy、license；
- bank index/facet/page 路径；
- `cache_mode`: `metadata | records | full`。

### `problem_bank_artifacts`

- `release_id + remote_key` 联合主键；
- kind、local path、byte size、content type；
- etag、sha256；
- `state`: `missing | downloading | ready | corrupt`；
- last accessed、pinned、downloaded bytes。

### `problem_bank_problem_locations`

- `release_id + problem_id` 联合主键；
- bank slug、dataset slug；
- summary page 或 record shard 的定位信息；
- 可选 byte offset/length，由发布器能够提供时使用。

现有 `problem_attempts` 继续使用稳定的 problem id，不绑定本地缓存路径。

## 7. 同步状态机

```text
idle
  └─ check current manifest (If-None-Match)
       ├─ 304 / same release ───────────────> ready
       └─ new release
            └─ validate schema/channel/license
                 └─ create staging release
                      └─ download core artifacts
                           └─ verify size + sha256
                                ├─ failure -> failed, keep old active
                                └─ success -> ready -> atomic activate
```

核心规则：

1. 同一时刻只能有一个 sync coordinator；其他请求复用同一进度流。
2. root manifest 使用短缓存和 ETag；immutable release artifacts 使用长期缓存。
3. 网络错误采用有上限的指数退避和 jitter；取消操作保留可恢复的 `.part`。
4. 新 release 未完成校验前，所有查询继续走旧 active release。
5. 激活成功后至少保留上一个 ready release，用于快速回滚。
6. schema 不兼容时只报告“客户端需要升级”，不清理当前缓存。

## 8. 缓存策略

定义三级模式：

### Metadata（默认）

缓存 current/release manifests、bank index、facets、posting lists 和必要的
problem-id lookup。题目详情和媒体按需获取。

### Records

用户选择“离线使用某题库”后，下载该 bank 的 summary pages 和 record shards；
媒体仍按需下载。

### Full

下载指定 bank 的 records 和媒体，仅由用户显式开启。不要默认下载整个 bucket。

配额分开管理：

- core metadata 永久 pin，不能由 LRU 淘汰；
- record cache 使用独立配额；
- media cache 使用独立配额并按内容 hash 去重；
- active release 和上一个 rollback release 受保护；
- 淘汰顺序是 inactive release -> 未 pin 媒体 -> 未 pin record shards。

初始默认值应通过真实产物大小测量后确定，不沿用当前未经验证的 64 MiB。

## 9. 发布协议需要补强的字段

当前结构可以作为基础，但版本缓存需要每个可下载 artifact 至少携带：

```json
{
  "key": "...",
  "byteSize": 123,
  "sha256": "...",
  "contentType": "application/json",
  "etag": "..."
}
```

`artifactBaseUrl` 必须是客户端可 GET 的绝对 HTTPS URL，或明确规定为 root
manifest 同源的 bucket-root-relative key。桌面客户端默认从 R2 自定义域名
`https://assets.chat-with-geogebra.com/problem-bank/v1/manifest.json` 直读 root
manifest；release manifest、题库索引、分页、题目明细和媒体也沿相同 origin
直接读取，不经过 Worker。`https://problem-bank.chat-with-geogebra.com/v1/*`
只保留为旧链接和诊断接口的兼容入口，不再是客户端默认数据路径。Rust 客户端
拒绝跨 origin 的 manifest 跳转，避免云端清单被利用来探测本机或内网地址。

R2 自定义域名已经启用 Cloudflare Cache，但 JSON 默认不一定具备缓存资格。发布侧
应为 `assets.chat-with-geogebra.com/problem-bank/v1/releases/*` 配置长时间 Edge
TTL，为可变的 root manifest 配置短 TTL；release 目录保持 immutable，root
manifest 继续承担版本指针职责。

2026-09-23 已在商业库手动部署题库 Worker。新子域名可读取 root manifest、
release manifest、verification report、dataset manifests 与 record shards，并已验证
HEAD、ETag/304、单段 Range/206、CORS 和只读边界。随后从全部 300,920 条
immutable record shards 重建并上传了当前 release `2026-06-12.2` 的
完整 runtime index tree，共 7,579 个 JSON 文件：problem-bank 目录与分页、facet
postings、problem-id lookup 以及两个顶层聚合索引。线上已逐类验证 4 个题库的首尾
分页、300,920 条聚合计数、代表性 posting、lookup 对象大小、Range/206 与 immutable
缓存头；客户端和边缘 Worker 不需要临时扫描或伪造索引。

建议 root manifest 从单一 `currentReleaseId` 升级为显式 channel pointer：

```json
{
  "schemaVersion": "problem-bank.r2.v2",
  "channels": {
    "production": { "releaseId": "...", "manifestUrl": "..." },
    "evaluation": { "releaseId": "...", "manifestUrl": "..." },
    "internal": { "releaseId": "...", "manifestUrl": "..." }
  }
}
```

发布顺序固定为：上传 immutable artifacts -> 上传 verification report -> 上传
release manifest -> 最后更新 channel pointer。客户端永远不会观察到半发布版本。

## 10. 许可和渠道边界

当前 internal release 同时包含 `allowed`、`restricted` 和 `unknown` 数据。
客户端不得仅凭“对象公开可读”判断可分发性：

- production channel 只暴露允许进入公开产品的数据；
- restricted/unknown bank 必须保持显式标记，并在同步前执行策略检查；
- 缓存记录保留 dataset、license、reuse policy 和 release channel；
- 商业构建不能静默预下载禁止商业使用的数据。

## 11. TypeScript 调用接口

替换“renderer 直接 fetch 云端”和经 Bun sidecar 管理缓存的路径：

- `getProblemBankCacheState()` / `get_problem_bank_cache_state`：读取状态；
- `checkProblemBankUpdate()` / `check_problem_bank_update`：后台检查新版本；
- `syncProblemBankMetadata()` / `sync_problem_bank_metadata`：staging、校验、原子激活；
- `onProblemBankCacheState()` / `desktop:problem-bank-cache-state`：订阅进度；
- 后续增加 `setProblemBankCacheMode()` 和非 active release 清理命令；
- `GET /v1/problem-sets`：统一返回本地内置和 active cloud banks；
- `GET /v1/problem-sets/:id/problems`：由后端处理本地、缓存或远端查询；
- `GET /v1/problems/:id`：按 problem lookup 定位并按需缓存详情；
- `GET /v1/problem-media/:id`：只返回受控的本地/远端媒体流。

同步进度通过 Tauri event 推送，renderer 重载后再调用 state command 补齐快照；
不为本地进程间状态额外引入 SSE 或 WebSocket。

## 12. 设置页交互

题库页显示：

- 当前版本、云端可用版本和上次检查时间；
- `已是最新 / 有更新 / 正在下载 / 离线可用 / 同步失败`；
- 每个 bank 的题量、许可、缓存模式和占用空间；
- 检查更新、下载离线版、暂停/继续、清理旧版本；
- 总缓存空间、records/media 分项和配额设置。

没有网络时不显示空题库；优先展示 active cache，并将网络状态作为次要提示。

## 13. 实施阶段

### Phase 1：契约与发布器

- 定义 v2 manifests 和 artifact descriptors；
- 让 builder 生成 sha256、byte size、channel pointers；
- 添加 manifest contract 和完整性测试。

### Phase 2：后端缓存核心

- 使用 Rust 实现 ReleaseResolver、ArtifactStore、SyncCoordinator；
- 添加缓存表和 app-data 路径；
- 支持 staging、校验、原子激活、回滚和配额。

当前已落地 Phase 2 的基础闭环：Rust 解析 v1 root/release manifest，在后台线程
执行带上限重试的网络请求，将 manifest 写入 staging，重新解析落盘内容后 rename
到不可变 release 目录，并原子替换 `active.json`。TypeScript 已有 typed invoke 和
状态事件接口；core indexes、bank records、LRU 和配额属于下一批实现。

### Phase 3：查询链整合

- 将 cloud bank 接入 `ProblemBankRepository`；
- 复用云端 facets、postings、lookup 和 summary pages；
- 详情与媒体按需下载；
- 删除未使用的 renderer IndexedDB 缓存。

### Phase 4：设置页和可观测性

- 增加版本、进度、缓存模式、空间与错误状态；
- 为 check、download、verify、activate、evict 写结构化日志。

### Phase 5：端到端验证

- 真实 R2 staging release；
- 离线启动和查询；
- 下载中断恢复；
- 坏 hash 不切换；
- 新旧版本切换和清理；
- 大题库查询不全量载入内存。

## 14. 验收标准

1. active release 在无网络情况下可以启动、列出题集并打开已缓存题目。
2. 同版本检查命中 ETag/304 时不重复下载 artifact。
3. 同步中断或校验失败后，旧 active release 保持可查询。
4. 切换 active release 是原子的，应用不会看到混合版本。
5. 并发点击同步只产生一个后台任务。
6. active 和 rollback release 不会被 LRU 删除。
7. 缓存超额后能按策略回收，Rust 元数据状态与文件系统保持一致。
8. restricted/unknown 数据不会被 production build 静默缓存。
9. 30 万题的索引和查询流程不会一次性把全部 JSONL 载入内存。
10. 前端退出、刷新或语言切换不会中断后台缓存状态的一致性。

## 15. 首版范围

首版只实现：production channel、metadata 默认缓存、按 bank 的 records 离线缓存、
媒体按需缓存、保留一个回滚版本。全量媒体预下载、跨设备同步、差分 patch 和复杂
SSE 进度放在后续版本。
