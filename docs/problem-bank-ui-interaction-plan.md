# 题库 UI 与交互实施计划

## 目标

将“题库配置”和“使用题库”拆成两个清晰表面：

- 设置页只管理本地/云端来源、版本、同步和缓存。
- 聊天浮窗右侧的题库伴随卡片负责浏览、筛选、预览和发送到对话。
- 所有浏览操作保持只读，不自动发消息、不自动修改 GeoGebra 画板。

本计划遵循根目录 `DESIGN.md`，缓存和发布语义遵循
`docs/problem-bank-versioned-cache-design.md`。

## 当前基线

- 设置页已有独立“题库”标签，但只显示本地题集并支持刷新/重新索引。
- TypeScript 已定义 cloud bank、facets、problem page、problem detail 和许可字段。
- Rust 题库缓存已有 current/release manifest 的 staging、校验和原子激活基础。
- 当前 release 的 `problem-banks/index.json` 与 `index/facets.json` 已发布。
- bank pages、facet postings、problem-id lookup 尚未完整发布，因此当前只能完成来源与版本管理，不能把云端下钻能力标记为可用。

## 页面结构

### 1. 设置 > 题库 / 通用

```text
┌ 题库                                      [打开题库]
│ 2 个来源 · 当前版本 2026-06-12.2
├ 本地题库      已就绪 · 4 个题集 · 1,240 题       [刷新] [重新索引]
└ 云端题库      离线可用 · 2026-06-12.2            [检查] [同步]
    每个题库独立显示下载、断点续传与离线状态

┌ 通用 > 题库缓存
│ 已缓存 128 MB                                  [打开目录] [清空缓存]
└ /Users/.../problem-bank
```

规则：

- 标题行只保留总状态与“打开题库”；来源行显示各自状态。
- 按钮统一靠右；图标按钮带本地化 tooltip 和 `aria-label`。
- 缓存目录、容量与清理属于通用页；题库页不重复展示全局存储控制。
- 展开区域使用 height + opacity 动画；减少动态效果时直接切换。
- 同步失败保留旧 active release，并在云端行内显示错误和重试。

### 2. 浮窗右侧题库卡片 > 题库目录

```text
┌ [←] 题库                          [刷新]
│ [搜索题目、知识点或来源……]        [筛选]
│ [全部] [本地] [离线可用] [含图片]
├ 高中数学多模态题库    云端 · 120,000 题
│ 含图片 9,400 · 允许复用 · 已缓存索引
├ 几何构造精选          本地 · 320 题
└ ...
```

- 点击对话框顶部题库图标后，卡片从右侧滑入，高度始终与对话框一致；可通过顶部图标、卡片关闭按钮或 Escape 收回。
- 默认展示 catalog，不直接加载题目列表。
- 排序优先级：用户最近使用 -> 离线可用 -> 配置顺序。
- 卡片整块可聚焦/打开；右侧只放必要的下载或状态图标。
- restricted/unknown bank 在卡片上直接显示状态，不藏在详情页。

### 3. 题目列表

```text
┌ [←] 高中数学多模态题库        2,418 条
│ [搜索当前题库……]              [筛选 3]
│ [高一 ×] [几何 ×] [含图片 ×]
├ 题目预览文字……                    [图片]
│ 高一 · 几何 · 中等 · 允许复用
├ 题目预览文字……
└ ...
```

- 搜索和 filters 改变后重置 cursor；滚动加载下一页。
- 过滤维度：dataset、grade、construction、modality、hasMedia。
- chips 只显示已生效条件，支持单个移除和“清除全部”。
- 列表行显示 prompt preview、难度/年级/媒体和许可；避免重复元数据。
- 网络失败后保留已经加载的结果，在列表尾部提供重试。

### 4. 题目详情

```text
┌ [←] 题目详情
│ [题目图片]
│ 题干……
│ ▸ 查看答案与解析
│ 来源 · release · license · reuse policy
│                              [在画板中分析]
│                              [发送到对话]
```

- 答案和解析默认折叠，避免浏览时泄题。
- 图片按需加载，失败时保留 alt 和重试，不影响文字内容。
- `发送到对话` 返回 chat 并预填 composer；用户再次确认发送。
- `在画板中分析` 预填一条要求结合当前画板分析的消息；提交前不执行命令。
- restricted/unknown 时在动作区上方显示说明；不符合策略的动作禁用并解释原因。

## 导航与状态保持

