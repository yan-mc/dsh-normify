# ADR-0008：版本、发布与社区运营

- 状态：Accepted（冻结）
- 日期：2026-11-03

## 背景
当前 tag/release 仅 v0.5.1–4、版本散落 5+ 处、两个 release 在 CI 红时发布、9 条 issue/PR 零回复、7 周停摆。这是"看起来跟不上"的直接原因之一。

## 决定
- 版本线：0.5.5（止血，当前结构）→ 0.6.0（内部重构，公开面不变）→ 0.7.0（形态切换，breaking + legacy）→ 1.0.0（稳定）。
- 三包同版本号；`package.json` 为唯一版本源（`scripts/version.mjs` 同步，代码内读版本不再硬编码）。
- tag=release=package.json 三方一致；`release.yml` 自动测试/pack/sha256/Release；`RELEASE-CHECKLIST.md` 强制。
- 节奏：patch ≤1 月（跟 DSH rc），minor ≥季度；发布后 7 天回看。
- 社区：合并/重做 PR #5/#7/#8；9 条 issue/PR 逐条结论；issue/PR 模板 + label；48h triage；外部贡献署名。
- 旧 A/B 表述改为"n=1 可行性实验"；新评测按 ADR/D13 执行。

## 后果
- 发布可复现、可审计；社区信任恢复。
- 单人维护压力需靠自动化与模板降低（R8）。
