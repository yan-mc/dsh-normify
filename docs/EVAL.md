# Normify 评测协议（EVAL）

> **一句话**：`EVAL.md` 定义评测协议与边界；`EVAL-RESULTS.md` 是 `eval/harness.mjs` 的**可复跑**结果表。
> **本次（Phase 2 / 0.6.0）只交付并执行"检索层"评测**——三种检索手段在同一 fixture 上回答同一批结构知识问题的正确率/延迟/成本。
> **它不是 LLM A/B，不测量、也不宣称端到端 agent 收益**。LLM 层 A/B 的预注册协议见本文 §4（待后续在 DSH 内执行）。

---

## 1. 边界与结论口径

| 本次测量 | 本次**不**测量 |
| --- | --- |
| 结构知识问题的**检索正确率**（hit@3 / recall@3） | 模型在真实任务上的成功率（agent 端到端） |
| 检索的**输出 token**、本地扫描量、上下文数据量估计 | 模型思考 token、多轮编排、工具选择成本 |
| 单次检索的墙钟延迟、CLI 调用次数 | 人机协作体验 / 可维护性 / 学习曲线 |
| fixture 重建 + 全量跑的可复现性与稳定性（±10%） | 跨模型、跨 harness 版本、跨机器的泛化 |

**诚实声明**：harness 的 A/B/C 三臂都是确定性检索器；fixture 是合成仓库；因此本次结果只能支撑"检索层成本结构"的结论，不能支撑"接入 Normify 后 agent 更强"的结论。后者必须走 §4 的 LLM A/B。

---

## 2. 本次评测（检索层）协议

### 2.1 环境与依赖

- 仓库：`dsh-normify`（分支 `refactor/v1`，tag v0.6.0）
- Node：DSH runtime bundled node（v24.21.0；CI 另有 20/22/24 矩阵）
- 前置：`node node_modules/typescript/bin/tsc -p tsconfig.json`（`lib/` 不在 git 中）
- 命令（一键）：`node eval/harness.mjs`（默认 30 任务 × 3 arm × n=3 ≈ 10s；`--fresh` 重建 fixture）
- 产物：`eval/results/raw-*.json`（每次运行原始数据）、`eval/results/latest.json`、`docs/EVAL-RESULTS.md`（自动生成）

### 2.2 fixture（确定性、可复现）

`eval/spec.mjs` 使用固定 hash 生成 **131 模块 / 3 棵树 / 216 API / 88 依赖 / 6 planned / 4 deprecated**；
`eval/fixture.mjs` 将其物化为：

- `repo/`：源码骨架（每个模块 1 个 `.ts`，含 API/依赖注释），`git init` + 固定作者/时间提交；
- `structure/normify-eval-demo/`：结构数据（模块 Markdown + policy），由 **真实 CLI** `build` 产出 `tree.json`、`structure-manifest.json`、`receipt.json` 等；
- `repo-drift/r<i>/`：每个 drift 任务一个独立 git 副本（只含该文件的一处工作区修改），使 `sync --repo-root` 的 `affected` 语义无歧义。

可复现性：模块 uid / 文件内容 / 依赖 / 任务 / ground truth 全部由 `SPEC_VERSION`（当前 `v2`）派生；同版本下 fixture 结构字节级一致。
唯一非确定项是 `build` 写入的 `compiled_at` 时间戳（不参与任务与评分）。fixture 默认缓存复用；`--fresh` 强制重建。

### 2.3 任务集（30 条，4 类；ground truth 由脚本计算）

| 类别 | 条数 | 问题形态 | ground truth |
| --- | --- | --- | --- |
| `locate` | 6 | 哪个模块拥有 API `<path>`？ | 该 API 的 owner 模块（脚本从 spec 派生） |
| `impact-in` | 6 | 哪些模块直接依赖 X？ | 反向边集合 |
| `impact-transitive` | 3 | 哪些模块（隔一跳）间接依赖 X？ | depth-2 反向可达集合（与 `brief.impact.transitive` 同义） |
| `impact-out` | 4 | X 依赖哪些模块？ | X 的 deps 目标 |
| `list-leaves` | 4 | 子树 X 下有哪些叶子？ | 子树内无子模块的模块 |
| `list-planned` | 3 | 树 X 下有哪些 planned 模块？ | state=planned 集合 |
| `drift` | 4 | 源文件 F 变更后哪些模块需要同步？ | source 含 F 的模块（`sync` 语义） |

