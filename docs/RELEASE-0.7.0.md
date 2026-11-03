# Normify v0.7.0 · Phase 2 发布说明（7 原语默认面 / 评测 / 市场分发）

> 状态：发布候选已通过全部验收（`pack-smoke --all --strict` PASS 43 / FAIL 0）。推送与 npm publish 由仓库负责人执行。

## 一句话

0.7.0 把**默认工具面从 31 个旧工具切换为 7 个原语**（`project / read / write / check / build / render / change`，op 枚举），并补齐**检索层评测**与**市场分发材料**。结构数据格式（v1）不变、五件产物 + SBOM + verify 不变、CLI 不变；旧 31 名通过 `config.legacyTools: true` 过渡 1 个 minor。

## 亮点

### 1) 工具面切换（breaking，有过渡）

| 原语 | op |
|---|---|
| `normify_project` | init / list / status |
| `normify_read` | get / list / search / deps / outline / brief / layout / policy |
| `normify_write` | upsert / patch / batch / move / delete / promote / layout_upsert / layout_delete |
| `normify_check` | validate / check / drift / policy |
| `normify_build` | build / verify / sbom |
| `normify_render` | render |
| `normify_change` | open / update / list / close |

- 默认注册 **7** 个工具（schema 体积较 31 工具面显著下降，工具选择歧义减少）。
- `config.legacyTools: true` → 7 + 31 = **38**（旧名保留 1 个 minor）；`config.toolset: "full"` → 31（完全回旧面）。
- destroy 语义（含 `normify_write` 的 delete/layout_delete）继续走 `tools/pre-execute ask` 一次性审批。
- 每个工具仍有真实 `output.schema` / `presentationMeta` / `presentCall` / `presentResult`。

### 2) 检索层评测（n≥3，可复跑）

- `eval/harness.mjs`：grep 基线 / tree.json 基线 / normify CLI 三 arm × ≥20 任务 × n=3，独立进程运行；指标 = top-k 正确率、耗时、输出字节（token 代理）、调用次数。
- 结果与局限见 `docs/EVAL-RESULTS.md`；`docs/EVAL.md` 给出**在 DSH 内做 LLM A/B** 的 n≥3 / 独立 profile / 预注册指标 / 盲评协议（本次不宣称端到端 agent 收益）。
- 旧 A/B（42/42、87/88）表述改为"n=1 可行性实验"（见 docs/EVAL.md 方法学说明）。

### 3) 市场分发材料

- `docs/MARKET.md`：官方 plugin market（索引源模式）/ dshbase / dshhub 的上架材料（标题/描述/tags、截图、安装命令、兼容声明、安全说明、需用户执行的步骤清单）。
- ADR-0011：Harness 内只读 UI 面板 0.7 不做（0.8/1.0 重评，含 spike 范围与验收指标）。
- ADR-0012：MCP 薄适配 0.7 不做（CLI-first；含 PR #6 回应措辞与未来只读 MCP 边界）。

### 4) 文档 / 技能

- README/README_EN 工具面章节改为 7 原语 + legacyTools 映射表；MIGRATION 增加 0.6→0.7；COMPATIBILITY 增加 0.7.0 行；SKILL 与 references 同步（薄入口保持 ≤150 行）。
- 诊断码总表、发布检查清单、CLI 文档沿用 0.6.0 体系。

## 验证（2026-11-03 实机）

| 项目 | 结果 |
|---|---|
| build / typecheck | PASS（0 error） |
| 6 套 e2e/回归 + core-unit 79 + platform-contract 25 + perf | PASS |
| `pack-smoke --all --strict` | **PASS 43 / FAIL 0 / WARN 0**（static 15 / contract 18 / boot 8） |
| 工具面 | 默认 7 原语；`legacyTools` 38；`toolset=full` 31（platform-contract 25/25 覆盖三种模式） |
| static | engines 门禁、bundle patch 自洽、files 覆盖、版本单源 0.7.0、lib↔src 对齐、full 规格 31 |
| contract | 真实 ToolRuntime（full 面 31 工具）schema/presenters/skill 全过 |
| boot | `pnpm pack` 266,769 B → 临时 DSH_HOME profile → `dsh plugin add` → dump-config 含插件层 → headless mount 无错误 |
| 评测 | 见 `docs/EVAL-RESULTS.md`（本次为检索层评测，非 LLM A/B） |

## 安装与升级

- DSH 0.2.x（`engines.dsh: ">=0.2.1-rc.1 <0.3.0"`，只支持当前最新版）；DSH 0.1.x 请留在 0.5.4。
- **从 0.6.x 升级**：结构数据无需迁移；默认工具名从 31 变成 7 原语——若你的 prompt/技能还引用旧名，设置 `config.legacyTools: true` 或改用新原语（映射见 README）。
- 安装：`plugin_manager`（`install_bundle`，包目录/tgz/市场条目）或 `dsh plugin --profile <p> add <tgz>`；装好后新开会话。

## 附件

| 项 | 值 |
|---|---|
| 附件 | `dsh-external-dsh-normify-0.7.0.tgz` |
| 体积 | 266,769 B |
| SHA-256 | `4609994ca9e1a5edd152b8ed1799bd13c66170ef0680eecaee8237d8ea0ddf61` |

## 已知限制 / 1.0 预告

- 0.1.x 不支持；DSH 换 minor 需随版本更新 `engines.dsh`（见 COMPATIBILITY）。
- LLM 端到端 A/B 需在 DSH 内由用户按 EVAL.md 协议执行（本机无模型凭据）；本次只交付检索层数据。
- 市场实际收录需用户执行推送/上传/提交索引（见 MARKET.md 清单）。
- 1.0.0 目标：连续 2 个 minor 无破坏、公开 API/诊断码/CLI 协议冻结、安全复查、维护承诺。
