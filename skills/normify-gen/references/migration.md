# 迁移与兼容（migration）

> SKILL 的参考文件之一。面向“用户的旧结构数据/旧用法要不要迁移”的问答。
> 完整迁移政策（含版本矩阵与命令）以 [docs/MIGRATION.md](../../../docs/MIGRATION.md) 与 [docs/COMPATIBILITY.md](../../../docs/COMPATIBILITY.md) 为准。

## 1. 数据格式（最重要）

- 结构数据的 schema_version 目前为 **1**，从 0.4.x 到 0.7.0 **无需迁移**：0.5.x 建的项目可直接被 0.6/0.7 读取/写入。
- `check{op:"validate"}`（CLI：`normify validate`）仍是唯一门禁；升级后先跑一次（带 `--repo-root`）确认 0 error，再继续开发。
- 删除型变更在 0.5.5 起由引擎自动维护 `delete_snapshot`；0.5.4 及以前创建的删除型变更可能缺快照，按报错提示用 `change{op:"update"}`（CLI：`normify call normify_change_update`）补一次即可。

## 2. 0.5.4 → 0.5.5（P0 止血）

无需数据迁移。行为变化（需要知道）：

| 变化 | 影响 |
| --- | --- |
| `engines.dsh` 只支持 `0.2.x` | DSH 0.1.x 环境请留在 0.5.4；0.2.x 直接升级 |
| 产物 5 件 + `receipt.sha256`（sidecar 自证） | 校验方式从“读 receipt”升级为 `normify verify`（sidecar → receipt → artifacts） |
| `id` 末段保留段 `index` 被拒绝 | 旧项目若真有 `*.index` 叶子，会报 `structure/id-reserved`，需改名（用 `normify_module_move`） |
| `render.out` 只接受纯文件名 | 传路径会报 `render/invalid-out`；要放别处请先渲染后移动文件 |
| `sync` diff 范围校验 | 只接受 revision / `A..B` / `A...B`；`-` 开头一律拒绝 |
| 写盘原子化 | 无感知；崩溃时不会再出现半截文件 |

## 3. 0.5.x → 0.6.0（分层重构，公开面兼容）

**无需数据迁移**；这是内部重构 + 新增 CLI 的版本。

| 对象 | 0.5.x | 0.6.0 |
| --- | --- | --- |
| 包入口 `main` | `lib/index.js` | `lib/dsh/index.js`（`import '@dsh-external/dsh-normify'` 照常可用） |
| 新增导出 | — | `@dsh-external/dsh-normify/core`（纯 Node 引擎）、`.../cli` |
| CLI | 无 | `normify` bin + `node lib/cli/index.js`（见 [recipes.md](recipes.md)） |
| 31 个 `normify_*` 工具名 | 31 | **仍是 31，名字不变**（适配层重写，DSH 无关规格在 `src/core/toolset.ts`） |
| 数据格式 | v1 | v1（只读/可写兼容） |
| `lib/` 仓库状态 | 随包发布 | **不再入 git**：使用/开发前先 `npm run build`（产线包仍包含 lib） |
| 构建 | `bash scripts/build.sh` | `npm run build`（`node node_modules/typescript/bin/tsc -p tsconfig.json`） |

**升级动作**：`npm install` → `npm run build`（从源码用时）→ 重装插件包 → **新开 DSH 会话**（工具列表会话启动时快照）。

## 4. 0.6.x → 0.7.0（默认工具面切换，**无数据迁移**）

- 默认只注册 **7 原语**（`project / read / write / check / build / render / change`，按 `op` 分派）；
  `legacyTools: true` 额外注册 31 旧名（过渡 1 个 minor，0.8 移除）；`toolset: "full"` 完全回 0.6 面。
- 结构数据 v1、五件产物 + SBOM + `verify`、CLI 命令与退出码**不变**；CLI 内部恒为 full 31 工具集。
- 迁移动作：把 prompt/技能里的旧工具名改成原语 op（映射见 [toolset.md](toolset.md)）；短期可开 `legacyTools`。
- 4 个旧工具**无原语等价**：`normify_fingerprint` / `normify_module_refresh` / `normify_help` / `normify_policy_upsert`；
  过渡期用 `legacyTools` 或 CLI `call`（`change{op:"close"}` 会自动刷新指纹/激活 planned）。
- 旧 A/B 表述改为“n=1 可行性实验”，方法学见 [docs/EVAL.md](../../../docs/EVAL.md)。

## 5. 兼容性口径

- 插件只支持**当前最新 DSH 线**（当前 `0.2.1-rc.5`，engines `>=0.2.1-rc.1 <0.3.0`）；DSH 换 minor 时插件随版本更新，不维护旧 DSH 分支。
- 需要旧 DSH/旧插件组合时，请锁定插件版本（`npm` 版本即契约），不要用 version exemption 强行绕过。
