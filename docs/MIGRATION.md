# 迁移指南（MIGRATION）

> 目标读者：从旧版本升级 Normify 的用户 / 维护者。兼容矩阵见 [COMPATIBILITY.md](COMPATIBILITY.md)。
> 当前主线：`0.6.0`（refactor/v1，开发中）；已发布最新：`0.5.5`。

## 0. 一句话结论

| 升级路径 | 是否要迁移数据 | 要做的事 |
| --- | --- | --- |
| `0.5.4 → 0.5.5` | **不需要** | 直接升级插件；行为变化见 §2 |
| `0.5.x → 0.6.0` | **不需要**（数据格式 v1 不变） | `npm run build`（从源码用时）→ 重装 → 新开 DSH 会话；CLI 为新增能力 |
| `0.4.x / 0.5.x → 0.7.0`（未来） | 需要（v2 迁移，届时提供 `normify migrate`） | 等 0.7.0 发布说明；在此之前项目继续用 v1 |
| `0.1.x` 环境 | — | **不支持**；请留在插件 `0.5.4` |

## 1. 数据格式兼容

- 结构数据 `schema_version: 1`：0.4.x 起的数据 0.5.x / 0.6.0 **可直接读写，无需迁移**。
- 升级后先跑一次全量校验（带仓库证据）：

```bash
node lib/cli/index.js validate --project <slug> --repo-root <repo>
```

- 若 0.5.4 及以前创建过「删除型变更」，0.5.5 起引擎会自动维护 `delete_snapshot`；旧变更缺快照时按报错提示补一次 `change_update`（会自动回填），无需手写。

## 2. `0.5.4 → 0.5.5`（P0 止血）

无数据迁移。需要知道的行为变化：

| 变化 | 影响 / 动作 |
| --- | --- |
| DSH 只支持 `0.2.x`（engines `>=0.2.1-rc.1 <0.3.0`） | 0.1.x 环境留在 0.5.4；0.2.x 直接升级 |
| 产物 5 件 + `receipt.sha256`（自证链） | 校验从“读 receipt”改为 `normify verify`（sidecar → receipt → artifacts） |
| `id` 末段保留段 `index` 被拒绝 | 旧项目若有 `*.index` 叶子会报 `structure/id-reserved`：用 `normify_module_move` 改名 |
| `render.out` 只接受纯文件名 | 传路径报 `render/invalid-out`；需要换目录时渲染后移动文件 |
| `sync` 的 diff 范围校验 | 只接受 revision / `A..B` / `A...B`；`-` 开头一律拒绝 |
| 写盘原子化 | 无感知；崩溃不再留半截文件 |

## 3. `0.5.x → 0.6.0`（分层重构 + CLI，公开面兼容）

**无需数据迁移**。这是内部重构 + 新增 CLI/SBOM 的版本，工具名与数据格式保持不变。

### 3.1 包结构 / 入口

| 对象 | 0.5.x | 0.6.0 |
| --- | --- | --- |
| 包入口 `main` | `lib/index.js` | `lib/dsh/index.js`（`import '@dsh-external/dsh-normify'` 不变） |
| 新增导出 | — | `@dsh-external/dsh-normify/core`（纯 Node 引擎）、`.../cli` |
| 仓库源码分层 | `src/index.ts` / `src/tools.ts` / `src/engine/*` | `src/core/`（引擎+toolset）/ `src/dsh/`（DSH 适配层）/ `src/cli/`（CLI） |
| `lib/` 是否入 git | 是 | **否**：使用/开发前先 `npm run build`（npm 发行包内仍含 `lib/`） |
| 构建命令 | `bash scripts/build.sh` | `npm run build`（`node node_modules/typescript/bin/tsc -p tsconfig.json`） |
| 31 个工具名 | 31 个 | **仍是 31 个，名字不变** |
| 数据格式 | v1 | v1（读写兼容） |

### 3.2 升级步骤（从源码安装）

```bash
npm install
npm run build            # 生成 lib/core、lib/dsh、lib/cli、lib/types
npm test                 # 6 套测试全绿
# 重新打包/安装插件（插件管理器或 dsh plugin add），然后新开 DSH 会话
```

> 工具列表在 DSH 会话启动时快照——升级后必须**新开一个会话**才能看到 31 个工具。

### 3.3 新增：CLI

- `normify` bin → `lib/cli/index.js`；不装 bin 时用 `node lib/cli/index.js`。
- 命令与退出码见 [README「CLI」](../README.md#16-cli跨-agent--ci)；跨 agent/CI 场景不再需要 DSH。
- 新增 `verify` 子命令与 `build --verify-only`：只校验收据链，不重编译。

### 3.4 新增：结构 SBOM

- `build` 额外产出 `structure-manifest.json`（模块/API/依赖确定性清单 + 其它产物哈希 + 生成器版本），与 `receipt.json`/`receipt.sha256` 一起构成**五件产物 + 回执自证链**。

### 3.5 兼容性边界

- 旧代码若直接 `import '@dsh-external/dsh-normify'` 并依赖其导出：0.6.0 的包入口指向 `lib/dsh/index.js`，公开导出面以 `docs/SPEC.zh-CN.md` 与包 `exports` 为准；引擎级 API 请改用 `@dsh-external/dsh-normify/core`。
- 插件在 DSH 侧的安装契约不变（`dsh.bundle.patch` + `cordis.patch.yml`）。

## 4. `0.7.0` 预告（规划中）

- 工具面收敛为 **7 个原语**：`project / read / write / check / build / render / change`；
  31 个旧工具名保留在 `legacyTools` 开关后。
- 数据模型演进到 v2，配套 `normify migrate`（逐版本步骤、幂等、可中断）与 v1 只读兼容。
- 0.7.0 发布前**不需要**任何提前迁移；当前项目照常使用 v1。届时以发布说明与 `MIGRATION.md` 更新为准。

## 5. 版本与 DSH 跟进政策

- 插件只支持**当前最新 DSH 线**（当前 `0.2.1-rc.5`）；DSH 换 minor 时发布适配版本的插件，不维护旧 DSH 分支。
- 需要旧组合时请锁定插件版本（npm 版本即契约）；不推荐用 version exemption 强行绕过 engines 门禁。
- 每次发布更新 [COMPATIBILITY.md](COMPATIBILITY.md)，发布动作见 [RELEASE-CHECKLIST.md](RELEASE-CHECKLIST.md)。
