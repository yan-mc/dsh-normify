# ADR-0003：工具面 v1——7 个原语 + legacy 过渡

- 状态：Accepted（冻结）
- 日期：2026-11-03

## 背景
31 个工具常驻 schema 28,473B（≈8–11k tokens），7 个参数是 free-form；Anthropic 把 bloated tool sets 列为最常见失败模式；DSH 0.2.x 的 `deferLoading` 不能解决静态工具膨胀。31 工具中约 20 个无测试，且两个工具在文档中从未出现。

## 决定
- 默认面 = 7 原语：`normify_project / read / write / check / build / render / change`；op 用 enum/oneOf 精确约束，禁止 free-form object。
- 0.6.0：公开面不变（31 旧名保留，内部转调原语）。
- 0.7.0：默认只注册 7 个；`config.legacyTools=true` 额外注册旧名（deprecated，1 个 minor 后移除）。
- 每个工具必须有：真实 `output.schema`、`presentCall/presentResult`、语义化 summary、`isConcurrencySafe(args)`。

## 后果
- 常驻 schema 目标 ≤12KB；工具选择歧义下降；技能/CLI 承担编排。
- breaking 发生在 0.7.0（配 MIGRATION + legacy 开关）。
