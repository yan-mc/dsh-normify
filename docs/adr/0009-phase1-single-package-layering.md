# ADR-0009：Phase 1 采用"单包内部分层"，Phase 2 再抽成 monorepo 三包

- 状态：Accepted（修订 REFACTOR-PLAN v1.0 的 D2/P1-01）
- 日期：2026-11-03

## 背景
v1.0 计划 P1 直接搭 pnpm monorepo 三包（core / cli / dsh）。实施前评估：当前构建链（tsc → lib/，lib 入库，测试直接 import lib/index.js，ci-contract-check 正则扫 lib/tools.js）与 DSH 安装路径（bundle 包即插件包）都假设单包；立刻三包需要 workspace 链接、三套 tsconfig/发布顺序、DSH 安装包解析 core 依赖等新机制，会在"内部重构"阶段引入与目标无关的发布风险。

## 决定
- **Phase 1（0.6.0）**：单包内部分层——`src/core/`（纯 Node，零 `@deepseek-ai/*` import）、`src/dsh/`（DSH 适配层）、`src/cli/`（CLI 入口）。用目录边界 + CI 静态检查（core 禁 import DSH）实现解耦；构建仍 tsc 单配置，产物 `lib/{core,dsh,cli}`。
- **Phase 2（0.7.0）**：再把 `src/core` 与 `src/cli` 抽成独立包（`@dsh-external/normify-core` / `normify-cli`），monorepo 化，与 CLI 独立发布同时发生。
- 评审标准不变：core 无 DSH 依赖、可单测、CLI 与插件共用同一 core API。

## 后果
- Phase 1 风险显著降低（不引入 workspace/多包发布），0.6.0 可更快交付。
- Phase 2 抽包时有一次目录迁移成本（已按 core/dsh/cli 边界切好，迁移主要是移动目录 + package.json）。
- REFACTOR-PLAN 升 v1.1：P1-01/P1-02 改为"内部分层 + core 抽取"，WBS P1-08 CLI 仍按计划；P2 增加"抽包"任务。
