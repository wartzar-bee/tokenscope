/* tokenscope /card/ — renders a shared cost card from the URL #fragment.
 * 100% client-side. The fragment is NEVER sent to a server, so nothing is uploaded.
 *
 * The decoder (unpackSummary) is the mirror of src/share.mjs:packSummary — keep in sync
 * (a Node test asserts a round-trip through both). The card SVG + benchmark logic mirror
 * src/share.mjs / web/app.js (dependency-free for the browser).
 */
(function () {
  "use strict";

  // ---- formatting helpers (mirror src/share.mjs) ----
  var usd = function (n) { return "$" + (n < 10 ? n.toFixed(2) : Math.round(n).toLocaleString()); };
  var ktok = function (n) {
    return n >= 1000 ? (n / 1000).toFixed(n >= 100000 ? 0 : 1).replace(/\.0$/, "") + "k" : String(Math.round(n));
  };
  var r2 = function (n) { return Math.round((n + Number.EPSILON) * 100) / 100; };
  var esc = function (s) {
    return String(s).replace(/[&<>"]/g, function (ch) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[ch];
    });
  };

  // ---- base64url decode (mirror src/share.mjs toB64url, inverse) ----
  function fromB64url(s) {
    var b64 = s.replace(/-/g, "+").replace(/_/g, "/");
    while (b64.length % 4) b64 += "=";
    return decodeURIComponent(escape(atob(b64)));
  }

  // ---- unpack the positional array (mirror src/share.mjs:packSummary) ----
  // Returns a privacy-safe shareSummary-shaped object, or throws on bad/old data.
  function unpackSummary(arr) {
    if (!Array.isArray(arr) || arr[0] !== 1) throw new Error("unsupported card schema");
    var cell = function (c) { return { usd: (c && c[0]) || 0, pct: (c && c[1]) || 0 }; };
    var split = {
      output: cell(arr[3]),
      cacheRead: cell(arr[4]),
      cacheWrite: cell(arr[5]),
      freshInput: cell(arr[6])
    };
    // optional web-tools cell appended at index 11 (after modelCount at 10)
    if (arr.length > 11 && Array.isArray(arr[11])) split.webTools = cell(arr[11]);
    var resentPct = split.cacheRead.pct;
    return {
      tool: "tokenscope",
      totalCost: arr[1] || 0,
      turns: arr[2] || 0,
      split: split,
      context: { peak: arr[7] || 0, avg: arr[8] || 0 },
      cacheEfficiency: arr[9] || 0,
      modelCount: arr[10] || 0,
      headline: resentPct + "% of this Claude Code session's spend was re-sent (cached) context."
    };
  }

  // ---- benchmark reference (mirror src/benchmark.mjs) ----
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

  // ---- card SVG (mirror src/share.mjs:shareCardSVG, fed the already-unpacked summary) ----
  function cardSVG(s) {
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
    var b = benchmarkOf(s);
    var insight = esc(s.split.cacheRead.pct) + '% of spend was re-sent context  ·  median session ' + esc(b.median.resentPct) + '%';
    var compare = '  <text x="36" y="' + (H - 96) + '" font-family="ui-sans-serif,system-ui,sans-serif" font-size="13" fill="#94a3b8">more cache-efficient than ~<tspan fill="#34d399" font-weight="700">' + esc(b.cacheEffPctile) + '%</tspan> of ' + esc(b.ref.n) + ' measured sessions</text>\n';
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

  // ---- positive-only flex line (L-018a: status, never a grade/scold) ----
  function flexHTML(s) {
    var b = benchmarkOf(s);
    var bits = [];
    bits.push("This Claude Code session ran <strong>" + esc(usd(s.totalCost)) + "</strong> over <strong>" + s.turns.toLocaleString() + "</strong> model turns");
    bits.push("&mdash; more cache-efficient than ~<strong>" + b.cacheEffPctile + "%</strong> of " + b.ref.n + " measured sessions");
    bits.push("(median session re-sends <strong>" + b.median.resentPct + "%</strong> of its spend as context).");
    return bits.join(" ");
  }

  // ---- markdown (for the "copy as markdown" button on a shared card) ----
  function shareMarkdown(s) {
    var b = benchmarkOf(s);
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
    rows.forEach(function (r) { var v = r[1]; if (v.usd <= 0 && v.pct <= 0) return; L.push("| " + r[0] + " | " + Math.round(v.pct) + "% | " + usd(v.usd) + " |"); });
    L.push("");
    L.push("More cache-efficient than ~" + b.cacheEffPctile + "% of " + b.ref.n + " measured sessions ([benchmark](https://tokenscope.pages.dev/benchmark/)).");
    L.push("");
    L.push("_Make your own: `npx @wartzar-bee/tokenscope --share` — local, read-only, numbers only, nothing uploaded._");
    return L.join("\n");
  }

  // ---- clipboard helper ----
  function copyText(text, btn, ok) {
    var done = function () { var t = btn.textContent; btn.textContent = ok || "Copied!"; setTimeout(function () { btn.textContent = t; }, 1400); };
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).then(done, fb);
    else fb();
    function fb() {
      var ta = document.createElement("textarea"); ta.value = text; ta.style.position = "fixed"; ta.style.opacity = "0";
      document.body.appendChild(ta); ta.select(); try { document.execCommand("copy"); done(); } catch (e) {} document.body.removeChild(ta);
    }
  }

  // ---- boot ----
  function el(id) { return document.getElementById(id); }

  function render() {
    var copyBtn = el("copyNpx");
    if (copyBtn) copyBtn.addEventListener("click", function () { copyText("npx @wartzar-bee/tokenscope --share", this, "Copied!"); });

    var frag = (location.hash || "").replace(/^#/, "");
    if (!frag) { el("empty").style.display = ""; return; }

    var s;
    try { s = unpackSummary(JSON.parse(fromB64url(frag))); }
    catch (e) { el("empty").style.display = ""; return; }
    if (!(s.totalCost > 0)) { el("empty").style.display = ""; return; }

    // draw card
    var svg = cardSVG(s);
    el("cardbox").innerHTML = svg;

    // flex line
    var flex = el("flex");
    flex.innerHTML = flexHTML(s);
    flex.style.display = "";

    // contextual title/sub
    el("sub").innerHTML = "Rendered locally from a tokenscope share link &mdash; only aggregate numbers travel in this page's URL (after the <code>#</code>), and your browser never sends that to a server.";

    // enable the card's own download / copy
    var dl = el("dlsvg"), cm = el("copymd");
    dl.style.display = ""; cm.style.display = "";
    dl.addEventListener("click", function () {
      var blob = new Blob([svg], { type: "image/svg+xml" });
      var url = URL.createObjectURL(blob);
      var a = document.createElement("a"); a.href = url; a.download = "tokenscope-cost-card.svg";
      document.body.appendChild(a); a.click(); document.body.removeChild(a);
      setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
    });
    cm.addEventListener("click", function () { copyText(shareMarkdown(s), this, "Copied!"); });
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", render);
  else render();
})();
