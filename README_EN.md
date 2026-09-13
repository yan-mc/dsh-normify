<p align="center">
  <strong>English</strong> · <a href="./README.md">简体中文</a>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/version-0.5.4-0891b2?style=flat-square" alt="Version">
  <img src="https://img.shields.io/badge/license-MIT-22c55e?style=flat-square" alt="License">
  <img src="https://img.shields.io/badge/DSH-Plugin-7C3AED?style=flat-square" alt="DSH Plugin">
  <img src="https://img.shields.io/badge/DSH-0.1.5--rc.2-7C3AED?style=flat-square" alt="DSH">
  <img src="https://img.shields.io/badge/node-%E2%89%A518-339933?style=flat-square" alt="Node">
  <img src="https://img.shields.io/badge/tools-31-0ea5e9?style=flat-square" alt="31 tools">
</p>

<h1 align="center">Normify · Normalized Architecture Map Builder</h1>

<p align="center"><b>Describe an entire project as a fractal module tree that both humans and AI can read: the AI analyses and authors, a deterministic engine validates, compiles and renders — open any module and you get a finer sub-graph.</b></p>

---

## 0. TL;DR

Normify is a **DeepSeek Harness (DSH) plugin** and, at the same time, **a development workflow written for AI agents**:

- **For the AI**: a `normify-gen` skill plus **30 `normify_*` tools** — the model turns a repository into a module-tree
  structure database, then keeps it alive through development (design-first planned trees → implement → close the change).
- **For the engine**: zero-tolerance validation (L1 write-time / L2 project-wide / L3 frozen artifacts),
  deterministic compilation (`tree.json` and three sibling artifacts with SHA-256 frozen receipts) and
  render datasets (`renders/`) that decide *how each level is drawn*.
- **For humans**: a **single-file interactive architecture map** (`normify.html`) — drill-down levels, hover
  descriptions, one-click zh/en switch, deep links, multi-tree, **API-anchored arrows**, cross-level aggregation,
  zoom and search. Zero external dependencies: open it by double-clicking.

> It is not a "render a picture and you're done" tool: the structure data and the code are **contracts for each other**.
> `normify_sync` detects drift after every change, and `normify_change_close` (zero-error enforced) closes the loop,
> so the map never drifts away from the code.

<p align="center">
  <img src="https://raw.githubusercontent.com/yan-mc/dsh-normify/main/docs/screenshots/engine.png" alt="Engine level with API-anchored arrows" width="100%">
  <br><sub><b>Engine level</b>: 14 modules, API-anchored arrows (each arrow lands on a concrete API row), labelled subsystem dependencies, dashed cross-level aggregation</sub>
</p>

## 1. What problem does it solve?

| Pain | How Normify answers it |
| --- | --- |
| Diagrams rot the moment they are drawn | The structure data is **validatable source data**: `normify_sync` reports fingerprint drift, `normify_change_close` enforces zero errors |
| Diagrams are too coarse to show contracts | Granularity goes down to a **single functional unit**; APIs live on leaves and arrows can anchor to a concrete API (`from_api` / `to_api`) |
| AI cannot see the whole picture while editing | `normify_brief` returns target contracts, impact surface (who depends on me), policy constraints and an acceptance checklist |
| Design-after-code always drifts | **Planned-first**: create the tree in `state: planned`, flip to `active` with `normify_module_refresh(activate)` once the code lands |
| Conventions rely on discipline | `policy.yml` rules (dependency direction / forbid / acyclic / depth / cross-tree / naming) are enforced by `validate` |
| Full regeneration is too heavy for big repos | Incremental regeneration: only the affected subtree is rebuilt, `layouts_to_review` names the levels to re-check |

## 2. Features

### 2.1 Data model — fractal and redundancy-free

