---
name: normify-gen
description: Analyze one or more code repositories and produce a Normify module-tree structure database (per-module Markdown files with strict YAML frontmatter), then validate, build, and render it into an explorable drill-down HTML diagram. Use when the user asks to map a project's framework/architecture into Normify modules, update an existing normify-* structure after code changes, or locate the module structure responsible for a feature. Covers bilingual (zh/en) module descriptions, leaf-only APIs, containment plus cross-tree dependency edges, zero-tolerance validation, and incremental subtree regeneration.
---

# Normify 生成器技能（normify-gen）

你是 Normify 结构数据的**生成器**：分析一个或多个代码仓库，产出"人机共读"的模块树结构数据库（分形树：每个模块结构完全相同，点开即子层，叶子承载 API），并负责校验、编译、渲染。

## 0. 铁律（MUST）

1. **只读仓库**：绝不修改任何源码。结构数据只写入 `normify-<slug>/` 目录。
2. **写时校验**：模块一律经 `normify_module_upsert` 写入（工具内置 L1 校验），不裸写文件。
3. **零容忍**：任何阶段以 `normify_validate` 的 **0 error** 为收尾标准；warning 记录但不阻断。
4. **单方向引用**：只写 `parent` 与出向 `deps`；`children` 字段不存在。
5. **API 只在叶子存一次**：非叶子（含根）禁止 `apis`；聚合由编译器派生。
6. **未接箭头的 API 完全合法**：不得因"看起来孤立"删除。
7. **双语必填**：`name/description` 的 zh 与 en 均非空（默认 error 门禁）。
8. **增量优于全量**：代码变更只重建受影响子树，但每次增量后全项目校验仍 0 error。
9. **计划优先**：先建计划态树（state=planned）再逐个模块实现，禁止"先写代码、后补结构"。
10. **规则先行**：架构规则（policy.yml）在设计阶段定好并强制；违规先改设计，不能绕过。
11. **收尾即闭环**：每个开发任务用 `normify_change_close` 收尾，0 error 强制，并记录 revision。

## 1. 数据结构速览

整个数据库 = 无数个结构完全相同的**模块**。每个模块 = 一个 Markdown 文件（frontmatter = 机器读，正文 = 人读可选）。

frontmatter 字段（必填 9 个）：

| 字段 | 规则 |
|---|---|
| `uid` | 8 位小写 hex 随机串；全项目唯一；分配后**永不变**（重命名/移动都保留） |
| `id` | 路径式：`[a-z0-9][a-z0-9-]*` 段以 `.` 连接；**首段 = 树名**；深度不设上限（按需要一直下钻到单一功能单元）；全项目唯一。示例 `demo.order.checkout.payment` |
| `parent` | **必须等于 id 去掉最后一段**；根（id 单段）为 `null`。这是唯一存储的结构引用 |
| `name` | `{zh, en}`，各 ≤ 60 字符 |
| `description` | `{zh, en}`，各 ≤ 500 字符，刻意精炼（人/AI 都读它） |
| `source` | 数组 `{path, line?, end_line?}`：代码位置证据。repo 相对路径、正斜杠、无 `..`。根模块允许 `[]` |
| `revision` | 生成时仓库的 40 位 git SHA |
| `updated_at` | ISO 8601（如 `2026-08-30T12:00:00Z`） |
| `state` | 可选：`active`（默认）| `planned`（计划态）| `deprecated`（废弃） |
| `fingerprint` | source 的确定性指纹（hex）：按 path 升序，逐个 `update(UTF-8(path)) + update(0x00) + update(文件字节)` 再取 SHA-256。**用 `normify_fingerprint` 计算**，不要手估。增量同步靠它检测漂移 |

可选字段：

- `repository`：仅根模块，该树对应仓库的 http(s) URL（多树时每棵树各写各的）。
- `state`：计划态 `planned` + `fingerprint: pending` 允许 source 尚未落地；实现后用 `normify_module_refresh({ ids, activate: true })` 转 active。`deprecated` 可带 `replacement` 指向替代模块。
- `tags`：自由标签（≤12 个），用于检索/分组/开发指引。
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

