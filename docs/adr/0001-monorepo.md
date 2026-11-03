# ADR-0001：monorepo 三包架构

- 状态：Accepted（冻结于 REFACTOR-PLAN-v1.0）
- 日期：2026-11-03

## 背景
当前单包把 DSH 适配（`src/index.ts`、`src/tools.ts`）与引擎（`src/engine/*`）混在一起；DSH 换版要动大文件；CLI/跨 agent 复用不可能。

## 决定
拆为 pnpm workspace 三包：`packages/core`（私有引擎、零 DSH 依赖）、`packages/cli`（发布，`normify` bin）、`packages/dsh`（发布，DSH bundle）。依赖单向：cli/dsh → core。三包同版本号发布。

## 后果
- 好处：引擎可单测、CLI 可跨 agent、DSH 适配面收敛到 `packages/dsh/src/adapter/`。
- 代价：构建/发布从单包变三包（用 `scripts/version.mjs` + CI 矩阵抵消）；DSH 安装需 core 已发布或随包解析（发布顺序：core → cli → dsh）。
- 约束：core 中禁止出现 `@deepseek-ai/*` import（CI 静态检查）。

## 替代方案
单包继续堆（否决：无法跨 agent、适配面继续膨胀）；两包（core+cli，DSH 合在 cli）（否决：插件发布面与 CLI 混在一起）。
