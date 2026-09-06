# 贡献指南

欢迎提交 Issue 与 Pull Request。贡献前请阅读 [docs/SPEC.zh-CN.md](docs/SPEC.zh-CN.md)（正式规范 v1.0）。

## 开发环境

- Node.js ≥ 18
- 源码构建：`npm install && npm run build`（tsc 编译 src/ → lib/）
- 本地快速路径：`scripts/build.sh` 自动选择 vendor-ts 或 npm 路径

## 修改与验证

1. 改 `src/engine/`（框架无关核心）或 `src/tools.ts` / `src/index.ts`（DSH 适配层）。
2. `npm run typecheck` 通过后再 `npm run build`。
3. 引擎回归：node 直调 lib 引擎跑「建树 → 校验 → 编译 → 渲染 → 负例」闭环。
4. 渲染回归：渲染 HTML 后，提取查看器 JS 做 `node --check`；可用无头浏览器 dump-dom 后做几何断言（线不穿框、文字不出框、标签不压框）。
5. 工具回归：在 DSH 会话内注入插件（dev_inject_plugin），派子代理用 `normify.*` 工具做端到端验收。

## 提交规范

- 每个提交聚焦一件事；破坏性变更必须同步更新 docs/SPEC.zh-CN.md 与 CHANGELOG.md。
- `kind` 枚举扩展是向后兼容变更（只改校验器与渲染器各一处常量表）。