**无手写答案**：`eval/spec.mjs#buildTasks()` 从模块图推导每条的 `expected` 集合。

### 2.4 三个 arm（同任务、同 fixture、各自独立进程）

| arm | 手段 | 模拟的现实场景 |
| --- | --- | --- |
| **A. grep** | 递归扫描源码 + 模块 Markdown，字符串匹配后解析 id | 没有结构工具、只能 grep/读文件的 agent |
| **B. tree** | 只读 `tree.json`，JSON 过滤 | 有编译产物、但没有结构工具的 agent |
| **C. normify** | 只通过 `node lib/cli/index.js`（`search`/`get`/`list`/`call normify_deps_find`/`brief`/`sync`） | 装了 Normify、通过工具查询的 agent |

每个 (arm × task × rep) 都是**独立 node 进程**（n=3），以隔离缓存/状态；C 的 CLI 子进程调用次数单独计数。

### 2.5 指标（预注册，不事后挑选）

- **hit@3**：取返回结果前 3 个 id，是否覆盖全部 ground truth（集合覆盖，是=1/否=0）；
- **recall@3**：top-3 与 ground truth 的交集 / |ground truth|；
- **平均墙钟 ms**：harness 进程 spawn 到 worker 退出的墙钟（含进程启动）；
- **平均输出 B / token 代理**：stdout 结果 JSON 字节数；token 代理 = 输出字节/4（任务书口径，不用 tokenizer）；
- **本地扫描 B**：arm 为回答读了本地多少字节（A/B 进程内；C 在 CLI 内部）；
- **上下文数据 B（估计）**：必须放进模型上下文的数据量——B 需要整份 `tree.json`；A 的 grep 输出仅匹配行（按 0 计，代价体现为多轮调用）；C 只有工具输出；
- **CLI 调用次数**：C 的外部进程调用数；A/B 记为 0；
- **稳定性**：每个 rep 的 arm 聚合 → min/max/相对极差；同任务跨 rep 结果是否完全一致。

### 2.6 复跑与验收

```bash
node eval/harness.mjs                 # 全量（fixture 复用；≈10s）
node eval/harness.mjs --fresh         # 强制重建 fixture（≈15s）
node eval/harness.mjs --reps 5        # 只调重复数
node eval/harness.mjs --tasks 10 --json
```

验收线（本次已满足）：退出码 0；2–5 分钟内跑完；同 fixture 重复运行的 hit@3/recall@3 完全一致、延迟相对极差 ≤10%、输出字节一致。
结果与逐条明细见 [EVAL-RESULTS.md](EVAL-RESULTS.md) 和 `eval/results/`。

---

## 3. 已知偏差与威胁（Threats to Validity）

1. **任务简单**：合成 fixture 命名规整、问题单跳/近单跳，三臂正确率均 100%（天花板）→ 本次主要看成本；不能推论"真实仓库也 100%"。
2. **A/B 是"理想化检索器"**：它们直接在进程内解析，没有模型选择/多轮 grep/读文件的往返成本；A 的真实 token 成本介于"输出"与"扫描量"之间，本 harness 无法精确建模（已单列"本地扫描 B"）。
3. **C 的延迟含 CLI 进程启动**（~200 ms/次）；在 DSH 内工具调用无此启动成本，但结果仍要进入上下文——两个口径都保留在结果表，勿混用。
4. **fixture 缓存**：复用 vs `--fresh` 会让 fixture 构建耗时不同（结构内容一致）。
5. **drift 单文件化**：每个 drift 任务一个独立 git 副本；真实一次改动常含多文件（C 一次 `sync` 可覆盖全部，摊薄成本）。
6. **token 代理 = bytes/4 是粗估**，未用真实 tokenizer；结论只用于量级比较，不作绝对预算。
7. **单机**：未测跨平台（CI 仅跑构建/单测/契约，不跑本 harness）、未测并发/负载。