- 保持 `panelView` 为 `chat | settings`，题库使用独立的 sidecar open state，避免替换对话内容。
- 题库内部路由使用轻量状态：`catalog | results(bankSlug) | detail(problemId)`。
- 离开题库时保留 search、filters、scroll position 和当前 detail；新会话不清除题库浏览状态。
- 从 detail 发送到对话后记录返回点；再次打开题库回到原 detail。
- 展开或收回 sidecar 不卸载 GeoGebra，不重建当前会话，不清空 composer 草稿。
- 宽屏时若右侧空间不足，可平滑把对话框整体左移；收回后恢复原位置。窄屏时卡片覆盖对话框右侧，避免超出视口。

## 数据与接口边界

Renderer 只消费以下稳定接口，不直接拼接 R2 key：

1. `getProblemBankCacheState()`：来源、active release、缓存大小、同步状态。
2. `checkProblemBankUpdate()`：检查 current pointer。
3. `syncProblemBankMetadata()`：下载、校验并原子激活 core indexes。
4. `GET /v1/problem-sets`：本地与 active cloud bank 的统一目录。
5. `GET /v1/problem-sets/:id/problems`：分页、搜索、facets/cursor。
6. `GET /v1/problems/:id`：按需读取详情和受控媒体引用。

若 runtime index tree 不完整，后端返回结构化 `index_incomplete`，UI 保留来源管理，
但不进入空白列表或把 404 当作“0 条题目”。

## 状态矩阵

| 状态 | 设置页 | 浏览页 | 可执行操作 |
| --- | --- | --- | --- |
| 本地就绪 | 题集/题量 | 正常展示 | 浏览、重新索引 |
| 云端未检查 | 未检查 | 不冒充为空 | 检查更新 |
| 正在同步 | 进度与当前阶段 | 继续读旧 active | 暂停/取消（后续） |
| 已是最新 | 当前 release | 正常展示 | 刷新、离线下载 |
| 有新版本 | 当前/最新版本 | 继续读旧 active | 同步 |
| 离线 | 最近检查时间 | 只显示已缓存 | 重试 |
| 索引未完整发布 | 行内警告 | 禁止下钻 | 刷新发布状态 |
| 缓存损坏 | 保留旧版本、提示修复 | 使用旧 active | 修复/重新同步 |

## 分阶段实施

### Phase A：来源管理闭环

- 将现有本地卡片改成统一 summary + 两个 source rows。
- 接入 Rust cache state/check/sync event；显示版本、进度、错误和离线状态。
- 增加“打开题库”入口；右侧伴随卡片与对话框等高、可收回，并随对话框一起拖动。
- 为状态 reducer/parser、错误保留和同步事件补测试。

验收：网络失败或新版本损坏不会清空本地题集/旧 active；设置页无假成功状态。

### Phase B：目录与列表

- 在 `AssistantPanel` 增加题库图标和等高的 `ProblemBankSidecar`。
- 实现 unified catalog、search、filters、cursor pagination 和离线结果。
- 发布并验证 bank pages、postings、lookup 后再开放 cloud drill-down。

验收：四个 cloud banks 与本地 sets 均可辨识；10 万级结果不会一次性渲染。

### Phase C：详情与对话交接

- 实现 problem detail、媒体、答案折叠、许可提示。
- 新增结构化 problem reference composer attachment。
- 实现预填但不自动发送，保留会话/草稿/画板状态。

验收：发送到对话前无模型请求、无 GeoGebra 命令；返回题库位置不丢失。

### Phase D：离线与缓存管理

- bank 级 records/full cache mode、配额、下载进度、暂停/恢复和清理。
- inactive release 与 media/record LRU 的可视化管理。

验收：断网重启后 active cache 可浏览；配额淘汰不影响 active/rollback/core metadata。

## 测试清单

- Contract：cloud index/facets/page/detail parser、`index_incomplete`、许可字段。
- Rust：ETag 304、重试、取消、校验失败、原子激活、旧版本回滚、跨 origin 拒绝。
- React：键盘导航、filter chips、detail back、答案 disclosure、pre-fill not send。
- E2E：在线首次同步、离线启动、更新中断、损坏 release、窄宽度布局、减少动态效果。
- Visual：设置页和 catalog/results/detail 在桌面与窄宽度下截图，检查右侧对齐、间距、长文本和中英文。

## 当前状态

当前 release `2026-06-12.2` 的完整 runtime index tree 已发布并完成线上验收：
4 个 bank index、1,507 个 bank pages、facet postings 和 4 个 problem-id lookup
均可从题库子域名读取。Phase B 不再受云端索引发布阻塞，后续只需按稳定接口完成
目录、筛选、详情和按需缓存交互；客户端仍不得临时扫描 300,920 条 record shards。
