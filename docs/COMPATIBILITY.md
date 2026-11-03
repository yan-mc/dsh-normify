# 兼容性矩阵（COMPATIBILITY）

**当前结论：插件 `0.6.0` 在 DSH `0.2.1-rc.5` 上已由 `node scripts/pack-smoke.mjs --all --strict` 实测 PASS（PASS 43 / FAIL 0 / WARN 0）；DSH 0.1.x 不支持。**

> 本文件是“插件版本 × DSH 版本 × 验证状态”的唯一矩阵。更新时间：2026-11-03。
> 重新验证命令见 §3；DSH 换 minor 时必须重跑并更新本表（政策见 [MIGRATION.md](MIGRATION.md) §5）。

## 1. 版本矩阵

| DSH 版本 | 插件版本 | 状态 | 验证方式 / 证据 | 说明 |
| --- | --- | --- | --- | --- |
| `0.2.1-rc.5` | `0.5.5`（P0 止血） | ✅ **已验证** | `pack-smoke --all --strict`：PASS 42 / FAIL 0 / WARN 0；`pnpm pack` → 临时 DSH_HOME profile → `dsh plugin add` → dump-config 含插件层 → headless mount 无错误；真实 ToolRuntime 加载 31 工具 | `engines.dsh: ">=0.2.1-rc.1 <0.3.0"` |
| `0.2.x`（`>=0.2.1-rc.1 <0.3.0`） | `0.5.5+` | ✅ 支持（声明区间） | engines 区间；具体 rc 版本以 pack-smoke 重跑为准 | 只支持当前 DSH 线 |
| `0.2.1-rc.5` | `0.6.0` | ✅ **已验证** | `pack-smoke --all --strict`：PASS 43 / FAIL 0 / WARN 0（static 15 / contract 18 / boot 8）；tgz 266,546 B；版本单源 0.6.0 | 结构数据 v1 不变，无迁移 | `npm test`（6 套）＋ `pack-smoke --all`；发布前以 [RELEASE-CHECKLIST.md](RELEASE-CHECKLIST.md) 为准 | CLI + 结构 SBOM；工具名/数据格式不变 |
| `0.2.1-rc.5` | `0.7.0` | ✅ **已验证**（0.7 默认 7 原语；legacyTools 过渡） | `pack-smoke --all --strict`；tools 面 = 7 原语（contract 档用 legacy full 验证 31 旧名）；CLI/产物不变 | 需要显式 legacyTools 才能用旧工具名 |
| `< 0.2.1-rc.1` 的 0.1.x | 任意 | ❌ **不支持** | 版本门禁 `incompatible-version` 会拒绝安装/启用 | 0.1.x 请留在插件 `0.5.4` |
| `>= 0.3.0` | 任意 | ❌ 未声明 | engines 上限 `<0.3.0` 会拒绝 | 需发布适配 0.3 的新版本 |
| Node.js `< 18` | — | ❌ 不支持 | `engines.node: ">=18"` | — |

## 2. 平台与运行方式

| 项 | 状态 |
| --- | --- |
| Windows（DSH 桌面端） | ✅ 主验证平台（pack-smoke boot 档、真机安装） |
| Linux / macOS（Node CLI + CI） | ✅ CLI 与引擎为纯 Node；CI 在 ubuntu-latest / Node 22 跑 build+test+CLI smoke |
| DSH profile | 用当前运行的 profile；安装走 DSH 插件管理器 / 市场 / `dsh plugin add`（不再手改 profile） |
| 非 DSH agent / CI | ✅ 用 `normify` CLI（`lib/cli/index.js`），不依赖 DSH 运行时 |

## 3. 重新验证（发布前/DSH 升级后必跑）

```bash
npm install
npm run build
npm test
node ci-contract-check.cjs
node scripts/check-core-boundary.mjs
node --input-type=module -e "import { execFileSync } from 'node:child_process'; const out = execFileSync(process.execPath, ['lib/cli/index.js','tools'],{encoding:'utf8'}); const n = JSON.parse(out).length; if (n !== 31) throw new Error('expected 31 tools, got '+n)"
node scripts/pack-smoke.mjs --all --strict      # 退出码 0 才算 PASS
```

- `pack-smoke` 需要本机 DSH 桌面端（默认探测 `D:\deepseekharness`）与 pnpm；参数与三档说明见脚本头部。
- 结果 JSON 默认写在脚本 `--work` 目录，可作为发布附件证据。

## 4. 已知边界（不是兼容性问题）

- `normify_fingerprint` 的越界路径在 0.5.5 已拒绝 `../..`；显式传入的 `repoRoot` 仍按调用者给的根计算（残余低危，0.6.0 收口）。
- 结构数据目录由使用者自管（建议纳入 git），插件不托管远端。
- 插件不保证在 DSH 之外的宿主里自动注入工具；非 DSH 场景请用 CLI。

## 5. 维护规则

1. DSH 发新 minor：先跑 §3，再改 `engines.dsh` 与上表，发布 patch；**不滥用 version exemption**。
2. 插件发版：`tag` = Release = `package.json` 版本，且本表新增一行。
3. 兼容性表述只写“已验证/未验证”，不写“应该可以”。
