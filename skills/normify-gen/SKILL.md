---
name: normify-gen
description: Build and maintain a Normify module-tree structure database for one or more code repositories (per-module Markdown with strict YAML frontmatter), then validate, build, verify and render it into a single-file drill-down architecture map. Use when the user asks to map a project's architecture/framework into Normify modules, to update or sync an existing normify-* structure after code changes, to locate which module owns a feature/API or who depends on it, to close a development change with zero-error validation, to migrate/upgrade Normify structure data (including the 0.7 7-primitive / legacyTools transition), or to run the Normify CLI in CI. Covers the 7-primitive tool surface (project/read/write/check/build/render/change with op enums; 31 legacy names via legacyTools), bilingual (zh/en) modules, leaf-only APIs, containment plus cross-tree dependency edges, zero-tolerance validation, structure SBOM receipts, companion (design-first) development workflow, and incremental subtree regeneration.
---

# Normify 生成器技能（normify-gen）

你是 Normify 结构数据的**生成器/维护者**：把代码仓库分析成“人机共读”的分形模块树，并负责校验、编译、回执自证与渲染。

本技能是**薄入口**；细节按需读 `references/`（见 §8）。规范唯一真源是 [docs/SPEC.zh-CN.md](../../docs/SPEC.zh-CN.md)，诊断码总表是 [docs/DIAGNOSTICS.md](../../docs/DIAGNOSTICS.md)。

## 0. 何时用 / 不用

**用**：建架构图或模块树；代码变更后同步结构；查“功能/API 属于哪个模块、谁依赖我”；伴随开发（先建图后编程、change_close 收口）；迁移/升级旧结构数据；在 CI/非 DSH agent 里跑 CLI。

**不用**：单纯画一次性示意图（不一定需要结构数据）；不想维护代码↔结构契约的场景。

## 1. 决策树

```text
用户要什么？
├─ 首次映射仓库/多仓库           → 配方 §1（project_init → 骨架 → 逐层 → API/箭头 → renders → build/verify/render）
├─ 改了代码，要把结构图跟上      → 配方 §3（drift → 按 affected/drift/new_files/layouts 处理 → validate/build/verify）
├─ 要新增/改造一块功能（还没写码）→ 配方 §2（change.open → brief → check → planned batch → 写码 → change.close）
├─ 查模块职责/API 归属/影响面     → read: list/get/search/deps/brief（CLI：list/get/search/brief）
├─ 关闭一次开发变更              → change.close（0 error 强制；失败保持原状态）
└─ 旧结构数据/旧工具名/旧版本升级  → references/migration.md + docs/MIGRATION.md
```

## 2. 铁律（不变量）

1. **只读仓库**：绝不改源码；结构数据只写 `normify-<slug>/`。
2. **写时校验**：模块一律经写工具落盘（L1 内置），不裸手写 YAML 文件。
3. **零容忍**：交付/关单以 `check{op:"validate"}` **0 error** 为准；warning 不阻断但必须汇报。
4. **单方向引用**：只写 `parent` 与出向 `deps`；`children` 字段不存在。
5. **API 只在叶子**：非叶子（含根）禁止 `apis`；未接箭头的 API 完全合法。
6. **双语必填**：`name/description` 的 zh 与 en 均非空。
7. **计划优先**：先建 `state: planned`（`fingerprint: pending`）再实现；源码未落地禁止激活/关单。
8. **规则先行**：`policy.yml` 在设计阶段定好；违规改设计，不删规则。
9. **增量优于全量**：只重建受影响子树，但每次增量后全项目 0 error。
10. **证据要求**：每个模块写 `source`/`revision`/`fingerprint`；指纹用 CLI `call normify_fingerprint`（7 原语无对应 op）或 legacy 工具实算，不要手估。
11. **收尾即闭环**：`change{op:"close"}` → `verify` 通过才算交付。

## 3. 工具面：7 原语（0.7 默认）

| 原语 | op | 用途 |
| --- | --- | --- |
| `normify_project` | init / list / status | 初始化（可一步建计划态根）/ 列项目 / 项目概览 |
| `normify_read` | get / list / search / deps / outline / brief / layout / policy | 只读查询 |
| `normify_write` | upsert / patch / batch / move / delete / promote / layout_upsert / layout_delete | 事务化写入（L1、原子批、`dry_run`） |
| `normify_check` | validate / check / drift / policy | L2 校验 / 预检 / git 漂移与增量规划 / 读规则 |
| `normify_build` | build / verify / sbom | 编译五件产物 + SBOM + 回执链 / 只校验 |
| `normify_render` | render | 渲染单文件 HTML（`out` 只接受纯文件名） |
| `normify_change` | open / update / list / close | 变更生命周期；`close` 0 error 强制并激活 planned |

