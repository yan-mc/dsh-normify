# 变更日志

本项目的所有显著变更都记录在此文件中。版本遵循 [Semantic Versioning](https://semver.org/)。

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
