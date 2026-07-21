/* tokenscope web surface — 100% client-side. Nothing is uploaded.
 * Parses the JSON you paste from `npx @wartzar-bee/tokenscope --json` and renders
 * the report + a shareable SVG "cost report card".
 *
 * The share-summary / SVG logic below is a faithful port of src/share.mjs
 * (kept dependency-free for the browser). Keep the two in sync if either changes.
 */
(function () {
  "use strict";

  // ---- formatting helpers (mirror src/share.mjs) ----
  var usd = function (n) { return "$" + (n < 10 ? n.toFixed(2) : Math.round(n).toLocaleString()); };
  var pct = function (n) { return Math.round(n) + "%"; };
  var ktok = function (n) {
    return n >= 1000
      ? (n / 1000).toFixed(n >= 100000 ? 0 : 1).replace(/\.0$/, "") + "k"
      : String(Math.round(n));
  };
  var r2 = function (n) { return Math.round((n + Number.EPSILON) * 100) / 100; };
  var esc = function (s) {
    return String(s).replace(/[&<>"]/g, function (ch) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[ch];
    });
  };

  // ---- benchmark reference (mirror src/benchmark.mjs) — shipped/offline comparison ----
  var BENCHMARK = {
    n: 66, asOf: "2026-05-29",
    costUsd: { p10: 1.63, p25: 2.10, p50: 4.08, p75: 8.31, p90: 11.42 },
    resentPct: { p10: 14, p25: 19, p50: 24, p75: 31, p90: 46 },
    cacheEff: { p10: 69, p25: 77, p50: 83, p75: 87, p90: 94 }
  };
  function percentileOf(x, bp) {
    var pts = [[10, bp.p10], [25, bp.p25], [50, bp.p50], [75, bp.p75], [90, bp.p90]];
    if (x <= pts[0][1]) return Math.max(1, Math.round((10 * x) / (pts[0][1] || 1)));
    if (x >= pts[4][1]) { var over = (x - pts[4][1]) / (pts[4][1] || 1); return Math.min(99, 90 + Math.round(9 * Math.min(1, over))); }
    for (var i = 0; i < 4; i++) {
      var pa = pts[i][0], va = pts[i][1], pb = pts[i + 1][0], vb = pts[i + 1][1];
      if (x >= va && x <= vb) { var t = vb === va ? 0 : (x - va) / (vb - va); return Math.round(pa + t * (pb - pa)); }
    }
    return 50;
  }
  function benchmarkOf(s) {
    return {
      ref: { n: BENCHMARK.n, asOf: BENCHMARK.asOf },
      median: { costUsd: BENCHMARK.costUsd.p50, resentPct: BENCHMARK.resentPct.p50, cacheEff: BENCHMARK.cacheEff.p50 },
      costPctile: percentileOf(s.totalCost, BENCHMARK.costUsd),
      resentPctile: percentileOf(s.split.cacheRead.pct, BENCHMARK.resentPct),
      cacheEffPctile: percentileOf(s.cacheEfficiency, BENCHMARK.cacheEff)
    };
  }

  // ---- privacy-safe summary (mirror src/share.mjs:shareSummary) ----
  function shareSummary(a) {
    var b = a.breakdown || {};
    var p = a.pct || {};
    var split = {
      output: { usd: r2(b.out || 0), pct: Math.round(p.out || 0) },
      cacheRead: { usd: r2(b.cacheRead || 0), pct: Math.round(p.cacheRead || 0) },
      cacheWrite: { usd: r2(b.cacheWrite || 0), pct: Math.round(p.cacheWrite || 0) },
      freshInput: { usd: r2(b.freshIn || 0), pct: Math.round(p.freshIn || 0) }
    };
    if ((b.webTools || 0) > 0) split.webTools = { usd: r2(b.webTools || 0), pct: Math.round(p.webTools || 0) };
    var resentPct = Math.round(p.cacheRead || 0);
    var headline = (a.totalCost > 0)
      ? resentPct + "% of this Claude Code session's spend was re-sent (cached) context."
      : "No measurable cost in this session.";
    var summary = {
      tool: "tokenscope",
      totalCost: r2(a.totalCost || 0),
      turns: a.turns || 0,
      split: split,
      context: { peak: Math.round((a.context && a.context.peak) || 0), avg: Math.round((a.context && a.context.avg) || 0) },
      cacheEfficiency: Math.round((a.cacheEfficiency || 0) * 100),
      models: Object.keys(a.byModel || {}),
      headline: headline
    };
    summary.benchmark = (a.totalCost > 0) ? benchmarkOf(summary) : null;
    return summary;
  }

  // ---- markdown (mirror src/share.mjs:shareMarkdown) ----
  function shareMarkdown(a) {
    var s = shareSummary(a);
    var rows = [
      ["Output (model writing)", s.split.output],
      ["Cache read (re-sent context)", s.split.cacheRead],
      ["Cache write (new context)", s.split.cacheWrite],
      ["Fresh input", s.split.freshInput]
    ];
    if (s.split.webTools) rows.push(["Web tools", s.split.webTools]);
    var L = [];
    L.push("### tokenscope — Claude Code cost report");
    L.push("");
    L.push("**Total: " + usd(s.totalCost) + "** over **" + s.turns.toLocaleString() + "** model turns");
    L.push("");
    L.push("> " + s.headline);
    L.push("");
    L.push("| Where the money went | % | cost |");
    L.push("| --- | --: | --: |");
    rows.forEach(function (r) {
      var v = r[1];
      if (v.usd <= 0 && v.pct <= 0) return;
      L.push("| " + r[0] + " | " + pct(v.pct) + " | " + usd(v.usd) + " |");
    });
    L.push("");
    L.push("Peak context ~" + ktok(s.context.peak) + " tokens (avg " + ktok(s.context.avg) + "). Cache efficiency " + s.cacheEfficiency + "%.");
    L.push("");
    if (s.benchmark) {
      var bm = s.benchmark;
      L.push("**How this compares** — vs " + bm.ref.n + " real sessions ([benchmark](https://tokenscope.pages.dev/benchmark/), measured " + bm.ref.asOf + "; a reference set, not a census):");
      L.push("- Cost " + usd(s.totalCost) + " — bigger than ~" + bm.costPctile + "% of measured sessions (median " + usd(bm.median.costUsd) + ")");
      L.push("- Cache efficiency " + s.cacheEfficiency + "% — more efficient than ~" + bm.cacheEffPctile + "% (median " + bm.median.cacheEff + "%)");
      L.push("- Re-sent context " + s.split.cacheRead.pct + "% — median session " + bm.median.resentPct + "%");
      L.push("");
    }
    L.push("_Generated locally by [tokenscope](https://github.com/wartzar-bee/tokenscope) — `npx @wartzar-bee/tokenscope --share`. Read-only, no upload; numbers only, no paths or content._");
    return L.join("\n");
  }

  // ---- SVG card (mirror src/share.mjs:shareCardSVG) ----
  function shareCardSVG(a) {
    var s = shareSummary(a);
    var W = 600, H = 410; // extra height for CTA pill (mirrors src/share.mjs)
    var segs = [
      { key: "output", label: "output", color: "#22d3ee" },
      { key: "cacheRead", label: "re-sent ctx", color: "#fbbf24" },
      { key: "cacheWrite", label: "new ctx", color: "#c084fc" },
      { key: "freshInput", label: "fresh in", color: "#34d399" }
    ];
    if (s.split.webTools) segs.push({ key: "webTools", label: "web", color: "#94a3b8" });
    var barX = 36, barY = 150, barW = W - 72, barH = 30;
    var x = barX, barParts = [], legendParts = [], lx = barX, ly = barY + 64;
    segs.forEach(function (seg) {
      var v = s.split[seg.key];
      if (!v || (v.usd <= 0 && v.pct <= 0)) return;
      var w = Math.max(0, (v.pct / 100) * barW);
      if (w > 0) {
        barParts.push('<rect x="' + r2(x) + '" y="' + barY + '" width="' + r2(w) + '" height="' + barH + '" fill="' + seg.color + '"/>');
        if (w > 34) barParts.push('<text x="' + r2(x + w / 2) + '" y="' + (barY + 20) + '" text-anchor="middle" font-size="13" font-weight="600" fill="#0f172a">' + v.pct + '%</text>');
        x += w;
      }
      var chip = seg.label + " " + v.pct + "%";
      legendParts.push(
        '<rect x="' + lx + '" y="' + (ly - 11) + '" width="12" height="12" rx="2" fill="' + seg.color + '"/>' +
        '<text x="' + (lx + 18) + '" y="' + ly + '" font-size="13" fill="#cbd5e1">' + esc(chip) + '</text>'
      );
      lx += 28 + chip.length * 7.4;
      if (lx > W - 120) { lx = barX; ly += 24; }
    });
    var b = s.benchmark;
    var insight = b
      ? esc(s.split.cacheRead.pct) + '% of spend was re-sent context  ·  median session ' + esc(b.median.resentPct) + '%'
      : esc(s.split.cacheRead.pct) + '% of spend was re-sent (cached) context';
    var compare = b
      ? '  <text x="36" y="' + (H - 96) + '" font-family="ui-sans-serif,system-ui,sans-serif" font-size="13" fill="#94a3b8">more cache-efficient than ~<tspan fill="#34d399" font-weight="700">' + esc(b.cacheEffPctile) + '%</tspan> of ' + esc(b.ref.n) + ' measured sessions</text>\n'
      : '';
    // CTA pill — mirrors src/share.mjs
    var pillY = H - 52, pillH = 34, pillW = 276;
    var ctaPill = '  <rect x="36" y="' + pillY + '" width="' + pillW + '" height="' + pillH + '" rx="17" fill="#34d399"/>\n' +
      '  <text x="' + (36 + pillW / 2) + '" y="' + (pillY + 22) + '" text-anchor="middle" font-family="ui-sans-serif,system-ui,sans-serif" font-weight="800" font-size="15" fill="#06281b">Make your own &#x2192; tokenscope.pages.dev</text>\n';
    return '<svg xmlns="http://www.w3.org/2000/svg" width="' + W + '" height="' + H + '" viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="tokenscope cost report card">\n' +
      '  <rect width="' + W + '" height="' + H + '" rx="14" fill="#0f172a"/>\n' +
      '  <rect x="0.5" y="0.5" width="' + (W - 1) + '" height="' + (H - 1) + '" rx="14" fill="none" stroke="#1e293b"/>\n' +
      '  <text x="36" y="48" font-family="ui-monospace,Menlo,Consolas,monospace" font-size="20" font-weight="700" fill="#e2e8f0">tokenscope &#9187;</text>\n' +
      '  <text x="' + (W - 36) + '" y="48" text-anchor="end" font-family="ui-sans-serif,system-ui,sans-serif" font-size="13" fill="#64748b">Claude Code cost report</text>\n' +
      '  <text x="36" y="104" font-family="ui-sans-serif,system-ui,sans-serif" font-size="40" font-weight="800" fill="#34d399">' + esc(usd(s.totalCost)) + '</text>\n' +
      '  <text x="36" y="130" font-family="ui-sans-serif,system-ui,sans-serif" font-size="14" fill="#94a3b8">over ' + s.turns.toLocaleString() + ' model turns</text>\n' +
      '  <text x="' + (W - 36) + '" y="104" text-anchor="end" font-family="ui-sans-serif,system-ui,sans-serif" font-size="13" fill="#64748b">peak ~' + esc(ktok(s.context.peak)) + ' tok · avg ' + esc(ktok(s.context.avg)) + '</text>\n' +
      '  <rect x="' + barX + '" y="' + barY + '" width="' + barW + '" height="' + barH + '" rx="4" fill="#1e293b"/>\n' +
      '  ' + barParts.join("\n  ") + '\n' +
      '  ' + legendParts.join("\n  ") + '\n' +
      '  <text x="36" y="' + (H - 130) + '" font-family="ui-sans-serif,system-ui,sans-serif" font-size="15" font-weight="600" fill="#fbbf24">' + insight + '</text>\n' +
      compare +
      ctaPill +
      '</svg>';
  }

  // ---- normalize pasted input into a full analyze-shaped object ----
  // Accepts the rich `--json` output, OR the compact `--share --json` summary.
  function normalize(raw) {
    var o = JSON.parse(raw);
    if (o && o.breakdown && o.pct) return o; // already the rich analyze shape
    // compact share-summary shape -> reconstruct enough to render
    if (o && o.split && o.tool === "tokenscope") {
      var sp = o.split;
      var b = {
        out: (sp.output || {}).usd || 0,
        cacheRead: (sp.cacheRead || {}).usd || 0,
        cacheWrite: (sp.cacheWrite || {}).usd || 0,
        freshIn: (sp.freshInput || {}).usd || 0,
        webTools: (sp.webTools || {}).usd || 0
      };
      var p = {
        out: (sp.output || {}).pct || 0,
        cacheRead: (sp.cacheRead || {}).pct || 0,
        cacheWrite: (sp.cacheWrite || {}).pct || 0,
        freshIn: (sp.freshInput || {}).pct || 0,
        webTools: (sp.webTools || {}).pct || 0
      };
      var byModel = {};
      (o.models || []).forEach(function (m) { byModel[m] = { cost: 0, turns: 0 }; });
      return {
        totalCost: o.totalCost || 0, turns: o.turns || 0, breakdown: b, pct: p,
        context: { peak: (o.context || {}).peak || 0, avg: (o.context || {}).avg || 0 },
        cacheEfficiency: (o.cacheEfficiency || 0) / 100, byModel: byModel,
        topTools: [], insights: [], unknownModels: [], _compact: true
      };
    }
    throw new Error("That doesn't look like tokenscope JSON. Run `npx @wartzar-bee/tokenscope --json` and paste the whole output.");
  }

  // ---- render the report into the DOM ----
  function el(id) { return document.getElementById(id); }

  function renderReport(a) {
    var s = shareSummary(a);
    el("r-total").textContent = usd(s.totalCost);
    el("r-turns").textContent = "over " + s.turns.toLocaleString() + " model turns";

    var unknown = a.unknownModels || [];
    var warn = el("r-warn");
    if (unknown.length) {
      warn.style.display = "";
      warn.textContent = "⚠ unknown pricing for: " + unknown.join(", ") + " — excluded from cost. Override via .tokenscope.json";
    } else { warn.style.display = "none"; }

    var rows = [
      { lbl: "output (model writing)", v: s.split.output, c: "var(--out)" },
      { lbl: "cache read (re-sent ctx)", v: s.split.cacheRead, c: "var(--read)" },
      { lbl: "cache write (new ctx)", v: s.split.cacheWrite, c: "var(--write)" },
      { lbl: "fresh input", v: s.split.freshInput, c: "var(--fresh)" }
    ];
    if (s.split.webTools) rows.push({ lbl: "web tools", v: s.split.webTools, c: "var(--web)" });
    var html = "";
    rows.forEach(function (r) {
      if (r.v.usd <= 0 && r.v.pct <= 0) return;
      html += '<div class="row">' +
        '<div class="lbl">' + esc(r.lbl) + '</div>' +
        '<div class="track"><div class="fill" style="width:' + r.v.pct + '%;background:' + r.c + '"></div></div>' +
        '<div class="pc">' + r.v.pct + '%</div>' +
        '<div class="mny">' + esc(usd(r.v.usd)) + '</div>' +
        '</div>';
    });
    el("r-rows").innerHTML = html;

    var modelStr = s.models.length ? " · models: " + s.models.map(esc).join(", ") : "";
    el("r-context").innerHTML = "Peak context <strong>~" + esc(ktok(s.context.peak)) + "</strong> tokens (avg " +
      esc(ktok(s.context.avg)) + "). Cache efficiency <strong>" + s.cacheEfficiency + "%</strong>" + modelStr +
      (s.context.peak > 120000 ? '. <span style="color:var(--warn)">Large — /compact or a fresh session would cut per-turn cost.</span>' : ".");

    // SVG card
    var svg = shareCardSVG(a);
    el("r-card").innerHTML = svg;

    // insights (only present in rich --json)
    var insights = a.insights || [];
    if (insights.length) {
      el("r-insights-wrap").style.display = "";
      el("r-insights").innerHTML = insights.map(function (i) { return "<li>" + esc(i) + "</li>"; }).join("");
    } else { el("r-insights-wrap").style.display = "none"; }

    // tools (only present in rich --json)
    var tools = a.topTools || [];
    if (tools.length) {
      el("r-tools-wrap").style.display = "";
      el("r-tools").innerHTML = tools.slice(0, 12).map(function (t) {
        return '<span class="chip">' + esc(t[0]) + ' ×' + t[1] + '</span>';
      }).join("");
    } else { el("r-tools-wrap").style.display = "none"; }

    el("report").style.display = "block";
    // stash current svg + markdown for the share buttons
    el("report").dataset.svg = svg;
    el("report").dataset.md = shareMarkdown(a);
    el("report").scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function showErr(msg) { el("err").textContent = msg || ""; }

  function doRender() {
    showErr("");
    var raw = el("input").value.trim();
    if (!raw) { showErr("Paste the JSON output first."); return; }
    var a;
    try { a = normalize(raw); }
    catch (e) { showErr(e && e.message ? e.message : "Could not parse that as JSON."); el("report").style.display = "none"; return; }
    try { renderReport(a); }
    catch (e) { showErr("Rendered with an error: " + (e && e.message)); }
  }

  // ---- sample data (synthetic; matches the rich --json shape) ----
  var SAMPLE = {
    label: "sample session",
    turns: 967,
    totalCost: 868.84,
    breakdown: { total: 868.84, freshIn: 0.34, cacheWrite: 153.67, cacheRead: 577.59, out: 137.24, webTools: 0, webReq: 0 },
    tokens: { input: 22000, cacheRead: 385060000, cacheCreate: 102446000, output: 1829866 },
    pct: { freshIn: 0.04, cacheWrite: 17.69, cacheRead: 66.48, out: 15.79, webTools: 0 },
    context: { peak: 822000, avg: 404000, last: 822000 },
    cacheEfficiency: 0.79,
    byModel: { "claude-opus-4": { cost: 868.84, turns: 967 } },
    mainSide: { main: { cost: 720.1, turns: 880 }, sidechain: { cost: 148.74, turns: 87 } },
    topTools: [["Read", 412], ["Edit", 233], ["Bash", 198], ["Grep", 121], ["Write", 64]],
    unknownModels: [],
    insights: [
      "Re-sent (cached) context cost $577.59 (66% of spend) across 967 turns — that's context re-read every turn.",
      "Peak context ~822k tokens (avg 404k). Large — /compact or a fresh session would cut per-turn cost.",
      "Only 16% of spend is the model's actual output — most is moving context in/out. Tighten what stays in context.",
      "Subagents: $148.74 over 87 turns (17%)."
    ]
  };

  // ---- clipboard helper (no deps) ----
  function copyText(text, btn, okLabel) {
    var done = function () { var t = btn.textContent; btn.textContent = okLabel || "Copied!"; setTimeout(function () { btn.textContent = t; }, 1400); };
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(done, function () { fallback(); });
    } else { fallback(); }
    function fallback() {
      var ta = document.createElement("textarea");
      ta.value = text; ta.style.position = "fixed"; ta.style.opacity = "0";
      document.body.appendChild(ta); ta.select();
      try { document.execCommand("copy"); done(); } catch (e) {}
      document.body.removeChild(ta);
    }
  }

  // ---- wire up ----
  document.addEventListener("DOMContentLoaded", function () {
    el("render").addEventListener("click", doRender);
    el("sample").addEventListener("click", function () {
      el("input").value = JSON.stringify(SAMPLE, null, 2);
      doRender();
    });
    el("clear").addEventListener("click", function () {
      el("input").value = ""; showErr(""); el("report").style.display = "none";
    });
    el("copyNpx").addEventListener("click", function () { copyText("npx @wartzar-bee/tokenscope", this); });
    el("copyJson").addEventListener("click", function () { copyText("npx @wartzar-bee/tokenscope --json", this, "copied"); });
    el("dlsvg").addEventListener("click", function () {
      var svg = el("report").dataset.svg || "";
      if (!svg) return;
      var blob = new Blob([svg], { type: "image/svg+xml" });
      var url = URL.createObjectURL(blob);
      var a = document.createElement("a");
      a.href = url; a.download = "tokenscope-cost-card.svg";
      document.body.appendChild(a); a.click(); document.body.removeChild(a);
      setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
    });
    el("copymd").addEventListener("click", function () { copyText(el("report").dataset.md || "", this); });
  });
})();
