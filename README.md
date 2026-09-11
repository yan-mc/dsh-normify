<p align="center">
  <a href="./README_EN.md">English</a> · <strong>简体中文</strong>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/license-MIT-22c55e?style=flat-square" alt="License">
  <img src="https://img.shields.io/badge/DSH-Plugin-7C3AED?style=flat-square" alt="DSH Plugin">
  <img src="https://img.shields.io/badge/version-0.4.0-0891b2?style=flat-square" alt="Version">
  <img src="https://img.shields.io/badge/DSH-0.1.5--rc.2-7C3AED?style=flat-square" alt="DSH">
</p>

# Normify（归一化框架图构建器）

**把整个项目描述为一棵"人机共读"的分形模块树：AI 负责分析与创作，确定性引擎负责校验与渲染，点开任意模块就是一张更精细的子图。**

Normify 是一个 DeepSeek Harness（DSH）插件，由两部分组成：

- **生成器**：`normify-gen` 技能 + 30 个 `normify_*` 工具。AI 分析一个或多个代码仓库，产出模块树结构数据库（每模块一个 Markdown 文件，严格 YAML frontmatter，中英双语），支持初始全量生成与**增量再生成**（代码变更 → 只重建受影响子树）。
- **渲染器**：零容忍校验（L1 写时 / L2 全项目 / L3 冻结）+ 确定性编译（`tree.json` 等四件产物，SHA-256 冻结）+ 单文件交互式 HTML（逐层下钻、悬停介绍、一键中英切换、深链接、多树、API 聚合惰性展开、正交圆弧连线避障）。

## 核心理念

- **唯一元素**：整个数据库由无数个结构完全相同的**基本模块**构成。
- **只存 `parent`**：单方向引用，`children` 由索引导出，零冗余漂移。
- **API 只在叶子存一次**：聚合/统计/索引全部是编译期派生数据。
- **两类边**：containment（树边，导航骨架）+ dependency（箭头，可跨子树跨树，按 kind 着色）。
- **零容忍校验**：任何 error 阻断产物（fail-closed），诊断必带 `subject/evidence/supportedFixes`，AI 可自行修复。
- **路径式 id + 不变 uid**：AI 沿 id 逐层定位（类二分查找），uid 保证 git diff 稳定。

## 快速开始

### 1. 安装（DSH 0.1.5+ / DSHEAC AIO 桌面端）

方式 A：`dsh plugin`（推荐，自动登记 profile bundle 层）

```bash
# profile 名以桌面端实际加载的为准：DSHEAC AIO 6.9.x 为 web-desktop，早期 DSH Desktop 为 web
dsh plugin --profile web-desktop add <dsh-normify 目录的绝对路径>
# 例如：dsh plugin --profile web-desktop add F:/dsh-normify
# 或使用 pnpm 支持的 spec：dsh plugin --profile web-desktop add link:F:/dsh-normify
```

`dsh plugin` 把参数转发给 profile 目录里的 pnpm，并在安装后自动把声明了
`dsh.bundle.patch` 的依赖追加进 `dsh.profile.bundles`。重启 DSH 后插件生效。

方式 B：无 pnpm 的手工安装（本仓库的开发机安装形态）

```bash
# 1) 构建（需要 Node.js ≥ 18，可直接使用 DSH 自带 node）
npm install && npm run build

# 2) 把包链接/拷贝进目标 profile 的 node_modules
#    例：C:\Users\<你>\AppData\Roaming\com.deepseek.dsh.desktop.aio\releases\<版本>\dsh-home\profiles\web-desktop\node_modules\@dsh-external\dsh-normify
#    并确保依赖 yaml 可解析（link 安装会复用源码目录的 node_modules；拷贝安装需一并拷贝 yaml）

# 3) 编辑 profile 的 package.json：
#    dependencies 增加 "@dsh-external/dsh-normify": "link:F:/dsh-normify"
#    dsh.profile.bundles 增加 "@dsh-external/dsh-normify"

# 4) 重启 DSH
```

方式 C：源码开发（本仓库）

```bash
git clone https://github.com/yan-mc/dsh-normify
cd dsh-normify
npm install && npm run build
# 然后把本目录按方式 A/B 装进桌面端 profile
```

构建要求：Node.js ≥ 18；插件运行时只依赖 Node 内置模块 + 包内 `vendor/`（YAML 解析用 `yaml`，随依赖安装）。
源码自测：`npm run build && npm test`（引擎端到端，输出写入系统临时目录）。
安装完成后可用 `dsh --profile web-desktop --dump-config` 检查组合树里出现 `dsh-normify` 行。

### 2. 让 AI 分析你的仓库

在 DSH 会话中说：

```
用 normify-gen 技能分析 F:\my-project，生成结构图。
```

AI 会：逐层创作模块（写时 L1 校验）→ `normify_validate` 修到 0 error → `normify_build` 编译冻结 → `normify_render` 生成单文件 HTML，并返回精确路径。

