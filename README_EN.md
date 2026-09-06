<p align="center">
  <strong>English</strong> · <a href="./README.md">简体中文</a>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/license-MIT-22c55e?style=flat-square" alt="License">
  <img src="https://img.shields.io/badge/DSH-Plugin-7C3AED?style=flat-square" alt="DSH Plugin">
  <img src="https://img.shields.io/badge/version-0.1.0-0891b2?style=flat-square" alt="Version">
</p>

# Normify

**Describe an entire project as a human-and-AI-readable fractal module tree: the AI analyzes and authors, a deterministic engine validates and renders, and opening any module reveals a finer sub-diagram.**

Normify is a DeepSeek Harness (DSH) plugin with two parts:

- **Generator**: the `normify-gen` skill plus 14 `normify.*` tools. The AI analyzes one or more repositories and produces a module-tree structure database (one Markdown file per module, strict YAML frontmatter, bilingual zh/en), supporting full initial generation and **incremental regeneration** (code change → rebuild only the affected subtree).
- **Renderer**: zero-tolerance validation (L1 on write / L2 whole-project / L3 freeze) + deterministic compilation (`tree.json` and three more artifacts, SHA-256 frozen) + a single-file interactive HTML viewer (drill-down, hover intros, one-click zh/en switch, deep links, multi-tree, lazy API aggregation, orthogonal rounded edge routing with obstacle avoidance).

## Core ideas

- **One element**: the whole database is built from countless structurally identical **basic modules**.
- **Only `parent` is stored**: single-direction references; children are derived by index — zero redundancy drift.
- **APIs live only on leaves**: aggregation, stats, and indexes are compile-time derived data.
- **Two edge kinds**: containment (tree edges, the navigation skeleton) + dependency (arrows; cross-subtree and cross-tree; colored by kind).
- **Zero tolerance**: any error blocks artifacts (fail-closed); every diagnostic carries `subject/evidence/supportedFixes` so the AI can self-repair.
- **Path-style id + immutable uid**: the AI locates structures layer by layer (binary-search-like), while uids keep git diffs stable.

## Quick start

### 1. Install (DSH desktop)

Via the plugin manager / CLI:

```bash
dsh plugin --profile web add @dsh-external/dsh-normify@0.1.0
```

Or from source for development:

```bash
git clone https://github.com/yan-mc/dsh-normify
cd dsh-normify
npm install && npm run build
# then use the injector inside a DSH session:
# dev_install_package <this-directory>   (persistent)
# dev_inject_plugin <this-directory>     (runtime only)
```

Build requirements: Node.js ≥ 18 (only the source build needs npm; runtime dependencies are provided by the DSH host).

### 2. Ask the AI to map a repository

```
Use the normify-gen skill to map F:\my-project and produce the structure diagram.
```

The AI authors modules layer by layer (L1 validation on write) → `normify.validate` to 0 errors → `normify.build` (freeze) → `normify.render` (single-file HTML), and reports exact paths.

### 3. Open the diagram

Open `normify.html` in a browser: click to drill down; hover for intros; toggle 中/EN; cross-tree arrows carry tree badges.

### 4. Incremental sync after code changes

```
Sync the XX project structure diagram (the code has changed)
```

The AI runs `normify.sync` (git diff → dirty subtree) → rebuilds only affected modules → the whole project still validates with 0 errors.

## Tools (14)

| Tool | Purpose |
|---|---|
| `normify.tree.list` | List all structure-data projects and trees |
| `normify.module.get / list` | Read / list modules (with stats) |
| `normify.module.upsert` | Create/update a module (L1 on write; auto file-shape promotion) |
| `normify.module.delete / promote` | Delete a subtree (with dangling-edge warnings) / promote a leaf to a container |
| `normify.validate` | Whole-project zero-tolerance validation |
| `normify.build` | Compile tree.json + outline.md + api-index.json + receipt.json (SHA-256 frozen) |
| `normify.sync` | Incremental-regeneration planner (git diff → dirty subtree) |
| `normify.search / deps.find` | Search modules/APIs; reverse-lookup "who depends on me" |
| `normify.outline / render` | Rebuild the outline index; tree.json → single-file HTML |
| `normify.help` | Module field reference |

## Data model (one module)

```markdown
---
uid: 8f3a9c2e                     # 8 hex chars, project-unique, immutable
id: demo.order.checkout.payment   # path-style id (first segment = tree name, ≤ 8 segments)
parent: demo.order.checkout       # the only stored structural reference (null for roots)
name: { zh: 支付, en: Payment }
description: { zh: …, en: … }
source:
  - path: src/order/checkout/payment.ts
    line: 12
    end_line: 340
revision: 9f1a1cf0…               # 40-char git SHA
updated_at: 2026-08-30T12:00:00Z
fingerprint: e3b0c442…            # SHA-256 over source files (drift detection)
apis:                             # leaves only
  - protocol: http
    method: POST
    path: /api/v1/orders/{order_id}/pay
    description: { zh: 发起支付请求。, en: Initiates a payment. }
deps:                             # outbound arrows (source-side only; cross-tree allowed)
  - kind: call                    # call | event | dataflow | reference
    to: helper-lib.utils
    from_api: POST /api/v1/orders/{order_id}/pay
    to_api: rpc:format_amount
    label: { zh: 金额格式化, en: Format amount }
---
```

The complete field spec and validation rules live in [docs/SPEC.zh-CN.md](docs/SPEC.zh-CN.md).

## Renderer features

- **Drill-down**: collapsed nodes show only the name (auto-fit, centered); hover shows the intro; click enters the child level.
- **Orthogonal rounded edges**: axis-aligned routing with rounded corners, box avoidance, lane offsets, and per-kind colors (call/event/dataflow/reference/cross-tree).
- **Multi-tree & cross-tree arrows**: multiple repos = multiple trees; arrows cross trees with zero new syntax.
- **Lazy API aggregation**: grouped by child module with counts, plus an API browser (filter + windowing).
- **Deep links**: `#module=<id>`, `#api=<key>`, `#view=outline`, `?lang=zh|en`, `?theme=dark|light`.
- **Bilingual copy**: structured `{zh, en}` fields with one-click switching.

## Layout

```
dsh-normify/
├── src/
│   ├── index.ts              # plugin entry: 14 tools + runtime skill registration
│   ├── tools.ts              # tool definitions
│   └── engine/               # framework-free core: validation / compile / render / viewer
├── skills/normify-gen/SKILL.md
├── vendor/                   # self-contained runtime deps (patched schemastery + cosmokit)
├── scripts/build.sh          # vendor-ts local path / npm generic path
└── docs/SPEC.zh-CN.md        # formal specification v1.0
```

## Security

No telemetry, no network access, no credential handling, no background services, no install/postinstall scripts. The generator only reads repositories and only writes the designated `normify-*` structure-data directories (enforced by a tool allowlist). See [SECURITY.md](SECURITY.md).

## Docs

- [Formal specification v1.0](docs/SPEC.zh-CN.md) (Chinese)
- [Changelog](CHANGELOG.md) · [Contributing](CONTRIBUTING.md) · [Security](SECURITY.md)

## License

[MIT](LICENSE) © yan-mc