- **One element**: the whole database is made of identical **modules** (each module = one Markdown file).
- **Only `parent` is stored**: one-way reference; `children` is derived, so parent and children can never disagree.
- **APIs only on leaves**, stored once: aggregation, statistics and indexes are compile-time derivations.
- **Two kinds of edges**: containment (tree edges, navigation skeleton) + dependency (arrows, cross-subtree and cross-tree, coloured by `kind`).
- **Path-style ids + immutable uid**: the AI navigates level by level like a binary search; `uid` survives renames and moves,
  so diffs stay stable.
- **Unlimited depth** (since 0.5.0): split as fine as you need; depth is no longer a reason to merge modules.

### 2.2 Three validation layers, fail-closed

| Layer | When | What |
| --- | --- | --- |
| **L1** | every write | required fields, id grammar, uid, parent consistency, bilingual lengths, source/apis/deps shapes, state/replacement |
| **L2** | `normify_validate` | uniqueness, file↔id mapping, leaf/non-leaf rules, globally unique API keys, dependency targets, cycles, render-data cross checks, policy, change log, optional repository evidence (source existence + fingerprint match) |
| **L3** | `normify_build` | nothing is emitted when any error exists; emitted artifacts are SHA-256 frozen into `receipt.json` |

Every diagnostic carries `severity / code / message / subject / evidence / supportedFixes` so the **AI can fix it itself**.

### 2.3 Renderer — single file, drill-down, API-direct

- One HTML file (inline CSS/JS, **no external deps**, no telemetry); easy to archive or send to a colleague.
- Drill-down levels + breadcrumbs + search (module/API) + outline view + API browser.
- **API-direct arrows**: leaf boxes show API detail rows and arrows anchor to a concrete API row;
  multiple edges sharing one API row are fanned apart automatically.
- Cross-level dependencies aggregate into dashed `×N` edges (hidden by default; toggle with the toolbar or `?agg=1`).
- Deep links: `#module=<id>`, `#api=<rpc:key>`, `#view=outline`, `?lang=zh|en`, `?agg=1`; zoom, hover highlight, light/dark theme.
- **Geometry self-check**: the repo ships `check-geometry.mjs`, which asserts per level that lines stay inside the
  viewBox, do not hug, cross or overlap boxes.

### 2.4 Companion development — design first

```
change_open → brief → check → module_batch(state=planned) → 【write the code】
   → module_refresh(activate) → change_close (zero-error enforced) → verified + revision.after
```

- **Planned state**: a module may exist before its source does (`fingerprint: pending`); `validate` allows it.
- **No fake activation**: activating or closing before the source lands is refused.
- **Closing is a loop, not a flag**: refresh fingerprints → validate (zero-error) → build (optionally render) → mark
  `verified`; any failing step leaves the change untouched.
- **The map follows the code**: `normify_sync` uses `git diff` plus untracked files to find affected modules and drift.

### 2.5 Policy first (`policy.yml`)

| Rule | Purpose |
| --- | --- |
| `dependency-direction` | layer order defines the allowed dependency direction (e.g. plugin → tools → engine) |
| `forbid-dependency` | forbid given from → to dependencies (filterable by kind / state) |
| `acyclic` | the dependency graph must be acyclic (optionally including cross-tree edges) |
| `max-depth` | id segment limit — **optional**; omit it and depth is unlimited (default since 0.5.0) |
| `cross-tree` | cross-tree strategy: `forbid` / `allow` / `require-to-api` |
| `naming` | regex over id segments inside a scope |

Once installed, `normify_validate` / `normify_build` / `normify_check` all enforce it: **fix the design, don't bypass the rule**.

## 3. Release highlights

### v0.5.4 — the four tool-side defects found by the second A/B run (current)

Round 2 switched the project (a **spreadsheet formula engine + CLI**; same spec discipline, 88 hidden black-box
checks plus **differential fuzzing**). Final scores: B 88/88, A 87/88 (the single gap being one §5.2 ordering rule).
This release fixes the four *tool-side* issues that run exposed:

