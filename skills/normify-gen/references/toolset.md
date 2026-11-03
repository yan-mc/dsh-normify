# 工具面详解（toolset）

> SKILL 的参考文件之一。0.7.0 起 DSH 默认注册 **7 个原语**（按 `op` 分派）；本文件给出每个 op 的关键参数、
> 三档工具面配置、以及 31 个旧工具名到新原语的映射。完整参数树以运行时为准：
> legacy 模式 `normify_help{topic:"tool:<name>"}`，或 CLI `node lib/cli/index.js call <tool> --args-json ...`。

## 1. 7 个原语与 op

所有原语都用 `project`（slug，结构目录 = `normify-<slug>`）或 `dir`（结构目录绝对路径）定位项目。

### `normify_project`（op: init / list / status）

| op | 关键参数 | 说明 |
| --- | --- | --- |
| `init` | `project` / `dir`；`root_module`（可选 `{id,name:{zh,en},description:{zh,en},repository?}`） | 建目录 + 默认 policy；可一步建计划态根模块；幂等 |
| `list` | `root`（搜索根目录） | 列出全部结构项目 |
| `status` | `project` / `dir` | 模块清单与统计（概览） |

### `normify_read`（只读）

| op | 关键参数 | 说明 |
| --- | --- | --- |
| `get` | `id` | 读单个模块 |
| `list` | `parent`、`direct_only` | 按父级列模块（含统计） |
| `search` | `query`、`topK` | 检索模块/API |
| `deps` | `to` | 反查“谁依赖我” |
| `outline` | — | 重建 `outline.md` |
| `brief` | `task` / `id`、`files`、`depth` | 开发指引：契约/影响面/规则/建议/验收 |
| `layout` | `id` | 读某容器的渲染数据 |
| `policy` | — | 读 `policy.yml` |

### `normify_write`（事务化写）

| op | 关键参数 | 说明 |
| --- | --- | --- |
| `upsert` | `frontmatter`、`body`、`expect_updated_at`、`dry_run` | 写单模块（L1、自动晋升/降级父文件） |
| `patch` | `id`、`patch`、`expect_updated_at`、`dry_run` | 部分更新 |
| `batch` | `items[]`、`mode`（upsert/patch）、`dry_run` | 原子批量（单批 ≤200，失败整批回滚）；patch 条目为双层 `{patch:{id,patch:{...}}}` |
| `move` | `id`、`new_id`、`new_parent`、`dry_run` | 改名/挪层（保 uid、级联 parent、重写 deps、迁移 renders） |
| `delete` | `id` | 删子树（返回悬空边预警；destroy 走一次性审批） |
| `promote` | `id` | 叶子晋升容器 |
| `layout_upsert` | `id`、`layout_mode`、`max_columns`、`max_api_rows`、`order`、`groups`、`reading`、`edge_hints` | 写该层渲染数据 |
| `layout_delete` | `id` | 删渲染数据（回退自动布局） |

### `normify_check`（只读）

| op | 关键参数 | 说明 |
| --- | --- | --- |
| `validate` | `repoRoot` | L2 全项目校验（0 error 门禁；带 repoRoot 启用证据校验） |
| `check` | `modules[]`、`deps[]` | 动手前预检（parent/深度/环/policy） |
| `drift` | `repoRoot`、`diff` | git 漂移与增量同步规划（只读） |
| `policy` | — | 读 policy.yml |

### `normify_build`

| op | 关键参数 | 说明 |
| --- | --- | --- |
| `build` | `repoRoot` | 校验并编译五件产物 + SBOM + 回执链（任何 error 不产出） |
| `verify` | — | 只校验已有产物哈希（sidecar → receipt → artifacts） |
| `sbom` | — | 只校验（同 verify，面向 SBOM 消费方） |

### `normify_render`

| op | 关键参数 | 说明 |
| --- | --- | --- |
| `render` | `out`（纯文件名，默认 normify.html） | tree.json → 单文件交互 HTML |

### `normify_change`