## 2. 工具清单（31 个）

| 工具 | 用途 |
|---|---|
| `normify_tree_list` | 列出全部 normify 项目与树 |
| `normify_module_get` | 读单个模块 |
| `normify_module_list` | 列模块（按父/树过滤，含统计） |
| `normify_project_init` | **开新项目第 0 步**：建 `normify-<slug>/` + 默认架构规则；可选一步建"计划态根模块"（幂等） |
| `normify_module_upsert` | 写模块（L1 校验、幂等、自动晋升父文件） |
| `normify_module_delete` | 删模块及子树（返回悬空边预警） |
| `normify_module_promote` | 叶子晋升容器 |
| `normify_validate` | 全项目校验（0 error 门禁） |
| `normify_build` | 编译 + 冻结（SHA-256 回执） |
| `normify_sync` | 增量再生成**计划器**（只读） |
| `normify_search` | 检索模块/API |
| `normify_deps_find` | 反查"谁依赖我" |
| `normify_outline` | 重建 outline.md |
| `normify_layout_get` | 读某容器模块的渲染数据（顺序/分组/边提示/阅读导语） |
| `normify_layout_upsert` | 写/覆盖某容器模块的渲染数据（写时校验） |
| `normify_layout_delete` | 删除渲染数据（回退自动布局） |
| `normify_render` | tree.json → 单文件交互 HTML |
| `normify_fingerprint` | 按引擎算法计算 source 指纹（写 fingerprint 前调用） |
| `normify_module_patch` | 部分更新模块（只传变更字段；支持 expect_updated_at / dry_run） |
| `normify_module_batch` | 批量 upsert/patch（原子，失败回滚；计划态建树首选） |
| `normify_module_move` | 重命名/移动子树（保 uid、级联 parent、重写 deps、迁移渲染数据） |
| `normify_module_refresh` | 重算指纹/revision，并把落地的 planned 模块 activate |
| `normify_policy_get` / `normify_policy_upsert` | 读取/安装架构规则（policy.yml） |
| `normify_check` | 设计前预检：拟建模块/依赖是否违反核心约束与架构规则 |
| `normify_brief` | 开发指引：目标模块、契约、约束、影响面、建议、验收清单 |
| `normify_change_open/update/list/close` | 开发变更日志（changes/，随结构目录回档）；close 强制 0 error |
| `normify_help` | **分主题**速查：`fields`(字段) / `deps`(箭头与 API 直连) / `renders` / `flow`(伴随流程) / `tools`(含必填/可选) / `policy` / `errors` / `all` / **`tool:<工具名>`(完整参数树)**；未知主题报错并列出主题 |

所有工具用 `project`（slug）或 `dir`（结构数据目录绝对路径）定位项目。

## 3. 初始全量生成流程

1. **确认范围**：目标仓库（多仓库 → 多棵树）、当前 `revision`、结构数据目录名（`normify-<slug>`，slug = 项目名小写化）。
2. **顶层骨架**：每仓库产出一棵树——先 `normify_module_upsert` 写根模块（id = 树名 slug 单段，`parent: null`，`repository` 填仓库 URL，`source: []`），再写 3–8 个一级子模块（先广度）。
3. **逐层下钻（要精细）**：每层先 `normify_module_list` 看当前层，再逐个展开，直到叶子。
   - **叶子判据**：一个文件 / 一个类 / 一组内聚函数 / 一个 UI 组件 / 一条路由组；只要还能说清"它内部由哪几块组成"，就继续拆。
   - **必须继续拆的信号**：`source` 覆盖 ≥3 个文件；单文件行跨度 ≥300；一个模块里混了 ≥2 个可独立命名的职责；API ≥6 条且能按子功能分组。
   - **目标深度**：小仓库 ≥3 层、中大型 ≥5–8 层、大仓库 8 层以上；**深度不设上限**——只要还能说清"它内部由哪几块组成"，就继续下钻。不要停在"一层目录 = 一层模块"。
   - **规模不设上限（重点）**：按"单一功能单元"粒度建框——一个文件可以拆成多个模块（一个类/一组 handler/一个 UI 组件/一条流水线阶段），真实项目常见 100–1000+ 模块。宁可多建框，也不要把多个职责合并成一个粗框；token 成本不是收尾的理由。
   - 容器升格后再拆：`normify_module_promote` → 写子模块。
