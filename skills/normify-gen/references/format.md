# Normify 数据格式速查（format）

> SKILL 的参考文件之一。**规范唯一真源**：[docs/SPEC.zh-CN.md](../../../docs/SPEC.zh-CN.md)。
> 本文件只做“写结构数据时随时要查”的速查；完整字段/诊断见 SPEC 与 [validation.md](validation.md)。

## 1. 结构数据目录

一个项目 = 一个 `normify-<slug>/` 目录（slug 由 `project{op:"init"}` 或 `change{op:"open"}` 自动创建）：

```text
normify-<slug>/
├── modules/
│   ├── <tree>/index.md                 # 树根（容器，id = <tree>）
│   ├── <tree>/<seg>.md                 # 叶子（id = <tree>.<seg>）
│   └── <tree>/<seg>/index.md           # 容器（id = <tree>.<seg>）
├── renders/<id 点号换斜杠>.json        # 每个容器一层渲染数据
├── policy.yml                          # 架构规则（项目创建时自动安装）
├── changes/<change-id>.json            # 变更日志（随结构目录回档）
├── tree.json / outline.md / api-index.json / structure-manifest.json / receipt.json
└── receipt.sha256                      # receipt.json 的 sidecar 校验和
```

- **文件形态由工具维护**：给叶子写第一个子模块时 `x.md` 自动晋升为 `x/index.md`；删到只剩自身时自动降级。不要手改形态。
- 工具/CLI 用 `project`（slug）或 `dir`（结构目录绝对路径）定位项目。

## 2. 模块 frontmatter（必填 9 项 + 可选）

| 字段 | 必填 | 规则 |
| --- | --- | --- |
| `uid` | ✅ | 8 位小写 hex；全项目唯一；**改名/移动永不改变** |
| `id` | ✅ | 点分路径 id：`[a-z0-9][a-z0-9-]*` 段；首段=树名；全项目唯一；深度不限；末段不能是保留段 `index` |
| `parent` | ✅ | 必须等于 `id` 去掉最后一段；根为 `null`（只存单方向） |
| `name` | ✅ | `{zh, en}`，各 ≤ 60 字符 |
| `description` | ✅ | `{zh, en}`，各 ≤ 500 字符；人/AI 共读，写“职责与边界” |
| `source` | ✅ | `[{path, line?, end_line?}]`：仓库相对 POSIX 路径（禁绝对/`..`/反斜杠）；根模块允许 `[]` |
| `revision` | ✅ | 生成时仓库 40 位 git SHA |
| `updated_at` | ✅ | ISO 8601，如 `2026-11-03T12:00:00Z` |
| `fingerprint` | ✅ | `source` 的确定性 SHA-256（hex）；**用 `normify_fingerprint` 实算**（7 原语无对应 op：CLI `call normify_fingerprint` 或 legacyTools），不要手估 |
| `state` | 可选 | `active`（默认）/ `planned`（计划态，需 `fingerprint: pending`）/ `deprecated` |
| `replacement` | 可选 | 仅 deprecated；指向替代模块 id |
| `tags` | 可选 | 字符串数组，≤12 个，用于检索 |
| `repository` | 可选 | 仅根模块；该树对应仓库的 http(s) URL |
| `apis` | 可选 | **仅叶子**；`{protocol, method?, path, description{zh,en}}`；非叶子出现即 error |
| `deps` | 可选 | 出向箭头 `{kind, to, from_api?, to_api?, label?}`；只存源端 |
> 长度上限（zh/en 分别计）：模块 `name` ≤ 60；模块 `description` ≤ 500；`apis[].description` ≤ 200；`deps[].label`（可选）≤ 30。
> 诊断码：`structure/name-too-long`、`structure/description-too-long`、`api/description-too-long`、`dep/label-too-long`（宽松模式 `requireBilingual:false` 下统一降级为 warning）。

**取值约束**