- **`mode:"patch"` silent no-op is now rejected**: `items:[{patch:{id, tags:[...]}}]` (one nesting level short) used to
  return `ok:true, count:1` while changing **nothing** — the worst kind of false success. It now fails with
  `args/invalid-patch`, echoing the received keys and the correct shape `{patch:{id, patch:{...}}}`. A single-module
  `normify_module_patch` with an empty patch now fails with `args/empty-patch` too (passing only `expect_updated_at`
  no longer slips through).
- **`normify_module_refresh` no longer hard-requires git**: with a non-git `repoRoot` it used to fail with
  `refresh/git-failed` (the agent had to `git init` just to activate modules). It now degrades gracefully: fingerprints
  are recomputed, state is still activated, `revision` keeps its previous value, and a `refresh/git-unavailable`
  warning explains how to fix it.
- **Clearer `change_open` acceptance errors**: putting a `{zh,en}` object into `acceptance` used to produce one vague
  error; it now says which entry is wrong ("entry #N is not a non-empty string … acceptance only accepts plain
  strings") and suggests putting localized text in `title`/`intent`.
- **`normify_help` gained `topic:"tool:<name>"`**: the `tools` topic now lists required/optional params per tool, and
  the new topic prints a full parameter tree (type / description / required), generated live from the registry and
  therefore in sync with runtime validation.

### v0.5.3 — the four friction points found by a real companion-development A/B

These come from an actual A/B run: two AIs implemented the same backend spec, one with the plugin driving the
companion flow, one writing plain code. Both scored **42/42** on a hidden black-box suite. The plugin side shipped an
extra 41-module / 110-API / 10-layer architecture dataset — and hit the four rough edges below:

- **`normify_help` now takes a `topic`**: it used to ignore its arguments entirely and always return the same field
  cheat-sheet, so the agent read the plugin source just to get exact parameter names (~4 minutes lost). Topics:
  `fields` (default) / `deps` (arrows + API-direct) / `renders` / `flow` / `tools` / `policy` / `errors` / `all`.
  An unknown topic now **fails loudly** and lists the valid ones instead of being silently ignored.
- **Project bootstrap**: new 31st tool `normify_project_init` creates `normify-<slug>/` plus the default policy,
  optionally with a planned root module in one call (idempotent). `normify_change_open` now also **creates the project
  directory on demand** (it used to fail with `project/no-modules`), and `normify_brief` on a missing module returns an
  actionable hint instead of a bare error.
- **Causal batch diagnostics**: one `label-too-long` used to cascade into three `dep/target-missing` errors (L1-failed
  modules are removed from the batch working set). Follow-on errors are now reported as `dep/target-dropped` /
  `structure/parent-dropped` naming the **root-cause diagnostic**, and the failed response carries `root_causes` + a `hint`.
- **API-direct guidance**: arrows whose endpoints both declare APIs but that have no `from_api` / `to_api` now produce an
  aggregated `dep/unanchored` warning (count + first three examples). This was the wasted capability in the experiment:
  110 declared APIs, 54 arrows, zero anchored — unanchored arrows can only land on the box edge, never on an API row.
  Guidance, not relaxation: a wrong anchor key is still an error.

### v0.5.2 — three real data-corrupting defects fixed

- **`normify_module_upsert` keeps its required list**: `parameters.required` is `["frontmatter"]` again, and the 9
  mandatory frontmatter fields (uid / id / parent / name / description / source / revision / updated_at / fingerprint)
  are back in the schema. A nested schema was compiled twice, which silently dropped the whole required list, so the
  contract the model saw no longer matched what the runtime enforced.
- **`normify_module_move` rewrites migrated render data**: `id` / `order` / `groups.children` / `edge_hints` are all
  remapped to the new ids, plus the **old parent** (drops references to moved-out children) and the **new parent**
  (appends the new id to `order`) are maintained. Before the fix a move left the project failing L2 with
  `layout/id-mismatch` + `layout/order-child` (8–9 errors measured; 0 after 0.5.2).
- **Promotion hands APIs off**: when a leaf becomes a container (explicit `normify_module_promote`, auto-promotion when
  writing a child, or moving a subtree under a leaf) the stale `apis` are stripped from the container and reported as a
  `structure/api-dropped-on-promote` warning listing the dropped keys — previously the project hard-failed with `api/non-leaf`.
- **All API rows by default**: layout field `max_api_rows` defaults to **0 = expand all**; pass 1..48 to truncate.
- Each defect is locked in by `tests/regression-0.5.2.mjs` (34 assertions, all green).

### v0.5.1 — renderer: no more overlapping lines (12 → 0)

- **Fixed collinear line overlap**: from **12 overlaps across 28 levels → 0**. Four root causes:
  1. the primary router accepted the first candidate that merely did not cross *other* boxes — it never checked
     whether it lay on top of an already-drawn line → now only candidates with `violations === 0` are accepted;
  2. API-anchored ports were not fanned (several edges share one API row) → ±5.5px in-row fan-out;
  3. API ports on top/bottom sides were placed inside the box → they now fall back to even distribution along the edge;
  4. `segClear` skipped the source/target boxes entirely → new "enters its own box" check (inset 2px).
- Node/group spacing 170 → 220 so dense levels have more free channels.

### v0.5.0 — no module-count ceiling

- **Removed the hard `MAX_DEPTH = 12` limit**: drill down to single functional units; if a project really wants a depth
  limit, declare it in `policy.yml` (`maxDepth` widened to 1..64, scoped).
- Skill guidance: unlimited depth, batch limit 40 → 200, "keep 3–5 APIs per leaf".
<details>
<summary>Earlier versions (v0.4.x / v0.3 / v0.2 / v0.1)</summary>

- **v0.4.1**: renderer v3 (free-channel routing, dynamic viewBox, API-direct arrows, cross-level aggregation, zoom/hover);
  `normify_sync` now sees **untracked new files** (`git ls-files --others`).
- **v0.4.0**: companion development (`planned`/`deprecated`, `replacement`, `tags`), `policy.yml`, change log with
  `normify_change_close` (zero-error enforced), editing operators (`module_patch/batch/move/refresh`),
  `normify_brief` / `normify_check`, sync v2, reminder hook; tools 15 → 30.
- **v0.3.0**: render datasets (`order`/`groups`/`mode`/`reading`/`edge_hints`), id depth 8 → 12, finer granularity.
- **v0.2.0**: DSH 0.1.5-rc.2 adaptation; tool names `normify.x.y` → `normify_x_y`; bundle layer `cordis.patch.yml`;
  parameters compiled to standard JSON Schema; read-only tools marked `isConcurrencySafe`.
- **v0.1.0**: initial release (14 tools, data model v1, renderer v1).

</details>

## 4. Screenshots

| Overview (129 modules) | Tools (31 tools, five families) |
| --- | --- |
| ![overview](https://raw.githubusercontent.com/yan-mc/dsh-normify/main/docs/screenshots/overview.png) | ![tools](https://raw.githubusercontent.com/yan-mc/dsh-normify/main/docs/screenshots/tools.png) |

| Engine level (API-direct arrows) | Model level (clean routing after the 0.5.1 fix) |
| --- | --- |
| ![engine](https://raw.githubusercontent.com/yan-mc/dsh-normify/main/docs/screenshots/engine.png) | ![model](https://raw.githubusercontent.com/yan-mc/dsh-normify/main/docs/screenshots/model.png) |

> All four are **Normify mapping its own source** (129 modules / 214 APIs / 257 arrows / 28 render levels, `validate` 0 error).

## 5. Installation

### Option A — install from a packed tarball (recommended)

```bash
# 1) build the tarball (or grab it from the repository Releases)
cd dsh-normify && npm install && npm run build && npm pack

# 2) unpack it into the target profile's node_modules
#    <profile>/node_modules/@dsh-external/dsh-normify/

# 3) edit <profile>/package.json
#    dependencies         add  "@dsh-external/dsh-normify": "file:<abs path to tgz>"
#    dsh.profile.bundles  add  "@dsh-external/dsh-normify"

# 4) restart the DSH desktop app (the tool list is snapshotted when a session starts)
```

The plugin row is registered **by the bundle itself** (`package.json > dsh.bundle.patch: ./cordis.patch.yml`),
so you never edit the profile's `cordis.patch.yml` by hand.

### Option B — `dsh plugin`

```bash
dsh plugin --profile web-desktop add <absolute path to dsh-normify>
# or: dsh plugin --profile web-desktop add link:F:/dsh-normify
```

### Option C — development mode (edit source, restart, done)

Use a `link:` dependency pointing at this repository plus a directory junction in `node_modules`.
A `link:` install resolves dependencies against the **real path**, so this repository needs `node_modules/yaml`
(plain `npm install`).

> ⚠️ **Note**: upgrading the DSHEAC AIO desktop app re-seeds the profile from `resources/profile-seed`,
> which wipes the plugin registration — just re-install afterwards.

### Verify

```bash
# from the profile directory, importing by bare package name should print the plugin name
node -e "import('@dsh-external/dsh-normify').then(m=>console.log(m.name))"
```

## 6. Quick start

Once installed, just talk to the AI. The three most common prompts:

```text
# 1) map a repository
Use the normify-gen skill to build a structure tree and render an architecture map for F:\my-project,
with granularity down to single functional units.

# 2) design first, then code
I want to add a "rate limiting" module to my-project: normify_brief first, create it in planned state,
then I implement it and you refresh(activate) and change_close.

# 3) sync after code changes
Sync the structure map of my-project (normify_sync): update affected modules and render data,
then build + render once validate reports 0 errors.
```

Under the hood the agent runs:

```text
normify_tree_list → normify_module_upsert (root + first level)
  → normify_module_list (drill down) → normify_module_batch (atomic batches)
  → normify_layout_upsert (one render dataset per container)
  → normify_fingerprint (always compute before writing a fingerprint)
  → normify_validate (zero-error gate) → normify_build → normify_render
```

Artifacts (inside the structure directory `normify-<slug>/`):

| Artifact | Content |
| --- | --- |
| `modules/**/*.md` | the structure data itself (frontmatter + body) |
| `renders/**/*.json` | one render dataset per container level |
| `policy.yml` | architecture rules (defaults installed at project creation) |
| `changes/<id>.json` | development change log, archived together with the structure |
| `tree.json` | compiled: module dictionary + API index + edges + layouts + policy + change stats |
| `outline.md` / `api-index.json` | human-readable outline / API index |
| `receipt.json` | SHA-256 frozen receipt (stats + warning summary) |
| `normify.html` | the single-file interactive map |

## 7. The 31 tools

| Family | Tools | Purpose |
| --- | --- | --- |
| **Reference** | `normify_help` | field and tool reference (read before authoring) |
| **Read** | `normify_tree_list` | list projects and tree roots |
| | `normify_module_get` / `normify_module_list` | read one module / list modules by parent or tree |
| | `normify_search` / `normify_deps_find` / `normify_outline` | search, reverse lookup ("who depends on me"), rebuild `outline.md` |
| **Write** | `normify_module_upsert` | create/update a module (write-time L1 validation, automatic file-form promotion) |
| | `normify_module_delete` / `normify_module_promote` | delete a subtree (with dangling-edge warnings) / promote a leaf |
| **Evolve** | `normify_module_patch` | partial update (`expect_updated_at` guard + `dry_run`) |
| | `normify_module_batch` | atomic batch upsert/patch (whole-batch rollback) |
| | `normify_module_move` | rename/move (uid preserved, cascading parents, project-wide dep rewrite) |
| | `normify_module_refresh` | recompute fingerprint/revision; `activate` flips landed planned modules to active |
| **Layouts** | `normify_layout_get/upsert/delete` | maintain "how this level is drawn" (order/groups/mode/reading/lanes) |
| **Pipeline** | `normify_validate` | project-wide L2 validation (zero-error gate, optional evidence checks) |
| | `normify_build` / `normify_render` | compile + freeze artifacts / render the single-file HTML |
| | `normify_fingerprint` | deterministic source fingerprint (call before writing `fingerprint`) |
| | `normify_sync` | incremental regeneration planner (dirty subtrees, new-file suggestions, drift, breaking API changes) |
| **Companion** | `normify_brief` | development brief: contracts, impact surface, policy constraints, suggested modules, acceptance list |
| | `normify_check` | pre-flight check of proposed modules and dependencies |
| | `normify_change_open/update/list/close` | change log; `close` enforces zero errors |
| | `normify_policy_get/upsert` | read / install `policy.yml` |

## 8. Module frontmatter

```yaml
---
uid: 8c69b5a8                 # 8 lowercase hex, unique per project, never changes
id: dsh-normify.engine.ids    # dotted path id; first segment = tree name; unlimited depth
parent: dsh-normify.engine    # must equal the id minus its last segment; null for a root
name: {zh: "标识与路径", en: "Identifiers & Paths"}
description:                  # bilingual, ≤500 chars each, read by humans and AI alike
  zh: >
      模块 id 的文法、派生与 id ↔ 文件路径的双向映射。
  en: >
      Module id grammar, derivations and the id ↔ file-path mapping.
source:                       # code evidence (repo-relative path + optional line range)
  - {path: src/engine/ids.ts, line: 6, end_line: 34}
revision: 90df4a10…           # 40-hex git SHA at generation time
updated_at: "2026-09-12T12:00:00Z"
fingerprint: 630ac9020dba…    # deterministic fingerprint of source (use normify_fingerprint)
state: active                 # active | planned | deprecated
tags: [engine, ids]           # optional, ≤12
apis:                         # leaves only; 3–5 per leaf recommended
  - protocol: rpc             # http|ws|rpc|amqp|kafka|mysql|redis|file|grpc|graphql
    path: splitId
    description: {zh: "解析 id 为段数组。", en: "Parses an id into segments."}
deps:                         # outgoing arrows (stored on the source side only)
  - kind: call                # call|event|dataflow|reference
    to: dsh-normify.engine.model.module
    from_api: rpc:splitId     # optional: anchor to one of this module's APIs (API-direct)
    to_api: rpc:Module
    label: {zh: "id 契约", en: "Id contract"}
---
(body: optional long-form introduction for humans)
```

File layout: `modules/<tree>/<segments…>/index.md` for containers, `<last>.md` for leaves — maintained by the tools.

## 9. Render datasets (`renders/`)

One per **container** module, mirroring the module tree:

```json
{
  "schema_version": 1,
  "id": "dsh-normify.engine.model",
  "updated_at": "2026-09-12T12:00:00Z",
  "mode": "grid",              // auto | layers | groups | grid
  "max_columns": 3,            // 1..6
  "max_api_rows": 0,           // 0 = expand all (default); 1..48 = truncate
  "reading": {"zh": "本层 8 个子模块…", "en": "…"},
  "order": ["dsh-normify.engine.model.text", "…"],
  "groups": [{"id": "model", "title": {"zh": "模型与契约", "en": "Model"}, "children": ["…"]}],
  "edge_hints": [{"from": "a", "to": "b", "lane": 2, "style": "curve"}]
}
```

Readability recipes: **order = data flow**, **groups = domain boundaries**, **reading = the path**, long back-edges
get explicit lanes via `edge_hints`.

## 10. Companion development

### 10.1 Design first

```text
(1) normify_change_open    open a change (title / intent / modules / acceptance)
(2) normify_brief          contracts, impact surface, policy constraints, suggested modules, checklist
(3) normify_check          pre-flight the proposed modules and dependencies
(4) normify_module_batch   create planned modules (state=planned, fingerprint=pending, source may not exist yet)
                           plus normify_layout_upsert for that level in the same round
(5) 【write the code】
(6) normify_module_refresh recompute fingerprint/revision, activate:true → planned becomes active
(7) normify_change_close   zero-error close: refresh → validate → build → verified + revision.after
```

Planned modules keep `normify_validate` at 0 errors (a missing source is only a warning), and activating or closing
before the code lands is refused.

### 10.2 Companion update

```text
(1) change the code (committed or not)
(2) normify_sync           changed_files / affected / drift_fingerprints / layouts_to_review
                           and "suggested modules" for new files (with ids and target paths)
(3) normify_module_patch   add APIs, refresh descriptions, recompute fingerprint and revision
(4) normify_validate       0 errors
(5) normify_change_close   close and rebuild artifacts (tree.json reflects the change stats)
```

## 11. Repository layout & engineering

```bash
npm install          # devDependencies (typescript / @types/node / cordis / schemastery / cosmokit)
npm run build        # src/ → lib/ via tsc
npm run typecheck    # tsc --noEmit
npm test             # engine-e2e.mjs + companion-e2e.mjs (DSH-independent end-to-end)
node ci-contract-check.cjs   # bundle declaration + exactly 31 tools + provider-safe names
```

| Path | Content |
| --- | --- |
| `src/` | TypeScript sources (16 modules, ~7.2k lines): `index.ts`, `tools.ts`, `engine/*` |
| `lib/` | compiled output (shipped) |
| `skills/normify-gen/SKILL.md` | the generator skill (rules, workflow, granularity, readability) |
| `tests/` | two end-to-end suites: engine path + companion loop (eight stages) |
| `docs/SPEC.zh-CN.md` | formal specification (data model / source format / artifacts / validation / generator / renderer) |
| `vendor/` | vendored schemastery + cosmokit (loaded by relative path) |

## 12. Compatibility & troubleshooting

| Item | Requirement |
| --- | --- |
| DSH | `0.1.5-rc.2` (peer: `@deepseek-ai/cordis ^4`; `dsh-tools` / `dsh-skill` optional) |
| DSHEAC AIO | 6.9.x (profile `web-desktop`) |
| Node.js | ≥ 18 |

- **Installed but no tools** → the tool list is snapshotted at session start: open a **new session** (or restart the app).
- **Plugin disappears after an app upgrade** → the AIO re-seeds the profile from `resources/profile-seed`; re-install.
- **`Cannot find package 'yaml'`** → with a `link:` install, dependencies resolve against the real path; run `npm install` in this repo.
- **`evidence/fingerprint-drift`** → the code moved ahead of the structure data: run `normify_sync`, then `normify_module_refresh`.
- **`structure/leaf-too-coarse`** → not an error: that leaf can be split further (towards single functional units).

## 13. Security & privacy

- **No telemetry, no network calls**: structure data and artifacts are generated locally; `normify.html` loads nothing external.
- **No credential handling**: the plugin never reads or writes tokens, keys or passwords; `.gitignore` excludes
  `.env*`, `*.pem`, `*.credentials.yaml`. **There are no credentials in this repository — please keep it that way.**
- **Read-only on your code**: the generator never modifies the analysed repository; it only writes into `normify-<slug>/`.
- `source` records only repo-relative paths and line numbers, never source text.

## 14. Documentation

| Document | Content |
| --- | --- |
| [`docs/SPEC.zh-CN.md`](docs/SPEC.zh-CN.md) | formal specification v1.0 (Chinese) |
| [`skills/normify-gen/SKILL.md`](skills/normify-gen/SKILL.md) | the generator skill (the AI's playbook) |
| [`CHANGELOG.md`](CHANGELOG.md) | version history (0.1.0 → 0.5.4) |
| [`CONTRIBUTING.md`](CONTRIBUTING.md) | contributing guide |
| [`SECURITY.md`](SECURITY.md) | security policy |

## License

[MIT](LICENSE) © yan-mc

---

<p align="center"><sub>Normify — let the architecture map grow together with the code.</sub></p>