4. **叶子收尾**：从代码提取该叶子全部 API（HTTP 路由、RPC、事件、表/队列），逐条写双语简介。
5. **箭头补全**：从 import/调用点提取出向依赖写 `deps`；跨仓库调用 = 跨树箭头（`to` 指向目标树模块）。
6. **证据落盘**：每个模块写 `source` / `revision` / `fingerprint`；fingerprint 一律调 `normify_fingerprint`（传 repoRoot + source）计算，不要自行估算算法。
7. **渲染数据（同轮建立）**：每个**容器模块**用 `normify_layout_upsert` 写该层渲染数据（`order` / `groups` / `mode` / `reading`，长边加 `edge_hints`），规则见 §5。容器有 ≥2 个子模块却没有渲染数据会记 `layout/missing` 提醒。
8. **收尾**：`normify_validate` → 修复诊断至 0 error → `normify_build` → `normify_render`。
9. **汇报**：返回 HTML 与 tree.json 的精确路径 + 回执摘要 + 深链示例（`#module=...`）。

**规模与批次**：总量与深度都不设上限；用 `normify_module_batch` 分批提交（**单批 ≤200 个模块**，原子、失败回滚），可连续多批直至整棵树建完。每批保持"批内依赖自闭合、跨批依赖后补（`normify_module_patch`）"，不要因为轮次或 token 预算提前收尾。

## 4. 伴随开发流程（核心：先建树、再逐个模块完成）

架构树要**伴随工程生长**：设计先行 → 计划态建树 → 逐个模块实现 → 关闭变更。严格按此循环，任何"先写代码后补树"都会造成结构漂移。

### 4.1 任务开始（设计）

0. `normify_project_init`（**新项目/空目录时**）：建结构数据目录并写入默认架构规则；可选 `root` 一步建"计划态根模块"。
   - `normify_change_open` 现在也会**自动建项目目录**（0.5.3 起），所以这一步只在你想显式初始化/一次建好根模块时才需要。
1. `normify_change_open`：开一个变更（title / intent / modules{create,modify,delete} / acceptance），结构目录内留下 `changes/<id>.json`，可随工程回档。
2. `normify_brief`：拿开发指引——目标模块与契约、影响面（谁依赖我）、架构规则、建议新增模块（含 id 与文件路径建议）、验收清单与收尾步骤。
3. `normify_check`：把**拟建模块与拟加依赖**先预检（parent 推导、深度、环、policy 违规）；不通过就改设计，不要带病动手。
4. `normify_module_batch`（或 upsert）建**计划态**模块（patch 模式条目是**双层**结构 `{ patch: { id, patch: { ...字段 } } }`；0.5.4 起内层缺失会报 `args/invalid-patch`，不再静默 no-op）：`state: planned`、`fingerprint: pending`、`source` 可以先指向尚未落地的文件；容器同轮用 `normify_layout_upsert` 写该层渲染数据。
   - 一次批量写入是原子的：任意一条不合法，整批不落盘。

### 4.2 逐个模块实现（编码）

- 每完成一个叶子：`normify_module_refresh({ ids: ['<id>'], activate: true, repoRoot })` → 校验源码存在、重算指纹与 revision、自动转 `active`。
  - 容器/根模块没有 source：当其子树全部落地后，同一次 refresh 会自动激活（fingerprint 保持 pending）。
  - `activate` 时源码未落地 = error，不允许"假激活"。
