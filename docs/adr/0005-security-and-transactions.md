# ADR-0005：安全基线与写事务/锁

- 状态：Accepted（冻结）
- 日期：2026-11-03

## 背景
审计实测 3 处安全破口：`normify_sync.diff` 的 git 选项注入可任意写文件、`render.out` 路径穿越、`fingerprint` 越界读取；另有多处写无原子性、HTML `<title>` 未转义。SECURITY.md 的三条承诺目前不成立。

## 决定
- 统一路径守卫 `assertInsideProject`/`assertInsideRepo`（resolve + realpath，禁 `..`/绝对/符号链接逃逸）。
- 所有内容写 `writeFileAtomic`（tmp+fsync+rename+目录 fsync）；批量写用 `.normify/txn-<id>.json` 事务日志 + 回滚；写命令加 `.normify/lock`（O_EXCL + stale 30s）。
- 外部输入不进 shell；git 调用固定 argv + revision 白名单 + `--` 结束符。
- HTML：所有插值转义、JSON `<`→`\u003c`、`<title>` 转义、CSP `default-src 'none'`。
- 安全负例进 CI（每条威胁 ≥1 用例）。

## 后果
- 写路径变复杂（原子/事务/锁），但这是"零容忍/只读仓库"承诺的前提。
- DSH 侧 destroy 类工具通过 `tools/pre-execute` 返回 `ask` 审批；不依赖 sandbox（第三方工具不受 sandbox 约束）。