- `uid`：全项目唯一；`id-duplicate` / `uid-duplicate` 是 error。
- 叶子判据：没有任何模块以它为 `parent`。叶子**必须**有 `apis`（空数组允许，记 warning）。
- `apis[].protocol` ∈ `http | ws | rpc | amqp | kafka | mysql | redis | file | grpc | graphql`；`http` 必须有**大写** `method`，非 http 禁止 `method`。
- API 键 = `protocol:path`（http 再带 method）；**全项目唯一**，重复会 error。
- API 描述各 ≤ 200 字符（超出按 `structure/<field>-too-long` 系列报错）。
- `deps[].kind` ∈ `call | event | dataflow | reference`。
- `deps[].to` 为目标模块 id（可跨树）；`from_api` 只能是**本模块** API 键（仅叶子）；`to_api` 只能是**目标模块自身** API 键。
- `deps[].label` 各 ≤ 30 字符。
- 两端都声明了 API 的箭头建议补 `from_api` / `to_api`：否则 `check{op:"validate"}` 给聚合 warning `dep/unanchored`（箭头只能落在框边，钉不到 API 行）。

## 3. YAML 子集（手写 frontmatter 时必须遵守）

- 允许：普通标量、`{zh: ..., en: ...}` 内联映射、数组、`>` 折叠块。
- 禁止：锚点/别名（`&`/`*`）、`|` 块、TAB 缩进、多文档。
- 长描述用折叠块；其余字符串**交给工具序列化**，不要和序列化器抢格式。

## 4. 渲染数据（`renders/<id>.json`，仅容器模块）

| 字段 | 作用 |
| --- | --- |
| `mode` | `auto`(默认) / `groups` / `layers` / `grid` |
| `max_columns` | 1..6：grid 每行列数；layers 每几列换行 |
| `max_api_rows` | 0 = 全部展开（缺省）；1..48 = 截断 |
| `order` | **直接子模块**的阅读顺序（生产者 → 消费者）；未列出的自动追加 |
| `groups` | `[{id, title{zh,en}, children[]}]`；children 必须是直接子模块 |
| `reading` | `{zh,en}` 一句话阅读导语 |
| `edge_hints` | `[{from,to,kind?,lane?,style?,bundle?,priority?}]`：车道 0..9 / `orthogonal`\|`curve` |

用 `write{op:"layout_upsert"}` / `write{op:"layout_delete"}` 维护；容器缺渲染数据记 warning `layout/missing`。可读性配方见 [recipes.md](recipes.md)。

## 5. 编译产物（`build{op:"build"}` 产出：**五件产物 + 回执自证链**）

| 产物 | 内容 |
| --- | --- |
| `tree.json` | 模块字典 + API 索引 + 边 + 渲染数据 + 规则 + 变更统计 |
| `outline.md` | 人类可读大纲 |
| `api-index.json` | 全项目 API 索引 |
| `structure-manifest.json` | 结构 SBOM：模块/API/依赖的确定性清单（0.6.0 起） |
| `receipt.json` | 各产物 SHA-256 回执（**不含自身**） |
| `receipt.sha256` | `receipt.json` 自身校验和 sidecar |

- L3 约束：`check{op:"validate"}` 有 error 时**不产出**任何产物；产出后可用 CLI `verify` 复算整个回执链。
- `normify.html`（`render{op:"render"}`）是单文件交互图，零外部依赖。

## 6. 变更日志（`changes/<id>.json`）

- 由 `change{op:"open"/"update"/"close"}` 维护；`id` 默认 `YYYY-MM-DD-<title.en slug>`。
- 结构：`schema_version / id / title{zh,en} / status / intent / modules{create,modify,delete} / delete_snapshot / acceptance[] / note / revision / created_at / updated_at / closed_at`。
- `delete_snapshot` 由引擎在删除时自动回填（不要手写）；关闭成功即 `status: verified` 且写 `revision.after`。

## 7. 示例

完整模块文件与渲染数据示例见 [examples.md](examples.md)。