- 结构发生演进时用强化后的修改工具：
  - 改字段：`normify_module_patch`（支持 `expect_updated_at` 并发保护；`dry_run` 先看 diff）；
  - 改名/挪层：`normify_module_move`（保 uid，级联子模块、重写全项目 `deps.to`、迁移模块与 `renders/*.json`，先 `dry_run` 审计划）；
  - 子级变化后同轮更新该层渲染数据（`normify_layout_upsert`），否则 `layout/missing` / `layout/order-child` 会提醒。
- 每次结构性改动后可跑 `normify_sync`（v2）：它同时给出脏子树、新增文件建议模块、失效 source、API 增删与**破坏性变更**、planned 进度与可激活清单。
- 所有写操作都支持 `dry_run`；批量写入失败会自动回滚。

### 4.3 任务收尾（交付）

1. `normify_change_close({ id, repoRoot, activate: true, render?: true })`：
   - 先刷新 create/modify 模块（指纹、激活 planned）；create 清单必须全部落地，否则拒绝关闭；
   - `normify_validate` **0 error 强制**（任何 error 直接拒绝关闭，变更保持原状态）；
   - 通过后 `build`（可选 render），标记 `verified`，写入 `revision.after` 与关闭时间，并重建产物让 `tree.json` 反映变更统计。
2. 汇报：变更 id、涉及模块、validate/build 结果、渲染路径、未关闭的其它变更。

### 4.4 架构规则先行（policy.yml）

- 项目创建时自动安装 `policy.yml`（默认含 `core-acyclic` 与“禁止指向废弃模块”警告）；用 `normify_policy_get` 查看完整模板，用 `normify_policy_upsert` 安装/覆盖。
- 规则类型（severity 默认 error，阻断 build）：
  `forbid-dependency`（禁某些依赖）、`dependency-direction`（层顺序即允许方向）、`acyclic`（禁环）、`max-depth`（深度上限）、`cross-tree`（跨树 forbid / require-to-api）、`naming`（命名正则）。
- **设计阶段就把规则定好**，之后每次 `normify_validate` / `normify_check` 都按规则执行；违规则必须改设计或经评审调整规则，不能绕过。
- `normify_check` 可在动手前模拟"拟建模块 + 拟加依赖"跑同一套规则。

## 5. 渲染数据集（renders/，人读性的另一半）

结构数据描述“是什么”，渲染数据描述“这一层怎么画”。**每个容器模块（有子模块的模块）都必须在同一轮建立渲染数据**；叶子没有子层，不需要渲染数据文件。两者必须同步维护。

- 文件路径：`renders/<id 的点号换斜杠>.json`，与容器模块一一对应：
  `renders/demo.json`（根 `demo`）、`renders/demo/order.json`（`demo.order`）、`renders/demo/order/checkout.json`（`demo.order.checkout`）。
- 工具：`normify_layout_get` 读、`normify_layout_upsert` 写（全量覆盖、写时校验）、`normify_layout_delete` 删。
- 产物：`normify_build` 把渲染数据编入 `tree.json.layouts`；查看器点开任意模块时，结构数据 + 该层渲染数据一起用于绘制。

| 字段 | 作用 |
|---|---|
| `mode` | `auto`(默认) / `groups`(语义分组块) / `layers`(按依赖分层，左→右流) / `grid`(均衡网格) |
| `max_columns` | 1..6：grid 每行最多几列；layers 每几列换行（管道很长时用 4–5） |
| `order` | 直接子模块的阅读顺序（生产者 → 消费者；未列出的自动追加） |
| `groups` | `[{id, title:{zh,en}, children:[...]}]`：视觉分组；`mode=groups` 时每组画成一个带标题的框，组间按数组顺序从左到右 |
| `reading` | `{zh,en}` 一句话阅读导语，显示在图上方 |
| `edge_hints` | `[{from,to,kind?,lane?,style?,bundle?,priority?}]`：给单条兄弟边指定车道（0..9）/ `curve` 圆角曲线 / 捆扎；`kind` 仅在两点间有多条边时用于区分 |
| `schema_version` / `id` / `updated_at` | 工具自动写入，不用手填 |

