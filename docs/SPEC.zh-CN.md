# Normify（归一化框架图构建器）正式规范 v1.0

> 人机共读的分形项目结构图系统：一套结构数据 + 一个渲染器，以 DSH 插件形式交付。
> 状态：**v1.0 定稿**（取代《ModTree-制作计划草案.md》；该旧草案已从工作区清理）｜ 项目代号沿革：ModTree → **Normify**

> **实现状态（2026-09-12，v0.4.1）**：已适配 DeepSeek Harness `0.1.5-rc.2` / DSHEAC AIO 6.9.3 桌面端（profile `web-desktop`）。
> 1. 工具名 `normify_*`，共 **30 个**；模块新增 `state`（active/planned/deprecated）、`replacement`、`tags`；计划优先 + `normify_module_refresh(activate)` 激活。
> 2. 项目创建自动安装 `policy.yml`（完整规则集）；`normify_validate` 强制执行；`normify_changes/` 变更日志 + `normify_change_close` **0 error 强制**。
> 3. **渲染器 v3（0.4.1）**：连线走自由通道（≥16px 间距、不贴框）、viewBox 全几何自适应（不出界）、叶子框内 API 明细、`from_api/to_api` API 直连、跨层虚线 ×N 聚合、缩放/悬停高亮。
> 4. **生成粒度不设上限**：按单一功能单元拆分，鼓励 100–1000+ 模块；v0.3 的 `renders/` 渲染数据集、12 段 id、渲染器分组/车道/去重继续有效。

---

## 0. 文档性质与决策落地

### 0.1 文档性质

本文档是 Normify 的**正式规范**，是 M0 起的实现依据。规范用语遵循 RFC 2119：

- **MUST / MUST NOT**：强制要求（违反即校验 error 或实现缺陷）；
- **SHOULD / SHOULD NOT**：强烈建议（违反记 warning 或需说明理由）；
- **MAY**：可选能力。

### 0.2 决策落地表（草案 §11 十项开放问题的最终决定）

| # | 问题 | 最终决定 | 规范章节 |
|---|---|---|---|
| 1 | 命名 | **Normify**（归一化框架图构建器）；包名 `dsh-normify`；技能名 `normify-gen`；工具前缀 `normify_*` | §8 |
| 2 | 渲染器形态 | DSH 原生：v1 = CLI 工具产出单文件 HTML，在 DSH 工作区打开；**复用 DSH 现有产物/Web 展示能力，不做多平台适配、不开发 client UI** | §7.1 |
| 3 | 当前层导出 | **v1 不含**；渲染器稳定后以 v2 特性加入 | §7.7、§9 |
| 4 | 展开交互 | 未展开：只显示名称；**悬停：显示介绍（tooltip）**；点击：进入子层，层头显示本模块**名称 + 介绍**，主体为子模块图；正文 body v1 仍不消费 | §7.2 |
| 5 | `deps.kind` 枚举 | 定稿 `call | event | dataflow | reference`；**新增枚举值向后兼容**（老数据不受影响），扩枚举 = 校验器/渲染器各改一处常量表，属小改动 | §5.4、§11 |
| 6 | 多仓库/多树 | **v1 数据模型原生支持多树**（MC 多模组互调等场景必须）：树 = 一个 `parent: null` 的单段 id 根模块；跨树箭头 = 普通 `deps`，零新语法 | §2.5、§7.4 |
| 7 | 结构数据目录 | 固定 `normify-<项目slug>/`，放在 **DSH 对话工作目录**下（本项目语境即 `F:\Deepseek_harness`） | §3.1 |
| 8 | 双语强制 | 默认 error（MUST）；保留 profile 级开关（`requireBilingual: false` 时降级为 warning） | §5.5 |
| 9 | fingerprint 成本 | v1 全量哈希，不做采样优化 | §5.2 |
| 10 | 回执消费 | HTML 页脚仅**摘要**（构建时间/模块数/API 数/哈希前 12 位）；完整回执只落 `receipt.json` | §4.3 |

---

## 1. 概述

### 1.1 定位

Normify 把一个项目（或**多个互相调用的项目**，如一组 MC 模组）描述为**若干棵由结构完全相同的基本模块递归堆叠而成的分形树**：

- 顶层（树根层）= 项目骨架；
- 点开任意模块 = 看到它内部更精细的一张同构"子流程图"；
- 叶子模块 = 单一功能单元，承载该功能的全部 API 与双语简介；
- 依赖箭头可**跨子树、跨树**，记录真实调用/数据关系；
- AI 沿 id 路径逐层定位、增量维护；人通过可点击下钻的 HTML 阅读。

### 1.2 目标（v1）

1. 严格的模块结构数据规范 + 零容忍校验器；
2. DSH 生成器：AI 分析真实仓库 → 产出/增量更新结构数据；
3. 渲染器：编译产物 → 单文件交互式 HTML（下钻、悬停介绍、深链接、语言切换、多树）；
4. 完整闭环：代码变更 → 增量重建子树 → 校验 → 编译 → 渲染。

### 1.3 非目标（v1）

- 不修改、不生成源码；不做通用图布局引擎；不做机器翻译；
- 不做多用户协作/权限；不发明新文件格式；
- **不做 client UI 面板与多平台适配**；不含当前层 PNG/SVG 导出。

---

## 2. 核心数据模型

### 2.1 唯一元素：模块（Module）

整个数据库由无数个结构完全相同的模块构成。模块 = YAML frontmatter（机器读）+ Markdown 正文（人读，可选）。

### 2.2 模块字段规范

