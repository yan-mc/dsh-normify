# Normify v0.5.1 — 发布说明（可直接粘贴到 GitHub Release）

> 复制下面 `---` 之间的内容到 https://github.com/yan-mc/dsh-normify/releases/new?tag=v0.5.1

---

## Normify v0.5.1 · 渲染器防重叠 + 更精细的结构数据

把整个项目描述成一棵"人机共读"的分形模块树：AI 分析与创作，确定性引擎校验、编译与渲染。

### 🎯 本次重点

**渲染器不再"线压线"** —— 28 层全量几何自检：共线重叠 **12 处 → 0 处**。

四处根因（都在 `src/engine/template.ts`）：

1. **首选路由只判"不穿别人的框"，从不检查是否压到已画线** → 改为只接受
   `violations === 0` 的候选（不穿框 / 不压已画线 / 不横穿自身框 / 端口法向正确），
   没有完全干净的路径时才退化为"违规最少"。
2. **API 锚定端口没有端口分离**（同一 API 行常被多条边共用）→ 按到达顺序在行内 ±5.5px 扇形分离，
   仍钉在该 API 行（行高 13px）上。
3. **API 端口落在上下边时被放进框内部** → 上下边退回按边均匀分离。
4. **`segClear` 整块跳过源/目标框**，连线可横穿自己的框 → 新增"进入自身框内部"检查（内缩 2px），
   并把首/末段"沿节点边滑行"计入违规。

另将节点/分组间距 `GX/GY` 170 → 220，给密集层更多自由通道。

### ✨ 同期能力（v0.5.0）

- **取消模块数量上限**：删除硬编码的 `MAX_DEPTH = 12`，树可以一直下钻到"单一功能单元"；
  需要限层时用 `policy.yml` 的 `max-depth` 规则显式声明（`maxDepth` 1..64，可 scope）。
- **API 行数可配**：渲染数据新增 `max_api_rows`（0 = 全部展开，1..48，缺省 6），叶子 API 不再被硬截断。
- SKILL：目标深度改为"不设上限"，单批上限 40 → 200，新增"每叶 API 尽量 3–5 条"的粒度指引。

### 📐 用自身做的验证

| 指标 | 值 |
| --- | --- |
| 结构规模 | **129 模块 / 101 叶子 / 214 API / 257 箭头（125 条 API 直连）/ 28 层渲染数据** |
| 校验 | `normify_validate` **0 error / 0 warning**（含仓库证据校验） |
| 几何自检 | 28 层：**线压线 0 处**；27/28 层"越界/贴边/穿框/贴组框/线压线"五项全 0 |
| 工程 | `tsc --noEmit` 0 error；engine e2e + companion e2e 全绿；bundle + 30 工具命名契约通过 |
| 伴随开发 | 先建图后编程 12/12 + 伴随编程改图 10/10 PASS |

### 📦 安装

```bash
cd dsh-normify && npm install && npm run build && npm pack
# 解包到 <profile>/node_modules/@dsh-external/dsh-normify/
# profile 的 package.json：dependencies + dsh.profile.bundles 各加一行
# 重启 DSH 桌面端（工具列表在会话启动时快照）
```

兼容 DSH `0.1.5-rc.2` / DSHEAC AIO 6.9.x（profile `web-desktop`）/ Node ≥ 18。

### 📚 文档

- [README](README.md) ｜ [English](README_EN.md) ｜ [正式规范](docs/SPEC.zh-CN.md) ｜ [生成器技能](skills/normify-gen/SKILL.md) ｜ [变更日志](CHANGELOG.md)

---

## 若要用命令行创建 Release（需要 `gh` CLI 且已登录）

```powershell
# 安装：winget install --id GitHub.cli
gh auth login                       # 交互式登录一次
cd F:\Deepseek_harness\dsh-normify
gh release create v0.5.1 `
  --title "v0.5.1 · 渲染器防重叠 + 更精细的结构数据" `
  --notes-file docs/RELEASE-0.5.1.md `
  "F:\Deepseek_harness\dsh-external-dsh-normify-0.5.1.tgz"
```

或者直接在网页上创建：<https://github.com/yan-mc/dsh-normify/releases/new?tag=v0.5.1>
（标题与正文从本文件复制即可；附件可上传 `dsh-external-dsh-normify-0.5.1.tgz`）
