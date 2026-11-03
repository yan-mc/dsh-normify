# 市场分发材料（MARKET）

> 用途：官方 DSH 插件市场（索引源模式）、dshbase、dshhub 的上架/更新素材与操作清单。
> 本机**没有发布凭证**：以下“需用户执行”的步骤由仓库负责人完成；本文件只准备材料与清单。
> 当前发布版本：`0.7.0`（tag 待打；上一版 `0.6.0` 已发布）。发布动作完成后把下方占位符替换为实际 Release URL。
> 兼容矩阵：[COMPATIBILITY.md](COMPATIBILITY.md) ｜ 发布清单：[RELEASE-CHECKLIST.md](RELEASE-CHECKLIST.md) ｜ 安全：[../SECURITY.md](../SECURITY.md)

## 1. 基础信息（各渠道共用）

| 字段 | 值 |
| --- | --- |
| 包名 | `@dsh-external/dsh-normify` |
| 显示名（中文） | Normify · 结构编译器 |
| 显示名（English） | Normify · Structure Compiler |
| 版本 | `0.7.0` |
| License | MIT |
| 仓库 | https://github.com/yan-mc/dsh-normify |
| icon | `./icon.svg`（raw：`https://raw.githubusercontent.com/yan-mc/dsh-normify/main/icon.svg`） |
| locale 元数据 | `locale/zh.json`、`locale/en.json`（`meta.title` / `meta.description`） |
| 分类 | Developer Tools / Architecture / Static Analysis（以目录现有分类为准） |
| tags | `dsh-plugin`, `deepseek-harness`, `architecture`, `architecture-as-code`, `structure-sbom`, `cli`, `module-tree`, `normify` |
| topic（GitHub 必填） | `dsh-plugin`（另加 `deepseek-harness`、`architecture`、`structure-sbom`） |

## 2. 一句话 / 长描述（可直接粘贴）

### 中文

**一句话（≤60 字）**：把人机共读的分形模块树变成可校验、可编译、可回执的结构数据，并渲染单文件交互架构图。

**长描述**：
Normify 是 DeepSeek Harness（DSH）插件，也是一套写给 AI 用的开发流程。它把项目架构写成“分形模块树”结构数据：
AI 负责分析与创作，确定性引擎负责零容忍校验、确定性编译与渲染。核心能力：

- **7 原语工具面**（project / read / write / check / build / render / change，op 枚举约束）；0.7 起默认只注册 7 个，
  `legacyTools: true` 可临时恢复 31 个旧工具名（过渡 1 个 minor）。
- **五件产物 + 结构 SBOM + 回执自证链**：`tree.json` / `outline.md` / `api-index.json` / `structure-manifest.json` /
  `receipt.json` + `receipt.sha256`，`normify verify` 可逐件复算，篡改可检出。
- **单文件交互架构图**：下钻、悬停、双语、深链接、API 直连箭头、跨层聚合；零外部依赖，双击即开。
- **伴随开发流程**：先建图后编程（计划态 → 逐模块实现 → `change{op:"close"}` 0 error 收口）。
- **跨 agent CLI**：`normify` 命令（init/validate/build/verify/render/diff/change…），JSON 输出 + 稳定退出码，CI 可门禁。
- **只读分析、零网络、零遥测**：结构数据只写入 `normify-<slug>/`；写路径有包含性校验与原子写。

适用：需要“代码 ↔ 架构图不脱节”的团队 / 多 agent 协作 / 架构评审 / CI 结构门禁。

### English

**One-liner**：Turn your codebase into a validated, compilable, receipt-verifiable module tree — and a single-file interactive architecture map.

**Long description**：
Normify is a DeepSeek Harness (DSH) plugin and an agent workflow for architecture-as-code. It describes a project as a
fractal module tree: the AI analyses and authors, while a deterministic engine performs zero-tolerance validation,
deterministic compilation and rendering. Highlights:

- **7-primitive tool surface** (`project / read / write / check / build / render / change` with op enums); since 0.7 only
  these 7 are registered by default, with `legacyTools: true` temporarily restoring the 31 legacy tool names.
- **Five artifacts + structure SBOM + self-verifiable receipts**: `tree.json` / `outline.md` / `api-index.json` /
  `structure-manifest.json` / `receipt.json` plus `receipt.sha256`; `normify verify` recomputes the whole chain.
- **Single-file interactive architecture map**: drill-down, hover, zh/en switch, deep links, API-anchored arrows,
  cross-level aggregation; zero external dependencies.
- **Companion development**: design-first planned trees → implement → activate → zero-error `change_close`.
- **Cross-agent CLI**: `normify <cmd>` with JSON output and stable exit codes, usable in CI gates.
- **Read-only analysis, zero network, zero telemetry**; writes are confined to `normify-<slug>/` with atomic writes.

## 3. 安装命令（复制到各渠道）

```text
# A. 插件管理器（推荐）：在 DSH 会话里让 agent 用 plugin_manager → install_bundle，
#    目标为包目录 / Release tgz / 市场条目
# B. CLI：
dsh plugin --profile <profile> add <dsh-external-dsh-normify-<version>.tgz 的绝对路径>
# C. 市场：若索引源已收录，直接在插件市场页面安装
# 装完新开一个 DSH 会话（工具列表在会话启动时快照）
```

