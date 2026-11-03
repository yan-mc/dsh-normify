# Normify v0.5.5 · P0 止血：兼容当前 DSH 0.2.x（发布说明草稿）

> 本文件是**发布说明草稿**：带 `[待发布填写]` 的字段在打包/发布后补齐；粘贴到 GitHub Release 即可。

---

## Normify v0.5.5 · 对齐当前最新 DSH，并修掉 P0 级安全与数据问题

Phase 0「P0 止血」版本：不新增功能，只做三件事 —— 兼容当前 DSH 0.2.x、修安全破口、修会写坏数据的缺陷。

### 🎯 本版重点

**① 只支持当前最新 DSH（0.2.x）**

- `engines.dsh` 改为 `>=0.2.1-rc.1 <0.3.0`，目标运行时为 DSH `0.2.1-rc.5`（当前最新）。
- 0.1.x 环境请继续使用 v0.5.4（本版不再声明兼容）。
- 结构数据格式（v1）不变，从 0.5.4 升级无需迁移。

**② 安全修复（3 处）**

- `normify_sync`：`diff` 范围拒绝以 `-` 开头的选项注入（只接受 revision / `A..B` / `A...B` 文法）。
- `normify_render`：`out` 只接受纯文件名，越界报 `render/invalid-out`。
- `normify_fingerprint`：`source` 只接受仓库内 POSIX 相对路径；越界路径与符号链接按缺失处理，不再读取。

**③ L3 回执可自证**

- `receipt.json` 不再把自身写入 `artifacts`（自哈希逻辑上不可能自洽）；新增同目录 `receipt.sha256`
  sidecar，四件产物可逐件复算。（0.6.0 起产物增加 `structure-manifest.json`，共五件 + 回执自证链。）

**④ 数据正确性**

- `id` 末段保留段名 `index` 写入前拒绝（`structure/id-reserved`），避免与父容器同路径静默覆盖。
- 空 `module_batch`、孤儿 `module_upsert`、结构文件读取失败：显式报错（`args/empty-batch` /
  `structure/parent-not-exist`），不再静默成功。
- 环检测回归 L2：`normify_validate` 直接报环（`structure/dependency-cycle`），不再依赖渲染阶段才发现。
- `delete` 型变更单不再必然触发 `change/module-missing` 死锁，`change_close` 可正常收尾。

**⑤ 渲染安全与工程**

- 修复 HTML `<title>` 转义与 `/s+/g` → `/\s+/g` 正则；JSON `<` 转义保持。
- 写盘统一原子写（tmp + rename），中断不留半文件。

### ✅ 验证（2026-11-03 实机）

| 项目 | 结果 |
| --- | --- |
| `npm test`（engine / companion / regression-0.5.2 / 0.5.3 / 0.5.4 + 0.5.5 新增用例，共 6 套） | **PASS**（独立 worktree 复跑 2.3s，全绿） |
| `tsc -p tsconfig.json`（strict / declaration） | **PASS**（exit 0） |
| `node ci-contract-check.cjs`（31 工具契约） | **PASS**（bundle + tool-name contract ok） |
| `node scripts/pack-smoke.mjs --all --strict`（P0 验收入口） | **PASS 42 / FAIL 0 / WARN 0**（5.4s） |
| DSH `0.2.1-rc.5`：`pnpm pack` → 临时 DSH_HOME profile → `dsh plugin add <tgz>` → `dump-config` 含 dsh-normify 层 → headless mount 无错误 | **PASS**（engines 门禁解除；进入 MISSING_CREDENTIAL 阶段 = 插件全部 mount 成功） |
| 真实 `ToolRuntime` 契约加载（dsh-tools@0.2.1-rc.5 + cordis@4.0.5） | **PASS**（31 工具全部可见；parameters/output.schema 通过 0.2.1 JSON Schema 子集校验；skill normify-gen 注册成功） |

修复前后对照（审计期 12 个信号）：`git --output` 注入、`render.out` 穿越、`receipt` 自哈希、`index` 段 id、空 batch、孤儿 upsert、坏文件读、删 policy 后环检测、delete 型 change 死锁、`<title>` 注入、`/s+/g` 全部修复；`fingerprint` 越界收敛为"`../..` 已拒、显式 repoRoot 仍可算"（残余低危，0.6.0 收口）。

### 📦 安装（DSH 0.2.x）

推荐用 DSH 插件管理器 / 插件市场安装（`plugin_manager` → `install_bundle`，目标为包目录、Release tgz 或市场条目）；开发模式可用：

```bash
dsh plugin --profile <profile> add <dsh-normify 包目录或 .tgz 的绝对路径>
```

装完请**新开一个会话**（工具列表在会话启动时快照）。详见 [README「安装」](../README.md#5-安装)。

### 📎 附件

| 项 | 值 |
| --- | --- |
| 附件 | `dsh-external-dsh-normify-0.5.5.tgz` |
| 体积 | 219,798 B |
| SHA-256 | `014e1b26479c7f15cf2fa11a7a6ef5dae21e2bc9e6f286b5c80af96c8b1e51f2` |

### 🙏 致谢

感谢社区 PR #7（`fix(compat): support DSH 0.2.x`）与 PR #8（`extend engines.dsh range`）提供的兼容性核对与改动建议；
0.5.5 的 DSH 0.2.x 声明与安装验证参考了这两份工作。

### 📚 文档

- [README](../README.md) ｜ [English](../README_EN.md) ｜ [变更日志](../CHANGELOG.md)
- [正式规范](../docs/SPEC.zh-CN.md) ｜ [生成器技能](../skills/normify-gen/SKILL.md)