| 字段 | 类型 | 必填 | 约束（MUST） |
|---|---|---|---|
| `uid` | string | ✅ | 8 位小写 hex；全项目（跨树）唯一；重命名/移动不变 |
| `id` | string | ✅ | 路径式：段 `[a-z0-9][a-z0-9-]*`，`.` 分隔；首段 = 树名（treeId）；含树名段 ≤ 12 段；全项目唯一 |
| `parent` | string | null | ✅ | 唯一存储的结构引用；**MUST 等于 id 去掉最后一段**；根（单段 id）MUST 为 `null` |
| `name` | `{zh, en}` | ✅ | 各 ≤ 60 字符，均非空 |
| `description` | `{zh, en}` | ✅ | 各 ≤ 500 字符，均非空 |
| `source` | array of `{path, line?, end_line?}` | ✅ | repo 相对 POSIX 路径（正斜杠，禁 `..`/`/` 绝对/`\`）；根模块允许 `source: []`（记 notice） |
| `revision` | string | ✅ | 40 位 git SHA（生成时仓库提交） |
| `updated_at` | string | ✅ | ISO 8601 |
| `fingerprint` | string | ✅ | `source` 的确定性指纹（v1 全量哈希）：按 `source.path` 升序，逐个 `update(UTF-8(path)) + update(0x00) + update(文件字节)` 后取 SHA-256；用 `normify_fingerprint` 计算 |
| `state` | string | 可选 | `active`（默认）| `planned`（计划态）| `deprecated`（废弃）；planned 允许 `source` 未落地且 `fingerprint: pending` |
| `replacement` | string | 可选 | 仅 `state: deprecated`：替代模块 id（必须存在） |
| `tags` | string[] | 可选 | ≤12 个自由标签，用于检索/分组/开发指引 |
| `apis` | array | 叶子必填 | **只允许叶子持有**；根模块 MUST NOT 有 `apis` |
| `deps` | array | 可选 | 出向依赖箭头，**只在源端存储** |

### 2.3 API 条目

```yaml
apis:
  - protocol: http            # http | ws | rpc | amqp | kafka | mysql | redis | file | grpc | graphql
    method: POST              # 仅 http 必须；其余 MUST NOT 出现
    path: /api/v1/orders/{order_id}/pay   # URL 路径或 topic/队列名/表名
    description:
      zh: 发起支付请求。
      en: Initiates a payment for an order.
```

- **API 键（key）**：http 类为 `METHOD path`（METHOD 大写）；其余为 `protocol:path`。全项目唯一。
- **未接任何箭头的 API 完全合法**：不产生任何诊断（含 warning）。API 的存在性独立于边。

### 2.4 两类边

| 边 | 表达 | 存储 | 约束 |
|---|---|---|---|
| **containment**（父子） | `parent` | 每模块自存 parent | 每棵树恰好一个根；无环；`parent == derive(id)` |
| **dependency**（箭头） | `deps` 数组 | 只存源端 | 目标存在（可跨树）；可指向模块或目标模块的 API |

```yaml
deps:
  - kind: call                # call | event | dataflow | reference
    to: demo.order.checkout.invoice     # 目标模块 id（MUST 存在，可跨树）
    from_api: POST /api/v1/orders/{order_id}/pay   # MAY：本模块 API（仅叶子可用）
    to_api: POST /internal/invoices                  # MAY：目标模块自身 API
    label: { zh: 开票, en: Create invoice }          # MAY：各 ≤ 30 字符
