## Normify v0.5.2 · 修掉三处会写坏数据的真实缺陷

把整个项目描述成一棵"人机共读"的分形模块树：AI 分析与创作，确定性引擎校验、编译与渲染。
这一版没有新功能，只把三处**会让工具自己产出非法数据**的真实缺陷修掉 —— 都是 0.4.1 时代就存在、
在伴随开发里会真实踩到的坑。

### 🎯 三处修复

**① `normify_module_upsert` 的必填表不再丢失（工具契约）**

`parameters.required` 此前是 `undefined`，`frontmatter` 的 9 个必填字段（uid / id / parent / name / description /
source / revision / updated_at / fingerprint）在模型侧与运行时校验里全部消失，空参调用也不会被拦截。
根因是嵌套 schema 被二次编译：`moduleParams()` 返回**已编译**的 JSON Schema，再被
`params({ frontmatter: moduleParams() })` 编译一次时，内层的对象级 `required: [...]` 被整段丢掉。

- 修复：`moduleParams()` 改为返回**作者态** schema（`required: true` 内联），由外层 `params()` 统一编译；
  `toJsonSchema()` 同时改成**幂等**（保留并合并对象级 `required` 数组），任何嵌套复用都不再丢约束。
- 实测：`parameters.required = ["frontmatter"]`、`frontmatter.required` 9 项齐全、空参调用返回 `args/missing`。

**② `normify_module_move` 迁移渲染数据时重写内容（不再"搬个坏文件过去"）**

迁移时按字节复制 `renders/*.json`，`id` / `order` / `groups.children` / `edge_hints` 还停在旧 id 世界，
旧父级的 `order` 也仍指向已迁出的子模块 —— move 一完成，`normify_validate` 立刻报
`layout/id-mismatch`、`layout/order-child`、`layout/group-child`、`layout/groups-empty`、`layout/hint-endpoint`。

- 修复：迁移时用新 id 重写渲染数据（`id` / `order` / `groups.children` / `edge_hints`，并按新子模块集合过滤）；
  **旧父级**去掉已迁出子模块的引用（空组/空字段整体删除，`mode: groups` 无组时一并摘除）；
  **新父级**把新 id 补进 `order`；`dry_run` 新增 `detail.layout_rewrites` 列出原地重写清单。
- 渲染数据本身解析失败时按原样搬运 + 回报 `layout/unparsed-carried` 警告（不再静默吞掉）。
- 实测：move 前 **0 error** → 修复前 move 后 **8–9 error** → 修复后 **0 error**。

**③ 叶子晋升为容器时，API 不再留在容器上**

`writeModuleFile()` 的自动晋升与 `promoteModule()` 的显式晋升都只把 `x.md` 改成 `x/index.md`，
不清理 frontmatter 里的 `apis`，于是晋升后项目必然卡在 `api/non-leaf`（容器不允许声明 API）。

- 修复：两条晋升路径都会摘掉容器上的 `apis`（无 API 时仍走原来的"改名即晋升"，字节不变），
  并回报 `structure/api-dropped-on-promote` 警告，附**丢失的 API 键清单**与建议（写回合适的叶子）。
  `upsert` / `promote` / `move` / `batch` / `patch` / `refresh` 都会把该警告带回给调用方。

### ✨ 行为变更：API 默认全展开

渲染数据字段 `max_api_rows` 的缺省值由 6 改为 **0 = 全部展开** —— 叶子上的 API 一行都不折叠，
箭头可以精确锚定到每一条 API 行。需要收窄时显式写 1..48。既有数据集不写该字段即等于"全展开"，无需改动。

### ✅ 验证

| 项目 | 结果 |
| --- | --- |
| `tests/regression-0.5.2.mjs`（新增，锁定三处缺陷） | **34 项断言全绿** |
| `tests/engine-e2e.mjs` | PASS |
| `tests/companion-e2e.mjs` | PASS（原"记录 0.4.1 缺陷"的断言反转为"必须重写内容 + move 后 L2 = 0 error"） |
| `tsc -p tsconfig.json`（strict / declaration） | 0 error |

### 📦 安装

```powershell
Invoke-WebRequest -Uri "https://github.com/yan-mc/dsh-normify/releases/download/v0.5.2/dsh-external-dsh-normify-0.5.2.tgz" -OutFile "dsh-external-dsh-normify-0.5.2.tgz"
```

```bash
curl -L -o dsh-external-dsh-normify-0.5.2.tgz \
  https://github.com/yan-mc/dsh-normify/releases/download/v0.5.2/dsh-external-dsh-normify-0.5.2.tgz
```

然后按 [README「安装」](../README.md#5-安装) 把包登记进 profile 的 `dependencies` + `dsh.profile.bundles`，重启 DSH。

### 📚 文档

- [README](../README.md) ｜ [English](../README_EN.md) ｜ [正式规范](../docs/SPEC.zh-CN.md) ｜ [生成器技能](../skills/normify-gen/SKILL.md) ｜ [变更日志](../CHANGELOG.md)
