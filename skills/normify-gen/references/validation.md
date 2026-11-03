# 校验与诊断速查（validation）

> SKILL 的参考文件之一。**完整诊断码总表**（222+ 个，由代码生成）：[docs/DIAGNOSTICS.md](../../../docs/DIAGNOSTICS.md)。
> 本文件只列**最常遇到**的码与修法；遇到表外诊断，先看 `evidence` 与 `supportedFixes`，再回查总表。

## 1. 三层校验（fail-closed）

| 层 | 触发 | 校验内容 |
| --- | --- | --- |
| **L1** | 每次写入（upsert/patch/batch/move/promote/layout_upsert…） | 必填字段、id 文法、uid、parent 一致性、双语长度、source/apis/deps 形状、state/replacement、保留段名 |
| **L2** | `normify_check{op:"validate"}`（CLI：`normify validate`） | 全项目：id/uid/API 键唯一、文件↔id 映射、叶子/非叶子规则、依赖目标/环、渲染数据交叉校验、架构规则、变更日志、可选仓库证据（source 存在性 + fingerprint 一致） |
| **L3** | `normify_build{op:"build"}`（CLI：`normify build`） | 任何 error 都不产出产物；产出后写 `structure-manifest.json` + `receipt.json` + `receipt.sha256` |
| **回执自证** | `normify verify`（CLI） | `receipt.sha256` → `receipt.json` → 各产物哈希逐件复算；不一致 exit 2 |

- **error 阻断**：`build{op:"build"}` / `change{op:"close"}` 遇到任何 error 都拒绝继续；**warning 不阻断**但收尾必须汇报。
- 诊断对象形状：`severity / code / message / subject / evidence / supportedFixes`。
- 修法优先级：先读 `supportedFixes`，再看 `evidence`；不要靠猜。

## 2. 修复循环（每次写完就跑）

```bash
node lib/cli/index.js validate --dir F:/repo/normify-demo        # 0 = 0 error；2 = 有 error
node lib/cli/index.js get --dir F:/repo/normify-demo --id demo.order
```

1. 按 `code` 定位问题模块（`subject.module` / `path`）。
2. 用对应写工具修（不要手改文件；工具会维护文件形态/序列化）。
3. 重跑 `validate`，直到 **0 error**（warning 记录在案）。
4. 收尾：`build`（必要时 `render`）→ `verify` → 汇报产物路径与回执摘要。

## 3. 高频诊断码 → 修法

### 结构与字段

| 诊断码 | 含义 | 修法 |
| --- | --- | --- |
| `structure/parent-mismatch` | `parent` ≠ id 去尾段 | 按 `evidence.derived` 改 parent |
| `structure/parent-not-exist` | 孤儿（父不存在） | 先建父模块，或修正 parent |
| `structure/file-id-mismatch` | 文件路径与 id 不一致 | 用 `write{op:"upsert"}` 重写该模块（自动落位） |
| `structure/id-format` | id 段格式非法 | 按段规则改名（保留 uid） |
| `structure/id-reserved` | id 末段用了保留段 `index` | 换成具体功能名（如 `indexer`）；用 move 迁移 |
| `structure/uid-format` / `structure/uid-duplicate` | uid 非法/重复 | 重新分配 8 位 hex（改名/移动时保留原 uid） |
| `structure/parent-type` / `structure/missing-field` | 字段类型/缺失 | 按 evidence 补齐 |
| `structure/source-path-invalid` / `structure/source-entry-shape` | source 路径越界或条目形状错 | 改仓库内 POSIX 相对路径，禁 `..`/绝对路径/反斜杠 |
| `structure/unknown-field` | frontmatter 出现未知字段 | 删除或用工具支持的字段 |

### API / 依赖

| 诊断码 | 含义 | 修法 |
| --- | --- | --- |
| `api/leaf-missing` | 叶子缺 `apis` | 补 apis（空数组合法，但会 `api/leaf-empty` warning） |
| `api/non-leaf` | 容器/根写了 `apis` | 下放到叶子并删除本字段 |
| `api/key-duplicate` | API 键全项目重复 | 只保留一个定义，或改 path/method |
| `api/protocol-unknown` / `api/method-required` | 协议未知 / http 缺 method | 用受支持协议；http 补大写 method |
| `dep/target-missing` | 悬空箭头（目标不存在） | 建目标模块或改/删箭头 |
| `dep/self-loop` | 箭头指向自身 | 删除该箭头 |
| `dep/from-api-invalid` | `from_api` 不是本模块 API 键 | 用本模块 apis 的键 |
| `dep/to-api-invalid` | `to_api` 不是目标模块自身 API 键 | 用目标模块 apis 的键或删 `to_api` |
| `dep/unanchored`（warning） | 两端有 API 但箭头未锚定 | 补 `from_api`/`to_api`（图的精细价值在这） |

