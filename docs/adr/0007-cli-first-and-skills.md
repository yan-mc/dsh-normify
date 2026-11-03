# ADR-0007：CLI-first 分发与技能拆分

- 状态：Accepted（冻结）
- 日期：2026-11-03

## 背景
31 工具 + 26KB SKILL 是 0.1.x 时代设计；Agent 上下文工程的新范式要求"轻量标识符 + 按需检索 + 渐进披露"，工具少而正交；MCP 在硬任务上成本约为 CLI 技能 6 倍（外部实测），且工具常驻上下文。

## 决定
- 能力内核在 core；CLI（`normify`）是跨 agent 的通用入口（DSH/Claude Code/Codex/Cursor/OpenCode/CI）。
- DSH 插件只提供 7 原语 + presenters + inspect provider，不承载全部能力。
- MCP 只做可选薄适配（默认只读、opt-in），不作为核心形态；是否做由 P2 决策门 + ADR 决定。
- 技能拆为薄 `SKILL.md`（≤150 行）+ `references/`（格式/校验/迁移/配方/示例）+ 引用 CLI 命令；同一技能目录可分发到 `.dsh/skills` 与 `.agents/skills`。
- `normify init --agents` 可生成 ≤30 行结构入口（AGENTS.md 段/STRUCTURE.md），默认不写用户文件。

## 后果
- 跨 agent 可移植；插件安装体积/schema 变小。
- 需要维护 CLI 与插件的双入口一致性（CLI 为能力超集，插件为其子集）。
