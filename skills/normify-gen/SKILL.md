---
name: normify-gen
description: Analyze one or more code repositories and produce a Normify module-tree structure database (per-module Markdown files with strict YAML frontmatter), then validate, build, and render it into an explorable drill-down HTML diagram. Use when the user asks to map a project's framework/architecture into Normify modules, update an existing normify-* structure after code changes, or locate the module structure responsible for a feature. Covers bilingual (zh/en) module descriptions, leaf-only APIs, containment plus cross-tree dependency edges, zero-tolerance validation, and incremental subtree regeneration.
---

# Normify 生成器技能（normify-gen）

你是 Normify 结构数据的**生成器**：分析一个或多个代码仓库，产出"人机共读"的模块树结构数据库（分形树：每个模块结构完全相同，点开即子层，叶子承载 API），并负责校验、编译、渲染。

## 0. 铁律（MUST）

1. **只读仓库**：绝不修改任何源码。结构数据只写入 `normify-<slug>/` 目录。
2. **写时校验**：模块一律经 `normify.module.upsert` 写入（工具内置 L1 校验），不裸写文件。
3. **零容忍**：任何阶段以 `normify.validate` 的 **0 error** 为收尾标准；warning 记录但不阻断。
4. **单方向引用**：只写 `parent` 与出向 `deps`；`children` 字段不存在。
5. **API 只在叶子存一次**：非叶子（含根）禁止 `apis`；聚合由编译器派生。
6. **未接箭头的 API 完全合法**：不得因"看起来孤立"删除。
7. **双语必填**：`name/description` 的 zh 与 en 均非空（默认 error 门禁）。
8. **增量优于全量**：代码变更只重建受影响子树，但每次增量后全项目校验仍 0 error。

## 1. 数据结构速览

整个数据库 = 无数个结构完全相同的**模块**。每个模块 = 一个 Markdown 文件（frontmatter = 机器读，正文 = 人读可选）。

frontmatter 字段（必填 9 个）：

| 字段 | 规则 |
|---|---|
| `uid` | 8 位小写 hex 随机串；全项目唯一；分配后**永不变**（重命名/移动都保留） |
| `id` | 路径式：`[a-z0-9][a-z0-9-]*` 段以 `.` 连接；**首段 = 树名**；含树名段 ≤ 8 段；全项目唯一。示例 `demo.order.checkout.payment` |
| `parent` | **必须等于 id 去掉最后一段**；根（id 单段）为 `null`。这是唯一存储的结构引用 |
| `name` | `{zh, en}`，各 ≤ 60 字符 |
| `description` | `{zh, en}`，各 ≤ 500 字符，刻意精炼（人/AI 都读它） |
| `source` | 数组 `{path, line?, end_line?}`：代码位置证据。repo 相对路径、正斜杠、无 `..`。根模块允许 `[]` |
| `revision` | 生成时仓库的 40 位 git SHA |
| `updated_at` | ISO 8601（如 `2026-08-30T12:00:00Z`） |
| `fingerprint` | 对 source 文件内容的 SHA-256（hex）。增量同步靠它检测漂移 |

可选字段：

- `repository`：仅根模块，该树对应仓库的 http(s) URL（多树时每棵树各写各的）。
- `apis`：**仅叶子**。条目 = `{protocol, method?, path, description{zh,en}}`。protocol ∈ `http|ws|rpc|amqp|kafka|mysql|redis|file|grpc|graphql`；http 必须有大写 `method`，非 http 禁止 `method`。
- `deps`：出向依赖箭头（只存源端）。条目 = `{kind, to, from_api?, to_api?, label?{zh,en}}`。kind ∈ `call|event|dataflow|reference`；`to` 为目标模块 id（**可跨树**）；`from_api` 只能是本模块 API 键（仅叶子）；`to_api` 只能是目标模块**自身** API 键。

关键定义：

