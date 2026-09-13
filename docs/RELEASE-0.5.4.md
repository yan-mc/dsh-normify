## Normify v0.5.4 · 修掉第二轮 A/B 实测暴露的 4 个工具缺陷

第二轮对照实验换了题目：**表格公式引擎 + CLI**（同一份规范、隐藏黑盒 88 项，另加**差分模糊测试**）。
两组最终 B 88/88、A 87/88（唯一差异是一条 §5.2 语义，属被测实现问题而非插件）。
这一版修的是那一轮暴露的**工具侧**四个坑——都是"AI 真实踩到、并且为此绕路"的：

### 🎯 四处修复

**① `mode:"patch"` 的静默 no-op（最危险的"假成功"）**

`normify_module_batch { mode:"patch", items:[{ patch:{ id:"x", tags:[...] } }] }`（少一层包装）会走
`applyPatch(module, {})`，返回 **`ok:true, count:1` 而一个字段都没改**。

- 现在内层 `patch` 缺失 / `null` / 非对象 / 空对象 → **`args/invalid-patch`**，evidence 带收到的键与正确形状。
- 单模块 `normify_module_patch` 传空补丁（含"只给 `expect_updated_at`"）→ **`args/empty-patch`**。

**② `normify_module_refresh` 不再强依赖 git**

`repoRoot` 不是 git 仓库时以前直接失败（实测中 AI 只能 `git init` 才能把 planned 模块激活）。
现在**降级**：指纹重算、`activate` 生效、`revision` 保持原值，并给出 `refresh/git-unavailable` 警告 + 修法。

**③ `change_open` 的 `acceptance` 报错具体化**

传 `{zh,en}` 时现在明确写出"**第 N 条不是非空字符串**"并说明"验收标准只接受纯字符串，双语请写 title/intent"。

**④ `normify_help` 支持 `tool:<工具名>` 参数树**

`topic:"tools"` 每个工具带 `必填 / 可选` 摘要；新增 `topic:"tool:normify_module_batch"` 打印完整参数树
（类型 / 描述 / 必填，注册表实时生成、与运行时校验同源）。实测里 AI 为确认 patch 嵌套形状去读了插件源码，
这条主题就是为了消灭这种绕路。

### ✅ 验证

| 项目 | 结果 |
| --- | --- |
| `tests/regression-0.5.4.mjs`（新增） | **21 项断言全绿** |
| `tests/engine-e2e.mjs` / `companion-e2e.mjs` / `regression-0.5.2.mjs` / `regression-0.5.3.mjs` | 全部 PASS |
| `ci-contract-check.cjs`（31 个工具契约） | ok |
| `tsc -p tsconfig.json`（strict / declaration） | 0 error |

### 📦 安装

```powershell
Invoke-WebRequest -Uri "https://github.com/yan-mc/dsh-normify/releases/download/v0.5.4/dsh-external-dsh-normify-0.5.4.tgz" -OutFile "dsh-external-dsh-normify-0.5.4.tgz"
```

```bash
curl -L -o dsh-external-dsh-normify-0.5.4.tgz \
  https://github.com/yan-mc/dsh-normify/releases/download/v0.5.4/dsh-external-dsh-normify-0.5.4.tgz
```

### 📚 实验记录

- 报告：`test-results/2026-09-13-ab2-formula-engine/TEST-REPORT.md`
- 差分模糊结论：`check` 载荷 60/60 一致、`eval` 无环子集 36/36 一致、有环子集差异只在 `order`
- 三处**规范缺口**（`IF` 短路语义、区域传标量函数、文件级错误载荷形状）已补进归档 `SPEC.md` 附录

### 📚 文档

- [README](../README.md) ｜ [English](../README_EN.md) ｜ [正式规范](../docs/SPEC.zh-CN.md) ｜ [生成器技能](../skills/normify-gen/SKILL.md) ｜ [变更日志](../CHANGELOG.md)