CLI 使用（不依赖 DSH 运行时）：

```bash
normify --help          # 或 node lib/cli/index.js --help
normify verify --project demo
```

## 4. 截图引用（raw.githubusercontent，需在默认分支）

| 用途 | URL |
| --- | --- |
| 总览 | `https://raw.githubusercontent.com/yan-mc/dsh-normify/main/docs/screenshots/overview.png` |
| 引擎层（API 直连） | `https://raw.githubusercontent.com/yan-mc/dsh-normify/main/docs/screenshots/engine.png` |
| 工具层 | `https://raw.githubusercontent.com/yan-mc/dsh-normify/main/docs/screenshots/tools.png` |
| 模型层 | `https://raw.githubusercontent.com/yan-mc/dsh-normify/main/docs/screenshots/model.png` |

## 5. 版本与兼容声明

- 只支持**当前最新 DSH 线**：`0.2.1-rc.5` 已由 `pack-smoke --all --strict` 实测 PASS；`engines.dsh: ">=0.2.1-rc.1 <0.3.0"`。
- DSH 0.1.x **不支持**（插件 `0.5.4` 是最后支持线）；DSH `>=0.3.0` 需等适配版本。
- Node.js ≥ 18；Windows/macOS/Linux 的 CLI 与引擎均为纯 Node。
- 结构数据格式 v1 不变，0.5/0.6 项目直接升级（0.7 无数据迁移；工具面切换见 MIGRATION）。

## 6. 安全说明（渠道页面安全栏可用）

- 零网络、零遥测：插件/CLI 运行时不发起任何出站请求。
- 只读分析：绝不修改被分析仓库；结构数据只写到 `normify-<slug>/`。
- 写路径包含性校验 + `render.out` 纯文件名限制 + sync diff 参数白名单 + 原子写。
- fail-closed：validate 有 error 不产出产物；`normify verify` 校验回执链。
- 无凭据处理、无 install/postinstall 脚本。详见 [SECURITY.md](../SECURITY.md)。

## 7. 各渠道现状与更新动作

| 渠道 | 现状（2026-11-03） | 需要做什么 |
| --- | --- | --- |
| 官方 DSH 插件市场（索引源模式） | DSH 不自带索引，用户添加“索引源 URL”；`plugin_market` 只读工具每次请求有少量 token 成本；第三方索引需自担信任 | 把本仓库作为可索引条目加入索引源（具体索引 schema/提交方式以当前 DSH 插件市场文档为准）；打 `dsh-plugin` topic、补齐 locale/icon/description/keywords |
| dshbase（https://dshbase.com/plugins/dsh-normify/） | 已收录，标记为 **Unverified**（未做安装实测）；描述仍是旧口径 | 提交 Verified 证据（安装截图/日志/短 demo）；更新版本、描述、图标、tags |
| dshhub（https://dshhub.dev/plugins/dsh-normify） | 已收录（显示旧 star/更新时间） | 更新版本/描述；README 可贴其 badge |

## 8. 需用户执行的步骤清单（本机无发布凭证）

- [ ] 0.7.0 发布：`git tag v0.7.0` + push tag；GitHub Release 上传 `dsh-external-dsh-normify-0.7.0.tgz` 并填写 SHA-256。
- [ ] 更新 GitHub 仓库 description 与 topics（`dsh-plugin` 等）。
- [ ] 官方市场：准备/更新索引源条目（或提交索引源 PR），确认市场可搜索到，描述/版本/图标正确。
- [ ] dshbase：按站点指引提交 Verified 证据（截图/日志/demo），更新描述与版本。
- [ ] dshhub：提交目录信息更新（版本/描述/截图）。
- [ ] 社区：回复 0.7.0 相关 issue/PR（尤其默认面切换与 `legacyTools` 说明），致谢贡献者。
- [ ] 7 天后回看安装反馈与差评原因，triage 到下一 patch/minor。

## 9. 待填占位符（发布后替换）

| 项 | 值 |
| --- | --- |
| Release tgz URL | `https://github.com/yan-mc/dsh-normify/releases/download/v0.7.0/dsh-external-dsh-normify-0.7.0.tgz` |
| tgz 体积 / SHA-256 | 272,967 B / `8b196abdbf2d444a2f205a5d2e7b2dd3b40426a24b5507777e029502e1bef1a8` |
| 发布说明 | [RELEASE-0.7.0.md](RELEASE-0.7.0.md)（已就绪） |
| 下载量/星标（更新渠道用） | `<发布后从 GitHub API 读取>` |

## 10. 市场验收标准

- [ ] 市场/目录可搜索到 `dsh-normify`，显示名、图标、版本、描述均为当前版本。
- [ ] 安装命令可复制执行；DSH 0.2.1-rc.5 上安装成功、新会话可见工具面（默认 7 原语；legacyTools 开启后 31 旧名可见）。
- [ ] 兼容声明与 [COMPATIBILITY.md](COMPATIBILITY.md) 一致；安全描述与 [SECURITY.md](../SECURITY.md) 一致。
- [ ] 相对链接有效；截图 URL 可访问；无“四件产物/31 工具默认面”等旧口径残留。