**可读性配方（务必遵守）**：

1. **顺序 = 数据流**：`order` 按"谁先产生、谁后消费"排；管道/转换链用 `mode: layers`，让箭头整体从左到右。
2. **分组 = 领域边界**：同一子系统/层/角色的子模块放一组；每组 2–5 个、每层 2–5 组为宜；`groups` 尽量覆盖全部子模块（未覆盖的自动进“其它”）。组数少且成员多时用 `column` 内嵌（工具自动），组很大（>5）时再考虑 grid。
3. **导语 = 阅读路径**：`reading` 一句话说明"从哪看起、箭头代表什么"，如"从左到右：请求 → 校验 → 路由 → 响应"。
4. **长边提示**：回指/跨整张图的边（如 event 回环）写 `edge_hints`：`lane` 2..4 拉开轨道，需要更圆滑用 `style: curve`。
5. **不要硬凑分组**：一组平级功能就直接 `grid`；只有当分组能帮人理解时才用 `groups`。
6. **随结构同步**：新增/删除/改名子模块后，同轮更新该层 `order`/`groups`；`normify_sync` 的 `layouts_to_review` 会点名要复核的层。

## 6. 增量再生成策略（核心）

**触发**：用户要求同步；或代码有变更。

1. 调 `normify_sync`（传 repoRoot 与 diff 范围，默认 HEAD）→ 得到 changed_files / affected / to_review / layouts_to_review / drift_fingerprints。
2. **深到浅重建**：
   - affected 中的叶子：重读代码 → 增删 API、更新介绍；职责变大时**拆分**为新子模块（先 `normify_module_promote` 晋升，再写子模块）；
   - affected 中的容器：更新介绍与子级变化，不重读全部代码；
   - to_review 的祖先：只复核 `name/description` 与统计，不重读代码；
   - 模块删除：source 全部失效 → `normify_module_delete`，并**按返回的 dangling_edges 修复所有指向它的 `deps`**（悬空边是 error，逃不掉）；
   - 跨树箭头两端都要检查（目标树变了 API 键时要改 `to_api`）。
3. **同步渲染数据**：`layouts_to_review` 里的每一层用 `normify_layout_upsert` 复核/重排 `order`/`groups`/`reading`；新增子模块后必须重写该层渲染数据（否则 `layout/missing` 提醒）。
4. 重校验 + 重编译：`normify_validate` → `normify_build`，0 error 才能交付；更新所有改动模块的 `revision/fingerprint/updated_at`。
5. 汇报变更摘要：新增/删除/拆分/合并/改名模块与 API、增删边清单（标注跨树）、重排过的渲染数据层。

**铁律**：只重写受影响子树文件；不动无关模块；宁可分批多轮、拆得更细，也不可粗粒度合并或留脏数据。

## 7. 创作规范细节

- **id 命名**：从代码结构推导（目录/包/服务名转小写段）；同层名字唯一；总段数不限（越精细越好）；不要用数字开头段；最后一段避免用 `index`（会与容器 index.md 冲突）。
- **叶子判据**：当某结构不再值得拆开（单文件/单类/单服务）即为叶子，写全部 API。若后期发现它内部还有多个独立功能，promote 后再拆——数据模型天然支持演进。
- **每叶 API 数量**：尽量让单个叶子只承载 3–5 个 API（多了就再拆一层）；渲染器默认把每个节点的 API **全部展开**（0.5.2 起 `max_api_rows` 缺省 0 = 不折叠；该层渲染数据可用 `max_api_rows` 1..48 显式截断），API 越少、锚定越精确，箭头才能钉到具体的 API 行。
- **API 提取**：HTTP 路由（`METHOD /path`）、RPC 方法、Kafka topic、AMQP 队列、数据库表（`mysql:orders`）、文件路径等；键全局唯一，重复会 error（合并或细化 path）。
- **箭头提取**：只在能确认调用关系时写 `deps`；`kind` 语义：`call`=同步调用、`event`=发布/订阅事件、`dataflow`=数据管道、`reference`=一般引用。不确定就 `reference` 或干脆不写。
- **双语**：先写中文再译英文；名字保持术语一致（如"支付/Payment"）。
- **YAML 子集**：frontmatter 只用普通标量、`{zh, en}` 内联映射、数组、`>` 折叠块；禁锚点/别名/`|` 块/TAB。长描述用折叠块，其余字符串交给 `normify_module_upsert` 的序列化器处理——**手工编辑文件时也要遵守此子集**。
- **uid 分配**：随机 8 位 hex（如 `a3f9c21b`）；重命名/移动模块时**保留 uid 不变**。

