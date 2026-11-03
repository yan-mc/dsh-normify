# 工作流配方（recipes）

> SKILL 的参考文件之一。格式字段见 [format.md](format.md)，诊断修法见 [validation.md](validation.md)，迁移见 [migration.md](migration.md)，
> 7 原语/旧名映射见 [toolset.md](toolset.md)。
> CLI 与工具是同一引擎的两张皮：`node lib/cli/index.js <command>` ≈ 对应工具；**CLI 内部是 full 31 工具集，不受插件 toolset 影响**。

## 0. 先选入口

| 场景 | 用什么 |
| --- | --- |
| 在 DSH/agent 会话里（0.7 默认） | 7 原语 + `op`（见 [toolset.md](toolset.md)）；旧 prompt 可开 `legacyTools: true` 过渡 |
| 终端 / CI / 非 DSH agent | CLI：`node lib/cli/index.js <command>`（或安装后的 `normify` bin） |
| 只想调一个未封装工具 | `normify call <tool-name> --args-json '<json>'`（可调 7 原语与 31 旧名） |

## 1. 全量建树（首图为目标仓库）

```bash
# 0) 初始化（可选一步建计划态根模块）
node lib/cli/index.js init --project demo --root-id demo --name-zh "演示项目" --name-en "Demo"

# 1) 先建顶层骨架（根 + 3–8 个一级模块；建议批量、原子）
#    DSH 默认面：normify_write{op:"batch"}；CLI 内用 call 传完整参数（内部 full 工具集）
node lib/cli/index.js call normify_module_batch --args-json '{"project":"demo","items":[...]}'

# 2) 逐层下钻：每层先看清单，再拆
node lib/cli/index.js list --project demo --parent demo
node lib/cli/index.js call normify_module_list --args-json '{"project":"demo","parent":"demo"}'

# 3) 叶子写 APIS + 箭头；每完成一批就校验
node lib/cli/index.js validate --project demo --repo-root F:/repo

# 4) 收尾：编译 → 回执自证 → 渲染
node lib/cli/index.js build --project demo
node lib/cli/index.js verify --project demo
node lib/cli/index.js render --project demo --out normify.html
```

要点：

- **叶子判据**：一个文件/一个类/一组内聚函数/一个 UI 组件/一条路由组；还能说清“内部由哪几块组成”就继续拆。
- **必须继续拆的信号**：source 覆盖 ≥3 文件、单文件行跨度 ≥300、混了 ≥2 个可独立命名的职责、API ≥6 条且能按子功能分组。
- 单批 `module_batch` ≤200 个模块（原子、失败整批回滚）；总量与深度**不设上限**，鼓励 100–1000+ 模块。
- 每个模块都写 `source` / `revision` / `fingerprint`；fingerprint 用 CLI `call normify_fingerprint`（7 原语无对应 op）或 legacy 工具实算，不要手估。

## 2. 伴随开发（先建图后编程，推荐）

```text
change_open → brief → check → module_batch(state=planned) → 【写代码】
  → module_refresh(activate) → validate → build → change_close(0 error 强制)
```

```bash
# ① 开变更（CLI 用 --args-json 传 modules/acceptance）
node lib/cli/index.js change-open --project demo --args-json '{"title":{"zh":"限流","en":"Rate limit"},"intent":"...","modules":{"create":["demo.gateway.rate-limit"]},"acceptance":["..."]}'
# ② 拿指引 / ③ 预检
node lib/cli/index.js brief --project demo --task "给 demo 加限流模块"
node lib/cli/index.js call normify_check --args-json '{"project":"demo","items":[{"id":"demo.gateway.rate-limit","parent":"demo.gateway"}]}'
# ④ 建计划态模块（state=planned, fingerprint=pending, source 可未落地）
node lib/cli/index.js call normify_module_batch --args-json '{"project":"demo","items":[{"frontmatter":{...state:"planned",fingerprint:"pending"...}}]}'
# ⑤ 写代码；⑥ 激活
node lib/cli/index.js call normify_module_refresh --args-json '{"project":"demo","ids":["demo.gateway.rate-limit"],"activate":true,"repoRoot":"F:/repo"}'
# ⑦ 关单（0 error 强制）
node lib/cli/index.js change-close --project demo --id 2026-11-03-rate-limit
```

纪律：

- 计划态允许源码未落地，但 **`activate` / `change_close` 会校验源码落地**（禁止假激活）。
- `change_close` 内部顺序：refresh → validate（0 error 强制）→ build（可选 render）→ `verified` + `revision.after`；任何一步失败都不关闭。
- 每完成一个叶子就 refresh + 更新该层渲染数据，不要攒到最后。

## 3. 增量同步（代码变了，结构图跟上）

```bash
node lib/cli/index.js sync --project demo --repo-root F:/repo --diff HEAD~1
```

按 sync 输出处理：

1. **affected 叶子**：重读代码 → 增删 API、更新介绍；职责变大就 `promote` 后再拆。
2. **affected 容器**：更新介绍与子级变化，不重读全部代码。
3. **drift_fingerprints**：`module_refresh` 重算（或按需 `patch`）。
4. **new_files**：按建议模块 id 建叶子，并补 source/revision/fingerprint。
5. **layouts_to_review**：逐层复核/重排 `order` / `groups` / `reading`。
6. `validate` → `build` → `verify`；0 error 才算同步完成。

## 4. 渲染数据（可读性配方）

- **顺序 = 数据流**：`order` 按“谁先产生、谁后消费”排；管道链用 `mode: layers`。
- **分组 = 领域边界**：同一子系统/层/角色一组；每组 2–5 个、每层 2–5 组；`mode: groups` 时每组画成带标题的框。
- **导语 = 阅读路径**：`reading` 一句话说明“从哪看起、箭头代表什么”。
- **长边提示**：回指/跨整图的边用 `edge_hints` 拉车道（0..9）或 `style: curve`。
- 不硬凑分组：平级功能直接 `grid`；分组只有在能帮人理解时才用。
- API 全展开是缺省（`max_api_rows: 0`）；叶子 API 建议 3–5 条，多则继续拆。

## 5. 架构规则（policy.yml）

- 项目创建时自动安装默认规则；查看模板：`node lib/cli/index.js policy --project demo`。
- 六类规则：`forbid-dependency` / `dependency-direction` / `acyclic` / `max-depth` / `cross-tree` / `naming`。
- 设计阶段定规则；`validate` / `check` 强制执行。违规先改设计，不能用删规则绕过。
- 用 `normify_policy_upsert` 安装/覆盖；`policy` 文件格式错误会报 `policy/rule-*` 系列。

## 6. 交付前最小清单

```bash
node lib/cli/index.js validate --project demo --repo-root F:/repo   # 0 error
node lib/cli/index.js build --project demo
node lib/cli/index.js verify --project demo                         # 退出码 0
```

汇报时给出：结构目录、`normify.html` 路径、`receipt.sha256`、模块/API/依赖统计、以及仍存在的 warning 清单。
