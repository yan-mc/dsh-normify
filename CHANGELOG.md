# 变更日志

本项目的所有显著变更都记录在此文件中。版本遵循 [Semantic Versioning](https://semver.org/)。

> **重建说明（2026-09-12）**：本源码仓在 0.1.0 之后只在本地演进，上游仓库仅有 0.1.0 提交。
> 本次依据 0.4.1 发行产物（lib/ + .d.ts）、工作区测试记录（`test-results/2026-09-12-*`）与
> 《正式规范》《使用说明》重建源码；`[0.2.0]`–`[0.4.1]` 的条目系按上述记录**追述补写**，非原始文本。


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