- **树** = 一个 `parent: null` 根模块统领的整棵子树；树名 = 根 id（单段）。
- **叶子** = 没有任何模块以它为 parent（无需存储任何标记）。叶子**必须**有 `apis`（空数组允许但记 warning）。
- **多树** = 多个根。跨树箭头就是普通 `deps`（`to` 指向另一棵树的模块/API），零新语法。典型场景：一组互相调用的 MC 模组。

文件布局（结构数据目录 `normify-<slug>/`，在 DSH 工作目录下）：

```
normify-demo-repo/
├── modules/
│   ├── demo/index.md            # 根（id: demo，parent: null，repository: ...）
│   ├── demo/auth.md             # 叶子（id: demo.auth）
│   └── demo/order/checkout/payment.md   # 叶子（id: demo.order.checkout.payment）
├── outline.md / tree.json / api-index.json / receipt.json   # 编译器派生产物
```

容器模块文件 = `<最后一段>/index.md`；叶子 = `<最后一段>.md`。**文件形态由工具自动维护**：给叶子写第一个子模块时父文件自动晋升为 index.md；删除最后一个子模块时自动降级。

## 2. 工具清单（13 个）

| 工具 | 用途 |
|---|---|
| `normify.tree.list` | 列出全部 normify 项目与树 |
| `normify.module.get` | 读单个模块 |
| `normify.module.list` | 列模块（按父/树过滤，含统计） |
| `normify.module.upsert` | 写模块（L1 校验、幂等、自动晋升父文件） |
| `normify.module.delete` | 删模块及子树（返回悬空边预警） |
| `normify.module.promote` | 叶子晋升容器 |
| `normify.validate` | 全项目校验（0 error 门禁） |
| `normify.build` | 编译 + 冻结（SHA-256 回执） |
| `normify.sync` | 增量再生成**计划器**（只读） |
| `normify.search` | 检索模块/API |
| `normify.deps.find` | 反查"谁依赖我" |
| `normify.outline` | 重建 outline.md |
| `normify.render` | tree.json → 单文件交互 HTML |
| `normify.help` | 字段速查 |

所有工具用 `project`（slug）或 `dir`（结构数据目录绝对路径）定位项目。

## 3. 初始全量生成流程

1. **确认范围**：目标仓库（多仓库 → 多棵树）、当前 `revision`、结构数据目录名（`normify-<slug>`，slug = 项目名小写化）。
2. **顶层骨架**：每仓库产出一棵树——先 `normify.module.upsert` 写根模块（id = 树名 slug 单段，`parent: null`，`repository` 填仓库 URL，`source: []`），再写 3–8 个一级子模块（先广度）。
3. **逐层下钻**：每层先 `normify.module.list` 看当前层，再逐个展开，直到叶子。"单一功能单元"判据：一个文件/类/服务/一组内聚路由，**不再需要更细粒度**。
4. **叶子收尾**：从代码提取该叶子全部 API（HTTP 路由、RPC、事件、表/队列），逐条写双语简介。
5. **箭头补全**：从 import/调用点提取出向依赖写 `deps`；跨仓库调用 = 跨树箭头（`to` 指向目标树模块）。
6. **证据落盘**：每个模块写 `source` / `revision` / `fingerprint`（SHA-256 对 source 文件内容）。
7. **收尾**：`normify.validate` → 修复诊断至 0 error → `normify.build` → `normify.render`。
8. **汇报**：返回 HTML 与 tree.json 的精确路径 + 回执摘要 + 深链示例（`#module=...`）。

**规模控制**：每轮至多写 20 个模块；超大树分层分轮提交，每轮都以 0 error 收尾。

## 4. 增量再生成策略（核心）

**触发**：用户要求同步；或代码有变更。

1. 调 `normify.sync`（传 repoRoot 与 diff 范围，默认 HEAD）→ 得到 changed_files / affected / to_review / drift_fingerprints。
2. **深到浅重建**：
   - affected 中的叶子：重读代码 → 增删 API、更新介绍；职责变大时**拆分**为新子模块（先 `normify.module.promote` 晋升，再写子模块）；
   - affected 中的容器：更新介绍与子级变化，不重读全部代码；
   - to_review 的祖先：只复核 `name/description` 与统计，不重读代码；
   - 模块删除：source 全部失效 → `normify.module.delete`，并**按返回的 dangling_edges 修复所有指向它的 `deps`**（悬空边是 error，逃不掉）；
   - 跨树箭头两端都要检查（目标树变了 API 键时要改 `to_api`）。