### 3. 打开结构图

浏览器打开 `normify.html`：点击模块逐层下钻；悬停看介绍；右上角「中 / EN」一键切换语言；跨树箭头带树名标注。

### 4. 代码更新后增量同步

```
同步 XX 项目结构图（代码有更新）
```

AI 会跑 `normify_sync`（git diff → 脏子树定位）→ 只重建受影响模块 → 全项目校验仍 0 error。

## 工具清单（30 个）

| 工具 | 作用 |
|---|---|
| `normify_tree_list` | 列出全部结构数据项目与树 |
| `normify_module_get` / `normify_module_list` | 读单个 / 列出模块（含统计） |
| `normify_module_upsert` | 创建/更新模块（写时 L1 校验；自动晋升父文件形态） |
| `normify_module_delete` / `normify_module_promote` | 删子树（含悬空边预警）/ 叶子晋升容器 |
| `normify_validate` | 全项目零容忍校验（0 error 门禁） |
| `normify_build` | 编译 tree.json + outline.md + api-index.json + receipt.json（SHA-256 冻结） |
| `normify_sync` | 增量再生成计划器（git diff → 脏子树 → 待复核清单） |
| `normify_search` / `normify_deps_find` | 检索模块/API；反查"谁依赖我" |
| `normify_outline` / `normify_render` | 重建大纲索引；tree.json → 单文件交互 HTML |
| `normify_fingerprint` | 按引擎算法计算 source 指纹（写 fingerprint 前调用） |
| `normify_layout_get` | 读某容器模块的渲染数据 |
| `normify_layout_upsert` | 写/覆盖某容器模块的渲染数据（顺序/分组/边提示/阅读导语） |
| `normify_layout_delete` | 删除渲染数据（回退自动布局） |
| `normify_module_patch` / `normify_module_batch` / `normify_module_move` / `normify_module_refresh` | 部分更新 / 原子批量 / 改名移动 / 刷新激活 |
| `normify_policy_get` / `normify_policy_upsert` / `normify_check` | 架构规则读取 / 安装 / 设计前预检 |
| `normify_brief` | 开发指引（契约/影响面/规则/建议/清单） |
| `normify_change_open` / `normify_change_update` / `normify_change_list` / `normify_change_close` | 变更日志（随结构目录回档；close 强制 0 error） |
| `normify_help` | 模块字段速查 |

## 数据模型（一个模块）

```markdown
---
uid: 8f3a9c2e                     # 8 位 hex，全项目唯一，永不变
id: demo.order.checkout.payment   # 路径式 id（首段 = 树名，≤8 段）
parent: demo.order.checkout       # 唯一结构引用（= id 去尾段；根为 null）
name: { zh: 支付, en: Payment }
description: { zh: 负责订单支付……, en: Handles order payment… }
source:
  - path: src/order/checkout/payment.ts   # 代码位置证据
    line: 12
    end_line: 340
revision: 9f1a1cf0…               # 40 位 git SHA
updated_at: 2026-08-30T12:00:00Z
fingerprint: e3b0c442…            # source 指纹：path+NUL+内容 的 SHA-256（用 normify_fingerprint 计算）
apis:                             # 仅叶子模块允许
  - protocol: http
    method: POST
    path: /api/v1/orders/{order_id}/pay
    description: { zh: 发起支付请求。, en: Initiates a payment. }
deps:                             # 出向箭头（只存源端；可跨树）
  - kind: call                    # call | event | dataflow | reference
    to: helper-lib.utils
    from_api: POST /api/v1/orders/{order_id}/pay
    to_api: rpc:format_amount
    label: { zh: 金额格式化, en: Format amount }
---
```

完整字段规范与校验规则见 [docs/SPEC.zh-CN.md](docs/SPEC.zh-CN.md)。

## 伴随开发（v0.4）

架构树伴随工程生长：**设计先行 → 计划态建树 → 逐个模块实现 → 关闭变更**。

- **计划态**：模块可先以 `state: planned` + `fingerprint: pending` 建树（`source` 可指向尚未落地的文件）；实现后 `normify_module_refresh({ ids, activate: true })` 一键转 `active`。
- **开发指引**：任务开始 `normify_change_open` + `normify_brief` → 目标模块/契约/影响面/规则约束/建议新增模块(id+路径)/验收清单；`normify_check` 在动手前预检拟建模块与拟加依赖。
- **修改强化**：`normify_module_patch`（部分更新 + 并发保护）、`normify_module_batch`（原子批量）、`normify_module_move`（改名/挪层：保 uid、级联 parent、重写 deps、迁移渲染数据）、全部支持 `dry_run`。
- **变更闭环**：`changes/<id>.json` 随结构目录回档；`normify_change_close` 强制 0 error，通过后刷新指纹、激活 planned、build（可选 render）、记录 `revision.after`。
- **架构规则**：项目创建自动安装 `policy.yml`（完整规则集：forbid-dependency / dependency-direction / acyclic / max-depth / cross-tree / naming），设计阶段即受约束；`normify_validate` / `normify_check` 强制执行，违规阻断 build。
- **sync v2**：脏子树 + 新增文件建议模块 + 失效 source + API 增删与破坏性变更 + planned 进度。
- **可选提醒钩子**（默认关）：`devCompanionReminder: true` 时，连续修改 N 个文件后提醒同步结构树；只提醒、不自动改写。
- **渲染器 v0.4.1**：连线走自由通道（不贴框）、viewBox 自适应（不出界）、叶子框内展示 API 明细并按 `from_api/to_api` 直连、跨层依赖聚合为虚线 `×N`、支持缩放与悬停高亮；生成粒度**不设模块总量上限**。

