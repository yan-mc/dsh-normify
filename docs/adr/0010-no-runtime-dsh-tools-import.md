# ADR-0010：不运行时 import `@deepseek-ai/dsh-tools`，用等价 ToolDefinition 构造 + 自校验

- 状态：Accepted（修订 REFACTOR-PLAN v1.0 的 P1-05"迁移 defineTool"实现方式）
- 日期：2026-11-03

## 背景
0.2.1 推荐用 `defineTool()` 声明工具。但 `@deepseek-ai/dsh-tools` 的 `lib/index.js` 是单体 bundle，`peerDependencies` 含 `dsh-agent/dsh-llm/dsh-session/dsh-ptc-runtime` 等 10+ 包；若把它加入插件 `dependencies`，npm/pnpm 安装第三方插件时会拉取整套 DSH 依赖（数百个包），显著抬高安装体积与冲突面。当前的 dsh-normify 之所以轻，是因为运行时零 `@deepseek-ai/*` import（cordis 只是类型导入，schemastery 用 vendor 副本满足 Loader 的 `~standard` 识别）。

## 决定
- 插件**不把 dsh-tools 加为运行时依赖**；在 `src/dsh/definition.ts` 里构造与 `defineTool` 输出**契约等价**的 `ToolDefinition`：
  - `parameters`：继续使用 core 编译好的 JSON Schema（0.2.1 注册面接受 JSON Schema）；
  - `output`：真实 schema（`{type:'object', additionalProperties:true, properties:{ok,summary,count,errors,warnings,hint}}`）+ `render` + `presentationMeta`；
  - `execute`：**不在适配层强制 JSON Schema 校验**——required 检查沿用 core 包装（`args/missing`），类型/领域问题由 L1 与领域校验给出可修复诊断（0.5.3/0.5.4 的"acceptance 第 N 条 / label 超长"等体验不能被通用参数错误覆盖）；`validateToolArgs()` 保留给测试与 CLI `--strict`；
  - `presentCall/presentResult`：标准 `ToolCallView`/`ToolResultView`（generic 卡，含中文标题、kind、来源文件 locations、完成/失败态）；
  - `isConcurrencySafe(args)`：仅只读工具返回 true。
- 每版用 `scripts/pack-smoke.mjs --contract`（真实 ToolRuntime + `assertSupportedJsonSchema`）和 CI 契约测试验证等价性；`scripts/dsh-contract-diff.mjs` 跟踪 0.2.x→0.3 的 `ToolDefinition` 契约变化。
- 若未来 0.3 起工具注册必须经 `defineTool`（或 dsh-tools 变轻量），再切换到官方 helper——届时只改 `src/dsh/definition.ts` 一个文件。

## 后果
- 安装体积/冲突面保持最小；工具获得真实 output schema、presenter、参数校验，与 defineTool 输出的运行时形状一致（官方 `register()` 只校验 output.schema 子集与 render 函数）。
- 少一层官方 helper 的类型推导（不影响运行时）；契约一致性靠测试保证。
