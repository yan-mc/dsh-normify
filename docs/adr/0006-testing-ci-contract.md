# ADR-0006：测试分层、CI 矩阵与契约漂移检测

- 状态：Accepted（冻结）
- 日期：2026-11-03

## 背景
0.2 不兼容事故的根因是 CI 不接触 DSH 运行时；官方无 CHANGELOG、桌面 asar 剥离 `.d.ts`；现有测试是"历史 bug 行为断言"，无 render/安全/大项目/并发覆盖。

## 决定
- 三层测试：L1 引擎（node:test，core 单测 + 安全负例 + 性能断言）；L2 平台契约（真 `ToolRuntime` 注册 + schema 子集校验 + presenter 形状）；L3 真实运行时不冒烟（`npm pack` → 临时 profile → `dsh plugin add` → `--dump-config` 断言加载、新会话工具可见）。
- CI 矩阵：windows+ubuntu × Node 20/22/24 × DSH（固定当前最新 0.2.1-rc.5 + `next` 动态）；每周 alpha 预演。
- `scripts/dsh-contract-diff.mjs`：每周下载新旧 tarball，只 diff Normify 使用的符号面，有变化开 issue/失败。
- 发布前必须 L3 绿；不允许红着发版（0.5.2/0.5.3 教训）。

## 后果
- CI 时间变长（可缓存 pnpm store、矩阵按时段拆分）。
- 换来"DSH 换版能在发布前被发现"，这是本项目最需要的机制。