| op | 关键参数 | 说明 |
| --- | --- | --- |
| `open` | `title`、`intent`、`modules{create,modify,delete,api_add,api_remove}`、`acceptance[]`、`status`、`note` | 开变更单（acceptance 只接受纯字符串数组） |
| `update` | `id`、`patch` | 更新字段（`delete_snapshot` 由引擎自动维护） |
| `list` | `id`、`status` | 列变更 |
| `close` | `id`、`repoRoot`、`activate`（默认 true）、`render`、`note` | 0 error 强制收尾：刷新指纹 → 校验 → 编译 → verified + revision.after |

## 2. 三档工具面（插件 config）

| 配置 | 注册项 | 用途 |
| --- | --- | --- |
| `toolset: "core"`（默认） | 7 原语 | 新会话/新技能/新 prompt |
| `toolset: "core"` + `legacyTools: true` | 7 + 28 不冲突旧名（共 35 个唯一工具；check/build/render 与旧名同名，已去重） | 旧 prompt/技能过渡（1 个 minor） |
| `toolset: "full"` | 仅 31 旧工具 | 完全回 0.6 面（回滚/兼容） |

- 同名注意：`normify_check` / `normify_build` / `normify_render` 在 0.7 是**原语语义**（必须带 `op`）；
  `legacyTools` 会同时注册旧名，过渡期请直接用原语 `op`，不要依赖同名旧语义。
- CLI（`normify ...` / `call <tool>`）内部始终是 full 31 工具集，**不受**插件 `toolset` 影响。

## 3. 31 旧工具名 → 原语 op

| 0.6 旧工具 | 0.7 等价 |
| --- | --- |
| `normify_project_init` | `project{op:"init"}` |
| `normify_tree_list` | `project{op:"list"}` |
| `normify_module_list` | `read{op:"list"}`（项目概览用 `project{op:"status"}`） |
| `normify_module_get` | `read{op:"get"}` |
| `normify_search` | `read{op:"search"}` |
| `normify_deps_find` | `read{op:"deps"}` |
| `normify_outline` | `read{op:"outline"}` |
| `normify_brief` | `read{op:"brief"}` |
| `normify_layout_get` | `read{op:"layout"}` |
| `normify_policy_get` | `read{op:"policy"}` 或 `check{op:"policy"}`（二者同源） |
| `normify_module_upsert` | `write{op:"upsert"}` |
| `normify_module_patch` | `write{op:"patch"}` |
| `normify_module_batch` | `write{op:"batch"}` |
| `normify_module_move` | `write{op:"move"}` |
| `normify_module_delete` | `write{op:"delete"}` |
| `normify_module_promote` | `write{op:"promote"}` |
| `normify_layout_upsert` | `write{op:"layout_upsert"}` |
| `normify_layout_delete` | `write{op:"layout_delete"}` |
| `normify_validate` | `check{op:"validate"}` |
| `normify_check` | `check{op:"check"}` |
| `normify_sync` | `check{op:"drift"}` |
| `normify_build` | `build{op:"build"}`（只校验用 `build{op:"verify"}` / `{op:"sbom"}`） |
| `normify_render` | `render{op:"render"}` |
| `normify_change_open` | `change{op:"open"}` |
| `normify_change_update` | `change{op:"update"}` |
| `normify_change_list` | `change{op:"list"}` |
| `normify_change_close` | `change{op:"close"}` |
| `normify_module_refresh` | **无原语等价**：legacyTools / CLI；或由 `change{op:"close"}` 自动刷新激活 |
| `normify_fingerprint` | **无原语等价**：legacyTools 或 CLI `call normify_fingerprint` |
| `normify_help` | **无原语等价**：legacyTools 或 CLI `--help` / 本技能 references |
| `normify_policy_upsert` | **无原语等价**：legacyTools 或 CLI `call normify_policy_upsert` |

## 4. 迁移建议

- 新写 prompt/技能：只用 7 原语 + `op`（schema 小、歧义少）。
- 旧 prompt/技能：先在插件配置开 `legacyTools: true` 保证可用，再按上表逐步替换；0.8.0 移除 legacy 面。
- 需要 fingerprint/refresh/help/policy_upsert：过渡期用 `legacyTools` 或 CLI（CLI 内部 full，不受开关影响）。
