# 发布清单（RELEASE-CHECKLIST）

> 每次发版（patch/minor/major）逐项打勾；**任何一项未过都不发**。
> 适用仓库：`F:\Deepseek_harness\Normify-架构系统\dsh-normify`。目标运行时：当前最新 DSH（见 [COMPATIBILITY.md](COMPATIBILITY.md)）。

## 0. 冻结与范围

- [ ] 发布分支干净：`git status` 无未提交改动；只在预期分支（release/x.y.z 或 main）。
- [ ] 变更范围明确：本次只含计划内的修复/特性；无顺手重构混入。
- [ ] 兼容性判断：无 breaking 走 patch/minor；有 breaking 必须更新 [MIGRATION.md](MIGRATION.md) 并升 minor/major。

## 1. 版本一致性（单源）

- [ ] `package.json` 的 `version` 已是目标版本（唯一版本真源；CLI `--help` 也从这里读）。
- [ ] `CHANGELOG.md` 顶部有对应 `[x.y.z] - YYYY-MM-DD` 条目，内容与本次实际改动一致。
- [ ] `docs/RELEASE-<x.y.z>.md` 发布说明已更新（含安装、验证结果、附件名/SHA-256 占位）。
- [ ] README / README_EN 的版本 badge 与兼容表已同步。

## 2. 构建与静态检查

```bash
npm install
npm run build            # tsc → lib/（lib 不入 git，但发行包必须包含）
npm run typecheck
node ci-contract-check.cjs          # bundle 声明 + 恰好 31 工具 + provider 安全命名
node scripts/check-core-boundary.mjs # src/core 禁止 @deepseek-ai；src/cli 禁止 ../dsh
node --check lib/dsh/index.js && node --check lib/dsh/tools.js
```

- [ ] 以上命令全部 exit 0。
- [ ] `node --check` 覆盖 CLI：`node --check lib/cli/index.js`。

## 3. 测试

```bash
npm test                # engine / companion / regression-0.5.2 / 0.5.3 / 0.5.4 / 0.5.5（6 套）
npm run test:perf       # 性能冒烟（300 模块，宽松 3× 阈值）
node --input-type=module -e "import { execFileSync } from 'node:child_process'; const out = execFileSync(process.execPath, ['lib/cli/index.js','tools'],{encoding:'utf8'}); const n = JSON.parse(out).length; if (n !== 31) throw new Error('expected 31 tools, got '+n)"
```

- [ ] 6 套测试全绿。
- [ ] CLI 冒烟：31 个工具、`--help`、退出码符合定义（0/2/4/5/6）。
- [ ] 新增/修复的问题有回归断言（`tests/regression-<ver>.mjs`）。

## 4. 文档防漂移

```bash
node scripts/gen-diagnostics.mjs --check   # DIAGNOSTICS.md 与 src/core 一致
```

- [ ] `docs/DIAGNOSTICS.md` 已重新生成且 `--check` 通过。
- [ ] SKILL 仍为薄入口（`skills/normify-gen/SKILL.md` ≤150 行），`references/` 链接全部有效。
- [ ] SKILL/文档中引用的诊断码都能在 `docs/DIAGNOSTICS.md` 或动态码模板中找到。
- [ ] 相对链接检查通过（README / docs / skills 内链无 404）。
- [ ] README/README_EN 口径一致：工具数、产物件数、构建命令、CLI 命令与退出码。

## 5. 发布包验收（pack-smoke）
- [ ] `node tests/platform-contract.mjs`：默认 7 原语 / `legacyTools` 35 / `toolset=full` 31 三模式 PASS

```bash
node scripts/pack-smoke.mjs --all --strict   # 退出码 0；PASS/FAIL/WARN 全记录
```

三档覆盖：`--static`（包清单/engines/边界）、`--contract`（真实 ToolRuntime + cordis 加载 31 工具）、`--boot`（pack → 临时 DSH_HOME profile → `dsh plugin add` → dump-config → headless mount）。

- [ ] `--all --strict` PASS（FAIL 与 WARN 均不做发布理由）。
- [ ] 证据 JSON（脚本 `--work` 目录）归档到发布记录。

## 6. 打包与校验和

```bash
npm pack                  # 生成 dsh-external-dsh-normify-<ver>.tgz
npm pack --dry-run        # 先核对文件清单
```

- [ ] 包内含：`lib/`（含 `lib/cli`、`lib/dsh`、`lib/core`、`lib/types`）、`skills/`（含 `references/`）、`vendor/`、`locale/`、`icon.svg`、`cordis.patch.yml`、`README.md`、`README_EN.md`、`LICENSE`、`package.json`。
- [ ] 包内**不含**：`src/`、`tests/`、`docs/`、`node_modules/`、截图/临时文件。
- [ ] 记录 tgz 体积与 `sha256sum`（Windows：`Get-FileHash -Algorithm SHA256`），写入 Release 说明。

## 7. 打 tag 与发布

- [ ] CI 全绿（**不允许红着发版**；矩阵至少 ubuntu+windows × Node 20/22/24，DSH 当前最新）。
- [ ] `git tag v<ver>` 与 `package.json` 版本一致；推送 tag。
- [ ] GitHub Release：标题 `v<ver> · <摘要>`；正文取自 `docs/RELEASE-<ver>.md`；附件上传 tgz；填写体积与 SHA-256。
- [ ] `tag` = Release 版本 = `package.json` 版本 = badge 版本（四者一致）。
- [ ] 关闭对应社区 issue/PR（在 Release 说明中写“已修复于 v<ver>”，致谢贡献者）。

## 8. 市场与元数据

- [ ] `package.json`：`description` / `keywords` / `icon` / `locale` / `exports` / `files` 与当前能力一致。
- [ ] GitHub 仓库 description/topics 更新（工具数、DSH 版本范围）。
- [ ] dshbase / dshhub 等目录的版本/描述同步（若已收录）。
- [x] GitHub Release 已发布（v0.5.5 / v0.6.0 / v0.7.0，资产 tgz 已上传）；npm 按负责人决定**暂不发布**。

## 9. 发布后 7 天

- [ ] 收集 issue/Discord 等反馈，triage 到下一 patch/minor。
- [ ] 若发现安装/崩溃级问题：立即发 patch 或回滚（复用上一版 tgz 并在 Release 标记）。
- [ ] 更新 [COMPATIBILITY.md](COMPATIBILITY.md) 的“已验证”行（如 DSH 有变化）。

## 10. 中止/回滚条件

出现以下任一情况，停止发布并回到修 bug 步骤：pack-smoke 非 0 退出、CI 红、engines 与实际运行时不符、回执链 `verify` 不通过、发布包缺文件、文档与行为不一致。
