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
      + '<div class="meta"><span>模块 ' + (m.aggregate.descendant_count + 1) + '</span><span>API ' + (m.aggregate.own_api_count + m.aggregate.inherited_api_count) + '</span><span>出边 ' + m.aggregate.dep_out + '</span><span>入边 ' + m.aggregate.dep_in + '</span>'
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

  function renderDiagram(main, m, kids) {
    var svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
    svg.setAttribute('class', 'diagram')
    var boxW = 150, boxH = 54, gapX = 64, gapY = 50, margin = 38
    var cols = Math.min(4, Math.max(1, Math.ceil(Math.sqrt(kids.length))))
    var rows = Math.ceil(kids.length / cols)
    var W = margin * 2 + cols * boxW + (cols - 1) * gapX
    var H = margin * 2 + rows * boxH + (rows - 1) * gapY
    svg.setAttribute('viewBox', '0 0 ' + W + ' ' + H)

    var nodes = []
    kids.forEach(function (id, i) {
      var col = i % cols, row = Math.floor(i / cols)
      var x = margin + col * (boxW + gapX), y = margin + row * (boxH + gapY)
      nodes.push({ id: id, col: col, row: row, x: x, y: y, w: boxW, h: boxH, cx: x + boxW / 2, cy: y + boxH / 2 })
    })
    var rects = nodes.map(function (n) { return { x: n.x, y: n.y, w: n.w, h: n.h } })
    var byId = {}
    nodes.forEach(function (n) { byId[n.id] = n })
    var kidsSet = {}
    kids.forEach(function (id) { kidsSet[id] = true })
    var laneUse = {}
    var idxOf = {}
    nodes.forEach(function (n, i) { idxOf[n.id] = i })

    function colGapX(col) { return margin + col * (boxW + gapX) - gapX / 2 }
    function rowGapY(row) { return margin + row * (boxH + gapY) - gapY / 2 }
    function segClear(x1, y1, x2, y2, skipA, skipB) {
      var minX = Math.min(x1, x2), maxX = Math.max(x1, x2)
      var minY = Math.min(y1, y2), maxY = Math.max(y1, y2)
      for (var i = 0; i < rects.length; i++) {
        if (i === skipA || i === skipB) continue
        var r = rects[i]
        if (maxX <= r.x + 4 || minX >= r.x + r.w - 4) continue
        if (maxY <= r.y + 4 || minY >= r.y + r.h - 4) continue
        return false
      }
      return true
    }
    function pathClear(pts, skipA, skipB) {
      for (var i = 0; i < pts.length - 1; i++) {
        if (!segClear(pts[i][0], pts[i][1], pts[i + 1][0], pts[i + 1][1], skipA, skipB)) return false
      }
      return true
    }
    function laneOffset(axis, v) {
      var k = axis + Math.round(v / 6)
      var n = Math.min(laneUse[k] || 0, 2)
      laneUse[k] = (laneUse[k] || 0) + 1
      return n * 9
    }
    function clean(pts) {
      var out = []
      for (var i = 0; i < pts.length; i++) {
        var p = pts[i]
        if (out.length > 0 && Math.abs(p[0] - out[out.length - 1][0]) < 0.5 && Math.abs(p[1] - out[out.length - 1][1]) < 0.5) continue
        out.push(p.slice())
      }
      return out
    }
    function adjust(pts) {
      // 每段两端同步平移：保持横平竖直，共享角点累加两侧偏移
      var out = pts.map(function (p) { return p.slice() })
      for (var i = 0; i < pts.length - 1; i++) {
        var p0 = pts[i], p1 = pts[i + 1]
        if (Math.abs(p1[0] - p0[0]) < 0.5) {
          var off = laneOffset('v', p0[0])
          out[i][0] += off; out[i + 1][0] += off
        } else if (Math.abs(p1[1] - p0[1]) < 0.5) {
          var off2 = laneOffset('h', p0[1])
          out[i][1] += off2; out[i + 1][1] += off2
        }
      }
      return clean(out)
    }
    function routeEdge(A, B) {
      var out, inn
      if (A.col === B.col) {
        if (B.row > A.row) { out = [A.cx, A.y + A.h]; inn = [B.cx, B.y] }
        else { out = [A.cx, A.y]; inn = [B.cx, B.y + B.h] }
        var midY = (out[1] + inn[1]) / 2
        var straight = clean([[out[0], out[1]], [out[0], midY], [inn[0], midY], [inn[0], inn[1]]])
        if (pathClear(straight, idxOf[A.id], idxOf[B.id])) {
          var adj0 = adjust(straight)
          if (pathClear(adj0, idxOf[A.id], idxOf[B.id])) return adj0
        }
        var vLane = colGapX(Math.min(A.col + 1, cols))
        var yLanes = []
        var rMin = Math.min(A.row, B.row), rMax = Math.max(A.row, B.row)
        for (var r = rMin + 1; r <= rMax; r++) yLanes.push(rowGapY(r))
        yLanes.push(margin * 0.5, margin * 2 + rows * boxH + (rows - 1) * gapY - margin * 0.5)
        var step = B.row > A.row ? 16 : -16
        for (var j = 0; j < yLanes.length; j++) {
          var det = clean([[out[0], out[1]], [out[0], out[1] + step], [vLane, out[1] + step], [vLane, yLanes[j]], [inn[0], yLanes[j]], [inn[0], inn[1]]])
          if (pathClear(det, idxOf[A.id], idxOf[B.id])) {
            var adj1 = adjust(det)
            if (pathClear(adj1, idxOf[A.id], idxOf[B.id])) return adj1
          }
        }
        return straight
      }
      if (B.col > A.col) { out = [A.x + A.w, A.cy]; inn = [B.x, B.cy] }
      else { out = [A.x, A.cy]; inn = [B.x + B.w, B.cy] }
      var lanes = [(out[0] + inn[0]) / 2]
      var cMin = Math.min(A.col, B.col) + 1, cMax = Math.max(A.col, B.col)
      for (var c = cMin; c <= cMax; c++) lanes.push(colGapX(c))
      lanes.push(margin * 0.5, margin * 2 + cols * boxW + (cols - 1) * gapX - margin * 0.5)
      var seen = {}, cands = []
      for (var k = 0; k < lanes.length; k++) {
        var key = Math.round(lanes[k] / 6)
        if (seen[key]) continue
        seen[key] = true
        cands.push(clean([[out[0], out[1]], [lanes[k], out[1]], [lanes[k], inn[1]], [inn[0], inn[1]]]))
      }
      // 通用绕行候选：A/B 两侧列隙 + 行隙（两行之间的空隙、上下方、外侧），
      // 覆盖同行有中间框与对角线穿框两类场景
      var gapA = B.col > A.col ? colGapX(A.col + 1) : colGapX(A.col)
      var gapB = B.col > A.col ? colGapX(B.col) : colGapX(B.col + 1)
      var rMin = Math.min(A.row, B.row), rMax = Math.max(A.row, B.row)
      var yDet = []
      for (var r = rMin + 1; r <= rMax; r++) yDet.push(rowGapY(r))
      if (rMin > 0) yDet.push(rowGapY(rMin))
      if (rMax < rows - 1) yDet.push(rowGapY(rMax + 1))
      yDet.push(margin * 0.5, margin * 2 + rows * boxH + (rows - 1) * gapY - margin * 0.5)
      var seenY = {}
      for (var yy = 0; yy < yDet.length; yy++) {
        var yk = Math.round(yDet[yy] / 6)
        if (seenY[yk]) continue
        seenY[yk] = true
        cands.push(clean([[out[0], out[1]], [gapA, out[1]], [gapA, yDet[yy]], [gapB, yDet[yy]], [gapB, inn[1]], [inn[0], inn[1]]]))
      }
      var saved = null
      for (var q = 0; q < cands.length; q++) {
        if (pathClear(cands[q], idxOf[A.id], idxOf[B.id])) {
          var adj = adjust(cands[q])
          if (pathClear(adj, idxOf[A.id], idxOf[B.id])) return adj
          if (saved === null) saved = cands[q]
        }
      }
      if (saved !== null) return clean(saved)
      return clean(cands[0])
    }
    function roundedPath(pts, r) {
      if (pts.length < 2) return ''
      var d = 'M ' + pts[0][0] + ' ' + pts[0][1]
      for (var i = 1; i < pts.length - 1; i++) {
        var p0 = pts[i - 1], p1 = pts[i], p2 = pts[i + 1]
        var d1 = Math.sqrt((p1[0] - p0[0]) * (p1[0] - p0[0]) + (p1[1] - p0[1]) * (p1[1] - p0[1]))
        var d2 = Math.sqrt((p2[0] - p1[0]) * (p2[0] - p1[0]) + (p2[1] - p1[1]) * (p2[1] - p1[1]))
        var rr = Math.min(r, d1 / 2 - 0.5, d2 / 2 - 0.5)
        if (rr < 3) { d += ' L ' + p1[0] + ' ' + p1[1]; continue }
        var ax = p1[0] - (p1[0] - p0[0]) * rr / d1
        var ay = p1[1] - (p1[1] - p0[1]) * rr / d1
        var bx = p1[0] + (p2[0] - p1[0]) * rr / d2
        var by = p1[1] + (p2[1] - p1[1]) * rr / d2
        d += ' L ' + ax + ' ' + ay + ' Q ' + p1[0] + ' ' + p1[1] + ' ' + bx + ' ' + by
      }
      var last = pts[pts.length - 1]
      d += ' L ' + last[0] + ' ' + last[1]
      return d
    }
    function arrowPoints(tip, prev) {
      var dx = tip[0] - prev[0], dy = tip[1] - prev[1]
      var len = Math.sqrt(dx * dx + dy * dy) || 1
      var c = dx / len, s = dy / len
      var bx = tip[0] - 9 * c, by = tip[1] - 9 * s
      var px = -s * 4.5, py = c * 4.5
      return tip[0] + ',' + tip[1] + ' ' + (bx + px) + ',' + (by + py) + ' ' + (bx - px) + ',' + (by - py)
    }
    function longestSeg(pts) {
      var best = null, bestLen = -1
      for (var i = 0; i < pts.length - 1; i++) {
        var dx = pts[i + 1][0] - pts[i][0], dy = pts[i + 1][1] - pts[i][1]
        var len = Math.sqrt(dx * dx + dy * dy)
        if (len > bestLen) { bestLen = len; best = [pts[i], pts[i + 1]] }
      }
      return best
    }
    function labelPos(pts, text, skipA, skipB) {
      var w = estWidth(text, 10)
      var find = function (exempt) {
        var best = null, bestLen = -1
        for (var i = 0; i < pts.length - 1; i++) {
          var p0 = pts[i], p1 = pts[i + 1]
          var dx = p1[0] - p0[0], dy = p1[1] - p0[1]
          var len = Math.sqrt(dx * dx + dy * dy)
          if (len < 26) continue
          var horiz = Math.abs(dx) > Math.abs(dy)
          var mx = (p0[0] + p1[0]) / 2, my = (p0[1] + p1[1]) / 2
          var lx = mx - w / 2, ly = horiz ? my - 14 : my - 5, lw = w, lh = 10
          var ok = true
          for (var r = 0; r < rects.length; r++) {
            if (exempt && (r === skipA || r === skipB)) continue
            var b = rects[r]
            if (lx + lw > b.x + 3 && lx < b.x + b.w - 3 && ly + lh > b.y + 3 && ly < b.y + b.h - 3) { ok = false; break }
          }
          if (ok && len > bestLen) { bestLen = len; best = { x: mx, y: horiz ? my - 9 : my, horiz: horiz, len: len } }
        }
        return best
      }
      // 严格通过（标签不压任何框）优先，且取最长段；否则退回豁免端点框的最长段
      var strict = find(false)
      if (strict !== null) return strict
      return find(true)
    }

    // 先画边（线不压框）
    kids.forEach(function (id) {
      var km = mods[id]
      ;(km.deps || []).forEach(function (d) {
        if (!kidsSet[d.to] || d.to === id) return
        var A = byId[id], B = byId[d.to]
        var pts = routeEdge(A, B)
        var p = document.createElementNS('http://www.w3.org/2000/svg', 'path')
        p.setAttribute('d', roundedPath(pts, 9))
        p.setAttribute('class', 'edge kind-' + d.kind + (d.cross_tree ? ' cross' : ''))
        svg.appendChild(p)
        var last = pts[pts.length - 1], prev = pts[pts.length - 2]
        var mk = document.createElementNS('http://www.w3.org/2000/svg', 'polygon')
        mk.setAttribute('points', arrowPoints(last, prev))
        mk.setAttribute('class', 'arrow kind-' + d.kind + (d.cross_tree ? ' cross' : ''))
        svg.appendChild(mk)
        var lp = labelPos(pts, d.label ? L(d.label) : d.kind, idxOf[id], idxOf[d.to])
        if (lp) {
          var t = document.createElementNS('http://www.w3.org/2000/svg', 'text')
          t.setAttribute('x', lp.x)
          t.setAttribute('y', lp.y)
          t.setAttribute('text-anchor', 'middle')
          t.setAttribute('class', 'edge-label')
          t.setAttribute('style', 'paint-order: stroke; stroke: var(--bg); stroke-width: 4px; stroke-linejoin: round;')
          t.textContent = d.label ? L(d.label) : d.kind
          svg.appendChild(t)
        }
      })
    })

    // 再画框（永远在最上层）+ 名称入框居中自适应
    nodes.forEach(function (n) {
      var km = mods[n.id]
      var g = document.createElementNS('http://www.w3.org/2000/svg', 'g')
      var rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect')
      rect.setAttribute('x', n.x); rect.setAttribute('y', n.y)
      rect.setAttribute('width', n.w); rect.setAttribute('height', n.h)
      rect.setAttribute('rx', 9)
      rect.setAttribute('class', 'node' + (children[n.id] ? '' : ' leaf'))
      g.appendChild(rect)
      var fit = fitName(L(km.name), n.w - 14)
      var lh = fit.fs * 1.28
      var y0 = n.cy - (fit.lines.length - 1) * lh / 2
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
      g.onclick = function () { goto('#module=' + encodeURIComponent(n.id)) }
      g.onmouseenter = function () { showTip(g, km) }
      g.onmouseleave = hideTip
      svg.appendChild(g)
    })
    main.appendChild(svg)
    var bar = el('div', 'legendbar')
    bar.innerHTML = '<span class="hint">连线：</span>'
      + '<span class="chip"><span class="swatch kind-call"></span>call</span>'
      + '<span class="chip"><span class="swatch kind-event"></span>event</span>'
      + '<span class="chip"><span class="swatch kind-dataflow"></span>dataflow</span>'
      + '<span class="chip"><span class="swatch kind-reference"></span>reference</span>'
      + '<span class="chip"><span class="swatch cross"></span>跨树</span>'
    main.appendChild(bar)
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
        + '<div class="t-meta">模块 ' + (m.aggregate.descendant_count + 1) + ' · API ' + (m.aggregate.own_api_count + m.aggregate.inherited_api_count) + '</div>'
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