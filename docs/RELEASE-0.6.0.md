# Normify v0.6.0 · Phase 1 发布说明（结构编译器 / CLI / SBOM）

> 状态：发布候选已通过全部验收（`pack-smoke --all --strict` PASS 43 / FAIL 0）。推送与 npm publish 由仓库负责人执行。

## 一句话

0.6.0 是**内部重构版**：公开工具名（31 个 `normify_*`）与结构数据格式不变，换来 **core/dsh/cli 分层**、**跨 agent CLI**、**结构 SBOM + 回执自证链**、**语义化结构 diff**、**现代化 DSH 适配层（真实 output schema / presenters / destroy 审批）**、**测试与 CI 矩阵 + DSH 契约漂移检测**，以及写路径 60× 性能提升。

## 亮点

### 架构（无 breaking）

- `src/core`（纯 Node 引擎，零 `@deepseek-ai/*`）／`src/dsh`（DSH 适配层，唯一接触 DSH API）／`src/cli`（跨 agent CLI）；`lib/` 不再入库，构建产物由 `npm run build` 生成。
- 新增 **7 原语面**（`project / read / write / check / build / render / change`）作为 opt-in：`config.toolset: "core"`；默认仍是 31 工具旧面，0.7.0 切换默认并配 `legacyTools` 过渡。
- ADR-0009（Phase 1 单包内部分层、Phase 2 再抽 monorepo）、ADR-0010（不引 `dsh-tools` 运行时依赖，用等价 ToolDefinition + 自校验）。

### 新增能力（全部可选、向后兼容）

| 能力 | 入口 | 说明 |
|---|---|---|
| **CLI** | `normify <cmd>`（`bin`） | init/status/list/get/search/brief/validate/check/build/verify/render/sync/change/policy/diff/call/tools；JSON 输出 + 退出码 0/2/4/5/6；跨 DSH/Claude Code/Codex/CI 可用 |
| **结构 SBOM** | `structure-manifest.json` | 模块/API/依赖确定性清单 + 生成器版本 + 其它产物哈希 |
| **回执自证链** | `receipt.json` + `receipt.sha256` | source → manifest → tree/api-index/outline → receipt → sidecar，逐件可复算 |
| **verify** | `normify verify` / `normify_build{verify_only:true}` | 篡改产物可检出（`verify/hash-mismatch`，退出码 2） |
| **语义化 diff** | `normify diff --from <a> --to <b>` | 模块/API/依赖增删改 + breaking 判定；`--fail-on-change` / `--fail-on-breaking` 退出码 3，可做 PR 门禁 |
| **DSH 适配层** | 插件内自动 | 31 工具真实 `output.schema`、`presentationMeta`、`presentCall/presentResult` 卡片、只读工具 `isConcurrencySafe`、destroy 操作 `tools/pre-execute ask` 一次性审批 |
| **上架元数据** | `locale/{en,zh}.json`、`icon.svg`、`exports` | 插件管理器/市场可显示标题、描述、图标 |
| **技能瘦身** | `skills/normify-gen/` | 321 行 → 114 行薄入口 + `references/`（format/validation/recipes/migration/examples） |

### 性能（本机 Node 24 基准，审计基线 → 0.6.0）

| 场景 | 0.5.4 | 0.6.0 |
|---|---|---|
| 300 模块 batch 写入 | 42.8s | **0.67s**（≈64×） |
| 单模块 patch（300 模块项目） | 645ms | **121ms** |
| 300 模块 validate | 310ms | **100ms** |

### 测试与工程

- `tests/core-unit.mjs` 79 用例、`tests/platform-contract.mjs` 22 断言（真实 ToolRuntime）、`tests/perf-smoke.mjs`；既有 6 套 e2e/回归全绿。
- CI：fast（ubuntu+windows × node20/22/24）/ integration / contract-next（非阻断）/ guards；`npm pack --dry-run` 清单校验。
- `scripts/dsh-contract-diff.mjs` + 每周 `dsh-watch`：只 diff Normify 使用的 DSH 符号面，漂移自动开/复用 issue（实测已发现 0.2.2-alpha 的 12 移除/16 新增）。
- 修复：单段根模块父晋升自删（根文件消失）、`depParam.label` 误标必填。

## 验证（2026-11-03 实机）

| 项目 | 结果 |
|---|---|
| build / typecheck | PASS（0 error） |
| 6 套 e2e/回归 + core-unit 79 + platform-contract 22 + perf | PASS |
| `pack-smoke --all --strict`（static/contract/boot） | **PASS 43 / FAIL 0 / WARN 0** |
| static | 15 PASS：engines 门禁解除、bundle patch 自洽、files 覆盖、版本单源 0.6.0、lib↔src 24 文件对齐、31 工具 |
| contract | 18 PASS：真实 ToolRuntime 31 工具可见、parameters/output.schema 通过 0.2.1 子集、presenters 存在、skill 注册 |
| boot | 8 PASS：`pnpm pack` 267,045 B（tag v0.6.0 重建资产） → 临时 DSH_HOME profile → `dsh plugin add` → dump-config 含插件层 → headless mount 无错误 |

## 安装与升级

- DSH 0.2.x（`engines.dsh: ">=0.2.1-rc.1 <0.3.0"`，只支持当前最新版）；DSH 0.1.x 请留在 0.5.4。
- 安装：`plugin_manager`（`install_bundle`，包目录/tgz/市场条目）或 `dsh plugin --profile <p> add <tgz>`；装好后**新开会话**。
- 从 0.5.x 升级：**无需迁移**（结构数据 v1 不变；`lib` 布局与 CLI 是新增）。详见 [MIGRATION.md](MIGRATION.md)。

## 附件

| 项 | 值 |
|---|---|
| 附件 | `dsh-external-dsh-normify-0.6.0.tgz` |
| 体积 | 267,045 B |
| SHA-256 | `de48dbe14a3100494a6dedc8a43201f9d3d2408e2832db3806877292d3644cf2` |

## 已知限制 / 0.7.0 预告

- 默认仍是 31 工具面；7 原语为 opt-in（`toolset: "core"`）。0.7.0 切换默认 + `legacyTools` 过渡 + 市场分发 + n≥3 评测。
- DSH 每条 minor 需随版本更新 `engines.dsh`（政策见 [COMPATIBILITY.md](COMPATIBILITY.md)）。
- MCP 适配、Harness 内 UI 面板为 0.7.x 决策门（默认不做，需 spike + ADR）。

## 致谢

感谢社区 PR #7/#8 提供的 DSH 0.2.x 兼容性核对；0.5.5/0.6.0 的兼容声明与验证参考了这两份工作。
