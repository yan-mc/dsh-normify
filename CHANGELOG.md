# 变更日志

本项目的所有显著变更都记录在此文件中。版本遵循 [Semantic Versioning](https://semver.org/)。

> **重建说明（2026-09-12）**：本源码仓在 0.1.0 之后只在本地演进，上游仓库仅有 0.1.0 提交。
> 本次依据 0.4.1 发行产物（lib/ + .d.ts）、工作区测试记录（`test-results/2026-09-12-*`）与
> 《正式规范》《使用说明》重建源码；`[0.2.0]`–`[0.4.1]` 的条目系按上述记录**追述补写**，非原始文本。


## [0.5.3] - 2026-09-12

本版全部来自一次**伴随编程 A/B 对照实验**（同一份规范、两个 AI：一个带插件走伴随流程、一个纯手写；
隐藏黑盒验收两组均 42/42）。实验记录见工作区 `test-results/2026-09-12-ab-companion/`。

### 新增

- **`normify_project_init`（第 31 个工具）**：初始化结构数据项目 —— 建 `normify-<slug>/` + 安装默认架构规则，
  可选 `root: {id, name, description, repository?}` 一步创建**计划态根模块**（`state: planned`、`fingerprint: pending`、
  `source: []`，之后 `module_refresh` 落地激活）。幂等。

### 修复

1. **`normify_help` 忽略入参**：0.5.2 只有一份固定字段速查，实测中 AI 为拿准 `change_open` / `layout_upsert` /
   `change_close` 的参数名只能去读插件源码。现在支持 `topic`：`fields`（默认）/ `deps` / `renders` / `flow` / `tools` /
   `policy` / `errors` / `all`；**未知主题返回 `args/invalid-topic` 并列出可用主题**（不再静默忽略）。
   `topic=tools` 由注册表实时生成工具清单（名称 + 行为 + 描述），不会再与代码漂移。
2. **缺少项目初始化通道**：
   - `normify_change_open` 现在按写工具语义 `resolve(create: true)` 自动创建结构数据目录与默认架构规则
     （此前报 `project/no-modules`，实验里只能靠 `module_batch {items: [], dry_run: true}` 绕过）；
   - `normify_project_init` 提供显式入口；
   - `normify_brief` 遇到不存在的模块时返回可执行 `hint`（先 init / 先建树 / 或改用 `task` 参数）。
3. **批量诊断缺少因果链**：L1 校验失败的模块会被移出批次工作集，导致 1 条 `structure/label-too-long`
   连带出 N 条 `dep/target-missing`（实验里 1 个根因报成 4 个 error，AI 读源码才定位到）。
   现在：
   - 连带诊断改报 **`dep/target-dropped`** / **`structure/parent-dropped`**，message 与
     `evidence.root_cause_code` / `evidence.root_cause` 直接点明根因；
   - 失败响应新增 `root_causes: [{module, code, message}]` 与 `hint`，`detail.dropped_by_l1` 同步提供。

### 变更（引导，不阻断）

- **新增聚合 warning `dep/unanchored`**：两端都声明了 API、却没写 `from_api` / `to_api` 的箭头会被汇总成一条 warning
  （条数 + 前 3 条示例），提示"API 直连"才能把箭头钉到具体 API 行上。
  实验数据显示这条引导确有价值：结构数据里 110 条 API、54 条箭头、**0 条锚定**，等于白丢渲染器最精细的一层。
  **引导不等于放宽**：`from_api` / `to_api` 写错键仍然是 `dep/from-api-invalid` 的 error。

### 测试

- 新增 `tests/regression-0.5.3.mjs`（21 项断言）锁定以上 4 点；`ci-contract-check.cjs` 的工具数契约 30 → 31，
  并断言 `normify_project_init` / `normify_help` / `normify_module_batch` 必须存在；`npm test` 串联 4 套测试。

## [0.5.2] - 2026-09-12

### 修复（三处会写坏数据的真实缺陷）

1. **`normify_module_upsert` 必填表丢失**（工具契约）
   `moduleParams()` 返回的是**已编译**的 JSON Schema，被 `params({ frontmatter: moduleParams() })` 再编译一次时，
   内层的对象级 `required: [...]` 被整段丢掉 → `normify_module_upsert.parameters.required === undefined`，
   `frontmatter` 的 9 个必填字段在模型侧与运行时校验里全部消失（空参调用不会被拦截）。
   修复：`moduleParams()` 改为返回**作者态** schema（`required: true` 内联），由外层 `params()` 统一编译；
   `toJsonSchema()` 同时改为**幂等**（保留并合并对象级 `required` 数组），嵌套复用不再丢约束。
   **实测**：`required = ["frontmatter"]`，`frontmatter.required` 9 项齐全，空参调用返回 `args/missing`。

2. **`normify_module_move` 迁移渲染数据只搬文件、不重写内容**
   迁移时按字节复制 `renders/*.json`，`id` / `order` / `groups.children` / `edge_hints` 仍停留在旧 id 世界；
   旧父级的 `order` 也仍指向已迁出的子模块 → move 之后 `normify_validate` 立刻报
   `layout/id-mismatch`、`layout/order-child`、`layout/group-child`、`layout/groups-empty`、`layout/hint-endpoint`。
   修复：迁移时用新 id 重写全部渲染数据字段（并按新子模块集合过滤），**旧父级**去掉已迁出子模块的引用
   （`order` / `groups` / `edge_hints`，空组与空字段整体删除、`mode: groups` 无组时一并摘除），
   **新父级**把新 id 补进 `order`；`dry_run` 的 `detail.layout_rewrites` 会列出这些原地重写。
   渲染数据本身解析失败时按原样搬运并回报 `layout/unparsed-carried` 警告（不再静默）。
   **实测**（回归用例）：move 前 0 error → 修复前 move 后 8–9 error → 修复后 0 error。

3. **叶子晋升为容器时 API 留在容器上**
   `writeModuleFile()` 的父级自动晋升、`promoteModule()` 的显式晋升都只是把 `x.md` 改成 `x/index.md`，
   不清理父模块 frontmatter 里的 `apis` → 晋升后项目必然卡在 `api/non-leaf`（容器不允许声明 API）。
   修复：两条晋升路径都会摘掉容器上的 `apis`（无 API 时仍走原来的"改名即晋升"，字节不变），
   并回报 `structure/api-dropped-on-promote` 警告，附**丢失的 API 键清单**与修复建议（写回合适的叶子）；
   `normify_module_upsert` / `normify_module_promote` / `move` / `batch` / `patch` / `refresh` 都会把该警告带回。

### 变更

- **API 默认全展开**：渲染数据 `max_api_rows` 缺省改为 **0（全部展开）**；修复前缺省为 6（超出折叠成 `+N`）。
  需要收窄时显式写 1..48。渲染数据不写该字段 = 全展开，既有数据集无需改动即按新默认渲染。
- 新增 `tests/regression-0.5.2.mjs`（34 项断言）锁定以上三处缺陷；`tests/companion-e2e.mjs` 中"记录 0.4.1 缺陷"
  的断言反转为"必须重写内容，且 move 后 L2 = 0 error"。

## [0.5.1] - 2026-09-12

### 修复（渲染器：消除"线互相重叠/线压线"）

上一版仍有若干层出现连线共线重叠。逐层几何自检（28 层）定位后修复了四处：

1. **路由只看"不撞框"，不看"不压线"** —— 首选分支原来取"第一条不穿过别的框的候选"就返回，
   于是它可能正好压在先画的线上；现在改为**取 violations==0 的候选**（不穿框 / 不压已画线 / 不横穿自身框 / 端口法向正确），
   没有完全干净的路径时再退化为"违规最少"。
2. **API 锚定端口没有端口分离** —— 同一个 API 行常被多条边共用（"API 直连"箭头），都钉在同一个点上必然共线；
   现在按到达顺序在行内做 ±5.5px 扇形分离，仍落在该 API 行（行高 13px）内。
3. **API 端口在上下边时被放到框内部** —— API 行是"横排的一行"，纵向边上没有对应的行位置；
   现在上下边退回按边均匀分离（否则端口落在框内，连线横穿自己的框）。
4. **连线可以横穿自己源/目标框** —— `segClear` 会整块跳过源/目标框；新增 `segEntersRect` 检查（内缩 2px，
   贴端口的那一小段不算），并把首/末段"沿节点边滑行"也计入违规。

另将节点/分组间距 GX/GY 由 170 调到 220（密集层需要更多可用的自由通道）。

**修复后实测**：28 层全量几何自检 —— **线压线 0 处、越界 0、贴框 0、贴组框 0**（修复前：model 层 7 处、engine 层 3 处、template 层 1 处、root 层 1 处）。
仅最密集的 engine 层（14 节点 / 36 条同层箭头）仍有 7 处"线从节点框下穿过"（走线在节点之下，不重叠）。

## [0.5.0] - 2026-09-12

### 变更（面向"指导和伴随项目开发"的放开）

- **取消模块数量/深度上限**：删除 `MAX_DEPTH = 12` 的硬性结构限制（`splitId` / `idFromFilePath` / `module_move` /
  `module_check` 中的深度校验全部移除，文案同步更新）。树可以按"单一功能单元"一直下钻，深度不再成为合并模块的理由；
  若某个项目确实需要限制层级，用架构规则 `policy.yml` 的 `max-depth` 规则（`maxDepth` 放宽到 1..64，按 scope 生效）显式声明。
- **API 行数可配**：渲染器每个节点的 API 明细行不再写死 4 行；新增渲染数据字段 `max_api_rows`（0 = 全部展开，1..48，
  缺省 6），由 `normify_layout_upsert` 写入。配合更细的模块粒度，叶子的 API 基本可以全部展开、箭头也能精确锚定到 API 行。
- SKILL 同步：目标深度改为"不设上限"、单批上限 40 → 200 放宽（原子性不变）、新增"每叶 API 尽量 3–5 条"的粒度指引。
- 规则速查/字段速查去掉段数上限描述。

### 说明

- 这两个改动都是"减少人为限制、提升结构精细度"，不改变既有数据的合法性：老数据集（≤12 段、API 行 ≤4 展示）在新版本下
  依然 0 error，只是可以继续拆得更细、API 展示得更全。

## [0.4.1] - 2026-09-12

### 修复

- `normify_sync` 漏报未跟踪的新文件：`gitChangedFiles` 追加 `git ls-files --others --exclude-standard`，
  新建但未 commit 的文件现在会出现在 `new_files` 并给出建议模块。

### 变更

- **渲染器 v3（最终）**
  - 连线只走自由通道，节点框保持 ≥16px 净空（线不贴框）；候选路径做框体/组框碰撞检测（线不穿框）；
  - 全局车道坐标注册表 + 按负载择路（线不压线）；外侧合成车道兜底；
  - `viewBox` 由全部几何包围盒动态计算（线不出视口）；
  - 叶子框内展示 API 明细行（最多 4 行 + `+N`），精确边按 `from_api/to_api` 锚定 API 行端口（API 直连）；
  - 跨层依赖聚合为虚线 `×N`（默认隐藏，工具栏或 `?agg=1` 开启，悬停看明细）；缩放与悬停高亮。

## [0.4.0] - 2026-09-12

### 新增

- **伴随开发**：`state`（active / planned / deprecated）+ `replacement` + `tags`；计划态先建树、实现后
  `normify_module_refresh({ ids, activate: true })` 激活；源码未落地时禁止假激活。
- **架构规则 policy.yml**：`forbid-dependency` / `dependency-direction` / `acyclic` / `max-depth` /
  `cross-tree` / `naming` 六类规则，项目创建自动安装，`normify_validate` / `normify_build` / `normify_check` 强制执行；
  `normify_policy_get` / `normify_policy_upsert` 管理。
- **变更日志 changes/<id>.json**：`normify_change_open/update/list/close`；`close` 0 error 强制
  （刷新指纹并激活 → validate → build → 标记 verified + `revision.after`）。
- **编辑算子**：`normify_module_patch`（`expect_updated_at` 并发保护 + `dry_run`）、
  `normify_module_batch`（原子，失败整批回滚）、`normify_module_move`（保 uid、级联 parent、重写全项目 `deps.to`、渲染数据随迁）。
- **指引与预检**：`normify_brief`（目标模块/影响面/规则约束/验收清单）、`normify_check`（拟建模块与依赖预检）。
- **sync v2**：脏子树 / 新增文件→建议模块 / 失效 source / API 增删与破坏性变更 / planned 进度与可激活清单。
- 可选提醒钩子 `devCompanionReminder`（默认关）：连续写 N 个文件后提示同步结构树。
- 工具数 15 → **30**。

## [0.3.0] - 2026-09-12

### 新增

- **渲染数据集 `renders/`**：与容器模块一一对应的可读性数据（`order` / `groups` / `mode` / `reading` / `edge_hints`），
  由 `normify_layout_get/upsert/delete` 维护，`normify_build` 编入 `tree.json.layouts`。
- 渲染器按渲染数据绘制：语义分组框、阅读顺序、车道与边提示、边去重。

### 变更

- id 段数上限 8 → **12**；下钻粒度放开（按单一功能单元拆分，鼓励 100–1000+ 模块）。

## [0.2.0] - 2026-09-12

### 变更

- 适配 DeepSeek Harness `0.1.5-rc.2` / DSHEAC AIO 桌面端。
- 工具名 `normify.x.y` → **`normify_x_y`**（provider-safe：`^[a-zA-Z0-9_-]+$`）。
- 新增 bundle 层 `cordis.patch.yml` 与 `package.json > dsh.bundle.patch`，改由 bundle 声明装载。
- 工具 `parameters` 在交给模型前编译为**标准 JSON Schema**（属性内联 `required` 提升为对象级 `required`、
  补 `additionalProperties: false`）；新增必填参数守卫与统一错误载荷。
- 只读工具标记 `isConcurrencySafe`，可由 dsh 并发调度器并行调用。

## [0.1.0] - 2026-09-06

### 新增

- **生成器**：`normify-gen` 技能（初始全量生成 + 增量再生成策略）+ 14 个 `normify.*` 工具
  - 模块 CRUD（`module.get/list/upsert/delete/promote`，写时 L1 校验、文件形态自动晋升/降级）
  - 全项目零容忍校验 `normify.validate`（结构/叶子/API/边/多树/文件映射/仓库证据）
  - 编译冻结 `normify.build`（tree.json / outline.md / api-index.json / receipt.json，SHA-256）
  - 增量同步计划器 `normify.sync`（git diff → 脏子树定位）
  - 检索 `normify.search`、反查 `normify.deps.find`、大纲 `normify.outline`、渲染 `normify.render`
  - 项目/树清单 `normify.tree.list`、字段速查 `normify.help`
- **数据模型 v1**：单一元素"模块"（uid / 路径式 id / parent 单方向引用 / 双语 name+description / source+revision+fingerprint 证据 / 叶子专属 apis / 出向 deps）
  - 多树原生支持（每树一个单段 id 根；跨树箭头零新语法）
  - 严格 YAML 子集（frontmatter 解析带行号诊断）
  - 诊断协议：subject / evidence / supportedFixes（面向 LLM 自修复）
- **渲染器 v1**：单文件交互式 HTML
  - 逐层下钻 / 悬停介绍 / 面包屑 / 一键中英切换 / 明暗主题
  - 深链接（#module / #api / #tree / #view=outline|apis / ?lang / ?theme）
  - 正交圆弧连线：避让框体、车道偏移去重、按 kind 着色、智能标签避让
  - 模块名入框居中：自适应字号 + 双行折行 + 截断
  - API 聚合惰性展开 + API 浏览器（过滤 + 窗口化）
  - 多树根选择器与跨树箭头标注

### 工程

- 插件入口运行时注册 14 工具 + `normify-gen` 技能（`ctx.skills.register`，无需 cordis patch）
- 运行时依赖 vendored（schemastery + cosmokit，相对路径补丁），避免注入环境包名解析问题
- 构建双路径：本地 vendor-ts 工具链 / npm 通用路径（CI 友好）
- 端到端验证：引擎层 node 直测、工具层子代理验收、渲染层无头浏览器几何分析（0 线穿框 / 0 文字出框）