```

- MUST：`to != id`（禁自环）；`(from_api?, to, to_api?, kind)` 组合不重复；
- MUST：`from_api` 为本模块 API（非叶子禁用）；`to_api` 为目标模块自身 API。

### 2.5 树与多树（v1 原生支持）

- **树 = 以某个单段 id 的根模块为顶的整棵子树**。树名（treeId）= 根模块 id。
- 多树 = 存在多个 `parent: null` 的根（MUST ≥ 1）。每棵树的根各自在 frontmatter 声明 `repository`（该树对应仓库的 URL，展示/跳转用）。
- **跨树箭头 = 普通 `deps`**：`to` 直接引用另一棵树的模块 id 或 API。**零新语法**，单树场景完全无感。
- 典型场景：一组互相调用的 MC 模组 = 每个模组一棵树 + 若干跨树箭头。

### 2.6 叶子规则

- **叶子 = 没有任何模块以它为 parent**（索引导出；不存 `children`、不存 `is_leaf`）。
- 叶子 MUST 有 `apis`（空数组 → warning"无接口的功能单元"）。
- 非叶子与根 MUST NOT 出现 `apis` 键。
- 叶子晋升容器：由工具迁移 `x.md` → `x/index.md` 并重写子级 parent（§6.4）。

---

## 3. 源格式规范

### 3.1 目录约定

- 结构数据目录 MUST 名为 `normify-<项目slug>/`（slug = 项目文件夹名小写化、空格/非法字符替换为 `-`），MUST 放在 **DSH 对话的工作目录**下。
- 单项目对话多项目时 = 多个 `normify-*` 目录并存，互不干扰。

### 3.2 文件布局（目录树 = 模块树；多树 = 多棵子树）

```
normify-demo-repo/               # 结构数据目录（工作目录下）
├── modules/
│   ├── demo/                    # 树 1（treeId: demo）
│   │   ├── index.md             # 根模块（id: demo，parent: null）
│   │   ├── auth.md              # 叶子（id: demo.auth）
│   │   └── order/
│   │       ├── index.md         # 容器（id: demo.order）
│   │       └── checkout/
│   │           ├── index.md     # 容器（id: demo.order.checkout）
│   │           └── payment.md   # 叶子（id: demo.order.checkout.payment）
│   └── helper-lib/              # 树 2（treeId: helper-lib，被 demo 跨树调用）
│       ├── index.md
│       └── utils.md
├── policy.yml                   # 架构规则（项目创建时自动安装；normify_validate 强制执行）
├── changes/                     # 开发变更日志（每次任务一份 JSON，随结构目录回档）
│   └── 2026-09-12-add-feature.json
├── renders/                     # 渲染数据集（仅容器模块；与 modules/ 一一对应）
│   ├── demo.json                # 根 demo 层的排布（mode/order/groups/reading/edge_hints）
│   └── demo/order.json          # demo.order 层
├── outline.md                   # 派生：全项目索引（AI 导航入口）
├── tree.json                    # 编译产物（渲染器唯一输入）
├── api-index.json               # 派生：API key → 模块 id 反查表
└── receipt.json                 # 派生：构建回执
```

- 容器模块文件 = `<最后一段>/index.md`；叶子 = `<最后一段>.md`。
- 映射规则：`id = (modules/ 下相对路径，去文件名，/ → .)`；根文件 `<treeId>/index.md` 的 id = `treeId`（唯一例外）。
- 深度上限：id 段数 ≤ 12（含树名段）。

### 3.6 渲染数据集（renders/，v0.3）

结构数据描述“是什么”，渲染数据描述“这一层怎么画”，两者并行且同步维护：

- **只存在于容器模块**（有子模块的模块）；叶子没有子层，不需要渲染数据。
- 文件路径：`renders/<id 的点号换斜杠>.json`，与容器模块一一对应：
  `renders/demo.json`、`renders/demo/order.json`、`renders/demo/order/checkout.json`。
- 字段（JSON，`normify_layout_upsert` 写时校验并补 `schema_version/id/updated_at`）：

| 字段 | 约束 |
|---|---|
| `mode` | `auto` / `groups` / `layers` / `grid`（可选，默认 auto） |
| `max_columns` | 1..6 整数（可选） |
| `order` | 直接子模块 id 数组，不重复；未列出的按启发式追加（warning） |
| `groups` | `[{id, title:{zh,en}, children:[...]}]`；children 必须是直接子模块且不重复、不跨组 |
| `reading` | `{zh,en}` 非空双语，显示在图上方 |
| `edge_hints` | `[{from,to,kind?,lane?,style?,bundle?,priority?}]`；from/to 必须是直接子模块且存在对应 `deps` 边 |
| `schema_version` | 1 |

- 校验：`layout/orphan`（无对应模块）、`layout/not-container`（叶子不该有）、`layout/order-child`、`layout/group-child`、`layout/hint-edge-missing` 等为 error；`layout/missing`（容器缺渲染数据）为 warning。
- 编译：渲染数据编入 `tree.json.layouts`；`normify_render` 的查看器在点开任意模块时，结构数据 + 该层渲染数据一起消费。

### 3.3 frontmatter 严格 YAML 子集

只允许：普通标量、`{zh, en}` 内联映射、数组、`>` 折叠块、双引号字符串。**禁用**：锚点/别名（`&`/`*`）、`|` 块、复杂 flow、TAB 缩进、非 UTF-8。解析失败 = error，报告精确行号。

### 3.4 正文（body）

- 每个模块文件 SHOULD 有正文：给人类读者的展开介绍（可含图/表/链接），与 frontmatter 介绍一致但可更详细。
- v1 渲染器 MUST NOT 消费正文（仅人用编辑器/仓库阅读）。

### 3.5 完整示例模块文件

`modules/demo/order/checkout/payment.md`（treeId = `demo`，id = `demo.order.checkout.payment`）：

````markdown
---
uid: 8f3a9c2e
id: demo.order.checkout.payment
parent: demo.order.checkout
revision: 9f1a1cf0b6e9e2a3d4c5b6a7f8e9d0c1b2a3f4e5
updated_at: 2026-08-30T12:00:00Z
fingerprint: e3b0c44298fc1c149afbf4c8996fb924
source:
  - path: src/order/checkout/payment.ts
    line: 12
    end_line: 340
name:
  zh: 支付
  en: Payment
description:
  zh: >
    负责订单支付：对接支付渠道、处理回调、维护支付状态机，
    并向发票模块发起开票请求。
  en: >
    Handles order payment: channel integration, callback processing,
    payment state machine, and invoice requests.
apis:
  - protocol: http
    method: POST
    path: /api/v1/orders/{order_id}/pay
    description:
      zh: 发起支付请求。
      en: Initiates a payment for an order.
  - protocol: kafka
    path: payment.completed
    description:
      zh: 支付完成后发布的事件。
      en: Event published after a successful payment.
deps:
  - kind: call
    to: demo.order.checkout.invoice
    from_api: POST /api/v1/orders/{order_id}/pay
    to_api: POST /internal/invoices
    label: { zh: 开票, en: Create invoice }
  - kind: call
    to: helper-lib.utils
    from_api: POST /api/v1/orders/{order_id}/pay
    to_api: rpc:format_amount
    label: { zh: 金额格式化, en: Format amount }
---

# 支付模块

（正文 = 给人类读者的展开介绍，可含图、表、链接；v1 渲染器不消费。）
````

---

### 3.7 模块生命周期与计划态（v0.4）

- `state` 可选，缺省 = `active`；序列化时 active 不落盘（旧数据零差异）。
- **planned（计划态）**：先建树、后实现。`source` 可指向尚未落地的文件；`fingerprint` 允许 `pending`（仅 planned 或空 source 模块）。
  - `normify_validate` 对 planned 的未落地 source 记 warning（不阻断）；active 的缺失/漂移仍为 error。
  - 实现后用 `normify_module_refresh({ ids, activate: true, repoRoot })`：重算指纹与 revision、转 active；源码未落地时 activate 报 error（禁止假激活）。
  - 容器/根模块没有 source：子树全部落地后同一次 refresh 会激活（fingerprint 保持 pending）。
- **deprecated**：可带 `replacement`；指向 deprecated 的 `deps` 记 `deprecation/inbound` warning，`replacement` 不存在为 error。

### 3.8 架构规则 policy.yml（v0.4）

- 位置：结构数据目录根 `policy.yml`；项目创建（`resolveProject(create)`）时自动安装默认模板（含 `core-acyclic` 与“禁止指向废弃模块”警告 + 全部规则类型的注释示例）。
- 规则类型（severity 默认 `error`，可 `warning`；`enabled: false` 可临时停用）：

| 类型 | 字段 | 语义 |
|---|---|---|
| `forbid-dependency` | `from[]/to[]`（id 模式，`*` 单段、`**` 任意段）、`kind[]?`、`fromState?/toState?` | 禁止匹配的依赖 |
| `dependency-direction` | `layers[{name,match[]}]`、`allowSameLayer?`、`allowBackward?` | 层顺序即允许方向 |
| `acyclic` | `scope[]?`、`includeCrossTree?` | 依赖图无环 |
| `max-depth` | `maxDepth(1..12)`、`scope[]?` | id 段数上限 |
| `cross-tree` | `mode: forbid / allow / require-to-api` | 跨树依赖策略（require 时必须写 `to_api`） |
| `naming` | `pattern`（正则）、`scope[]?` | 作用域内 id 段的命名约束 |

- 执行：`normify_validate` 产出 `policy/<rule-id>` 诊断（error 阻断 build）；`normify_check` 在动手前对“拟建模块 + 拟加依赖”做同样的模拟校验。
- 工具：`normify_policy_get`（读取/模板/参考）、`normify_policy_upsert`（安装/覆盖，dry_run 可预检）。

### 3.9 开发变更日志 changes/（v0.4）

每个开发任务一份 `changes/<YYYY-MM-DD-slug>.json`，随结构目录一起回档：

```json
{
  "schema_version": 1,
  "id": "2026-09-12-add-feature",
  "title": { "zh": "新增功能", "en": "Add feature" },
  "status": "in_progress",
  "intent": { "zh": "意图与背景", "en": "Intent" },
  "modules": { "create": ["demo.new"], "modify": ["demo.core"], "delete": [], "api_add": [], "api_remove": [] },
  "acceptance": ["validate 0 error"],
  "revision": { "before": null, "after": null },
  "created_at": "…", "updated_at": "…", "closed_at": null
}
```

- 工具：`normify_change_open/update/list/close`；`close` 流程 = 刷新 create/modify 指纹并激活 planned → `validate` **0 error 强制** → `build`（可选 render）→ 标记 `verified` + `revision.after`；任何一步失败都不关闭。
- L2 校验：变更引用的模块必须存在（计划态允许）；`change/module-missing`、`change/create-not-landed` 等为 error；多个 in_progress 记 warning。

### 3.10 伴随开发提醒钩子（可选，默认关）

- 插件配置 `devCompanionReminder`（默认 `false`）与 `devCompanionReminderAfter`（默认 `8`）：
  开启后监听 `tools/post-execute`，连续 N 次"写文件类"工具调用后，在下一次写工具结果里追加一条提醒，
  建议 `normify_sync` / `normify_change_close` 同步结构树与渲染数据。
- 只提醒、不自动改写结构；不开启时不注册任何监听。patch 示例：

```yaml
- insert:
    - id: dsh-normify
      name: '@dsh-external/dsh-normify'
      config:
        devCompanionReminder: true
        devCompanionReminderAfter: 8