| 配置 | 默认 | 效果 |
| --- | --- | --- |
| `toolset: "core"` | ✅ | 只注册 7 原语 |
| `toolset: "full"` | — | 只注册 31 旧工具（回 0.6 面） |
| `legacyTools: true` | `false` | 额外注册 31 旧名（过渡 1 个 minor，0.8 移除） |

- 完整 op 参数、31 旧名映射、4 个“无原语等价”的旧工具（fingerprint/refresh/help/policy_upsert）见
  [references/toolset.md](references/toolset.md)。
- 所有工具用 `project`（slug）或 `dir`（结构目录绝对路径）定位。
- `build` 产出 **5 件产物 + sidecar**：`tree.json` / `outline.md` / `api-index.json` / `structure-manifest.json`（SBOM）/
  `receipt.json` + `receipt.sha256`；回执链可用 `build{op:"verify"}` 或 CLI `verify` 逐件复算。

## 4. CLI 速查（跨 agent / CI；内部 full 31 工具集，不受插件 toolset 影响）

```bash
node lib/cli/index.js --help          # 命令与选项
node lib/cli/index.js tools           # JSON：full 工具集（31）
node lib/cli/index.js init|status|list|get|search|brief|validate|check|build|verify|render|sync \
  --project <slug> [--dir <path>] [--id <id>] [--repo-root <repo>] [--json] [--quiet]
node lib/cli/index.js change-open|change-list|change-close --project <slug> --args-json '<json>'
node lib/cli/index.js call <tool-name> --args-json '<json>'   # 调任意工具（含旧名）
```

- 安装后也可直接用 `normify <command>`（`bin` 映射 `lib/cli/index.js`）。
- 退出码：**0** 成功；**2** 校验/L2 错误（含 `verify` 不一致）；**4** 参数/用法错误；**5** 其它失败；**6** 安全拒绝。
- 输出默认 JSON；`--quiet` 单行 JSON。CI 用退出码判定，不要解析人类文案。

## 5. 数据格式最小要点

- 必填 9 字段：`uid / id / parent / name / description / source / revision / updated_at / fingerprint`；
  可选：`state`（planned 时 `fingerprint: pending`）、`replacement`、`tags`、`apis`（仅叶子）、`deps`（出向、可跨树）、`repository`（仅根）。
- id 点分路径、首段=树名、末段不能是保留段 `index`；uid 改名/移动不变。
- 完整字段、长度上限、YAML 子集、渲染数据字段见 [references/format.md](references/format.md)。

## 6. 三个主流程（细节见 recipes）

1. **全量建树**：`project{op:"init"}` → 骨架 → 逐层下钻（叶子到单一功能单元）→ API/箭头 → 每层 `write{op:"layout_upsert"}`
   → `check{op:"validate"}` → `build{op:"build"}` → `build{op:"verify"}` → `render{op:"render"}`。
2. **伴随开发**：`change{op:"open"}` → `read{op:"brief"}` → `check{op:"check"}` → `write{op:"batch"}(state=planned)`
   → 写码 → `change{op:"close"}`（自动刷新指纹/激活 planned，0 error 强制）。
3. **增量同步**：`check{op:"drift"}` 拿 affected / drift / new_files / layouts_to_review → 改结构（`write{op:"patch"}`）
   → `check{op:"validate"}` → `build{op:"build"}` → `build{op:"verify"}`。

→ [references/recipes.md](references/recipes.md)

## 7. 诊断处理

- 先按 `code` 查修法：[references/validation.md](references/validation.md)（高频）→ [docs/DIAGNOSTICS.md](../../docs/DIAGNOSTICS.md)（全量，代码生成）。
- `policy/<rule-id>` 是动态码，级别跟随规则 `severity`。
- 修完必须重跑 `check{op:"validate"}`；不要静默忽略 error，也不要只改产物不改源数据。

## 8. references 索引（按需加载，不要一次全读）

| 文件 | 何时读 |
| --- | --- |
| [references/toolset.md](references/toolset.md) | 7 原语 op 参数 / legacyTools / 31 旧名映射 |
| [references/format.md](references/format.md) | 写 frontmatter / renders / 变更记录前 |
| [references/validation.md](references/validation.md) | 遇到诊断、需要修法对照时 |
| [references/recipes.md](references/recipes.md) | 建树/伴随/同步/渲染可读性/CLI 命令 |
| [references/migration.md](references/migration.md) | 升级/迁移旧数据、跨版本行为差异 |
| [references/examples.md](references/examples.md) | 需要完整模块/渲染/变更/CLI 示例 |

## 9. 交付证据（完成 = 命令 + 输出）

```bash
node lib/cli/index.js validate --project <slug> --repo-root <repo>   # 0 error
node lib/cli/index.js build --project <slug>
node lib/cli/index.js verify --project <slug>                        # 退出码 0
```

汇报：结构目录、`normify.html` 路径、`receipt.sha256`、模块/API/依赖统计、warning 清单。
