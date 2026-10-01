# Codex / MCP 适配器

本 fork 在原有 DSH 插件之外增加标准 MCP stdio 入口。适配器复用同一套
`registerTools` 和引擎，暴露全部 31 个 `normify_*` 工具；DSH 的安装方式保持可用。
不需要 DSH 桌面端、OpenAI API key 或常驻 HTTP 服务。

## 安装与构建

需要 Node.js 18+、npm 和已安装的 Codex。首次从本 fork 获取适配分支：

```sh
git clone --branch codex-mcp-adapter https://github.com/CreFire/dsh-normify.git
cd dsh-normify
npm ci
npm run build
npm run test:mcp
```

构建命令直接运行 TypeScript，支持 Windows PowerShell、Linux 和 macOS，不依赖 Bash。
包也提供 `normify-mcp` 可执行入口；本地 checkout 推荐使用下方绝对路径命令，避免
Codex 启动时工作目录或 PATH 不同导致找不到文件。

## 接入 Codex

PowerShell 示例（替换仓库位置和结构数据的默认存放目录）：

```powershell
codex mcp add normify -- node 'D:\Work\Acode\myc\dsh-normify\lib\mcp.js' --root 'D:\Work\Acode\myc'
codex mcp get normify
```

Linux / macOS 示例：

```sh
codex mcp add normify -- node /absolute/path/dsh-normify/lib/mcp.js --root /absolute/path/workspace
codex mcp get normify
```

Codex 负责启动和停止子进程。添加配置后，在新会话中检查工具是否出现；已打开的会话
可能仍使用旧工具列表。`codex mcp get` 只证明配置存在，真实连接和调用由 MCP 测试或新
会话里的工具调用验证。

`--root` 是 `project` 相对定位及 `normify_tree_list` 的默认目录，省略时使用启动目录。
它不是文件系统沙箱。工具显式提供 `dir`、`root`、`repoRoot` 时沿用原引擎语义。
在多个仓库中工作时，传绝对 `dir` 和 `repoRoot`，避免混用项目。

## 技能与使用

适配器同时提供 `normify-gen` MCP prompt 和 `normify://skills/normify-gen` resource，
内容来自包内的 `skills/normify-gen/SKILL.md`。MCP prompt 不等同于安装 Codex 技能。
要让 Codex 按技能名称发现工作流，可将整个 `skills/normify-gen` 目录复制到
`~/.codex/skills/normify-gen`（若已存在，先检查内容，勿直接覆盖）。

新会话中的示例请求：

> 使用 normify-gen，为指定仓库建立模块树，按原技能流程校验、构建并生成交互式架构图。
> 结构数据写到指定的 normify-* 目录，先读取源码再描述模块和依赖。

也可先调用 `normify_help`，参数为 `{"topic":"tools"}`。Codex 显示的实际工具名称可能带
MCP 服务名前缀，后缀仍是原来的 `normify_*` 名称。

## 行为与验证

- 工具参数沿用原工具注册表的 JSON Schema，并在适配器执行前校验。
- `readOnlyHint`、`destructiveHint`、`idempotentHint` 来自现有工具行为声明。
- 返回值同时保留 JSON 文本和结构化结果；引擎返回 `ok: false` 时设置 MCP `isError: true`。
- 每个服务进程串行执行工具调用，避免同一进程的读写和写写交错。不要让多个独立
  MCP/DSH 进程同时修改同一个结构数据目录；原引擎没有跨进程事务锁。
- 标准输出专供 MCP 协议；启动错误写入标准错误。适配器不调用会打印加载日志的 DSH 入口。
- DSH 专属的开发提醒钩子没有移植；Codex 通过技能流程执行同步和关单。

```sh
npm run typecheck
npm test
node ci-contract-check.cjs
```

`test:mcp` 使用官方 SDK 客户端启动真实 stdio 子进程，在临时目录验证工具发现、错误处理
及建树到 HTML 的闭环，不会为当前业务仓库生成架构数据。

参考：[Codex MCP 配置](https://developers.openai.com/codex/mcp)、
[MCP TypeScript SDK](https://github.com/modelcontextprotocol/typescript-sdk)。
