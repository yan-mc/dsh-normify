## Normify v0.5.3 · 把「伴随编程实测」暴露的 4 个摩擦点修掉

这一版没有新功能，只有四件事 —— 全部来自一次真实的 A/B 对照实验：**同一份规范、同一类模型，两个 AI 写同一个
交互式白板后端**，一个带 dsh-normify 走伴随流程，一个纯手写；用一套隐藏黑盒验收（42 项）打分，两组最终**都是 42/42**。
插件组额外交付了 41 模块 / 110 API / 10 层的架构数据，也把下面 4 个粗糙处暴露了出来。

### 🎯 四处修复

**① `normify_help` 现在按主题返回（此前完全忽略入参）**

0.5.2 的 `normify_help` 无论传什么都返回同一份字段速查。实验里 AI 为了拿到 `change_open` / `layout_upsert` /
`change_close` 的准确参数名，只能去读插件的 `lib/tools.js`，多花约 4 分钟。

- 主题：`fields`（默认）/ `deps`（箭头与 API 直连）/ `renders`（渲染数据）/ `flow`（伴随开发主流程）/
  `tools`（工具清单，由注册表实时生成）/ `policy`（架构规则）/ `errors`（常见诊断码与修法）/ `all`
- **传错主题不再静默忽略**：返回 `args/invalid-topic` 并列出可用主题。

**② 项目初始化通道（新增第 31 个工具）**

实验里"第一次开项目"没有入口：`change_open` 要求项目目录已存在（`project/no-modules`），
`normify_brief({id})` 要求模块已存在，AI 只能用 `module_batch {items: [], dry_run: true}` 去"建目录"。

- 新增 **`normify_project_init`**：建 `normify-<slug>/` + 安装默认架构规则；可选 `root` 一步创建"计划态根模块"；幂等。
- `normify_change_open` 现在也会**自动建项目目录**（写工具语义）。
- `normify_brief` 遇到不存在的模块，返回"先 init / 先建树 / 或改用 `task` 参数"的可执行提示。

**③ 批量诊断补上因果链**

实验里一条 `structure/label-too-long` 连带出 3 条 `dep/target-missing`（L1 失败的模块会被移出批次工作集），
报错完全不点明因果，AI 只能读源码才确认根因，白跑一轮。

- 连带错误改报 **`dep/target-dropped`** / **`structure/parent-dropped`**，message 与 `evidence.root_cause_code`
  直接写明"某模块因哪条 L1 诊断被移出批次"；
- 失败响应新增 **`root_causes: [{module, code, message}]` + `hint`**，一眼看清"修哪几个"。

**④ 「API 直连」引导**

实验数据：结构数据里声明了 **110 条 API、54 条箭头，其中 0 条**用 `from_api` / `to_api` 锚定到具体 API ——
等于白丢渲染器最精细的一层（箭头只能落在框边，钉不到 API 行）。

- `normify_validate` 现在会给出**聚合 warning `dep/unanchored`**：条数 + 前 3 条示例 + 修法。
- **引导不等于放宽**：锚到不存在的 API 键仍然是 error（`dep/from-api-invalid`）。

### ✅ 验证

| 项目 | 结果 |
| --- | --- |
| `tests/regression-0.5.3.mjs`（新增，锁定四点） | **21 项断言全绿** |
| `tests/engine-e2e.mjs` / `tests/companion-e2e.mjs` / `tests/regression-0.5.2.mjs` | 全部 PASS |
| `ci-contract-check.cjs` | 工具数契约 30 → **31**，并断言 3 个关键工具存在 |
| `tsc -p tsconfig.json`（strict / declaration） | 0 error |

### 📦 安装

```powershell
Invoke-WebRequest -Uri "https://github.com/yan-mc/dsh-normify/releases/download/v0.5.3/dsh-external-dsh-normify-0.5.3.tgz" -OutFile "dsh-external-dsh-normify-0.5.3.tgz"
```

```bash
curl -L -o dsh-external-dsh-normify-0.5.3.tgz \
  https://github.com/yan-mc/dsh-normify/releases/download/v0.5.3/dsh-external-dsh-normify-0.5.3.tgz
```

然后按 [README「安装」](../README.md#5-安装) 把包登记进 profile 的 `dependencies` + `dsh.profile.bundles`，重启 DSH。

### 📚 实验记录（本版修复的依据）

- 报告：`test-results/2026-09-12-ab-companion/TEST-REPORT.md`（A/B 交付物、隐藏黑盒 42 项、两份过程日志、证据清单）
- 关键数字：A 组 41 模块 / 110 API / 54 箭头 / 10 层 / `validate` 0 error；两组端到端耗时 ≈8.4 min vs ≈22 min

### 📚 文档

- [README](../README.md) ｜ [English](../README_EN.md) ｜ [正式规范](../docs/SPEC.zh-CN.md) ｜ [生成器技能](../skills/normify-gen/SKILL.md) ｜ [变更日志](../CHANGELOG.md)
