# Normify v0.7.1 · 补丁：issue #4 文案长度校验一致性

> **已发布（2026-11-03）**：GitHub Release https://github.com/yan-mc/dsh-normify/releases/tag/v0.7.1（资产 tgz 已上传）；npm 按负责人决定暂不发布。

## 一句话

0.7.1 只修 **issue #4**：模块/API/依赖三类文案的**诊断码前缀、宽松模式 severity、长度上限口径**三者对齐。工具面（默认 7 原语）、数据格式与 CLI 均不变，从 0.7.0 升级**无需迁移**。

## 修复内容

### 1) 诊断码前缀（6 个不可达码复活）

`checkL10n` 支持 `codePrefix`：模块=`structure` / API=`api` / 依赖=`dep`。

- 之前：API 描述超长、依赖 label 超长被错报成 `structure/description-too-long` / `structure/label-too-long`，`validate` 的 `BILINGUAL_CODES` 里 `api/description-*`、`dep/label-*` 共 6 个码永远不可达。
- 现在：分别产生 `api/description-{shape,empty,too-long}`、`dep/label-{shape,empty,too-long}`；`structure/label-too-long` 不再出现。

### 2) 宽松模式 severity 统一

`requireBilingual: false` 时，四类文案问题（模块 name、模块 description、`apis[].description`、`deps[].label`）统一降级为 **warning**，不再出现"label 超长整批原子回滚、其他只 warning"的分叉。

- L1 对"内容类错误（empty / too-long）"仍返回模块（结构性错误照旧阻断），避免模块被丢后产生 `api/leaf-missing` 等误导性连带错误；
- 写路径仍是**零容忍**：任意 L1 error 都会拒绝写入（批量原子性不变）。

### 3) 上限口径与诊断表

四个字段四种上限，现已写清并对齐：

| 字段 | 上限（zh/en 各） |
|---|---|
| 模块 `name` | 60 |
| 模块 `description` | 500 |
| `apis[].description` | 200 |
| `deps[].label`（可选） | 30 |

- `reference.ts` 的诊断口径修正；`references/format.md` 补上限说明；
- `gen-diagnostics.mjs` 支持 `@diag-codes` 注解（显式枚举由参数决定前缀的码），`docs/DIAGNOSTICS.md` 扩到 **235** 个码；
- `--check` 增加 CRLF 归一化，Windows 工作区不再误报过期。

### 4) 回归测试

`tests/regression-0.5.5.mjs` 增补 ⑩a–⑩d：strict 模式产生 3 个正确码 / loose 模式统一降级 warning（0 error）/ 旧码消失 / 模块不被丢弃。

## 验证（2026-11-03 实机）

| 项目 | 结果 |
|---|---|
| typecheck / build | PASS（0 error） |
| 6 套 e2e/回归 + core-unit 79 + platform-contract 25 + perf + eval | PASS |
| `pack-smoke --all --strict`（static/contract/boot） | **PASS 42 / FAIL 0 / WARN 0** |
| 诊断表 | `gen-diagnostics --check` PASS（235 码） |
| 工具面 | 默认 7 原语；legacyTools 35；toolset=full 31（platform-contract 25/25） |

## 升级

- 从 0.7.0：直接替换插件包即可，**无数据迁移、无 API 变更**；回归门禁建议加一条 `dep/label` 宽松模式用例（本次已内置）。
- 从 0.6.x/0.5.x：见 [MIGRATION.md](MIGRATION.md)。

## 附件

| 项 | 值 |
|---|---|
| 附件 | `dsh-external-dsh-normify-0.7.1.tgz` |
| 体积 | 273,852 B |
| SHA-256 | `7f2d27e14a489638da7ebb1b20c94b18a27f96ec8fb21bed73064ce838abda60` |

## 致谢

感谢 issue #4（@siweina）给出的逐行核对与三处不一致证据；本补丁按其建议采用"码前缀对齐 + L2 统一分级 + 文档上限表"的方案实现。
