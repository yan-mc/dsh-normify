# ADR-0012：0.7.0 不做 MCP 适配，CLI-first；未来可选只读 MCP（P2-09 决策门：不通过）

- 状态：Accepted（P2-09 决策门结论：0.7.0 不做，未来按标准重评）
- 日期：2026-11-03
- 编号说明：编号承接规划期 ADR-0001–0010（不在本仓库），本仓库内自 0011 起。
- 相关：REFACTOR-PLAN v1.1 §4 Phase 2 P2-09；PR #6（Codex MCP stdio adapter 提案）；`docs/MARKET.md`

## 背景

PR #6 提议为 Normify 增加 **Codex MCP stdio adapter**，让 MCP 客户端直接调用工具/技能。
评估 MCP 的必要性：MCP 客户端（Claude Desktop / Codex / 各类 IDE）需要"协议接入"，而 Normify 已有从引擎派生的
**跨 agent CLI**；两者在能力上高度重叠，区别在接入方式与运行形态。

CLI-first 的现状证据：

- `normify` 是 `bin: ./lib/cli/index.js`，覆盖 init/status/list/get/search/brief/validate/check/build/verify/
  render/sync/change/policy/diff/call/tools，**输出 JSON + 稳定退出码 0/2/4/5/6**，可被任何 agent 以 shell 调用。
- CI 已对 CLI 做冒烟（31 工具/命令链路/退出码），并有 `test:contract` 真实 ToolRuntime 加载。
- 技能以 Agent Skills 格式分发（`skills/normify-gen/`，薄 SKILL + references），不依赖特定宿主协议。
- 结构数据格式与产物在磁盘上是确定性的（五件产物 + SBOM + `verify` 回执链），MCP 能提供的信息 CLI 已能提供。

MCP 适配的成本/风险：

- 需要常驻或按需启动的 server 进程、协议生命周期、错误语义、超时/大小限制、权限/审批模型；
- 工具 schema 需要与 CLI/核心保持同源（否则双份维护、易漂移）；
- 新增依赖与安全面（stdio 之外的传输、客户端认证、恶意输入），与"零网络、最小依赖"的定位冲突；
- 在 0.7.0 时间窗内，收益（少一次 shell 调用）不足以抵消上述成本。

## 决定

- **0.7.0 不做 MCP 适配**；不引入 MCP server/新 runtime 依赖。
- 跨 agent 继续走 **CLI + Agent Skills**（Agent Skills 可被多个 agent 原生读取；CLI 可被任何 agent shell 调用）。
- 关闭/回应 PR #6，说明结论与未来重评标准（下方措辞可直接使用）。
- 本 ADR 即 P2-09 的决策门产出；不创建 MCP spike 分支。

## 对 PR #6 的回应措辞

> 感谢这个适配提案（Codex MCP stdio adapter）。我们评估后决定 **0.7.0 不接入 MCP**，原因：
> (1) 0.6.0 已提供与引擎同源的跨 agent CLI（JSON 输出 + 稳定退出码，CI 有冒烟），MCP 能做的查询/校验/编译能力
> CLI 均可覆盖；(2) MCP 需要常驻进程/协议生命周期/权限模型与新增依赖，和插件"零网络、最小信任面"的定位冲突；
> (3) 工具面在 0.7.0 刚切到 7 原语（配 legacyTools 过渡），此时再叠一层协议适配会放大维护面。
> 如果后续有 ≥3 个明确的 MCP-only 场景（CLI 无法满足），我们会按 ADR-0012 的重评标准评估一个**只读** MCP 适配。
> 在此之前，CLI（`normify ...`）和 Agent Skills 是官方跨 agent 路径。感谢提交！

## 未来可选只读 MCP 的边界（若重评通过）

- **只读 op**：`project.list/status`、`read.*`、`check.validate/check/drift`、`build.verify/sbom`；**不提供**写入/删除/
  close 等会改变项目的能力（需要写时走 CLI/插件审批路径）。
- **传输**：stdio only；无网络监听、无遥测。
- **schema 同源**：MCP 工具 schema 从 core 工具规格生成，与 CLI JSON 协议保持同源；不手写第二份。
- **依赖**：优先零新依赖的最小 stdio JSON-RPC 实现；如需库，须评估体积/维护性并在 ADR 记录。
- **开关**：默认关闭，显式启用；可被宿主 profile 禁用；错误可降级到 CLI。
- **安全**：路径包含性校验、只读断言、输出大小/超时限制、无 shell、无网络出站。

## 重评标准（做 / 继续不做）

1. **需求证据**：≥3 个外部 MCP 客户端用户场景，且确认 CLI 无法满足（附案例/复现）。
2. **原型**：只读 4–6 个 op、schema 复用、依赖增量 ≤1 个轻依赖；在 Claude Desktop/Codex 至少一个客户端跑通。
3. **指标**：启动 <300ms、调用成功率 ≥99%、输出与 CLI JSON 一致、无新增网络行为。
4. **安全审查**：只读/无网络/路径包含性/输出限额全部有负例测试；CI 覆盖。
5. 不达标 → 继续 CLI-first，更新本 ADR；达标 → 新增实现 ADR 后再开工。

## 后果

- 0.7.0 不增加协议层维护面；跨 agent 能力由 CLI 与 Agent Skills 覆盖。
- PR #6 以"已评估、暂不采纳、给出重评标准"关闭，避免无回复。
- 市场材料强调 CLI/Agent Skills，不承诺 MCP；未来若做，按本 ADR 边界执行。
