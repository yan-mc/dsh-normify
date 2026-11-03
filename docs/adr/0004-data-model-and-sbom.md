# ADR-0004：数据模型 v2、产物与结构 SBOM

- 状态：Accepted（冻结）
- 日期：2026-11-03

## 背景
v1 有 `index` 末段与父容器同文件的数据丢失缺陷；`receipt.json` 自哈希逻辑上不可能成立；产物缺少机器可消费的 SBOM/可 diff 能力；v1 项目格式仍是最有价值资产，不能推倒。

## 决定
- 模块 Markdown 仍是唯一真源；frontmatter v1 字段全保留，新增可选 `decisions/owners/since`。
- 新增项目清单 `normify.json`（schemaVersion 2）；v1 项目只读兼容，`normify migrate` 升级。
- 保留段名（含 `index` 等）在 L1 拒绝。
- 产物：`tree.json` v2 + `api-index.json` + `outline.md` + **`structure-manifest.json`（结构 SBOM，含 source 文件哈希/模块/API/依赖/总量）** + `receipt.json`（不含自身）+ `receipt.sha256` + `normify.html`。
- 哈希链：source → structure-manifest → tree/api-index/outline → receipt → receipt.sha256。
- 序列化确定性：键排序、LF、无环境信息。

## 后果
- 修复"冻结"卖点，新增可审计 SBOM 与语义 diff 基础。
- 存量项目需要一次 migrate（幂等、可中断），但 v1 仍可读。
