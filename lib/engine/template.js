export function renderTemplate(dataJson, summary) {
    // script 标签内的 JSON 必须转义 < 防止提前闭合
    const safeJson = dataJson.replace(/</g, '\\u003c');
    return `<!DOCTYPE html>
<html lang="zh" data-theme="dark">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<meta name="generator" content="normify">
<title>${summary.name} · Normify</title>
<style>
:root {
  --bg: #0b1220; --panel: #111a2c; --panel2: #16223a; --border: #24344f;
  --text: #e6edf7; --muted: #93a4bf; --accent: #38bdf8; --accent2: #34d399;
  --node: #16223a; --node-leaf: #122036; --node-stroke: #2c4367; --leaf-stroke: #2f6f5f;
  --edge: #5b6f92; --edge-call: #64748b; --edge-event: #a78bfa; --edge-dataflow: #34d399; --edge-reference: #94a3b8; --edge-cross: #f59e0b; --danger: #f87171; --warn: #fbbf24;
}
[data-theme="light"] {
  --bg: #f6f8fc; --panel: #ffffff; --panel2: #eef2f9; --border: #d7dfec;
  --text: #16233b; --muted: #5c6b85; --accent: #0284c7; --accent2: #059669;
  --node: #ffffff; --node-leaf: #f4fbf8; --node-stroke: #9fb4d4; --leaf-stroke: #4fae96;
  --edge: #7c93b5; --edge-call: #64748b; --edge-event: #8b5cf6; --edge-dataflow: #059669; --edge-reference: #94a3b8; --edge-cross: #d97706; --danger: #dc2626; --warn: #b45309;
}
* { box-sizing: border-box; }
body { margin: 0; font-family: "Segoe UI", "PingFang SC", "Microsoft YaHei", system-ui, sans-serif; background: var(--bg); color: var(--text); }
header { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; padding: 10px 16px; border-bottom: 1px solid var(--border); background: var(--panel); position: sticky; top: 0; z-index: 20; }
#brand { font-weight: 700; color: var(--accent); margin-right: 6px; }
#breadcrumb { display: flex; flex-wrap: wrap; gap: 4px; align-items: center; }
#breadcrumb a { color: var(--accent); text-decoration: none; padding: 2px 4px; border-radius: 4px; }
#breadcrumb a:hover { background: var(--panel2); }
#breadcrumb .sep { color: var(--muted); }
#controls { margin-left: auto; display: flex; gap: 6px; align-items: center; }
button { background: var(--panel2); color: var(--text); border: 1px solid var(--border); border-radius: 6px; padding: 4px 10px; cursor: pointer; font-size: 13px; }
button:hover { border-color: var(--accent); }
#searchBox { position: relative; }
#searchInput { background: var(--panel2); border: 1px solid var(--border); color: var(--text); border-radius: 6px; padding: 4px 8px; width: 180px; }
#searchDrop { position: absolute; top: 32px; right: 0; width: 340px; max-height: 320px; overflow: auto; background: var(--panel); border: 1px solid var(--border); border-radius: 8px; display: none; z-index: 40; }
#searchDrop.open { display: block; }
#searchDrop .item { padding: 6px 10px; cursor: pointer; border-bottom: 1px solid var(--border); }
#searchDrop .item:hover { background: var(--panel2); }
#searchDrop .sub { color: var(--muted); font-size: 12px; }
main { padding: 16px; max-width: 1200px; margin: 0 auto; }
.level-head { background: var(--panel); border: 1px solid var(--border); border-radius: 10px; padding: 14px 18px; margin-bottom: 14px; }
.level-head h1 { margin: 0 0 6px; font-size: 20px; }
.level-head .desc { color: var(--muted); margin: 0 0 8px; font-size: 14px; }
.level-head .meta { color: var(--muted); font-size: 12px; display: flex; gap: 12px; flex-wrap: wrap; }
.level-head .meta a { color: var(--accent); }
svg.diagram { background: var(--panel); border: 1px solid var(--border); border-radius: 10px; width: 100%; height: auto; }
.node { fill: var(--node); stroke: var(--node-stroke); stroke-width: 1.5; cursor: pointer; }
.node.leaf { fill: var(--node-leaf); stroke: var(--leaf-stroke); }
.node:hover { stroke: var(--accent); stroke-width: 2; }
.node text, .node-name { fill: var(--text); pointer-events: none; }
.node-name { text-anchor: middle; }
.edge { stroke: var(--edge); stroke-width: 1.6; fill: none; stroke-linecap: round; stroke-linejoin: round; }
.edge.kind-call { stroke: var(--edge-call); }
.edge.kind-event { stroke: var(--edge-event); }
.edge.kind-dataflow { stroke: var(--edge-dataflow); }
.edge.kind-reference { stroke: var(--edge-reference); stroke-dasharray: 6 4; }
.edge.cross { stroke: var(--edge-cross); stroke-dasharray: 5 3; }
.edge-label { fill: var(--muted); font-size: 10px; }
.arrow { fill: var(--edge); }
.arrow.kind-call { fill: var(--edge-call); }
.arrow.kind-event { fill: var(--edge-event); }
.arrow.kind-dataflow { fill: var(--edge-dataflow); }
.arrow.kind-reference { fill: var(--edge-reference); }
.arrow.cross { fill: var(--edge-cross); }
.legendbar { display: flex; flex-wrap: wrap; gap: 14px; align-items: center; margin: 10px 2px; font-size: 12px; color: var(--muted); }
.legendbar .chip { display: inline-flex; align-items: center; gap: 6px; }
.legendbar .swatch { width: 24px; border-top: 3px solid var(--edge-call); }
.legendbar .swatch.kind-call { border-color: var(--edge-call); }
.legendbar .swatch.kind-event { border-color: var(--edge-event); }
.legendbar .swatch.kind-dataflow { border-color: var(--edge-dataflow); }
.legendbar .swatch.kind-reference { border-color: var(--edge-reference); border-top-style: dashed; }
.legendbar .swatch.cross { border-color: var(--edge-cross); border-top-style: dashed; }
#tooltip { position: fixed; z-index: 60; max-width: 300px; background: var(--panel); border: 1px solid var(--accent); border-radius: 8px; padding: 8px 10px; display: none; pointer-events: none; font-size: 13px; box-shadow: 0 6px 24px rgba(0,0,0,.4); }
#tooltip .t-name { font-weight: 700; margin-bottom: 4px; }
#tooltip .t-desc { color: var(--muted); }
#tooltip .t-meta { color: var(--accent2); font-size: 11px; margin-top: 4px; }
.crosslist { margin-top: 12px; background: var(--panel); border: 1px solid var(--border); border-radius: 10px; padding: 10px 14px; font-size: 13px; }
.crosslist h3 { margin: 4px 0 6px; font-size: 13px; color: var(--muted); }
.crosslist .row { margin: 3px 0; }
.crosslist .badge { display: inline-block; background: var(--panel2); border: 1px solid var(--edge-cross); color: var(--edge-cross); border-radius: 4px; padding: 0 5px; font-size: 11px; margin-left: 6px; }
details.api-group { margin: 4px 0 4px 14px; }
details.api-group summary { cursor: pointer; color: var(--accent); font-size: 13px; }
details.api-group summary .cnt { color: var(--muted); font-size: 12px; }
.api-list { list-style: none; margin: 4px 0 8px 12px; padding: 0; }
.api-list li { padding: 3px 0; font-size: 13px; border-bottom: 1px dashed var(--border); }
.api-list .key { font-family: Consolas, monospace; color: var(--accent2); font-size: 12px; }
.api-list .desc { color: var(--muted); font-size: 12px; margin-left: 8px; }
.trees { display: grid; grid-template-columns: repeat(auto-fill, minmax(240px, 1fr)); gap: 14px; }
.tree-card { background: var(--panel); border: 1px solid var(--border); border-radius: 12px; padding: 16px; cursor: pointer; }
.tree-card:hover { border-color: var(--accent); }
.tree-card h2 { margin: 0 0 6px; font-size: 17px; }
.tree-card .repo { font-size: 12px; color: var(--muted); word-break: break-all; }
.section { background: var(--panel); border: 1px solid var(--border); border-radius: 10px; padding: 12px 16px; margin-bottom: 12px; }
.section h2 { margin: 0 0 8px; font-size: 15px; }
.section h3 { margin: 10px 0 4px; font-size: 13px; color: var(--muted); }
table { width: 100%; border-collapse: collapse; font-size: 13px; }
th, td { text-align: left; padding: 4px 8px; border-bottom: 1px solid var(--border); }
th { color: var(--muted); font-weight: 600; }
footer { color: var(--muted); font-size: 12px; text-align: center; padding: 18px; }
.outline ul { list-style: none; margin: 2px 0 2px 16px; padding: 0; }
.outline > ul { margin-left: 0; }
.outline li { padding: 2px 0; }
.outline a { color: var(--text); text-decoration: none; }
.outline a:hover { color: var(--accent); }
.outline .stat { color: var(--muted); font-size: 12px; }
.hint { color: var(--muted); font-size: 12px; }
/* —— 布局与可读性（v0.3）—— */
.reading { background: var(--panel2); border-left: 3px solid var(--accent); border-radius: 6px; padding: 8px 12px; margin: 0 0 10px; font-size: 13px; }
.group-box { fill: var(--panel2); fill-opacity: .45; stroke: var(--border); stroke-width: 1; stroke-dasharray: 5 4; }
.group-title { fill: var(--muted); font-size: 12px; font-weight: 600; paint-order: stroke; stroke: var(--panel); stroke-width: 4px; stroke-linejoin: round; }
.node-g { cursor: pointer; }
.edge { opacity: .78; }
.edge.hl { stroke-width: 3.2; opacity: 1; }
.node-g:hover .node { stroke: var(--accent); stroke-width: 2; }
.node.state-planned { stroke-dasharray: 6 4; opacity: .88; }
.node.state-deprecated { stroke: var(--danger); stroke-dasharray: 3 3; opacity: .65; }
.state-badge { font-size: 9px; }
.state-badge.state-planned { fill: var(--accent); }
.state-badge.state-deprecated { fill: var(--danger); }
/* —— 渲染器 v3：API 明细 / 端口 / 缩放 —— */
.diagram-wrap { overflow: auto; max-height: 80vh; background: var(--panel); border: 1px solid var(--border); border-radius: 10px; }
.diagram-wrap svg.diagram { overflow: visible; display: block; border: none; background: transparent; }
.diagram-tools { display: flex; align-items: center; gap: 6px; margin: 8px 2px 4px; font-size: 12px; color: var(--muted); }
.zoom-btn { min-width: 30px; padding: 2px 8px; font-size: 12px; }
.zoom-label { min-width: 40px; text-align: center; color: var(--muted); }
.api-sep { stroke: var(--border); stroke-width: 1; }
.api-chip { fill: var(--muted); font-size: 9px; font-family: ui-monospace, Consolas, monospace; }
.api-more { fill: var(--muted); font-size: 9px; }
.edge.agg { stroke-dasharray: 3 5; stroke-width: 1; opacity: .38; }
.hide-agg .edge.agg, .hide-agg .arrow.agg, .hide-agg .edge-label.agg { display: none; }
.zoom-btn.agg-toggle.on { border-color: var(--accent); color: var(--accent); }
.arrow.agg { opacity: .38; }
.edge-label.agg { font-size: 9px; }
.legendbar .swatch.agg { border-top-style: dashed; border-color: var(--edge); }
.edge.dim, .arrow.dim { opacity: .06; }
.node-g:hover .node { stroke-width: 2.4; }
</style>
</head>
<body>
<header>
  <span id="brand">⬡ Normify</span>
  <nav id="breadcrumb"></nav>
  <div id="controls">
    <div id="searchBox">
      <input id="searchInput" placeholder="搜索模块 / API">
      <div id="searchDrop"></div>
    </div>
    <button id="btnLang" title="切换语言">EN</button>
    <button id="btnTheme" title="切换主题">☀</button>
    <button id="btnOutline" title="大纲视图">大纲</button>
    <button id="btnApis" title="API 浏览器">API</button>
  </div>
</header>
<main id="main"></main>
<footer id="footer"></footer>
<div id="tooltip"></div>
<script type="application/json" id="normify-data">${safeJson}</script>
<script>
(function () {
  'use strict'
  var DATA = JSON.parse(document.getElementById('normify-data').textContent)
  var mods = DATA.modules
  var apiIndex = DATA.api_index
  var edges = DATA.edges
  var stats = DATA.project.stats
  var trees = DATA.project.trees
  var lang = initLang()
  var current = parseHash()
  var children = {}
  var roots = []
  Object.keys(mods).forEach(function (id) {
    var m = mods[id]
    if (m.parent === null) roots.push(id)
    else (children[m.parent] = children[m.parent] || []).push(id)
  })
  roots.sort()
  Object.keys(children).forEach(function (k) { children[k].sort() })
  var depIn = {}
  edges.forEach(function (e) { (depIn[e.to] = depIn[e.to] || []).push(e) })
  var corpus = buildCorpus()

  function esc(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;') }
  function L(o) { if (!o) return ''; return o[lang] || o.zh || '' }
  function treeRepo(treeId) { for (var i = 0; i < trees.length; i++) if (trees[i].tree_id === treeId) return trees[i].repository || null; return null }
  function idOfSegs(segs) { return segs.join('.') }
  function sourceHref(m) {
    var repo = treeRepo(m.tree)
    if (!repo || !m.source || m.source.length === 0) return null
    var s = m.source[0]
    var href = repo.replace(/\\/$/, '') + '/blob/' + m.revision + '/' + s.path
    if (s.line) href += '#L' + s.line + (s.end_line && s.end_line !== s.line ? '-L' + s.end_line : '')
    return href
  }
  function initLang() {
    var p = new URLSearchParams(location.search).get('lang')
    if (p === 'zh' || p === 'en') return p
    try { var s = localStorage.getItem('normify-lang'); if (s === 'zh' || s === 'en') return s } catch (e) {}
    return (navigator.language || '').toLowerCase().indexOf('zh') === 0 ? 'zh' : 'en'
  }
  function initTheme() {
    var p = new URLSearchParams(location.search).get('theme')
    var t = null
    try { t = localStorage.getItem('normify-theme') } catch (e) {}
    if (p === 'dark' || p === 'light') t = p
    document.documentElement.setAttribute('data-theme', t === 'light' ? 'light' : 'dark')
  }
  function parseHash() {
    var h = location.hash.replace(/^#/, '')
    if (h === 'trees') return { view: 'trees' }
    var params = {}
    h.split('&').forEach(function (kv) {
      if (!kv) return
      var i = kv.indexOf('=')
      if (i > 0) params[kv.slice(0, i)] = decodeURIComponent(kv.slice(i + 1))
    })
    if (params.view === 'outline') return { view: 'outline' }
    if (params.view === 'apis') return { view: 'apis' }
    if (params.api) {
      var owner = apiIndex[params.api]
      if (owner) return { view: 'level', moduleId: owner, apiKey: params.api }
    }
    if (params.module && mods[params.module]) return { view: 'level', moduleId: params.module }
    if (params.tree && mods[params.tree]) return { view: 'level', moduleId: params.tree }
    return { view: 'trees' }
  }
  function buildCorpus() {
    var out = []
    Object.keys(mods).forEach(function (id) {
      var m = mods[id]
      out.push({ kind: 'module', id: id, text: (id + ' ' + m.name.zh + ' ' + m.name.en + ' ' + L(m.description)).toLowerCase() })
    })
    Object.keys(apiIndex).forEach(function (key) {
      out.push({ kind: 'api', id: key, moduleId: apiIndex[key], text: key.toLowerCase() })
    })
    return out
  }

  function goto(hash) { location.hash = hash }
  function render() {
    var main = document.getElementById('main')
    main.innerHTML = ''
    renderBreadcrumb()
    document.getElementById('btnLang').textContent = lang === 'zh' ? 'EN' : '中'
    if (current.view === 'trees') renderTrees(main)
    else if (current.view === 'level') renderLevel(main)
    else if (current.view === 'outline') renderOutline(main)
    else renderApis(main)
    var footer = document.getElementById('footer')
    footer.textContent = 'Normify · ' + DATA.project.name + ' · 模块 ' + stats.module_count + ' / API ' + stats.api_count + ' / 箭头 ' + stats.dep_count + ' · 构建于 ' + DATA.project.compiled_at
    if (current.apiKey) highlightApi()
  }
  function renderBreadcrumb() {
    var bc = document.getElementById('breadcrumb')
    bc.innerHTML = ''
    var a
    if (roots.length > 1) {
      a = document.createElement('a')
      a.href = '#trees'
      a.textContent = '树'
      bc.appendChild(a)
      bc.appendChild(sepEl())
    }
    if (current.moduleId) {
      var segs = current.moduleId.split('.')
      for (var i = 0; i < segs.length; i++) {
        a = document.createElement('a')
        a.href = '#module=' + encodeURIComponent(idOfSegs(segs.slice(0, i + 1)))
        a.textContent = segs[i]
        bc.appendChild(a)
        if (i < segs.length - 1) bc.appendChild(sepEl())
      }
    }
  }
  function sepEl() { var s = document.createElement('span'); s.className = 'sep'; s.textContent = '/'; return s }

  function renderTrees(main) {
    var wrap = el('div', 'trees')
    roots.forEach(function (id) {
      var m = mods[id]
      var card = el('div', 'tree-card')
      card.innerHTML = '<h2>' + esc(L(m.name)) + '</h2><div class="hint">' + esc(m.id) + '</div><div class="repo">' + esc(treeRepo(m.id) || '') + '</div><div class="hint">' + esc(oneLine(L(m.description), 120)) + '</div>'
      card.onclick = function () { goto('#module=' + encodeURIComponent(id)) }
      card.onmouseenter = function () { showTip(card, m) }
      card.onmouseleave = hideTip
      wrap.appendChild(card)
    })
    main.appendChild(wrap)
  }

  function renderLevel(main) {
    var m = mods[current.moduleId]
    var head = el('div', 'level-head')
    var repo = treeRepo(m.tree)
    var srcHref = sourceHref(m)
    head.innerHTML = '<h1>' + esc(L(m.name)) + ' <span class="hint">' + esc(m.id) + '</span></h1>'
      + '<p class="desc">' + esc(L(m.description)) + '</p>'
      + '<div class="meta">' + (m.state ? '<span>状态 ' + (m.state === 'planned' ? '计划' : m.state === 'deprecated' ? '废弃' : '已实现') + '</span>' : '') + '<span>模块 ' + (m.aggregate.descendant_count + 1) + '</span><span>API ' + (m.aggregate.own_api_count + m.aggregate.inherited_api_count) + '</span><span>出边 ' + m.aggregate.dep_out + '</span><span>入边 ' + m.aggregate.dep_in + '</span><span>' + ((DATA.layouts && DATA.layouts[current.moduleId]) ? '布局 渲染数据' : '布局 自动') + '</span>'
      + (repo ? '<a href="' + esc(repo) + '" target="_blank" rel="noopener">仓库</a>' : '')
      + (srcHref ? '<a href="' + esc(srcHref) + '" target="_blank" rel="noopener">源码 ' + esc(m.source[0].path) + '</a>' : '')
      + '</div>'
    main.appendChild(head)
    var kids = children[current.moduleId] || []
    if (kids.length === 0) {
      renderLeafDetail(main, m)
    } else {
      renderDiagram(main, m, kids)
      renderCrossEdges(main, m, kids)
      renderInheritedApis(main, m)
    }
  }

  function estWidth(s, fs) {
    var w = 0
    for (var i = 0; i < s.length; i++) w += s.charCodeAt(i) > 255 ? fs : fs * 0.56
    return w
  }

  function wrapName(name, maxW, fs) {
    var s = String(name).replace(/s+/g, ' ')
    var words = s.split(' ')
    var lines = []
    if (words.length > 1) {
      var cur = ''
      for (var i = 0; i < words.length; i++) {
        var t = cur === '' ? words[i] : cur + ' ' + words[i]
        if (estWidth(t, fs) <= maxW || cur === '') cur = t
        else { lines.push(cur); cur = words[i] }
      }
      lines.push(cur)
    } else {
      lines.push(s)
    }
    if (lines.length > 2) lines = [lines[0], lines.slice(1).join(' ')]
    if (lines.length === 1 && estWidth(lines[0], fs) > maxW) {
      var l = lines[0], cut = 1
      while (cut < l.length && estWidth(l.slice(0, cut), fs) <= maxW) cut++
      cut = Math.max(1, cut - 1)
      lines = [l.slice(0, cut), l.slice(cut)]
    }
    if (lines.length === 2 && estWidth(lines[0], fs) > maxW) {
      var l2 = lines[0], cut2 = 1
      while (cut2 < l2.length && estWidth(l2.slice(0, cut2), fs) <= maxW) cut2++
      cut2 = Math.max(1, cut2 - 1)
      lines = [l2.slice(0, cut2), l2.slice(cut2) + ' ' + lines[1]]
    }
    return lines
  }

  function fitName(name, maxW) {
    var best = null
    for (var fs = 13; fs >= 8.5; fs -= 0.5) {
      var lines = wrapName(name, maxW, fs)
      var ok = true
      for (var i = 0; i < lines.length; i++) if (estWidth(lines[i], fs) > maxW) ok = false
      best = { lines: lines, fs: fs }
      if (ok) break
    }
    for (var j = 0; j < best.lines.length; j++) {
      var ln = best.lines[j]
      if (estWidth(ln, best.fs) <= maxW) continue
      while (ln.length > 1 && estWidth(ln + '…', best.fs) > maxW) ln = ln.slice(0, -1)
      best.lines[j] = ln + '…'
    }
    return best
  }

  var BOX = 200, GX = 170, GY = 170, MARGIN = 56, GPAD = 22, GTITLE = 24

  function orderedKids(kids, lay) {
    var kidSet = {}
    kids.forEach(function (k) { kidSet[k] = true })
    var edges = directEdges(kids)
    var order = []
    var seen = {}
    if (lay && lay.order) lay.order.forEach(function (id) { if (kidSet[id] && !seen[id]) { seen[id] = true; order.push(id) } })
    var rest = kids.filter(function (id) { return !seen[id] })
    if (edges.length > 0) {
      var layer = layerize(kids, edges)
      rest.sort(function (a, b) { return (layer[a] - layer[b]) || (a < b ? -1 : a > b ? 1 : 0) })
    } else {
      rest.sort()
    }
    return order.concat(rest)
  }

  /** 当前层可见的模块级直连边（仅用于自动排序/分层）。 */
  function directEdges(kids) {
    var kidSet = {}
    kids.forEach(function (k) { kidSet[k] = true })
    var out = []
    kids.forEach(function (id) {
      ;(mods[id].deps || []).forEach(function (d) {
        if (kidSet[d.to] && d.to !== id) out.push({ from: id, to: d.to, kind: d.kind })
      })
    })
    return out
  }

  /**
   * 当前层要画的全部边（对齐"API 直接连线"的原始目标）：
   * - exact：两端都在本层（孩子）——用真实 from_api/to_api 锚点，一条不合并；
   * - agg：某一端在可见孩子的子树内部（跨层）——聚合到可见模块上，虚线 + ×N + 明细 tooltip。
   */
  function collectEdges(kids) {
    var kidSet = {}
    kids.forEach(function (k) { kidSet[k] = true })
    var visibleOf = function (id) {
      if (kidSet[id]) return id
      for (var i = 0; i < kids.length; i++) {
        var k = kids[i]
        if (id.length > k.length && id.indexOf(k + '.') === 0) return k
      }
      return null
    }
    var exact = []
    var seenExact = {}
    var aggMap = {}
    Object.keys(mods).forEach(function (srcId) {
      var m = mods[srcId]
      ;(m.deps || []).forEach(function (d) {
        var from = visibleOf(srcId)
        var to = visibleOf(d.to)
        if (from === null || to === null || from === to) return
        if (kidSet[srcId] && kidSet[d.to]) {
          var sig = srcId + '|' + d.to + '|' + (d.from_api || '') + '|' + (d.to_api || '') + '|' + d.kind
          if (seenExact[sig]) return
          seenExact[sig] = true
          exact.push({
            from: srcId, to: d.to,
            from_api: d.from_api || null, to_api: d.to_api || null,
            kind: d.kind, label: d.label || null, cross_tree: !!d.cross_tree,
            agg: false, count: 1, samples: [srcId + (d.from_api ? ' [' + d.from_api + ']' : '') + ' -> ' + d.to + (d.to_api ? ' [' + d.to_api + ']' : '')],
          })
          return
        }
        var key = from + '|' + to + '|' + d.kind
        var hit = aggMap[key]
        if (hit === undefined) {
          hit = { from: from, to: to, from_api: null, to_api: null, kind: d.kind, label: null, cross_tree: !!d.cross_tree, agg: true, count: 0, samples: [] }
          aggMap[key] = hit
        }
        hit.count++
        hit.cross_tree = hit.cross_tree || !!d.cross_tree
        if (hit.samples.length < 12) hit.samples.push(srcId + (d.from_api ? ' [' + d.from_api + ']' : '') + ' -> ' + d.to + (d.to_api ? ' [' + d.to_api + ']' : ''))
      })
    })
    var agg = Object.keys(aggMap).map(function (k) { return aggMap[k] }).sort(function (a, b) { return (b.count - a.count) || String(a.from).localeCompare(String(b.from)) })
    return { exact: exact, agg: agg }
  }

  function layerize(ids, edges) {
    var layer = {}
    ids.forEach(function (id) { layer[id] = 0 })
    for (var pass = 0; pass < ids.length + 1; pass++) {
      var changed = false
      edges.forEach(function (e) {
        if (layer[e.to] < layer[e.from] + 1) { layer[e.to] = layer[e.from] + 1; changed = true }
      })
      if (!changed) break
    }
    return layer
  }

  /** 叶子模块展示的 API 行（最多 4 行；容器不展示）。 */
  function apiRows(id) {
    var m = mods[id]
    if (m === undefined || children[id] !== undefined) return []
    var apis = m.apis || []
    return apis.slice(0, 4)
  }

  function apiRowCount(id) { return apiRows(id).length }

  /** 节点高度：名称区 42 + 每行 API 13（无 API 的叶子/容器 54）。 */
  function nodeHeight(id) {
    var rows = apiRowCount(id)
    return rows === 0 ? 54 : 44 + rows * 13
  }

  /** 边的端口 y：优先钉在具体 API 行上（"API 直接连线"），否则名称区中心。 */
  function apiPortY(node, apiKey) {
    if (!apiKey) return node.y + 26
    var rows = apiRows(node.id)
    for (var i = 0; i < rows.length; i++) {
      if (rows[i].key === apiKey) return node.y + 40 + i * 13 + 6
    }
    return node.y + 26
  }

  function layoutBlock(members, edges, inner, maxCols) {
    var memberSet = {}
    members.forEach(function (id) { memberSet[id] = true })
    var internal = edges.filter(function (e) { return memberSet[e.from] && memberSet[e.to] })
    var nodes = []
    var W = 0, H = 0
    if (inner === 'column') {
      var y = 0
      members.forEach(function (id) {
        var h = nodeHeight(id)
        nodes.push({ id: id, x: 0, y: y, w: BOX, h: h })
        y += h + GY
      })
      W = BOX
      H = Math.max(0, y - GY)
    } else if (inner === 'layers' && internal.length > 0) {
      var layer = layerize(members, internal)
      var cols = {}
      members.forEach(function (id) { (cols[layer[id]] = cols[layer[id]] || []).push(id) })
      Object.keys(cols).forEach(function (k) { cols[k].sort() })
      var keys = Object.keys(cols).map(Number).sort(function (a, b) { return a - b })
      var perBand = Math.max(2, Math.min(maxCols, 5))
      var bands = []
      for (var bi = 0; bi < keys.length; bi += perBand) bands.push(keys.slice(bi, bi + perBand))
      var yBand = 0
      var maxW = 0
      bands.forEach(function (band) {
        var bandH = 0
        band.forEach(function (k) {
          var colH = 0
          cols[k].forEach(function (id) { colH += nodeHeight(id) + GY })
          colH = Math.max(0, colH - GY)
          bandH = Math.max(bandH, colH)
        })
        var x = 0
        band.forEach(function (k) {
          var colH = 0
          cols[k].forEach(function (id) { colH += nodeHeight(id) + GY })
          colH = Math.max(0, colH - GY)
          var y0 = yBand + (bandH - colH) / 2
          cols[k].forEach(function (id) {
            var h = nodeHeight(id)
            nodes.push({ id: id, x: x, y: y0, w: BOX, h: h })
            y0 += h + GY
          })
          x += BOX + GX
        })
        maxW = Math.max(maxW, x - GX)
        yBand += bandH + GY + 34
      })
      W = maxW
      H = Math.max(0, yBand - GY - 34)
    } else {
      var n = members.length
      var colsN = Math.min(maxCols, Math.max(1, Math.ceil(Math.sqrt(n))))
      var rows = Math.ceil(n / colsN)
      var rowH = []
      for (var r = 0; r < rows; r++) {
        var hRow = 0
        for (var c = 0; c < colsN; c++) {
          var idx = r * colsN + c
          if (idx < n) hRow = Math.max(hRow, nodeHeight(members[idx]))
        }
        rowH.push(hRow)
      }
      var yAcc = []
      var acc = 0
      for (var r2 = 0; r2 < rows; r2++) { yAcc.push(acc); acc += rowH[r2] + GY }
      members.forEach(function (id, i) {
        var c2 = i % colsN, r3 = Math.floor(i / colsN)
        var h2 = nodeHeight(id)
        var yTop = yAcc[r3] + (rowH[r3] - h2) / 2
        nodes.push({ id: id, x: c2 * (BOX + GX), y: yTop, w: BOX, h: h2 })
      })
      W = colsN * BOX + (colsN - 1) * GX
      H = Math.max(0, acc - GY)
    }
    return { nodes: nodes, w: W, h: H, members: members, internal: internal }
  }

  function renderDiagram(main, m, kids) {
    var lay = (DATA.layouts || {})[m.id] || null
    if (lay && lay.reading) {
      var rb = el('div', 'reading')
      rb.innerHTML = '<b>' + esc(lang === 'zh' ? '阅读导语' : 'Reading guide') + '</b> ' + esc(L(lay.reading))
      main.appendChild(rb)
    }
    var maxCols = (lay && lay.max_columns) ? Math.max(1, Math.min(6, lay.max_columns)) : 4
    var ordered = orderedKids(kids, lay)
    var direct = directEdges(kids)
    var edgeSet = collectEdges(kids)
    var exactEdges = edgeSet.exact
    var aggEdges = edgeSet.agg
    var groups = null
    if (lay && lay.groups && lay.groups.length > 0) {
      var assigned = {}
      groups = []
      lay.groups.forEach(function (g) {
        var members = (g.children || []).filter(function (id) { return kids.indexOf(id) >= 0 && !assigned[id] })
        members.forEach(function (id) { assigned[id] = true })
        if (members.length > 0) groups.push({ id: g.id, title: g.title, members: members })
      })
      var rest = ordered.filter(function (id) { return !assigned[id] })
      if (rest.length > 0) groups.push({ id: '__rest__', title: { zh: '其它', en: 'Others' }, members: rest })
    } else {
      groups = [{ id: '__all__', title: null, members: ordered }]
    }
    var mode = (lay && lay.mode && lay.mode !== 'auto') ? lay.mode : null
    if (mode === null) mode = (groups.length > 1) ? 'groups' : (direct.length >= 2 ? 'layers' : 'grid')
    if (mode === 'groups' && groups.length === 1 && !groups[0].title) mode = direct.length >= 2 ? 'layers' : 'grid'

    var TOP_PAD = 72
    var BOTTOM_PAD = 56
    var ROW_MAX = 3200
    var blocks = []
    var usedW = 0
    var rowX = MARGIN, rowY = TOP_PAD, rowH = 0
    groups.forEach(function (g) {
      var inner = mode === 'layers' ? 'layers' : (mode === 'groups' ? (g.members.length > 5 ? 'grid' : 'column') : 'grid')
      var block = layoutBlock(g.members, direct, inner, maxCols)
      block.title = g.title
      block.gid = g.id
      var bw = block.w + GPAD * 2
      if (rowX > MARGIN && rowX + bw > ROW_MAX) { rowX = MARGIN; rowY += rowH + GY; rowH = 0 }
      block.offsetX = rowX + GPAD
      block.offsetY = rowY + (block.title ? GTITLE + 8 : 0)
      rowX += bw + GX + 80
      usedW = Math.max(usedW, rowX - 40)
      rowH = Math.max(rowH, block.h + (block.title ? GTITLE + GPAD + 8 : 0))
      blocks.push(block)
    })
    var W = Math.max(MARGIN + usedW + MARGIN, 460)
    var H = rowY + rowH + BOTTOM_PAD
    var groupRects = []
    blocks.forEach(function (b) {
      if (!b.title) return
      groupRects.push({ x: b.offsetX - GPAD, y: b.offsetY - GTITLE - GPAD + 6, w: b.w + GPAD * 2, h: b.h + GTITLE + GPAD * 2 - 6 })
    })
    var corridorXs = []
    var corridorYs = []
    var blockIdx = {}
    blocks.forEach(function (b, bi) { b.nodes.forEach(function (n) { blockIdx[n.id] = bi }) })
    for (var bi2 = 0; bi2 < blocks.length - 1; bi2++) {
      var b1 = blocks[bi2], b2b = blocks[bi2 + 1]
      if (Math.abs(b1.offsetY - b2b.offsetY) < 48) corridorXs.push((b1.offsetX + b1.w + b2b.offsetX) / 2)
      else corridorYs.push((b1.offsetY + b1.h + b2b.offsetY) / 2)
    }

    var nodes = []
    blocks.forEach(function (b) {
      b.nodes.forEach(function (n) {
        nodes.push({ id: n.id, x: n.x + b.offsetX, y: n.y + b.offsetY, w: n.w, h: n.h, cx: n.x + b.offsetX + n.w / 2, cy: n.y + b.offsetY + n.h / 2 })
      })
    })
    var byId = {}
    nodes.forEach(function (n) { byId[n.id] = n })
    var rects = nodes.map(function (n) { return { x: n.x, y: n.y, w: n.w, h: n.h } })
    var nodesById = {}
    nodes.forEach(function (n) { nodesById[n.id] = n })
    var maxY = 0
    rects.forEach(function (r) { maxY = Math.max(maxY, r.y + r.h) })
    var CLEAR = 16
    // 自由通道：相邻列/相邻行之间的空隙中线（线走通道就不贴框）
    var vchans = []
    var hchans = []
    var xsSeen = [], ysSeen = []
    rects.forEach(function (r) {
      if (xsSeen.indexOf(r.x) < 0) xsSeen.push(r.x)
      if (ysSeen.indexOf(r.y) < 0) ysSeen.push(r.y)
    })
    xsSeen.sort(function (a, b) { return a - b })
    ysSeen.sort(function (a, b) { return a - b })
    function nearGroupBorderX(x) {
      for (var gi = 0; gi < groupRects.length; gi++) {
        var g = groupRects[gi]
        if (Math.abs(x - g.x) < 18 || Math.abs(x - (g.x + g.w)) < 18) return true
      }
      return false
    }
    function nearGroupBorderY(y) {
      for (var gi = 0; gi < groupRects.length; gi++) {
        var g = groupRects[gi]
        if (Math.abs(y - g.y) < 18 || Math.abs(y - (g.y + g.h)) < 18) return true
      }
      return false
    }
    function groupBorderDistX(x) {
      var d = Infinity
      for (var gi = 0; gi < groupRects.length; gi++) {
        var g = groupRects[gi]
        d = Math.min(d, Math.abs(x - g.x), Math.abs(x - (g.x + g.w)))
      }
      return d
    }
    function groupBorderDistY(y) {
      var d = Infinity
      for (var gi = 0; gi < groupRects.length; gi++) {
        var g = groupRects[gi]
        d = Math.min(d, Math.abs(y - g.y), Math.abs(y - (g.y + g.h)))
      }
      return d
    }
    for (var xi = 0; xi < xsSeen.length - 1; xi++) {
      var xa = xsSeen[xi], xb = xsSeen[xi + 1]
      var xgap = xb - (xa + BOX)
      if (xgap < CLEAR * 2 + 12) continue
      ;[0.18, 0.5, 0.82].forEach(function (fr) {
        var cx = xa + BOX + xgap * fr
        var sp = Math.min(xgap, 120) / 2 - CLEAR
        if (!nearGroupBorderX(cx) && groupBorderDistX(cx) >= 18 + Math.max(0, sp)) vchans.push({ x: cx, span: sp })
      })
    }
    for (var yi = 0; yi < ysSeen.length - 1; yi++) {
      var ya = ysSeen[yi], yb = ysSeen[yi + 1]
      var minH = 0
      rects.forEach(function (r) { if (Math.abs(r.y - ya) < 2) minH = Math.max(minH, r.h) })
      var ygap = yb - (ya + minH)
      if (ygap < CLEAR * 2 + 10) continue
      ;[0.22, 0.5, 0.78].forEach(function (fr) {
        var cy = ya + minH + ygap * fr
        var sp2 = Math.min(ygap, 140) / 2 - CLEAR
        if (!nearGroupBorderY(cy) && groupBorderDistY(cy) >= 18 + Math.max(0, sp2)) hchans.push({ y: cy, span: sp2 })
      })
    }

    // 全高自由列 / 全宽自由行：竖线或横线整条不与任何节点框相交（用于保底总线路由）
    var freeCols = []
    var freeRows = []
    for (var fx = Math.round(MARGIN * 0.6); fx <= W - MARGIN * 0.6; fx += 10) {
      var cxClr = Infinity
      for (var fi = 0; fi < rects.length; fi++) {
        var rr1 = rects[fi]
        if (fx > rr1.x - 1 && fx < rr1.x + rr1.w + 1) { cxClr = -1; break }
        cxClr = Math.min(cxClr, Math.min(Math.abs(fx - rr1.x), Math.abs(fx - (rr1.x + rr1.w))))
      }
      var spC = Math.max(0, Math.min(80, cxClr - CLEAR - 3))
      if (cxClr >= CLEAR + 4 && groupBorderDistX(fx) >= 18 + spC && !nearGroupBorderX(fx)) freeCols.push({ x: fx, span: spC })
    }
    for (var fy = Math.round(TOP_PAD * 0.35); fy <= maxY + BOTTOM_PAD; fy += 8) {
      var cyClr = Infinity
      for (var fi2 = 0; fi2 < rects.length; fi2++) {
        var rr2 = rects[fi2]
        if (fy > rr2.y - 1 && fy < rr2.y + rr2.h + 1) { cyClr = -1; break }
        cyClr = Math.min(cyClr, Math.min(Math.abs(fy - rr2.y), Math.abs(fy - (rr2.y + rr2.h))))
      }
      var spR = Math.max(0, Math.min(80, cyClr - CLEAR - 3))
      if (cyClr >= CLEAR + 4 && groupBorderDistY(fy) >= 18 + spR && !nearGroupBorderY(fy)) freeRows.push({ y: fy, span: spR })
    }

    // 外围合成车道：顶部/底部/左侧/右侧无节点区域，用于总线兜底，保证任何边都有干净路径
    for (var syn = 0; syn < 8; syn++) freeRows.push({ y: 8 + syn * 9, span: 80, synthetic: true })
    for (var syn2 = 0; syn2 < 22; syn2++) freeRows.push({ y: Math.round(maxY + 32 + syn2 * 9), span: 80, synthetic: true })
    for (var syn3 = 0; syn3 < 16; syn3++) freeCols.push({ x: 8 + syn3 * 9, span: 80, synthetic: true })
    for (var syn4 = 0; syn4 < 16; syn4++) freeCols.push({ x: Math.round(W - 8 - syn4 * 9), span: 80, synthetic: true })

    function segClear(x1, y1, x2, y2, skipFrom, skipTo) {
      var minX = Math.min(x1, x2), maxX = Math.max(x1, x2)
      var minY = Math.min(y1, y2), maxYv = Math.max(y1, y2)
      for (var i = 0; i < rects.length; i++) {
        var n = nodes[i]
        if (n.id === skipFrom || n.id === skipTo) continue
        var r = rects[i]
        var rx = r.x - CLEAR, ry = r.y - CLEAR, rw = r.w + CLEAR * 2, rh = r.h + CLEAR * 2
        if (maxX <= rx || minX >= rx + rw) continue
        if (maxYv <= ry || minY >= ry + rh) continue
        return false
      }
      return true
    }
    /** 平行于组框边且距离过近（视觉上"贴着组框走线"）判定。 */
    function segHugsGroup(x1, y1, x2, y2) {
      var horiz = Math.abs(y1 - y2) < 0.6
      var vert = Math.abs(x1 - x2) < 0.6
      if (!horiz && !vert) return false
      for (var gi = 0; gi < groupRects.length; gi++) {
        var g = groupRects[gi]
        if (horiz) {
          if (y1 < g.y - 2 || y1 > g.y + g.h + 2) continue
          if (Math.abs(y1 - g.y) >= 13 && Math.abs(y1 - (g.y + g.h)) >= 13) continue
          var lx = Math.min(x1, x2), rx = Math.max(x1, x2)
          if (Math.min(rx, g.x + g.w) - Math.max(lx, g.x) > 36) return true
        } else {
          if (x1 < g.x - 2 || x1 > g.x + g.w + 2) continue
          if (Math.abs(x1 - g.x) >= 13 && Math.abs(x1 - (g.x + g.w)) >= 13) continue
          var ty = Math.min(y1, y2), by = Math.max(y1, y2)
          if (Math.min(by, g.y + g.h) - Math.max(ty, g.y) > 36) return true
        }
      }
      return false
    }
    var usedH = []
    var usedV = []
    function segOverlapsUsed(x1, y1, x2, y2) {
      var horiz = Math.abs(y1 - y2) < 0.6
      var vert = Math.abs(x1 - x2) < 0.6
      if (!horiz && !vert) return false
      if (horiz) {
        var y = y1, lx = Math.min(x1, x2), rx = Math.max(x1, x2)
        for (var i = 0; i < usedH.length; i++) {
          var u = usedH[i]
          if (Math.abs(u.y - y) < 0.6 && Math.min(rx, u.x2) - Math.max(lx, u.x1) > 20) return true
        }
      } else {
        var x = x1, ty = Math.min(y1, y2), by = Math.max(y1, y2)
        for (var j = 0; j < usedV.length; j++) {
          var v = usedV[j]
          if (Math.abs(v.x - x) < 0.6 && Math.min(by, v.y2) - Math.max(ty, v.y1) > 20) return true
        }
      }
      return false
    }
    function commitRoute(pts) {
      for (var i = 0; i < pts.length - 1; i++) {
        var x1 = pts[i].x, y1 = pts[i].y, x2 = pts[i + 1].x, y2 = pts[i + 1].y
        if (Math.abs(y1 - y2) < 0.6) usedH.push({ y: y1, x1: Math.min(x1, x2), x2: Math.max(x1, x2) })
        else if (Math.abs(x1 - x2) < 0.6) usedV.push({ x: x1, y1: Math.min(y1, y2), y2: Math.max(y1, y2) })
      }
    }
    function pathClear(pts, skipFrom, skipTo) {
      for (var i = 0; i < pts.length - 1; i++) {
        if (!segClear(pts[i].x, pts[i].y, pts[i + 1].x, pts[i + 1].y, skipFrom, skipTo)) return false
        if (segHugsGroup(pts[i].x, pts[i].y, pts[i + 1].x, pts[i + 1].y)) return false
      }
      return true
    }
    function clean(pts) {
      var out = []
      for (var i = 0; i < pts.length; i++) {
        var p = pts[i]
        var last = out[out.length - 1]
        if (last && Math.abs(p.x - last.x) < 0.5 && Math.abs(p.y - last.y) < 0.5) continue
        out.push({ x: p.x, y: p.y })
      }
      for (var j = 1; j < out.length - 1; j++) {
        var a = out[j - 1], b = out[j], c = out[j + 1]
        if ((Math.abs(a.x - b.x) < 0.5 && Math.abs(b.x - c.x) < 0.5) || (Math.abs(a.y - b.y) < 0.5 && Math.abs(b.y - c.y) < 0.5)) {
          out.splice(j, 1)
          j--
        }
      }
      return out
    }

    var allEdges = aggEdges.concat(exactEdges)
    var sideCount = {}, sideUsed = {}
    function sideOf(A, B) {
      var dx = B.cx - A.cx, dy = B.cy - A.cy
      var a, b
      if (Math.abs(dx) >= Math.abs(dy)) { a = dx >= 0 ? 'R' : 'L'; b = dx >= 0 ? 'L' : 'R' }
      else { a = dy >= 0 ? 'B' : 'T'; b = dy >= 0 ? 'T' : 'B' }
      return [a, b]
    }
    allEdges.forEach(function (e) {
      var A = byId[e.from], B = byId[e.to]
      if (!A || !B) return
      e.sides = sideOf(A, B)
      sideCount[e.from + e.sides[0]] = (sideCount[e.from + e.sides[0]] || 0) + 1
      sideCount[e.to + e.sides[1]] = (sideCount[e.to + e.sides[1]] || 0) + 1
    })
    function portOf(node, side, key, apiKey) {
      if (apiKey) {
        var ay = apiPortY(node, apiKey)
        return { x: side === 'R' ? node.x + node.w : node.x, y: ay, side: side, api: true }
      }
      sideUsed[key] = (sideUsed[key] || 0) + 1
      var total = sideCount[key] || 1
      var frac = sideUsed[key] / (total + 1)
      if (side === 'L' || side === 'R') {
        var y = node.y + 10 + (node.h - 20) * frac
        return { x: side === 'R' ? node.x + node.w : node.x, y: y, side: side, api: false }
      }
      var x = node.x + 10 + (node.w - 20) * frac
      return { x: x, y: side === 'B' ? node.y + node.h : node.y, side: side, api: false }
    }
    var hintList = (lay && lay.edge_hints) || []
    function hintFor(e) {
      for (var i = 0; i < hintList.length; i++) {
        var h = hintList[i]
        if (h.from === e.from && h.to === e.to && (h.kind === undefined || h.kind === e.kind)) return h
      }
      return null
    }
    var laneUse = {}
    var railTopUse = 0
    var railBotUse = 0
    var chanUse = {}
    var laneXUsed = {}
    var laneYUsed = {}
    function chanKey(base, key) { return key + ':' + Math.round(base / 4) }
    function chanLoad(base, key) {
      var used = chanUse[chanKey(base, key)]
      if (used === undefined) return 0
      var n = 0
      for (var k in used) n++
      return n
    }
    /**
     * 分配一条全局唯一的车道坐标：同一坐标（x 或 y）绝不会分配给两条边，
     * 从根本上避免"线压线"（共线重叠）。axis: 'x' 竖线 / 'y' 横线。
     */
    function laneAt(base, key, span, axis) {
      var ax = axis === undefined ? (key === 'v' || key === 'fc' || key === 'mh' ? 'x' : 'y') : axis
      var reg = ax === 'x' ? laneXUsed : laneYUsed
      var k = chanKey(base, key)
      var used = chanUse[k]
      if (used === undefined) { used = {}; chanUse[k] = used }
      var step = 9
      var max = Math.max(9, span === undefined ? 36 : span)
      var slots = Math.max(1, Math.floor((max * 2) / step) + 1)
      for (var i = 0; i < slots; i++) {
        var off = i === 0 ? 0 : (i % 2 === 1 ? 1 : -1) * step * Math.ceil(i / 2)
        if (Math.abs(off) > max || used[off] !== undefined) continue
        var pos = Math.round((base + off) * 10) / 10
        if (reg[pos] === undefined) { reg[pos] = key; used[off] = 1; return pos }
      }
      return null
    }
    function route(e, pa, pb) {
      var hint = hintFor(e)
      var lane = hint && typeof hint.lane === 'number' ? hint.lane : 0
      var a = pa.side, b = pb.side
      var cands = []
      var aVert = (a === 'T' || a === 'B'), bVert = (b === 'T' || b === 'B')
      if (aVert && bVert) {
        var midY2 = (pa.y + pb.y) / 2
        var midY1 = pa.y + (pb.y - pa.y) * 0.34
        var midY3 = pa.y + (pb.y - pa.y) * 0.66
        cands.push([pa, { x: pa.x, y: midY2 }, { x: pb.x, y: midY2 }, pb])
        cands.push([pa, { x: pa.x, y: midY1 }, { x: pb.x, y: midY1 }, pb])
        cands.push([pa, { x: pa.x, y: midY3 }, { x: pb.x, y: midY3 }, pb])
      }
      var midCx = (pa.x + pb.x) / 2, midCy = (pa.y + pb.y) / 2
      var vc = [], hc = []
      for (var ci = 0; ci < vchans.length; ci++) {
        var ch = vchans[ci]
        if ((ch.x - pa.x) * (ch.x - pb.x) <= 0 && Math.abs(ch.x - pa.x) > 6 && Math.abs(ch.x - pb.x) > 6) vc.push({ ch: ch, d: Math.abs(ch.x - midCx), load: chanLoad(ch.x, 'v') })
      }
      for (var yi = 0; yi < hchans.length; yi++) {
        var chh = hchans[yi]
        if ((chh.y - pa.y) * (chh.y - pb.y) <= 0 && Math.abs(chh.y - pa.y) > 6 && Math.abs(chh.y - pb.y) > 6) hc.push({ ch: chh, d: Math.abs(chh.y - midCy), load: chanLoad(chh.y, 'h') })
      }
      vc.sort(function (p1, p2) { return (p1.load - p2.load) || (p1.d - p2.d) })
      hc.sort(function (p1, p2) { return (p1.load - p2.load) || (p1.d - p2.d) })
      var vLimit = Math.min(vc.length, 8)
      for (var vi = 0; vi < vLimit; vi++) {
        var mvx = laneAt(vc[vi].ch.x, 'v', vc[vi].ch.span)
        if (mvx === null) continue
        cands.push([pa, { x: mvx, y: pa.y }, { x: mvx, y: pb.y }, pb])
      }
      var hLimit = Math.min(hc.length, 8)
      for (var hi2 = 0; hi2 < hLimit; hi2++) {
        var mhy = laneAt(hc[hi2].ch.y, 'h', hc[hi2].ch.span)
        if (mhy === null) continue
        cands.push([pa, { x: pa.x, y: mhy }, { x: pb.x, y: mhy }, pb])
      }
      if ((a === 'R' && b === 'L') || (a === 'L' && b === 'R')) {
        if (pa.x <= pb.x) {
          var mx0 = laneAt((pa.x + pb.x) / 2, 'mh', 40)
          var mx = mx0 === null ? (pa.x + pb.x) / 2 : mx0
          cands.push([pa, { x: mx, y: pa.y }, { x: mx, y: pb.y }, pb])
        } else {
          var outX = Math.max(pa.x, pb.x) + MARGIN * 0.8
          var outX2 = Math.min(pa.x, pb.x) - MARGIN * 0.8
          cands.push([pa, { x: outX, y: pa.y }, { x: outX, y: pb.y }, pb])
          cands.push([pa, { x: outX2, y: pa.y }, { x: outX2, y: pb.y }, pb])
        }
      } else if ((a === 'B' && b === 'T') || (a === 'T' && b === 'B')) {
        if (pa.y <= pb.y) {
          var my0 = laneAt((pa.y + pb.y) / 2, 'mv', 30)
          var my = my0 === null ? (pa.y + pb.y) / 2 : my0
          cands.push([pa, { x: pa.x, y: my }, { x: pb.x, y: my }, pb])
        } else {
          var outY = Math.max(pa.y, pb.y) + GY * 0.9
          var outY2 = Math.min(pa.y, pb.y) - GY * 0.9
          cands.push([pa, { x: pa.x, y: outY }, { x: pb.x, y: outY }, pb])
          cands.push([pa, { x: pa.x, y: outY2 }, { x: pb.x, y: outY2 }, pb])
        }
      } else {
        cands.push([pa, { x: pb.x, y: pa.y }, pb])
        cands.push([pa, { x: pa.x, y: pb.y }, pb])
        var cornerX = (a === 'R') ? Math.max(pa.x, pb.x) + MARGIN * 0.8 : Math.min(pa.x, pb.x) - MARGIN * 0.8
        cands.push([pa, { x: cornerX, y: pa.y }, { x: cornerX, y: pb.y }, pb])
      }
      function nearestHChan(v) {
        var best = null, bd = Infinity
        for (var hci = 0; hci < hchans.length; hci++) {
          var chh2 = hchans[hci]
          var dh = Math.abs(chh2.y - v) + chanLoad(chh2.y, 'h') * 6
          if (dh < bd) { bd = dh; best = chh2 }
        }
        return best
      }
      var hNearA = nearestHChan(pa.y)
      var hNearB = nearestHChan(pb.y)
      if (hNearA !== null) {
        var hAy = laneAt(hNearA.y, 'h', hNearA.span)
        if (hAy !== null) cands.push([pa, { x: pa.x, y: hAy }, { x: pb.x, y: hAy }, pb])
      }
      if (hNearB !== null) {
        var hBy = laneAt(hNearB.y, 'h', hNearB.span)
        if (hBy !== null) cands.push([pa, { x: pa.x, y: hBy }, { x: pb.x, y: hBy }, pb])
      }
      function nearestChan(arr, v, side) {
        var best = null, bd = Infinity
        for (var ci2 = 0; ci2 < arr.length; ci2++) {
          var ch2 = arr[ci2]
          if (side === 'R' && ch2.x < v + 6) continue
          if (side === 'L' && ch2.x > v - 6) continue
          var d2 = Math.abs(ch2.x - v) + chanLoad(ch2.x, 'v') * 6
          if (d2 < bd) { bd = d2; best = ch2 }
        }
        return best
      }
      var cands2 = []
      var chA = nearestChan(vchans, pa.x, pa.side === 'R' ? 'R' : pa.side === 'L' ? 'L' : undefined)
      var chB = nearestChan(vchans, pb.x, pb.side === 'L' ? 'L' : pb.side === 'R' ? 'R' : undefined)
      if (chA === null) chA = nearestChan(vchans, pa.x, undefined)
      if (chB === null) chB = nearestChan(vchans, pb.x, undefined)
      var preferTop = (pa.y + pb.y) / 2 < (TOP_PAD + maxY) / 2
      if (chA !== null && chB !== null) {
        var cAx0 = laneAt(chA.x, 'v', chA.span)
        var cBx0 = laneAt(chB.x, 'v', chB.span)
        var railY2 = laneAt(preferTop ? 8 : Math.round(maxY + 32), 'rail', 80, 'y')
        if (cAx0 !== null && cBx0 !== null && railY2 !== null) {
          cands2.push([pa, { x: cAx0, y: pa.y }, { x: cAx0, y: railY2 }, { x: cBx0, y: railY2 }, { x: cBx0, y: pb.y }, pb])
        }
      }
      function pickFreeCol(x, dir) {
        var best = null, bd = Infinity
        for (var pi2 = 0; pi2 < freeCols.length; pi2++) {
          var fc0 = freeCols[pi2]
          if (dir === 'L' && fc0.x > x - 4) continue
          if (dir === 'R' && fc0.x < x + 4) continue
          var dd = Math.abs(fc0.x - x)
          if (dd < bd) { bd = dd; best = fc0 }
        }
        return best
      }
      function pickFreeRow(y, dir) {
        var best = null, bd = Infinity
        for (var pi3 = 0; pi3 < freeRows.length; pi3++) {
          var fr0 = freeRows[pi3]
          if (dir === 'T' && fr0.y > y - 4) continue
          if (dir === 'B' && fr0.y < y + 4) continue
          var dd2 = Math.abs(fr0.y - y)
          if (dd2 < bd) { bd = dd2; best = fr0 }
        }
        return best
      }
      /** 在候选自由列中选一条仍有空车道的（按距离+负载排序），返回 {col, laneX} */
      function allocFreeCol(x, dir) {
        var list = []
        for (var ai = 0; ai < freeCols.length; ai++) {
          var fcA = freeCols[ai]
          if (dir === 'L' && fcA.x > x - 4) continue
          if (dir === 'R' && fcA.x < x + 4) continue
          list.push({ col: fcA, score: Math.abs(fcA.x - x) + chanLoad(fcA.x, 'fc') * 10 })
        }
        list.sort(function (u, v) { return u.score - v.score })
        for (var ai2 = 0; ai2 < list.length; ai2++) {
          var lane = laneAt(list[ai2].col.x, 'fc', list[ai2].col.span)
          if (lane !== null) return { col: list[ai2].col, laneX: lane }
        }
        return null
      }
      function allocFreeRow(y) {
        var list = []
        for (var ri = 0; ri < freeRows.length; ri++) {
          list.push({ row: freeRows[ri], score: Math.abs(freeRows[ri].y - y) + chanLoad(freeRows[ri].y, 'fr') * 10 })
        }
        list.sort(function (u, v) { return u.score - v.score })
        for (var ri2 = 0; ri2 < list.length; ri2++) {
          var lane = laneAt(list[ri2].row.y, 'fr', list[ri2].row.span)
          if (lane !== null) return { row: list[ri2].row, laneY: lane }
        }
        return null
      }
      function busEntry(port) {
        if (port.side === 'L' || port.side === 'R') {
          var ac = allocFreeCol(port.x, port.side)
          if (ac === null) ac = allocFreeCol(port.x, undefined)
          return ac === null ? null : { col: ac.col, laneX: ac.laneX, row: null }
        }
        var ar = allocFreeRow(port.side === 'T' ? port.y + 6 : port.y - 6)
        if (ar === null) return null
        var ac2 = allocFreeCol(port.x, undefined)
        if (ac2 === null) return null
        return { col: ac2.col, laneX: ac2.laneX, row: ar.row, rowY: ar.laneY }
      }
      var eA = busEntry(pa), eB = busEntry(pb)
      if (eA !== null && eB !== null) {
        var midTarget = (pa.y + pb.y) / 2
        var rowOrder = freeRows.slice().sort(function (u, v) {
          return (Math.abs(u.y - midTarget) + chanLoad(u.y, 'fr') * 4) - (Math.abs(v.y - midTarget) + chanLoad(v.y, 'fr') * 4)
        })
        var built = 0
        for (var ri3 = 0; ri3 < rowOrder.length && built < 4; ri3++) {
          var gY = laneAt(rowOrder[ri3].y, 'fr', rowOrder[ri3].span)
          if (gY === null) continue
          var gxA = eA.laneX
          var gxB = eB.laneX
          var gpts = [{ x: pa.x, y: pa.y }]
          if (eA.row === null) gpts.push({ x: gxA, y: pa.y })
          else { gpts.push({ x: pa.x, y: eA.rowY }); gpts.push({ x: gxA, y: eA.rowY }) }
          gpts.push({ x: gxA, y: gY })
          gpts.push({ x: gxB, y: gY })
          if (eB.row === null) { gpts.push({ x: gxB, y: pb.y }); gpts.push({ x: pb.x, y: pb.y }) }
          else { gpts.push({ x: gxB, y: eB.rowY }); gpts.push({ x: pb.x, y: eB.rowY }); gpts.push({ x: pb.x, y: pb.y }) }
          cands2.push(gpts)
          built++
        }
      }
      var ordered = cands2.concat(cands)
      for (var oi = 0; oi < ordered.length; oi++) {
        var opts = clean(ordered[oi])
        var okp = pathClear(opts, e.from, e.to)
        if (okp) return { pts: opts, hint: hint, fallback: e.agg }
      }
      function violations(pts) {
        var v = 0
        for (var si = 0; si < pts.length - 1; si++) {
          for (var ri = 0; ri < rects.length; ri++) {
            var rn = nodes[ri]
            if (rn.id === e.from || rn.id === e.to) continue
            if (!segClear(pts[si].x, pts[si].y, pts[si + 1].x, pts[si + 1].y, e.from, e.to)) v++
          }
          if (segHugsGroup(pts[si].x, pts[si].y, pts[si + 1].x, pts[si + 1].y)) v += 2
          if (segOverlapsUsed(pts[si].x, pts[si].y, pts[si + 1].x, pts[si + 1].y)) v += 3
        }
        return v
      }
      var bestPts = clean(ordered[ordered.length - 1]), bestV = Infinity
      for (var pi = 0; pi < ordered.length; pi++) {
        var cp = clean(ordered[pi])
        var v1 = violations(cp)
        if (v1 < bestV) { bestV = v1; bestPts = cp }
      }
      return { pts: bestPts, hint: hint, fallback: true }
    }
    function roundedPath(pts, r) {
      if (pts.length < 2) return ''
      var d = 'M ' + pts[0].x + ' ' + pts[0].y
      for (var i = 1; i < pts.length - 1; i++) {
        var p0 = pts[i - 1], p1 = pts[i], p2 = pts[i + 1]
        var d1 = Math.sqrt((p1.x - p0.x) * (p1.x - p0.x) + (p1.y - p0.y) * (p1.y - p0.y))
        var d2 = Math.sqrt((p2.x - p1.x) * (p2.x - p1.x) + (p2.y - p1.y) * (p2.y - p1.y))
        var rr = Math.min(r, d1 / 2 - 0.5, d2 / 2 - 0.5)
        if (rr < 3) { d += ' L ' + p1.x + ' ' + p1.y; continue }
        var ax = p1.x - (p1.x - p0.x) * rr / d1
        var ay = p1.y - (p1.y - p0.y) * rr / d1
        var bx = p1.x + (p2.x - p1.x) * rr / d2
        var by = p1.y + (p2.y - p1.y) * rr / d2
        d += ' L ' + ax + ' ' + ay + ' Q ' + p1.x + ' ' + p1.y + ' ' + bx + ' ' + by
      }
      var last = pts[pts.length - 1]
      d += ' L ' + last.x + ' ' + last.y
      return d
    }
    function arrowPoints(tip, prev) {
      var dx = tip.x - prev.x, dy = tip.y - prev.y
      var len = Math.sqrt(dx * dx + dy * dy) || 1
      var c = dx / len, s = dy / len
      var bx = tip.x - 9 * c, by = tip.y - 9 * s
      var px = -s * 4.5, py = c * 4.5
      return tip.x + ',' + tip.y + ' ' + (bx + px) + ',' + (by + py) + ' ' + (bx - px) + ',' + (by - py)
    }

    var svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
    svg.setAttribute('class', 'diagram')
    svg.setAttribute('preserveAspectRatio', 'xMidYMid meet')

    blocks.forEach(function (b) {
      if (!b.title) return
      var bg = document.createElementNS('http://www.w3.org/2000/svg', 'rect')
      bg.setAttribute('x', b.offsetX - GPAD)
      bg.setAttribute('y', b.offsetY - GTITLE - GPAD + 6)
      bg.setAttribute('width', b.w + GPAD * 2)
      bg.setAttribute('height', b.h + GTITLE + GPAD * 2 - 6)
      bg.setAttribute('rx', 12)
      bg.setAttribute('class', 'group-box')
      svg.appendChild(bg)
      var gt = document.createElementNS('http://www.w3.org/2000/svg', 'text')
      gt.setAttribute('x', b.offsetX - GPAD + 4)
      gt.setAttribute('y', b.offsetY - 10)
      gt.setAttribute('class', 'group-title')
      gt.textContent = L(b.title)
      svg.appendChild(gt)
    })

    var drawn = []
    var labelBudget = {}
    var placedLabels = []
    var bounds = { minX: 0, minY: 0, maxX: W, maxY: H }
    function extend(x, y) {
      if (typeof x !== 'number' || typeof y !== 'number' || !isFinite(x) || !isFinite(y)) return
      if (x < bounds.minX) bounds.minX = x
      if (y < bounds.minY) bounds.minY = y
      if (x > bounds.maxX) bounds.maxX = x
      if (y > bounds.maxY) bounds.maxY = y
    }
    function labelPos(pts, text, skipFrom, skipTo) {
      var w = estWidth(text, 10)
      var best = null, bestLen = -1
      for (var i = 0; i < pts.length - 1; i++) {
        var p0 = pts[i], p1 = pts[i + 1]
        var dx = p1.x - p0.x, dy = p1.y - p0.y
        var len = Math.sqrt(dx * dx + dy * dy)
        if (len < 30) continue
        var horiz = Math.abs(dx) > Math.abs(dy)
        var mx = (p0.x + p1.x) / 2, my = (p0.y + p1.y) / 2
        var lx = mx - w / 2 - 4, ly = horiz ? my - 14 : my - 5, lw = w + 8, lh = 12
        var ok = true
        for (var r = 0; r < rects.length; r++) {
          var n = nodes[r]
          if (n.id === skipFrom || n.id === skipTo) continue
          var b2 = rects[r]
          if (lx + lw > b2.x + 3 && lx < b2.x + b2.w - 3 && ly + lh > b2.y + 3 && ly < b2.y + b2.h - 3) { ok = false; break }
        }
        for (var pl = 0; pl < placedLabels.length; pl++) {
          var b3 = placedLabels[pl]
          if (lx + lw > b3.x && lx < b3.x + b3.w && ly + lh > b3.y && ly < b3.y + b3.h) { ok = false; break }
        }
        if (ok && len > bestLen) { bestLen = len; best = { x: mx, y: horiz ? my - 9 : my, len: len, rect: { x: lx, y: ly, w: lw, h: lh } } }
      }
      if (best !== null && best.rect !== undefined) placedLabels.push(best.rect)
      return best
    }
    function drawEdge(e, pa, pb, r) {
      var pts = r.pts
      var path = document.createElementNS('http://www.w3.org/2000/svg', 'path')
      path.setAttribute('d', roundedPath(pts, (r.hint && r.hint.style === 'curve') || e.agg ? 16 : 10))
      path.setAttribute('class', 'edge kind-' + (e.kind || 'reference') + (e.cross_tree ? ' cross' : '') + (e.agg ? ' agg' : ''))
      path.setAttribute('data-from', e.from)
      path.setAttribute('data-to', e.to)
      var tip = pts[pts.length - 1], prev = pts[pts.length - 2] || pa
      var entry = { path: path, arrow: mk, label: null, from: e.from, to: e.to }
      var title = document.createElementNS('http://www.w3.org/2000/svg', 'title')
      title.textContent = e.agg
        ? '聚合 ' + e.count + ' 条依赖：\\n' + e.samples.join('\\n')
        : e.from + (e.from_api ? ' [' + e.from_api + ']' : '') + ' -> ' + e.to + (e.to_api ? ' [' + e.to_api + ']' : '') + ' (' + e.kind + ')'
      path.appendChild(title)
      svg.appendChild(path)
      var mk = document.createElementNS('http://www.w3.org/2000/svg', 'polygon')
      mk.setAttribute('points', arrowPoints(tip, prev))
      mk.setAttribute('class', 'arrow kind-' + (e.kind || 'reference') + (e.cross_tree ? ' cross' : '') + (e.agg ? ' agg' : ''))
      svg.appendChild(mk)
      var text = e.agg ? ('×' + e.count) : (e.label ? L(e.label) : e.kind)
      var budget = labelBudget[text] || 0
      var lp = budget < 2 ? labelPos(pts, text, e.from, e.to) : null
      if (lp) {
        labelBudget[text] = budget + 1
        var t = document.createElementNS('http://www.w3.org/2000/svg', 'text')
        t.setAttribute('x', lp.x)
        t.setAttribute('y', lp.y)
        t.setAttribute('text-anchor', 'middle')
        t.setAttribute('class', 'edge-label' + (e.agg ? ' agg' : ''))
        t.setAttribute('style', 'paint-order: stroke; stroke: var(--bg); stroke-width: 4px; stroke-linejoin: round;')
        t.textContent = text
        svg.appendChild(t)
        entry.label = t
        extend(lp.x - 30, lp.y - 10)
        extend(lp.x + 30, lp.y + 12)
      }
      for (var i = 0; i < pts.length; i++) extend(pts[i].x, pts[i].y)
      commitRoute(pts)
      drawn.push(entry)
    }

    // 先画精确边（API 直连，优先占用干净通道），再画聚合边（虚线、更轻）
    exactEdges.forEach(function (e) {
      var A = byId[e.from], B = byId[e.to]
      if (!A || !B) return
      var pa = portOf(A, e.sides[0], e.from + e.sides[0], e.from_api)
      var pb = portOf(B, e.sides[1], e.to + e.sides[1], e.to_api)
      drawEdge(e, pa, pb, route(e, pa, pb))
    })
    aggEdges.forEach(function (e) {
      var A = byId[e.from], B = byId[e.to]
      if (!A || !B) return
      var pa = portOf(A, e.sides[0], e.from + e.sides[0], null)
      var pb = portOf(B, e.sides[1], e.to + e.sides[1], null)
      drawEdge(e, pa, pb, route(e, pa, pb))
    })

    var nodeGroups = []
    nodes.forEach(function (n) {
      var km = mods[n.id]
      var g = document.createElementNS('http://www.w3.org/2000/svg', 'g')
      g.setAttribute('class', 'node-g')
      g.setAttribute('data-id', n.id)
      var rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect')
      rect.setAttribute('x', n.x); rect.setAttribute('y', n.y)
      rect.setAttribute('width', n.w); rect.setAttribute('height', n.h)
      rect.setAttribute('rx', 9)
      rect.setAttribute('data-id', n.id)
      rect.setAttribute('class', 'node' + (children[n.id] ? '' : ' leaf') + (km.state ? ' state-' + km.state : ''))
      g.appendChild(rect)
      var rows = apiRows(n.id)
      var nameH = rows.length > 0 ? 36 : n.h
      var fit = fitName(L(km.name), n.w - 14)
      var lh = fit.fs * 1.28
      var y0 = n.y + nameH / 2 - (fit.lines.length - 1) * lh / 2
      for (var li = 0; li < fit.lines.length; li++) {
        var t = document.createElementNS('http://www.w3.org/2000/svg', 'text')
        t.setAttribute('x', n.cx)
        t.setAttribute('y', y0 + li * lh)
        t.setAttribute('font-size', fit.fs)
        t.setAttribute('text-anchor', 'middle')
        t.setAttribute('dominant-baseline', 'middle')
        t.setAttribute('class', 'node-name')
        t.textContent = fit.lines[li]
        g.appendChild(t)
      }
      if (rows.length > 0) {
        var sep = document.createElementNS('http://www.w3.org/2000/svg', 'line')
        sep.setAttribute('x1', n.x + 8); sep.setAttribute('x2', n.x + n.w - 8)
        sep.setAttribute('y1', n.y + 36); sep.setAttribute('y2', n.y + 36)
        sep.setAttribute('class', 'api-sep')
        g.appendChild(sep)
        rows.forEach(function (a, ai) {
          var at = document.createElementNS('http://www.w3.org/2000/svg', 'text')
          at.setAttribute('x', n.x + 9)
          at.setAttribute('y', n.y + 36 + ai * 13 + 9)
          at.setAttribute('class', 'api-chip')
          at.textContent = clipText(String(a.key || a.protocol + ':' + a.path), n.w - 24, 9)
          g.appendChild(at)
        })
        var total = (km.apis || []).length
        if (total > rows.length) {
          var more = document.createElementNS('http://www.w3.org/2000/svg', 'text')
          more.setAttribute('x', n.x + n.w - 9)
          more.setAttribute('y', n.y + n.h - 4)
          more.setAttribute('text-anchor', 'end')
          more.setAttribute('class', 'api-more')
          more.textContent = '+' + (total - rows.length)
          g.appendChild(more)
        }
      }
      if (km.state === 'planned' || km.state === 'deprecated') {
        var badge = document.createElementNS('http://www.w3.org/2000/svg', 'text')
        badge.setAttribute('x', n.x + n.w - 6)
        badge.setAttribute('y', n.y + 12)
        badge.setAttribute('text-anchor', 'end')
        badge.setAttribute('class', 'state-badge state-' + km.state)
        badge.textContent = km.state === 'planned' ? (lang === 'zh' ? '计划' : 'planned') : (lang === 'zh' ? '废弃' : 'deprecated')
        g.appendChild(badge)
      }
      g.onclick = function () { goto('#module=' + encodeURIComponent(n.id)) }
      g.onmouseenter = function () {
        showTip(g, km)
        drawn.forEach(function (d) {
          var hit = d.from === n.id || d.to === n.id
          ;[d.path, d.arrow].forEach(function (el2) { el2.classList.toggle('hl', hit); el2.classList.toggle('dim', !hit) })
          if (d.label) d.label.classList.toggle('dim', !hit)
        })
      }
      g.onmouseleave = function () {
        hideTip()
        drawn.forEach(function (d) {
          ;[d.path, d.arrow].forEach(function (el2) { el2.classList.remove('hl'); el2.classList.remove('dim') })
          if (d.label) d.label.classList.remove('dim')
        })
      }
      svg.appendChild(g)
      nodeGroups.push(g)
      extend(n.x, n.y)
      extend(n.x + n.w, n.y + n.h)
    })

    var PADB = 28
    var vbW = Math.max(320, bounds.maxX - bounds.minX + PADB * 2)
    var vbH = Math.max(240, bounds.maxY - bounds.minY + PADB * 2)
    svg.setAttribute('viewBox', (bounds.minX - PADB) + ' ' + (bounds.minY - PADB) + ' ' + vbW + ' ' + vbH)
    svg.setAttribute('width', vbW)
    svg.setAttribute('height', vbH)

    var wrap = el('div', 'diagram-wrap')
    wrap.appendChild(svg)
    main.appendChild(wrap)

    var zoomSteps = [0, 1, 1.5, 2, 3]
    var zi = (vbW > wrap.clientWidth + 20) ? 1 : 0
    var ziLabel = el('span', 'zoom-label')
    function applyZoom() {
      var s = zoomSteps[zi]
      if (s === 0) { svg.style.width = '100%'; svg.style.maxWidth = '100%' } else { svg.style.width = Math.round(vbW * s) + 'px'; svg.style.maxWidth = 'none' }
      svg.style.height = 'auto'
      ziLabel.textContent = s === 0 ? (lang === 'zh' ? '适应' : 'Fit') : Math.round(s * 100) + '%'
    }
    var tools = el('div', 'diagram-tools')
    var minus = el('button', 'zoom-btn', '−')
    minus.onclick = function () { zi = Math.max(0, zi - 1); applyZoom() }
    var fitBtn = el('button', 'zoom-btn', lang === 'zh' ? '适应' : 'Fit')
    fitBtn.onclick = function () { zi = 0; applyZoom() }
    var plus = el('button', 'zoom-btn', '+')
    plus.onclick = function () { zi = Math.min(zoomSteps.length - 1, zi + 1); applyZoom() }
    tools.appendChild(minus); tools.appendChild(fitBtn); tools.appendChild(plus); tools.appendChild(ziLabel)
    if (aggEdges.length > 0) {
      var aggBtn = el('button', 'zoom-btn' + ' agg-toggle', (lang === 'zh' ? '显示跨层聚合 ×' + aggEdges.length : 'Show ' + aggEdges.length + ' cross-level')) 
      aggBtn.onclick = function () {
        var hidden = svg.classList.toggle('hide-agg')
        aggBtn.classList.toggle('on', !hidden)
      }
      if (!/[?&]agg=1/.test(location.search)) svg.classList.add('hide-agg')
      tools.appendChild(aggBtn)
      var aggInfo = el('span', 'hint', lang === 'zh' ? '（虚线 = 跨层聚合 ×N，默认隐藏，可点左侧按钮显示；悬停看明细）' : '(dashed = cross-level aggregate; hidden by default)')
      tools.appendChild(aggInfo)
    }
    main.appendChild(tools)
    applyZoom()

    var bar = el('div', 'legendbar')
    bar.innerHTML = '<span class="hint">连线：</span>'
      + '<span class="chip"><span class="swatch kind-call"></span>call</span>'
      + '<span class="chip"><span class="swatch kind-event"></span>event</span>'
      + '<span class="chip"><span class="swatch kind-dataflow"></span>dataflow</span>'
      + '<span class="chip"><span class="swatch kind-reference"></span>reference</span>'
      + '<span class="chip"><span class="swatch cross"></span>跨树</span>'
      + '<span class="chip"><span class="swatch agg"></span>' + esc(lang === 'zh' ? '跨层聚合' : 'aggregate') + '</span>'
      + '<span class="chip">' + esc(lang === 'zh' ? '悬停模块可高亮其连线；虚线边悬停可看明细' : 'Hover a module to highlight its edges; hover dashed edges for details') + '</span>'
      + '<span class="chip"><span class="swatch" style="border-color: var(--accent); border-top-style: dashed"></span>' + esc(lang === 'zh' ? '计划态' : 'planned') + '</span>'
      + '<span class="chip"><span class="swatch" style="border-color: var(--danger); border-top-style: dotted"></span>' + esc(lang === 'zh' ? '已废弃' : 'deprecated') + '</span>'
    main.appendChild(bar)
  }

  /** 文本截断（保持单行，超长加省略号）。 */
  function clipText(s, maxW, fs) {
    var t = String(s)
    if (estWidth(t, fs) <= maxW) return t
    while (t.length > 1 && estWidth(t + '…', fs) > maxW) t = t.slice(0, -1)
    return t + '…'
  }

  function renderCrossEdges(main, m, kids) {
    var kidsSet = {}
    kids.forEach(function (id) { kidsSet[id] = true })
    var outs = [], ins = []
    kids.forEach(function (id) {
      var km = mods[id]
      ;(km.deps || []).forEach(function (d) {
        if (!kidsSet[d.to]) outs.push({ from: id, dep: d })
      })
      ;(depIn[id] || []).forEach(function (e) {
        if (!kidsSet[e.from]) ins.push({ to: id, edge: e })
      })
    })
    var box = el('div', 'crosslist')
    box.appendChild(el('h3', null, '跨层箭头'))
    if (outs.length === 0 && ins.length === 0) {
      box.appendChild(el('div', 'hint', '本层没有指向外部或来自外部的箭头'))
    }
    outs.forEach(function (o) {
      var row = el('div', 'row')
      row.innerHTML = esc(o.from) + ' → ' + linkTo(o.dep.to)
        + ' <span class="hint">(' + esc(o.dep.kind) + (o.dep.label ? ' · ' + esc(L(o.dep.label)) : '') + ')</span>'
        + (o.dep.cross_tree ? '<span class="badge">跨树</span>' : '')
      box.appendChild(row)
    })
    ins.forEach(function (o) {
      var row = el('div', 'row')
      row.innerHTML = esc(o.to) + ' ← ' + linkTo(o.edge.from)
        + ' <span class="hint">(' + esc(o.edge.kind) + (o.edge.label ? ' · ' + esc(L(o.edge.label)) : '') + ')</span>'
        + (o.edge.cross_tree ? '<span class="badge">跨树</span>' : '')
      box.appendChild(row)
    })
    main.appendChild(box)
  }

  function renderInheritedApis(main, m) {
    var kids = children[m.id] || []
    var total = m.aggregate.own_api_count + m.aggregate.inherited_api_count
    var box = el('div', 'section')
    box.appendChild(el('h2', null, 'API（' + total + '）'))
    if (total === 0) { box.appendChild(el('div', 'hint', '本模块及其子树未定义 API')); main.appendChild(box); return }
    var list = el('ul', 'api-list')
    if (m.apis && m.apis.length > 0) {
      m.apis.forEach(function (a) { list.appendChild(apiItem(a)) })
    }
    box.appendChild(list)
    kids.forEach(function (id) {
      box.appendChild(apiGroup(id, 0))
    })
    main.appendChild(box)
  }

  function apiGroup(id, depth) {
    var km = mods[id]
    var own = (km.apis || []).length
    var below = km.aggregate.inherited_api_count
    var total = own + below
    var det = document.createElement('details')
    det.className = 'api-group'
    if (depth === 0) det.setAttribute('open', '')
    var sum = document.createElement('summary')
    sum.innerHTML = esc(L(km.name)) + ' <span class="cnt">' + esc(id) + ' · ' + total + '</span>'
    det.appendChild(sum)
    var inner = document.createElement('div')
    var ul = document.createElement('ul')
    ul.className = 'api-list'
    ;(km.apis || []).forEach(function (a) { ul.appendChild(apiItem(a)) })
    inner.appendChild(ul)
    var kids = children[id] || []
    kids.forEach(function (cid) { inner.appendChild(apiGroup(cid, depth + 1)) })
    det.appendChild(inner)
    return det
  }

  function apiItem(a) {
    var li = document.createElement('li')
    li.innerHTML = '<span class="key">' + esc(a.key || a.protocol + ':' + a.path) + '</span>'
      + '<span class="desc">' + esc(L(a.description)) + '</span>'
    return li
  }

  function renderLeafDetail(main, m) {
    var box = el('div', 'section')
    box.appendChild(el('h2', null, 'API（' + (m.apis || []).length + '）'))
    if (!m.apis || m.apis.length === 0) box.appendChild(el('div', 'hint', '该叶子模块未定义 API（无接口的功能单元）'))
    else {
      var ul = el('ul', 'api-list')
      m.apis.forEach(function (a) { ul.appendChild(apiItem(a)) })
      box.appendChild(ul)
    }
    var outs = m.deps || []
    box.appendChild(el('h3', null, '出向箭头（' + outs.length + '）'))
    outs.forEach(function (d) {
      var row = el('div', 'row')
      row.innerHTML = '→ ' + linkTo(d.to) + ' <span class="hint">(' + esc(d.kind) + (d.label ? ' · ' + esc(L(d.label)) : '') + ')</span>' + (d.cross_tree ? '<span class="badge">跨树</span>' : '')
      box.appendChild(row)
    })
    var ins = depIn[m.id] || []
    box.appendChild(el('h3', null, '入向箭头（' + ins.length + '）'))
    ins.forEach(function (e) {
      var row = el('div', 'row')
      row.innerHTML = '← ' + linkTo(e.from) + ' <span class="hint">(' + esc(e.kind) + (e.label ? ' · ' + esc(L(e.label)) : '') + ')</span>' + (e.cross_tree ? '<span class="badge">跨树</span>' : '')
      box.appendChild(row)
    })
    main.appendChild(box)
  }

  function renderOutline(main) {
    var box = el('div', 'section')
    box.appendChild(el('h2', null, '大纲（' + roots.length + ' 棵树 · ' + stats.module_count + ' 模块）'))
    var wrap = el('div', 'outline')
    var ul = document.createElement('ul')
    roots.forEach(function (id) { ul.appendChild(outlineItem(id)) })
    wrap.appendChild(ul)
    box.appendChild(wrap)
    main.appendChild(box)
  }

  function outlineItem(id) {
    var m = mods[id]
    var li = document.createElement('li')
    var a = document.createElement('a')
    a.href = '#module=' + encodeURIComponent(id)
    a.textContent = L(m.name) + ' — ' + id
    li.appendChild(a)
    li.appendChild(document.createTextNode(' '))
    var s = document.createElement('span')
    s.className = 'stat'
    s.textContent = '[模块 ' + (m.aggregate.descendant_count + 1) + ' · API ' + (m.aggregate.own_api_count + m.aggregate.inherited_api_count) + ']'
    li.appendChild(s)
    var kids = children[id] || []
    if (kids.length > 0) {
      var ul = document.createElement('ul')
      kids.forEach(function (k) { ul.appendChild(outlineItem(k)) })
      li.appendChild(ul)
    }
    return li
  }

  function renderApis(main) {
    var box = el('div', 'section')
    box.appendChild(el('h2', null, 'API 浏览器（' + Object.keys(apiIndex).length + '）'))
    var input = document.createElement('input')
    input.id = 'apiFilter'
    input.placeholder = '过滤（method / path / protocol）'
    input.style.cssText = 'width:100%;padding:6px 8px;background:var(--panel2);border:1px solid var(--border);color:var(--text);border-radius:6px;margin-bottom:8px;'
    box.appendChild(input)
    var table = document.createElement('table')
    var keys = Object.keys(apiIndex).sort()
    var MAX = 400
    function draw(filter) {
      table.innerHTML = '<tr><th>API</th><th>归属模块</th></tr>'
      var shown = 0
      for (var i = 0; i < keys.length && shown < MAX; i++) {
        var k = keys[i]
        if (filter && k.toLowerCase().indexOf(filter) === -1 && mods[apiIndex[k]].id.toLowerCase().indexOf(filter) === -1) continue
        var tr = document.createElement('tr')
        var td1 = document.createElement('td')
        var a1 = document.createElement('a')
        a1.href = '#api=' + encodeURIComponent(k)
        a1.textContent = k
        td1.appendChild(a1)
        var td2 = document.createElement('td')
        var a2 = document.createElement('a')
        a2.href = '#module=' + encodeURIComponent(apiIndex[k])
        a2.textContent = apiIndex[k]
        td2.appendChild(a2)
        tr.appendChild(td1); tr.appendChild(td2)
        table.appendChild(tr)
        shown++
      }
      if (shown >= MAX) {
        var tr = document.createElement('tr')
        var td = document.createElement('td')
        td.colSpan = 2
        td.className = 'hint'
        td.textContent = '已显示前 ' + MAX + ' 条，请用过滤缩小范围'
        tr.appendChild(td)
        table.appendChild(tr)
      }
    }
    draw('')
    input.oninput = function () { draw(input.value.trim().toLowerCase()) }
    box.appendChild(table)
    main.appendChild(box)
  }

  function highlightApi() {
    var key = current.apiKey
    var nodes = document.querySelectorAll('.key')
    for (var i = 0; i < nodes.length; i++) {
      if (nodes[i].textContent === key) {
        nodes[i].scrollIntoView({ block: 'center' })
        nodes[i].style.outline = '2px solid var(--accent)'
      }
    }
  }

  function linkTo(id) {
    return '<a href="#module=' + encodeURIComponent(id) + '">' + esc(id) + '</a>'
  }
  function oneLine(s, max) { var l = (s || '').split('\\n')[0]; return l.length > max ? l.slice(0, max) + '…' : l }
  function el(tag, cls, html) { var d = document.createElement(tag); if (cls) d.className = cls; if (html !== undefined) d.innerHTML = html; return d }

  var tip = document.getElementById('tooltip')
  var tipTimer = null
  function showTip(anchor, m) {
    tipTimer = setTimeout(function () {
      tip.innerHTML = '<div class="t-name">' + esc(L(m.name)) + ' <span class="hint">' + esc(m.id) + '</span></div>'
        + '<div class="t-desc">' + esc(L(m.description)) + '</div>'
        + '<div class="t-meta">' + (m.state ? (m.state === 'planned' ? '计划态 · ' : m.state === 'deprecated' ? '已废弃 · ' : '') : '') + '模块 ' + (m.aggregate.descendant_count + 1) + ' · API ' + (m.aggregate.own_api_count + m.aggregate.inherited_api_count) + '</div>'
      tip.style.display = 'block'
    }, 250)
    document.addEventListener('mousemove', moveTip)
    var r = anchor.getBoundingClientRect()
    moveTip({ clientX: r.right + 8, clientY: r.top })
  }
  function moveTip(e) {
    var pad = 12
    var w = tip.offsetWidth || 280
    var x = Math.min(e.clientX + pad, window.innerWidth - w - 8)
    var y = e.clientY + pad
    if (y + 120 > window.innerHeight) y = e.clientY - 140
    tip.style.left = x + 'px'
    tip.style.top = y + 'px'
  }
  function hideTip() {
    clearTimeout(tipTimer)
    tip.style.display = 'none'
    document.removeEventListener('mousemove', moveTip)
  }

  var input = document.getElementById('searchInput')
  var drop = document.getElementById('searchDrop')
  var searchTimer = null
  input.addEventListener('input', function () {
    clearTimeout(searchTimer)
    searchTimer = setTimeout(function () {
      var q = input.value.trim().toLowerCase()
      drop.innerHTML = ''
      if (!q) { drop.classList.remove('open'); return }
      var hits = []
      for (var i = 0; i < corpus.length && hits.length < 20; i++) {
        if (corpus[i].text.indexOf(q) >= 0) hits.push(corpus[i])
      }
      hits.forEach(function (h) {
        var item = el('div', 'item')
        if (h.kind === 'module') {
          item.innerHTML = esc(h.id) + '<div class="sub">模块</div>'
          item.onclick = function () { input.value = ''; drop.classList.remove('open'); goto('#module=' + encodeURIComponent(h.id)) }
        } else {
          item.innerHTML = esc(h.id) + '<div class="sub">API · ' + esc(h.moduleId) + '</div>'
          item.onclick = function () { input.value = ''; drop.classList.remove('open'); goto('#api=' + encodeURIComponent(h.id)) }
        }
        drop.appendChild(item)
      })
      drop.classList.add('open')
    }, 150)
  })
  document.addEventListener('click', function (e) {
    if (e.target !== input && e.target !== drop) drop.classList.remove('open')
  })

  document.getElementById('btnLang').addEventListener('click', function () {
    lang = lang === 'zh' ? 'en' : 'zh'
    try { localStorage.setItem('normify-lang', lang) } catch (e) {}
    render()
  })
  document.getElementById('btnTheme').addEventListener('click', function () {
    var t = document.documentElement.getAttribute('data-theme') === 'light' ? 'dark' : 'light'
    document.documentElement.setAttribute('data-theme', t)
    try { localStorage.setItem('normify-theme', t) } catch (e) {}
  })
  document.getElementById('btnOutline').addEventListener('click', function () { goto('#view=outline') })
  document.getElementById('btnApis').addEventListener('click', function () { goto('#view=apis') })
  window.addEventListener('hashchange', function () { current = parseHash(); render() })

  initTheme()
  render()
})()
</script>
</body>
</html>
`;
}
//# sourceMappingURL=template.js.map