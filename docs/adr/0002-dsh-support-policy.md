# ADR-0002：DSH 支持策略——只跟当前最新版

- 状态：Accepted（冻结）
- 日期：2026-11-03

## 背景
DSH 0.1.5-rc.2 → 0.2.1-rc.5 约 7 周；官方声明 developer preview「THERE WILL BE COMPATIBILITY-BREAKING CHANGES」；`engines.dsh` 一旦声明即独断兼容判定（peerDeps 被忽略）。项目因 `<0.2.0` 上界被当前 DSH 拒绝安装。

## 决定
- 只支持**彼时最新 DSH**，不为旧版保留兼容分支。
- `engines.dsh` 按当前 minor 线写区间：本次 `">=0.2.1-rc.1 <0.3.0"`；DSH 进下一 minor 时随版本更新（release 脚本 + dsh-watch 提醒）。
- 删除未使用的 `@deepseek-ai/dsh-tools`/`dsh-skill` peerDeps；只保留 `@deepseek-ai/cordis`。
- 兼容矩阵 `docs/COMPATIBILITY.md` 自动生成，市场/README 只引用它。

## 后果
- 旧 DSH 用户被明确不支持（README 写清"请升级 DSH"）。
- 每次 DSH minor 都可能需要发 patch；这是可接受的固定成本，换来跟进速度。