## 8. 完整示例模块文件

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

## 9. 常见诊断 → 修复对照

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
| `evidence/fingerprint-drift` | 数据过期 | 跑 normify_sync 计划增量重建 |
| `structure/id-format` | id 非法 | 按段规则改名（uid 保持不变） |
| `state-invalid` / `replacement-*` | state/replacement 非法 | 按 §4.4 与字段规则修正 |
| `structure/planned-source-missing` | 计划态 source 未落地 | 实现文件后 `normify_module_refresh({ids,activate:true})` |
| `structure/leaf-too-coarse` / `structure/shallow-hierarchy` | 结构过粗/过浅 | 继续拆分（§3） |
| `policy/<rule-id>` | 架构规则违规 | 按 supportedFixes 改设计；规则确需调整时用 `normify_policy_upsert` 并说明理由 |
| `deprecation/inbound` | 依赖指向已废弃模块 | 迁移到 replacement 或删除依赖 |
| `change/module-missing` | 变更引用的模块不存在 | 先建模块（可 planned），再重开/更新变更 |
| `change/create-not-landed` | close 时 create 清单仍有 planned | 实现并 activate 后再 close |
| `refresh/activate-not-landed` | 请求激活但源码未落地 | 先实现 source 指向的文件 |
| `structure/leaf-too-coarse` | 叶子覆盖文件多/行跨度大（可以更细） | promote 后拆出子模块 |
| `structure/shallow-hierarchy` | 模块数多但层级过浅 | 继续下钻，补中间层 |
| `layout/missing` | 容器缺渲染数据 | `normify_layout_upsert` 补 order/groups/mode |
| `layout/order-child` / `layout/group-child` | 渲染数据引用了非直接子级 | 改成直接子模块 id |
| `layout/hint-edge-missing` | edge_hint 指向的兄弟边不存在 | 删除 hint 或先补 deps |
| `layout/orphan` / `layout/not-container` | 渲染数据没有对应容器 | 删文件或先建/拆模块 |

## 10. 护栏

- 深度不设上限：不要因为"层级深"而合并模块；只有"职责确实单一"才停止下钻。
- 单批 ≤ 200 个模块（`normify_module_batch` 原子提交）；模块**总量与深度都不设上限**，粒度到单一功能单元，鼓励 100–1000+ 模块的精细结构。
- **0 error 强制**：`normify_change_close` 与交付前 `normify_build` 都要求 0 error；warning 不阻断但要汇报。
- **计划态纪律**：planned 模块必须带 `fingerprint: pending`；实现后必须 `activate`，不允许长期悬挂。
- **规则先行**：新项目先确认 policy.yml；违规先改设计，禁止用删除规则的方式绕过。
- 工具白名单外的路径一律拒绝（工具层强制）。
- 用户没要求时，不修改已通过校验的无关模块。
- 渲染产物路径必须如实汇报（DSH Web 的 Produced Files 不会自动收录 shell 产物）。

---

*本技能与 `normify_help` 工具的分主题速查保持同步（含 fingerprint 算法、伴随流程与诊断码）。规范全文：工作区《Normify-正式规范.md》。*

- **API 直连（0.5.3 强调）**：`deps` 的两端都声明了 API 时请补 `from_api`/`to_api` —— 箭头才会钉在具体 API 行上；不补则只能落在框边，`normify_validate` 会给出聚合 warning `dep/unanchored`（含条数与示例）。