### 证据 / 计划态

| 诊断码 | 含义 | 修法 |
| --- | --- | --- |
| `evidence/fingerprint-drift` | fingerprint 与仓库当前内容不一致 | `check{op:"drift"}` 找漂移 → `change{op:"close"}` 刷新（legacy：`normify_module_refresh`） |
| `evidence/source-missing` | source 指向的文件不存在 | 修正 path 或重算结构 |
| `evidence/fingerprint-pending` | 非 planned 模块用了 pending | 重算 fingerprint，或把 state 改为 planned |
| `evidence/checks-skipped`（warning） | 未传 repoRoot，跳过证据校验 | 交付前带 `--repo-root` 跑 validate |
| `structure/planned-source-missing`（warning） | planned 源码未落地 | 实现后 `change{op:"close"}` 自动激活（legacy：`refresh(activate:true)`） |
| `structure/leaf-too-coarse` / `structure/shallow-hierarchy`（warning） | 结构过粗/过浅 | 继续拆分（见 [recipes.md](recipes.md) 的粒度指引） |

### 渲染数据

| 诊断码 | 含义 | 修法 |
| --- | --- | --- |
| `layout/missing`（warning） | 容器缺渲染数据 | `write{op:"layout_upsert"}` 补 order/groups/mode |
| `layout/order-child` / `layout/group-child` | 引用了非直接子模块 | 改成直接子模块 id |
| `layout/hint-edge-missing` | edge_hint 指向的兄弟边不存在 | 删除 hint 或先补 deps |
| `layout/orphan` / `layout/not-container` | 渲染数据没有对应容器 | 删文件，或先建/拆模块 |
| `layout/max-api-rows` / `layout/max-columns` | 渲染字段越界 | 按报错范围改（0..48 / 1..6） |

### 架构规则 / 变更 / 回执

| 诊断码 | 含义 | 修法 |
| --- | --- | --- |
| `policy/<rule-id>`（动态） | 架构规则违规 | 按 supportedFixes 改设计；确需调整规则时用 `normify_policy_upsert`（legacy/CLI）并说明理由 |
| `policy/missing`（warning） | 项目未安装 policy.yml | `normify_policy_upsert`（legacy/CLI）安装默认规则 |
| `policy/schema-version` / `policy/rule-type` | policy 文件格式错 | 参照 `read{op:"policy"}` 模板重写 |
| `change/module-missing` | 变更引用不存在的模块 | 先建模块（planned 可）再重开/更新变更 |
| `change/create-not-landed` | close 时 create 清单仍 planned | 实现并激活后再 close |
| `change/delete-snapshot` | delete_snapshot 非法/被手改 | 由 `change{op:"update"}` 自动回填，不要手写 |
| `refresh/activate-not-landed` | 请求激活但源码未落地 | 先实现 source 指向的文件 |
| `render/invalid-out` | `out` 带路径/非法文件名 | 只传纯文件名（如 `normify.html`） |
| `verify/no-receipt` / `verify/sidecar-missing` | 缺回执或 sidecar | 重新 `build` |
| `verify/sidecar-mismatch` / `verify/hash-mismatch` / `verify/artifact-missing` | 回执链被改动/产物缺失 | 重新 `build`；`verify` 通过前不要发布 |

## 4. 动态诊断码

部分码由字段名/规则 id 拼接，实际返回时变量部分会被替换：

- `structure/<field>-too-long`、`structure/<field>-empty`、`structure/<field>-shape`（name/description 等）
- `structure/source-<field>-invalid`、`dep/<field>-invalid`
- `policy/<rule-id>`（级别跟随该规则的 `severity`，默认 error）

完整列表见 [docs/DIAGNOSTICS.md](../../../docs/DIAGNOSTICS.md)（含每个码的生成点与 message）。