---

## 4. LLM A/B 协议（未来在 DSH 内执行；本次未执行）

> 目的：回答"接入 Normify 是否提升 agent 在架构/定位/改码任务上的**端到端**表现"。必须预注册、可审计、盲评。

### 4.1 设计（预注册）

| 项 | 规定 |
| --- | --- |
| 假设 H1 | 接入组在"结构定位/影响面/一致性"类任务上的成功率高于对照组（单侧） |
| 主指标 | **任务成功率**（隐藏验收用例通过率；二项比例） |
| 次指标 | 首次正确时间、工具调用次数、总 token、人工评分（1–5）、结构文件正确率（validate 0 error / tree.json 可构建） |
| 样本量 | **n≥3 独立会话/条件/任务**（建议每条件≥12 会话；每个任务至少 3 个独立 session 重复） |
| 分组 | A：无插件（grep/glob 基线）；B：装 Normify + 伴随流程技能；若做 C 组：装 Normify 但不启用技能（区分"工具"与"提示词"贡献） |
| 模型 | 同一模型版本、同一 temperature/reasoning 设置；记录 model digest |
| 上下文预算 | 两组相同 token 预算与工具调用上限（超出判失败，避免"预算不均"） |
| 顺序 | 任务与条件**随机交错**执行；同一任务的两个条件会话由不同 shard 进程跑，避免缓存污染 |
| profile 隔离 | 每个 session 用**独立 DSH profile + 独立 DSH_HOME**；结构数据目录每 session 全新生成；禁止跨 session 复用缓存；插件版本、fixture commit 记录在案 |
| 预注册 | 本文件先提交，再跑正式实验；任何指标/任务修改必须写"偏离记录" |

### 4.2 任务集（LLM 层，建议扩展）

在检索层任务基础上，增加需要**多步规划 + 读取 + 编辑**的工程任务（隐藏验收）：

1. 给定需求，指出应改哪些模块/文件并说明理由（考定位+影响面）；
2. 实施一个小改动，要求结构数据 `validate` 0 error 且 `build` 成功（考伴随流程）；
3. 仓库已有代码变更后，重建受影响结构子树（考 `sync` + 局部更新）；
4. 回答跨树依赖/架构规则问题（考结构知识）；
5. 反例：故意错误的架构规则/命名，要求发现并修正（考校验闭环）。

每个任务配 **隐藏验收脚本**（自动打分）与**人工盲评 rubric**（结构正确性/可读性/冗余度）。

### 4.3 盲评与防偏

- 评分者不知道会话属于哪组（输出脱敏：去掉插件名/日志行）；
- 自动指标优先（隐藏用例 pass/fail、validate/build 退出码）；
- 人工评分双人独立、Krippendorff's α ≥0.7，分歧由第三人裁决；
- 记录每个会话的原始 transcript / 工具调用序列 / token 用量（DSH session 存储可导出）；
- 不利结果同样发布（若 H1 不成立，报告效应量与置信区间）。

### 4.4 分析计划

- 主指标：成功率差值的 **Wilson 置信区间** + 两比例检验（α=0.05，单侧）；
- 次指标：配对比较（同任务跨条件）用配对 bootstrap；时间/token 用中位数与 IQR；
- 报告效应量（风险差、NNT 量级）与失败模式分类（定位错/工具误用/结构损坏/流程中断）；
- 预设停止规则：达到计划样本量即停，不做"再跑一次看显著"。

### 4.5 进入 LLM A/B 的前提（Gate）

1. `node eval/harness.mjs` 稳定通过（本文件 §2.6）；
2. core-unit / e2e / regression / 平台契约 / pack-smoke 全绿；
3. 插件在目标 DSH 版本（当前 0.2.1-rc.5）安装成功、`--dump-config` 含插件层、无 skipped bundles（pack-smoke `--boot` 已覆盖）；
4. 预注册文档（本节 + 任务集 + 验收脚本）先于正式实验提交。

---

## 5. 变更记录

| 日期 | 变更 |
| --- | --- |
| 2026-11-03 | 初版：检索层 harness（30 任务 × 3 arm × n=3）、结果文档、LLM A/B 预注册协议草稿 |