3. 重校验 + 重编译：`normify.validate` → `normify.build`，0 error 才能交付；更新所有改动模块的 `revision/fingerprint/updated_at`。
4. 汇报变更摘要：新增/删除/拆分/合并/改名模块与 API、增删边清单（标注跨树）。

**铁律**：只重写受影响子树文件；不动无关模块；宁可本轮少做，不可留脏数据。

## 5. 创作规范细节

- **id 命名**：从代码结构推导（目录/包/服务名转小写段）；同层名字唯一；总段数 ≤ 8；不要用数字开头段。
- **叶子判据**：当某结构不再值得拆开（单文件/单类/单服务）即为叶子，写全部 API。若后期发现它内部还有多个独立功能，promote 后再拆——数据模型天然支持演进。
- **API 提取**：HTTP 路由（`METHOD /path`）、RPC 方法、Kafka topic、AMQP 队列、数据库表（`mysql:orders`）、文件路径等；键全局唯一，重复会 error（合并或细化 path）。
- **箭头提取**：只在能确认调用关系时写 `deps`；`kind` 语义：`call`=同步调用、`event`=发布/订阅事件、`dataflow`=数据管道、`reference`=一般引用。不确定就 `reference` 或干脆不写。
- **双语**：先写中文再译英文；名字保持术语一致（如"支付/Payment"）。
- **YAML 子集**：frontmatter 只用普通标量、`{zh, en}` 内联映射、数组、`>` 折叠块；禁锚点/别名/`|` 块/TAB。长描述用折叠块，其余字符串交给 `normify.module.upsert` 的序列化器处理——**手工编辑文件时也要遵守此子集**。
- **uid 分配**：随机 8 位 hex（如 `a3f9c21b`）；重命名/移动模块时**保留 uid 不变**。

## 6. 完整示例模块文件

`modules/demo/order/checkout/payment.md`（根 id = `demo`）：

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

（正文给人类读者，可选；v1 渲染器不消费。）
````

## 7. 常见诊断 → 修复对照

| 诊断码 | 含义 | 修法 |
|---|---|---|
| `structure/parent-mismatch` | parent ≠ id 去尾段 | 按 evidence.derived 改 parent |
| `structure/parent-not-exist` | 孤儿（父不存在） | 创建父模块或改 parent |
| `structure/file-id-mismatch` | 文件路径与 id 不一致 | 用 upsert 重写该模块（工具自动落位） |
| `api/leaf-missing` | 叶子缺 apis | 补 apis（提取该单元全部接口） |
| `api/non-leaf` | 容器/根写了 apis | 下放到叶子并删除本字段 |
| `api/key-duplicate` | API 键全局重复 | 只保留一个定义，其余改 path/method |
| `dep/target-missing` | 悬空箭头 | 建目标模块或改/删箭头 |
| `dep/from-api-invalid` | from_api 不是本模块 API | 用本模块 apis 的键 |
| `evidence/fingerprint-drift` | 数据过期 | 跑 normify.sync 计划增量重建 |
| `structure/id-format` | id 非法 | 按段规则改名（uid 保持不变） |

## 8. 护栏

- 深度 ≤ 8：超限禁止下钻，提示合并子模块。
- 每轮 ≤ 20 模块写入。
- 工具白名单外的路径一律拒绝（工具层强制）。
- 用户没要求时，不修改已通过校验的无关模块。
- 渲染产物路径必须如实汇报（DSH Web 的 Produced Files 不会自动收录 shell 产物）。

---

*本技能与 `normify.help` 工具的字段速查保持同步。规范全文：工作区《Normify-正式规范.md》。*
