# 贡献指南

欢迎 Issue 与 PR。开始前请阅读：

- 规范唯一真源：[docs/SPEC.zh-CN.md](docs/SPEC.zh-CN.md)
- 诊断码总表（代码生成）：[docs/DIAGNOSTICS.md](docs/DIAGNOSTICS.md)
- 兼容性矩阵：[docs/COMPATIBILITY.md](docs/COMPATIBILITY.md) ｜ 发布流程：[docs/RELEASE-CHECKLIST.md](docs/RELEASE-CHECKLIST.md)
- 生成器技能：[skills/normify-gen/SKILL.md](skills/normify-gen/SKILL.md)

## 开发环境

- Node.js ≥ 18（本机 PATH 无 node 时，用 DSH 自带 runtime：`<DSH>/resources/runtime/primary-runtime/dependencies/node/bin/node.exe`）。
- `npm install` 后构建：`npm run build`（`node node_modules/typescript/bin/tsc -p tsconfig.json`）。
- `lib/` **不再入 git**：拉代码后先 build；npm 发行包内仍包含 `lib/`。

## 代码结构（务守分层边界）

```text
src/core/    纯 Node 结构引擎（DSH 无关）：engine/*、toolset.ts（31 工具规格）
src/dsh/     DSH 适配层：真实 ToolDefinition（output schema + presenters + 审批）
src/cli/     CLI：命令/参数/退出码，只依赖 core
```

- `src/core/**` **禁止** import 任何 `@deepseek-ai/*`；`src/cli/**` **禁止** import `../dsh/*`。
- 边界检查：`node scripts/check-core-boundary.mjs`（CI 同款）。
- 工具名是公开契约：**31 个 `normify_*` 名字不得变更**。
- 数据格式 `schema_version: 1` 的读写兼容不得破坏；破坏性变更必须走迁移流程。

## 修改与验证

1. 改引擎（`src/core/engine/`）、工具规格（`src/core/toolset.ts`）、适配层（`src/dsh/`）或 CLI（`src/cli/`）。
2. `npm run typecheck` → `npm run build` → `node --check lib/cli/index.js`。
3. 全量测试：

```bash
npm test              # 6 套：engine / companion / regression-0.5.2 / 0.5.3 / 0.5.4 / 0.5.5
npm run test:perf     # 性能冒烟（300 模块，宽松阈值）
node ci-contract-check.cjs
node scripts/check-core-boundary.mjs
```

4. 改了诊断码/校验逻辑：跑 `node scripts/gen-diagnostics.mjs`，并提交 `docs/DIAGNOSTICS.md` 的同步 diff。
5. 改了插件适配层/包元数据：`node scripts/pack-smoke.mjs --all --strict`（真实 ToolRuntime / 临时 profile 安装，需本机 DSH 桌面端）。
6. 渲染回归：渲染 HTML 后用无头浏览器 dump-dom 做几何断言（线不穿框、文字不出框、标签不压框）。

## PR 规范

- 一个 PR 聚焦一件事；标题写清“改了什么/为什么”；关联 issue。
- 必带验证证据：命令 + 输出（测试 / CLI 退出码 / pack-smoke 结果）。
- 改文档时同步中英（README/README_EN）与 `CHANGELOG.md`；SKILL 保持薄入口（细节放 `references/`）。
- 破坏性变更必须同时更新 `docs/MIGRATION.md`、`docs/SPEC.zh-CN.md`、`CHANGELOG.md`，并升 minor/major。
- 提交信息用 `<type>: <summary>`（feat/fix/docs/test/refactor/chore），正文写动机与验证。

## 当前开发线

- `main`：可发布线（tag = Release = `package.json` 版本）。
- 0.6.0 重构在 `refactor/v1` 进行；合入前以 `pack-smoke --all --strict` + 6 套测试为准。
- 发布动作必须走 [docs/RELEASE-CHECKLIST.md](docs/RELEASE-CHECKLIST.md)，不允许红 CI 发版。