```

## 4. 编译产物规范

### 4.1 `tree.json` 结构（节选）

```json
{
  "schema_version": 1,
  "project": {
    "name": "demo-repo",
    "trees": [ { "tree_id": "demo", "root_uid": "a1b2c3d4", "repository": "https://github.com/owner/demo" } ],
    "revision": "9f1a1cf...",
    "compiled_at": "2026-08-30T12:05:00Z",
    "stats": { "tree_count": 2, "module_count": 412, "leaf_count": 371, "api_count": 1830, "dep_count": 962, "cross_tree_dep_count": 14, "max_depth": 6, "layout_count": 41, "planned_count": 3, "deprecated_count": 1, "policy_rule_count": 5, "change_count": 2, "open_change_count": 1 }
  },
  "modules": {
    "demo.order.checkout.payment": {
      "uid": "8f3a9c2e",
      "id": "demo.order.checkout.payment",
      "parent": "demo.order.checkout",
      "tree": "demo",
      "depth": 4,
      "name": { "zh": "支付", "en": "Payment" },
      "description": { "zh": "...", "en": "..." },
      "source": [ { "path": "src/order/checkout/payment.ts", "line": 12, "end_line": 340 } ],
      "revision": "9f1a1cf...",
      "updated_at": "2026-08-30T12:00:00Z",
      "fingerprint": "e3b0c442...",
      "apis": [ { "key": "POST /api/v1/orders/{order_id}/pay", "protocol": "http", "method": "POST", "path": "...", "description": { "zh": "...", "en": "..." } } ],
      "deps": [ { "kind": "call", "to": "helper-lib.utils", "from_api": "...", "to_api": "rpc:format_amount", "cross_tree": true, "label": { "zh": "...", "en": "..." } } ],
      "aggregate": { "descendant_count": 0, "own_api_count": 2, "inherited_api_count": 0, "dep_out": 2, "dep_in": 3 }
    }
  },
  "api_index": {
    "POST /api/v1/orders/{order_id}/pay": "demo.order.checkout.payment",
    "kafka:payment.completed": "demo.order.checkout.payment"
  },
  "policy": { "schema_version": 1, "updated_at": "…", "rules": [] },
  "changes": [ { "id": "2026-09-12-add-feature", "status": "in_progress", "title": { "zh": "…", "en": "…" } } ],
  "layouts": { "demo": { "schema_version": 1, "id": "demo", "updated_at": "...", "mode": "groups", "order": ["demo.order","demo.auth"], "groups": [], "reading": { "zh": "…", "en": "…" } } },
  "edges": [
    { "from": "demo.order.checkout.payment", "from_api": "...", "to": "helper-lib.utils", "to_api": "rpc:format_amount", "kind": "call", "cross_tree": true, "label": { "zh": "...", "en": "..." } }
  ]
}
```

### 4.2 派生内容（编译时计算，源中不存）

- `tree`（所属树）、`depth`、`aggregate`、`api_index`、`edges`、`cross_tree` 标记；
- `outline.md`：全项目 `id + 名称 + 一行介绍 + 统计` 分层大纲（含多树分节）。

### 4.3 冻结与回执

- 编译通过后冻结 `tree.json` 字节 → `receipt.json`（校验摘要、SHA-256、字节数、统计、warning 清单）。
- 存在 error 时 MUST NOT 产出任何产物（fail-closed），旧产物保持原样。
- HTML 页脚 MUST 仅展示**摘要**（构建时间、模块数、API 数、哈希前 12 位）；完整回执只落文件。

---

## 5. 校验规范

### 5.1 三层校验

| 层 | 时机 | 内容 |
|---|---|---|
| L1 单文件 | `normify_module_upsert` 写入时 | frontmatter 解析、字段类型、必填、id/uid 格式、YAML 子集 |
| L2 全项目 | `normify_validate` / `normify_build` | 多树结构、无环无孤儿、parent 一致性、文件↔id 映射、API 全局唯一、边两端存在、叶子规则、双语完备 |
| L3 冻结 | `normify_build` 收尾 | 产物完整性、哈希、回执 |

### 5.2 规则全集（error 级 MUST）

**结构类**
1. `uid` 8 位小写 hex，全项目唯一；
2. `id` 段格式合法、全项目唯一、段数 ≤ 12；
3. `parent: null` 的根 ≥ 1（每棵树一个根）；根的 id 必为单段；
4. 非根 `parent` 存在且等于 id 去尾段；
5. 无孤儿（可回溯到某个根）、无环（DFS）；
6. 文件位置与 id 映射一致（§3.2 规则）；`modules/` 下无游离文件、无空树目录；
7. `name/description` 双语义非空不超长；
8. `revision` 40 位 SHA；`updated_at` ISO 8601；`fingerprint` 非空。

**API 类**
9. 非叶子与根出现 `apis` → error；叶子必须有（空数组 → warning）；
10. API key 全项目唯一；`protocol` 在枚举内；http 必须/非 http 禁止 `method`；
11. API 双语 description 非空。

**边类**
12. `deps[].to` 存在（悬空 → error，诊断附反查引用方）；
13. `to != id`；`(from_api?, to, to_api?, kind)` 不重复；
14. `from_api` 为本模块 API（非叶子禁用）；`to_api` 为目标模块自身 API；
15. `kind` ∈ `call | event | dataflow | reference`。

**一致性类（有仓库上下文时）**
16. `--repo-root` 给定：`source.path` 存在（缺失 → error，提示 `normify_sync`）；`fingerprint` 与按 §5.2 算法重算的值一致（不一致 → error，提示用 `normify_fingerprint` 重算）；
17. **未接箭头的 API：合法，不产生任何诊断**（含 warning）。
18. `state`/`replacement`/`tags` 形状合法；replacement 指向存在模块；deprecated 入边记 warning；
19. `policy.yml` 存在且规则合法；规则命中产出 `policy/<rule-id>`（severity error 阻断）；
20. `changes/*.json` 形状合法、引用模块存在、状态与 closed_at 自洽；close 要求全项目 0 error。

**warning 级（不阻断）**：叶子 `apis: []`；根 `source: []`；根无子模块（空树）；正文缺失；`--repo-root` 未给定而存在 `source` 时的一致性跳过提示。

### 5.3 诊断格式（面向 LLM）

每条诊断 MUST 含 `code/severity/message/subject/evidence/supportedFixes`（Archify 模式）：

```json
{
  "code": "structure/parent-mismatch",
  "severity": "error",
  "message": "parent 字段与 id 推导不一致",
  "subject": { "module": "demo.order.checkout.payment", "path": "/parent" },
  "evidence": { "parent": "demo.order", "derived": "demo.order.checkout" },
  "supportedFixes": ["将 parent 改为 demo.order.checkout"]
}
```

修复 MUST 只动 `subject` 指向位置、采纳 `supportedFixes` 之一；重跑至 **0 error**；warning 全部记入回执。

### 5.4 `kind` 枚举与扩展兼容性

- 定稿：`call | event | dataflow | reference`。
- **新增枚举值向后兼容**：新值只出现在未来数据里；旧渲染器遇未知值按 `reference` 样式渲染并记 warning；扩展成本 = 校验器与渲染器各改一处常量表。**因此 v1 不加 `publish/subscribe`，留待真实需求出现时低成本扩展。**

### 5.5 双语强制与开关

- 默认：双语缺失 = error（MUST）。
- profile 级开关 `requireBilingual: false` 时降级为 warning（实现成本低，按需提供）。

---

## 6. 生成器规范

### 6.1 形态：技能 + 工具

- 技能 `skills/normify-gen/SKILL.md`：分析策略、创作规程、增量再生成策略（§6.3 原文收录）。
- 工具集（§6.4）：AI 经工具写结构数据，**写时即过 L1 校验**，不裸写文件。

### 6.2 初始全量生成流程（SKILL.md 收录）

1. **确认范围**：目标仓库（可多个，多树时逐仓库处理）、当前 `revision`、结构数据目录 `normify-<slug>/`；
2. **顶层骨架**：每仓库产出一棵树（根 = 项目名 slug，一级 3–8 个模块）；
3. **逐层下钻**：直到叶子（"单一功能单元"判据：一个文件/类/服务/一组内聚路由，不再需要更细粒度）；
4. **叶子收尾**：提取全部 API（路由/RPC/事件/表/队列），逐一写双语简介；
5. **箭头补全**：从 import/调用点提取出向依赖写 `deps`；**跨仓库调用 = 跨树箭头，直接指向目标树模块**；
6. **证据落盘**：`source`/`revision`/`fingerprint`（fingerprint 调 `normify_fingerprint` 计算）；
7. **逐文件写入**（写时校验）；8. **`normify_build`** 至 0 error；9. **`normify_render`** 交付路径 + 回执摘要。

**规模控制**：每轮至多 20 模块；超大树分层分轮提交，每轮 0 error 收尾。

### 6.3 增量再生成策略（SKILL.md 核心章）

**触发**：用户要求同步；或给定 `git diff`（默认 `revision..HEAD`，多树时逐树 diff）。

1. **取 diff 文件路径集 P**（逐树归属）；
2. **脏子树定位**：`source.path` 前缀匹配 → 直接命中集 A；A 的祖先标"待复核"（统计/介绍/职责边界可能变）；
3. **深到浅重建**：叶子重读代码（增删 API、更新介绍、必要时拆分晋升）；祖先只复核介绍与子级变化，不重读全部代码；`source` 全部失效的模块 → 删除模块及子树，**用反查修复所有指向它的 `deps`（含跨树）**；
4. **重校验 + 重编译**：`normify_validate` → `normify_build`，0 error 才交付；
5. **更新 `revision/fingerprint/updated_at`** 于所有改动模块；
6. **汇报变更摘要**：新增/删除/拆分/合并/改名模块与 API、增删边清单（标注跨树）。

**铁律**：只重写受影响子树文件；不动无关模块；增量后全项目校验仍 0 error；宁可本轮少做，不可留脏数据。

### 6.4 工具清单（v1）

| 工具 | 作用 |
|---|---|
| `normify_tree_list()` | 列出全部树（treeId + 根模块 + 仓库 URL） |
| `normify_module_get(id|uid)` | 读单个模块 |
| `normify_module_list(parent?|tree?, prefix?)` | 列模块（含统计） |
| `normify_module_upsert(frontmatter, body)` | 写模块，写时 L1 校验，幂等 |
| `normify_module_delete(id)` | 删模块及子树（附悬空边预警清单，含跨树） |
| `normify_module_promote(id)` | 叶子晋升容器（文件迁移 + 子树 parent 重写） |
| `normify_validate()` | 全项目校验（0 error 门禁） |
| `normify_build()` | 编译 tree.json + outline + api-index + 回执 + 冻结 |
| `normify_sync({diff?}, --dry-run)` | 增量再生成驱动（返回脏子树清单供 AI 分析） |
| `normify_search(query)` | 跨 id/name/description/API 检索 |
| `normify_deps_find(to=id)` | 反查"谁依赖我"（删除/改名前的安全网，含跨树） |
| `normify_outline()` | 再生成 outline.md |
| `normify_fingerprint(repoRoot, source)` | 按引擎算法计算 source 指纹 |
| `normify_layout_get(id)` | 读某容器模块的渲染数据 |
| `normify_layout_upsert(id, mode?, max_columns?, order?, groups?, reading?, edge_hints?)` | 写/覆盖渲染数据（写时校验） |
| `normify_layout_delete(id)` | 删除渲染数据（回退自动布局） |
| `normify_render(tree.json, out.html, {lang, theme})` | 渲染（§7） |
| `normify_module_patch(id, patch, expect_updated_at?)` | 部分更新（并发保护 / dry_run） |
| `normify_module_batch(items, mode, dry_run?)` | 原子批量 upsert/patch |
| `normify_module_move(id, new_id?|new_parent?, dry_run?)` | 改名/移动子树（级联 deps/渲染数据） |
| `normify_module_refresh(ids|all, repoRoot, activate?)` | 重算指纹/revision；planned → active |
| `normify_policy_get()` / `normify_policy_upsert(rules)` | 架构规则读取/安装 |
| `normify_check(modules?, deps?)` | 设计前预检（核心约束 + policy） |
| `normify_brief(task?|id?|files?)` | 开发指引（契约/影响面/规则/建议/清单） |
| `normify_change_open/update/list/close` | 变更日志；close 强制 0 error |

工具白名单：只允许读写指定 `normify-*` 目录与只读指定仓库；其余路径一律拒绝。

### 6.5 生成器护栏

- 只读仓库，绝不改源码；
- 每个模块必须有 `source` 证据（根/纯文档模块除外，记 notice）；
- 深度 ≤ 8，超限禁止下钻（诊断建议合并）；
- 双语缺失 = error（除非 profile 放宽）；
- 未接箭头的 API 保持原样，**不得**因"孤立"而删除。

---

## 7. 渲染器规范

> v0.4.1（渲染器 v3）：连线只走"自由通道"并保持 ≥16px 框体间距；viewBox 由全部几何包围盒动态计算，连线不会出界；
> 叶子框内展示 API 明细行（最多 4 行 + `+N`），精确边按 `from_api/to_api` 锚定到 API 行端口（API 直接连线）；
> 跨层依赖聚合为虚线 `×N` 边（tooltip 列明细）；支持缩放与悬停高亮。模块总量不设上限，粒度到单一功能单元。


### 7.1 形态与输入

渲染输入 = `tree.json`（结构数据 + 编入的 `layouts` 渲染数据）。查看器在每一层同时消费：结构数据给出模块/API/边，渲染数据给出该层的 `order`/`groups`/`mode`/`reading`/`edge_hints`；无渲染数据时回退自动布局（依赖分层 / 均衡网格）。连线由渲染器在运行时智能编排（不是结构数据的一部分）。

- 输入：**仅 `tree.json`**。
- 输出：**单文件自包含 HTML**（内联 CSS/JS、无外部依赖），写入工作区，**通过 DSH 现有 Web/工作区能力打开**；工具 MUST 返回产物精确路径。
- v1 不开发 client UI 面板、不做多平台适配；若未来 DSH 提供内嵌预览能力，MAY 对接（不自行造客户端）。

### 7.2 核心交互（作者已确认的行为规范）

1. **未展开的模块节点：只显示名称**。
2. **悬停：tooltip 显示介绍**（当前语言的 `description`；叶子同此规则）。
3. **点击容器/根模块：进入该模块层**——层头显示本模块**名称 + 介绍**（双语按语言）+ 面包屑 + 统计；主体 = 子模块图（各子节点同样只显名称、悬停出介绍）+ 本层箭头 + 进出箭头。
4. **点击叶子：打开模块详情视图**（名称+介绍+全部 API+`deps` 列表+source 跳转链接）。
5. **面包屑**：`demo / order / checkout / payment`，任意段可回跳；多树时首段为树名。
6. **一键语言切换**：`中 / EN` 按钮，全局切换所有 `name/description/label`（结构化双语，不依赖浏览器翻译）。
7. **搜索**：顶栏搜索，走 `api_index` 与模块索引，命中即跳转。
8. **进出边展示**：当前层每个节点显示与其他子树/树的箭头（出边实线、入边虚线，跨树箭头标注目标树名）。

### 7.3 API 聚合渲染（防"上层几千个 API"）

原则：**编译时算好、渲染时按需展开，绝不一次性平铺。**

- 详情面板三区：① 本模块 API（仅叶子）；② 继承 API（按直接子模块分组折叠：`invoice (12)`，展开再按孙分组，**递归惰性**）；③ 空态说明。
- **API 浏览器视图**：左树导航 + 右**虚拟化滚动列表**（只渲染可视区），按 protocol/method 过滤 + 全文搜索。
- 性能目标（M2 验收）：412 模块/1830 API 首屏 < 1s；3000 模块/10000 API 展开任意组 < 50ms。

### 7.4 多树视图

- 多树时：顶层 = **树根列表**（每树一个节点：名称 + 悬停介绍 + 仓库 URL 链接），点击进入该树。
- 单树时：直接进入该树（无树选择层）。
- 跨树箭头在任意层级视图中可见，标注 `树名` 前缀。

### 7.5 视图模式

| 视图 | 内容 |
|---|---|
| 分层图（默认） | 当前层模块框（名称 only）+ 本层箭头 + 进出边；点击下钻 |
| 大纲 | 全项目可折叠目录 + 统计（读 `outline.md` 编译数据），按树分节 |
| 模块详情 | 叶子：介绍 + API + deps + source 跳转；容器：见 §7.3 聚合面板 |
| 依赖视角 | 选中 API/模块 → 高亮上下游可达（沿 `edges`），回答"谁调用了 X" |

### 7.6 深链接规范

| 链接 | 行为 |
|---|---|
| `normify.html#module=demo.order.checkout.payment` | 下钻到该模块层并聚焦 |
| `normify.html#tree=helper-lib` | 进入某棵树 |
| `normify.html#api=POST%20%2Fapi%2Fv1%2Forders%2F%7Border_id%7D%2Fpay` | 聚焦 API，显示归属模块与上下游 |
| `normify.html#view=outline` | 大纲视图 |
| `?lang=en/zh` · `?theme=dark/light` | 初始语言 / 主题 |

### 7.7 导出（v2+）

当前层 PNG/SVG 导出等能力**不进入 v1**，渲染器稳定后以 v2 特性加入。

---

## 8. 插件工程规范

### 8.1 包结构（hybrid：工具 + 技能）

```
dsh-normify/
├── package.json              # name: @dsh-external/dsh-normify + dsh.bundle.patch
├── cordis.patch.yml          # DSH 0.1.5+ bundle 层：把插件行挂进 profile
├── lib/
│   ├── index.js              # 宿主入口：注册 18 工具 + normify-gen 运行时技能
│   ├── tools/                # §6.4 工具实现（标准 JSON Schema 参数）
│   ├── layout.js             # 渲染数据集：读写/校验 renders/*.json
│   ├── compiler/             # 源树解析 → tree.json（含校验核心）
│   └── renderer/             # tree.json + layouts → 单文件 HTML
├── skills/
│   └── normify-gen/SKILL.md  # 生成器技能（§6.2 + §6.3 全文收录）
├── assets/template.html      # 查看器模板
└── README.md
```

### 8.2 开发与安装闭环（DSH 0.1.5+ / 桌面端）

```bash
npm run build                      # 构建 lib/
dsh plugin --profile web-desktop add <本目录绝对路径>   # 装入桌面端 profile，自动登记 bundle 层
# 重启 DSH 生效；dsh --profile web-desktop --dump-config 可检查组合树
```

### 8.3 测试策略

- 校验器单测覆盖全部违规类型（含多树：双根合法、N 根、跨树悬空边、跨树自环…）+ 诊断快照；
- 编译器金样哈希比对；渲染器金样（含悬停/下钻/深链用例）；端到端小仓库闭环。

---

## 9. 里程碑与验收标准

| 里程碑 | 交付物 | 验收标准 |
|---|---|---|
| **M0 格式与校验器**（纯 CLI，无 DSH） | 规范定稿、L1/L2/L3 校验器、编译器、冻结回执 | 手工 3 层 20 模块样例树 + 第二棵树 + 跨树箭头：`normify_build` 通过；每类违规被精确定位为 error；回执含 SHA-256 |
| **M1 生成器**（DSH 工具 + SKILL.md） | §6.4 工具集、`normify-gen` 技能 | 单仓库从零生成 0 error、source 可跳转；AI 依据诊断自行修复至通过 |
| **M2 渲染器 MVP** | `normify_render`、单文件 HTML、名称/悬停/下钻交互、多树根选择器、深链接、语言切换、API 聚合视图 | §7.3 性能目标达成；深链接全直达；跨树箭头正确标注树名；千级 API 不卡顿 |
| **M3 增量再生成** | `normify_sync`、fingerprint 防漂移、悬空边反查修复（含跨树） | 改 2 个文件同步：只重写受影响子树（diff 可证）、全项目 0 error、变更摘要准确 |
| **M4 体验完善** | API 浏览器、依赖视角、大纲视图、主题 | 全部视图在 412 模块样例可用；无 JS 报错 |
| **M5 规模化与发布** | 3000+ 模块压测、npm 打包、`dev_release_plugin` | 构建 < 秒级、首屏 < 1s；`dev_self_test` 全 PASS |
| **v2 候选** | 当前层 PNG/SVG 导出、正文渲染、client UI（若 DSH 提供内嵌能力）、fingerprint 采样 | 按需启动 |

---

## 10. 风险与对策

| # | 风险 | 对策 |
|---|---|---|
| 1 | 上层 API 聚合爆炸 | 编译期 `api_index`+计数；递归惰性分组 + 虚拟列表（§7.3，M2 压测） |
| 2 | 模块重命名级联 | `uid` 保 diff 稳定；`normify_module_promote`/改名工具统一迁移；悬空边 error 逼出修复 |
| 3 | YAML 解析歧义 | 严格子集（§3.3）+ 写时校验 + 精确行号 |
| 4 | 双语漏写 | 默认 error 门禁 + profile 开关 |
| 5 | 数据与代码漂移 | `revision`+`fingerprint`+`normify_sync` |
| 6 | 大树超上下文 | 每模块独立文件 + `outline.md` + 检索工具 |
| 7 | 纯树掩盖真实依赖 | 两类边分离 + 跨树箭头 + 依赖视角 |
| 8 | Windows 路径深度 | id ≤ 12 段硬上限；容器/叶子文件形态由工具维护 |
| 9 | 校验器自身缺陷 | 全违规类型单测 + 诊断快照 + 编译器金样 |
| 10 | 多树数据膨胀 | 树按目录分区、按树 diff/同步、`normify_tree_list` 隔离操作面 |

---

## 11. 兼容性与迁移承诺

1. **`schema_version`**：当前为 1；破坏性变更 MUST 升版本并提供迁移工具。
2. **`kind` 枚举扩展**：新增值向后兼容（§5.4），不升版本。
3. **`id`/`uid` 命名空间**：全项目（跨树）唯一；`uid` 一经分配终身不变。
4. **产物格式**：`tree.json` 字段新增遵循"加不减、语义不变"原则；渲染器 MUST 忽略未知字段。
5. **草案迁移**：ModTree 草案中的单树布局（`modules/index.md` 为根）MUST 按 §3.2 迁移为 `modules/<treeId>/index.md`（M0 提供一次性迁移脚本或用生成器重建）。

---

## 12. 附录

### 12.1 关键设计原则

1. 单方向引用：只存 `parent`、只存出向 `deps`；反向关系全由索引导出。
2. 单一事实源：API 只在叶子存一次；聚合/统计/索引全是派生数据。
3. 派生优于存储：`depth/tree/children/aggregate/api_index/outline` 不进源。
4. fail-closed：任何 error 不产产物；诊断必带 subject/evidence/supportedFixes。
5. 人机共读：Markdown 源 + JSON 产物 + HTML 视图。
6. 增量优于全量：只重建脏子树，但全项目校验永远 0 error。
7. 不发明新格式：Markdown + JSON，规避 grep tax。
8. 叶子即功能：API 与最细功能单元绑定，孤立 API 与有边 API 同等合法。
9. **树 = 导航骨架，箭头 = 真实图**；多树零新语法。

### 12.2 验收剧本（MC 多模组场景）

1. 用户："分析 `core-mod` 与 `addon-mod` 两个仓库并生成结构图"（addon 依赖 core）。
2. AI：逐仓库生成两棵树（`core-mod`、`addon-mod`）→ addon 调用 core 的 API 写成跨树 `deps` → `normify_build` 0 error → `normify_render`。
3. 用户打开 `normify.html`：树根列表两个节点，进入 `addon-mod` 逐层下钻，跨树箭头标注 `core-mod`。
4. core 的 API 变更后：AI 跑 `normify_sync` 只重建 core 相关子树与 addon 的跨树箭头 → 0 error → 重新渲染。

---

*Normify 规范 v1.0 完。实现从 M0 开始：先按 §3/§5 落地校验器与编译器。*
