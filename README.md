<p align="center">
  <a href="./README_EN.md">English</a> · <strong>简体中文</strong>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/license-MIT-22c55e?style=flat-square" alt="License">
  <img src="https://img.shields.io/badge/DSH-Plugin-7C3AED?style=flat-square" alt="DSH Plugin">
  <img src="https://img.shields.io/badge/version-0.1.0-0891b2?style=flat-square" alt="Version">
</p>

# Normify（归一化框架图构建器）

**把整个项目描述为一棵"人机共读"的分形模块树：AI 负责分析与创作，确定性引擎负责校验与渲染，点开任意模块就是一张更精细的子图。**

Normify 是一个 DeepSeek Harness（DSH）插件，由两部分组成：

- **生成器**：`normify-gen` 技能 + 14 个 `normify.*` 工具。AI 分析一个或多个代码仓库，产出模块树结构数据库（每模块一个 Markdown 文件，严格 YAML frontmatter，中英双语），支持初始全量生成与**增量再生成**（代码变更 → 只重建受影响子树）。
- **渲染器**：零容忍校验（L1 写时 / L2 全项目 / L3 冻结）+ 确定性编译（`tree.json` 等四件产物，SHA-256 冻结）+ 单文件交互式 HTML（逐层下钻、悬停介绍、一键中英切换、深链接、多树、API 聚合惰性展开、正交圆弧连线避障）。

## 核心理念

- **唯一元素**：整个数据库由无数个结构完全相同的**基本模块**构成。
- **只存 `parent`**：单方向引用，`children` 由索引导出，零冗余漂移。
- **API 只在叶子存一次**：聚合/统计/索引全部是编译期派生数据。
- **两类边**：containment（树边，导航骨架）+ dependency（箭头，可跨子树跨树，按 kind 着色）。
- **零容忍校验**：任何 error 阻断产物（fail-closed），诊断必带 `subject/evidence/supportedFixes`，AI 可自行修复。
- **路径式 id + 不变 uid**：AI 沿 id 逐层定位（类二分查找），uid 保证 git diff 稳定。

## 快速开始

### 1. 安装（DSH 桌面端）

方式 A：插件管理器 / 命令行安装

```bash
dsh plugin --profile web add @dsh-external/dsh-normify@0.1.0
```

方式 B：本地开发安装（源码构建）

```bash
git clone https://github.com/yan-mc/dsh-normify
cd dsh-normify
npm install && npm run build
# 在 DSH 会话中用注入器：dev_install_package <本目录> 或 dev_inject_plugin <本目录>
```

构建要求：Node.js ≥ 18（源码构建需要 npm；插件运行时依赖由 DSH 宿主提供）。

### 2. 让 AI 分析你的仓库

在 DSH 会话中说：

```
用 normify-gen 技能分析 F:\my-project，生成结构图。
```

AI 会：逐层创作模块（写时 L1 校验）→ `normify.validate` 修到 0 error → `normify.build` 编译冻结 → `normify.render` 生成单文件 HTML，并返回精确路径。

### 3. 打开结构图

浏览器打开 `normify.html`：点击模块逐层下钻；悬停看介绍；右上角「中 / EN」一键切换语言；跨树箭头带树名标注。

### 4. 代码更新后增量同步

```
同步 XX 项目结构图（代码有更新）
```

AI 会跑 `normify.sync`（git diff → 脏子树定位）→ 只重建受影响模块 → 全项目校验仍 0 error。

## 工具清单（14 个）

| 工具 | 作用 |
|---|---|
| `normify.tree.list` | 列出全部结构数据项目与树 |
| `normify.module.get / list` | 读单个 / 列出模块（含统计） |
| `normify.module.upsert` | 创建/更新模块（写时 L1 校验；自动晋升父文件形态） |
| `normify.module.delete / promote` | 删子树（含悬空边预警）/ 叶子晋升容器 |
| `normify.validate` | 全项目零容忍校验（0 error 门禁） |
| `normify.build` | 编译 tree.json + outline.md + api-index.json + receipt.json（SHA-256 冻结） |
| `normify.sync` | 增量再生成计划器（git diff → 脏子树 → 待复核清单） |
| `normify.search / deps.find` | 检索模块/API；反查"谁依赖我" |
| `normify.outline / render` | 重建大纲索引；tree.json → 单文件交互 HTML |
| `normify.help` | 模块字段速查 |

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
fingerprint: e3b0c442…            # source 文件 SHA-256（防漂移）
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
├── src/
│   ├── index.ts              # 插件入口：注册 14 工具 + normify-gen 运行时技能
│   ├── tools.ts              # 工具定义（行为标记 / 参数 schema / 错误封装）
│   └── engine/               # 框架无关核心：L1 校验 / L2 校验 / 编译 / 渲染 / 查看器模板
├── skills/normify-gen/SKILL.md   # 生成器技能（含增量再生成策略全文）
├── vendor/                   # 运行时自包含依赖（schemastery + cosmokit，已打补丁）
├── scripts/build.sh          # 构建：vendor-ts 本地路径 / npm 通用路径
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