## 精细解析与渲染数据集（v0.3）

- **更细的层级**：id 上限 8 段 → **12 段**；SKILL 给出"必须继续拆"的信号（source ≥3 个文件 / 单文件行跨度 ≥300 / 混了多个可独立命名的职责 / API ≥6 条且可按子功能分组）；校验器用 `structure/leaf-too-coarse`、`structure/shallow-hierarchy` 提醒过粗的结构。
- **渲染数据集（renders/）**：结构数据描述"是什么"，渲染数据描述"这一层怎么画"。每个容器模块配一份 `renders/<id>.json`（叶子不需要），由 AI 与结构模块**同轮建立、同步维护**：
  - `order`：阅读顺序（数据流：生产者 → 消费者）
  - `groups`：语义分组（双语标题，画成带框的块）
  - `mode`：`groups` 分组块 / `layers` 依赖分层（左→右流）/ `grid` 均衡网格 / `auto`
  - `reading`：一句话阅读导语（显示在图上方）
  - `edge_hints`：长边/回指边的车道（`lane`）与曲线（`style`）提示
  - 工具：`normify_layout_get / normify_layout_upsert / normify_layout_delete`；`normify_build` 编入 `tree.json.layouts`，查看器点开任意层时与结构数据一起消费。
- **渲染器 v2**：按渲染数据排布；无渲染数据时按依赖自动分层；端口分离 + 车道分配 + 兄弟边去重 + 组间走廊路由，显著减少线重叠；悬停模块高亮其全部连线。

## 渲染器特性

- **逐层下钻**：未展开只显示名称（居中自适应字号）；悬停显示介绍；点击进入子层。
- **正交圆弧连线**：横平竖直 + 圆角拐弯，自动避让框体与重叠，按 kind 着色（call/event/dataflow/reference/跨树）。
- **多树与跨树箭头**：多个仓库 = 多棵树，箭头直接跨树（零新语法）。
- **API 聚合惰性展开**：按子模块分组折叠 + API 浏览器（过滤 + 窗口化），千级 API 不卡顿。
- **深链接**：`#module=<id>`、`#api=<key>`、`#view=outline`、`?lang=zh|en`、`?theme=dark|light`。
- **双语文案**：结构化 `{zh, en}` 字段 + 一键切换，不依赖浏览器翻译。

## 目录结构

```
dsh-normify/
├── cordis.patch.yml            # DSH 0.1.5+ bundle 层：把插件行挂进 profile（dsh.bundle.patch）
├── src/
│   ├── index.ts              # 插件入口：注册 30 工具 + normify-gen 运行时技能
│   ├── tools.ts              # 工具定义（行为标记 / 标准 JSON Schema 参数 / 错误封装）
│   └── engine/               # 框架无关核心：L1 校验 / L2 校验 / 编译 / 渲染数据 / 查看器模板
├── skills/normify-gen/SKILL.md   # 生成器技能（含增量再生成策略全文）
├── vendor/                   # 运行时自包含依赖（schemastery + cosmokit，已打补丁）
├── scripts/build.sh          # 构建：vendor-ts 本地路径 / npm 通用路径
├── tests/engine-e2e.mjs      # 引擎端到端测试（两棵树/跨树箭头/晋升/校验/编译/渲染）
└── docs/SPEC.zh-CN.md        # 正式规范 v1.0
```

## 安全说明

- 无遥测、无网络访问、无凭据处理、无后台服务、无 install/postinstall 脚本。
- 生成器只读仓库、只写指定的 `normify-*` 结构数据目录（工具白名单强制）。
- 结构数据在仓库侧独立存放，不修改任何源码。

详见 [SECURITY.md](SECURITY.md)。

## 文档

- [正式规范 v1.0（中文）](docs/SPEC.zh-CN.md) —— 数据模型 / 校验规则全集 / 里程碑
- [变更日志](CHANGELOG.md) · [贡献指南](CONTRIBUTING.md) · [安全说明](SECURITY.md)

## 许可

[MIT](LICENSE) © yan-mc
