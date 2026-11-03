# 安全说明

## 报告漏洞

请通过 [Issues](https://github.com/yan-mc/dsh-normify/issues) 报告（敏感信息请先私信维护者，不要公开细节）。
我们会在 48 小时内 triage，并在修复版本发布后公开致谢（除非你要求匿名）。

## 安全姿态（0.5.5+ 实际情况）

- **无遥测、无网络访问**：插件与 CLI 运行时不发起任何出站请求。
- **无凭据处理**：不读取、不存储、不转发 token / 私钥 / 密码。
- **无后台服务**：不注册定时器、守护循环或常驻进程；无 install/postinstall 脚本。
- **只读你的仓库**：结构数据只写入 `normify-<slug>/`；`source` 只记录仓库相对路径与行号，不复制源码。
- **写路径收敛**（P0 修复后的真实行为）：
  - `normify_render` 的 `out` 只接受纯文件名（禁止路径分隔符/`..`），越界报 `render/invalid-out`；
  - `normify_sync` 的 `diff` 范围只接受 revision / `A..B` / `A...B`，拒绝 `-` 开头的选项注入；
  - `normify_fingerprint` 的 `source` 只接受仓库内 POSIX 相对路径；越界路径与符号链接按缺失处理，不读取；
  - 所有结构数据写盘走原子写（tmp + fsync + rename），中断不留半文件。
- **fail-closed（L3）**：任何校验 error 都不产出产物；产出后由 `receipt.sha256 → receipt.json → 各产物` 的回执链自证（`normify verify`）。
- **HTML 注入防护**：查看器对所有插值做 HTML 转义（含 `<title>`），嵌入 JSON 时转义 `<` 防止提前闭合 `<script>`。
- **安装信任边界**：插件由 DSH 插件管理器校验 `engines` 后安装；DSH 运行在用户本机，插件不提升进程权限。

## 已知边界（如实披露）

- `normify_fingerprint`：0.5.5 已拒绝 `../..` 形式的越界路径；若调用者显式传入较宽的 `repoRoot`，指纹仍按该根计算（残余低危，计划 0.6.0 收口）。
- 结构数据目录由使用者自管；建议纳入 git 跟踪以便审查与回滚。
- `normify_sync` 依赖 git 可用；无 git 时该工具会如实报错（`refresh` 在无 git 时降级并给 warning）。
- 第三方插件市场/目录的索引不由本仓库控制；从市场安装时请核对包名与版本。

## 安全相关测试

- 回归集包含：`render.out` 穿越、`sync.diff` 选项注入、`fingerprint` 越界、删除 policy 后的环检测、`<title>` 注入、回执自哈希退化等负例。
- 发布前跑 `node scripts/pack-smoke.mjs --all --strict`；历史验证结论见 [docs/COMPATIBILITY.md](docs/COMPATIBILITY.md)。

## 不在范围

- 结构数据本身的业务正确性（架构是否合理）属于评审问题，不是安全漏洞。
- 用户在 `normify.html` 中自行嵌入的外部链接/资源（默认零外部依赖）。
