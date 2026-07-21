// Shareable, PRIVACY-SAFE summary of a tokenscope analysis.
// Emits aggregate numbers ONLY — NO file paths, NO prompt/response content, NO labels.
// Reuses the cost math from analyze() (src/core.mjs); does not recompute costs.
//
// Three outputs from one summary:
//   shareSummary(a)      -> a compact, privacy-safe data object
//   shareMarkdown(a)     -> markdown to paste into Reddit/Discord/GitHub issues
//   shareCardSVG(a)      -> a self-contained "cost report card" SVG (renders on GitHub)
//   shareLink(a)         -> a frictionless https link whose URL *fragment* carries the
//                           privacy-safe summary (fragments never reach a server) so a
//                           recipient renders the SENDER's card client-side + sees a
//                           one-command "make your own" CTA. The self-distribution loop.

import { benchmarkOf } from "./benchmark.mjs";

// Where the shareable /card/ page lives.
// UTM params ride the query string (before the #fragment) so Cloudflare Pages logs
// and any analytics beacon see inbound share-card clicks as attributable traffic.
// The fragment itself (#<data>) is never sent to the server — privacy unchanged.
export const CARD_BASE_URL = "https://tokenscope.pages.dev/card/?utm_source=card&utm_medium=share&utm_campaign=tokenscope#";

// --- formatting helpers (kept here so the web bundle can reuse them too) ---
export const usd = (n) => "$" + (n < 10 ? n.toFixed(2) : Math.round(n).toLocaleString());
export const pct = (n) => Math.round(n) + "%";
export const ktok = (n) =>
  n >= 1000 ? (n / 1000).toFixed(n >= 100000 ? 0 : 1).replace(/\.0$/, "") + "k" : String(Math.round(n));

// Round to keep the artifact tidy; never invents precision the logs don't have.
const r2 = (n) => Math.round((n + Number.EPSILON) * 100) / 100;

// Build the privacy-safe summary. Deliberately drops: label, curve, topTurns,
// per-turn data, tool names — anything that could hint at what was being worked on.
export function shareSummary(a) {
  const b = a.breakdown || {};
  const p = a.pct || {};
  const split = {
    output: { usd: r2(b.out || 0), pct: Math.round(p.out || 0) },
    cacheRead: { usd: r2(b.cacheRead || 0), pct: Math.round(p.cacheRead || 0) },
    cacheWrite: { usd: r2(b.cacheWrite || 0), pct: Math.round(p.cacheWrite || 0) },
    freshInput: { usd: r2(b.freshIn || 0), pct: Math.round(p.freshIn || 0) }
  };
  if ((b.webTools || 0) > 0) split.webTools = { usd: r2(b.webTools || 0), pct: Math.round(p.webTools || 0) };

  const resentPct = Math.round(p.cacheRead || 0);
  const headline =
    a.totalCost > 0
      ? `${resentPct}% of this Claude Code session's spend was re-sent (cached) context.`
      : "No measurable cost in this session.";

  // Model families only (e.g. "claude-opus-4") — never concrete ids tied to anything.
  const models = Object.keys(a.byModel || {});

  const summary = {
    tool: "tokenscope",
    totalCost: r2(a.totalCost || 0),
    turns: a.turns || 0,
    split,
    context: {
      peak: Math.round(a.context?.peak || 0),
      avg: Math.round(a.context?.avg || 0)
    },
    cacheEfficiency: Math.round((a.cacheEfficiency || 0) * 100),
    models,
    headline
  };
  // How does this session compare? (vs a shipped, offline reference set — see benchmark.mjs)
  summary.benchmark = a.totalCost > 0 ? benchmarkOf(summary) : null;
  return summary;
}

// Markdown for pasting into Reddit / Discord / a GitHub issue.
export function shareMarkdown(a) {
  const s = shareSummary(a);
  const rows = [
    ["Output (model writing)", s.split.output],
    ["Cache read (re-sent context)", s.split.cacheRead],
    ["Cache write (new context)", s.split.cacheWrite],
    ["Fresh input", s.split.freshInput]
  ];
  if (s.split.webTools) rows.push(["Web tools", s.split.webTools]);

  const L = [];
  L.push("### tokenscope — Claude Code cost report");
  L.push("");
  L.push(`**Total: ${usd(s.totalCost)}** over **${s.turns.toLocaleString()}** model turns`);
  L.push("");
  L.push(`> ${s.headline}`);
  L.push("");
  L.push("| Where the money went | % | cost |");
  L.push("| --- | --: | --: |");
  for (const [lbl, v] of rows) {
    if (v.usd <= 0 && v.pct <= 0) continue;
    L.push(`| ${lbl} | ${pct(v.pct)} | ${usd(v.usd)} |`);
  }
  L.push("");
  L.push(`Peak context ~${ktok(s.context.peak)} tokens (avg ${ktok(s.context.avg)}). Cache efficiency ${s.cacheEfficiency}%.`);
  L.push("");
  if (s.benchmark) {
    const b = s.benchmark;
    L.push(`**How this compares** — vs ${b.ref.n} real sessions ([benchmark](https://tokenscope.pages.dev/benchmark/), measured ${b.ref.asOf}; a reference set, not a census):`);
    L.push(`- Cost ${usd(s.totalCost)} — bigger than ~${b.costPctile}% of measured sessions (median ${usd(b.median.costUsd)})`);
    L.push(`- Cache efficiency ${s.cacheEfficiency}% — more efficient than ~${b.cacheEffPctile}% (median ${b.median.cacheEff}%)`);
    L.push(`- Re-sent context ${s.split.cacheRead.pct}% — median session ${b.median.resentPct}%`);
    L.push("");
  }
  L.push("_Generated locally by [tokenscope](https://github.com/wartzar-bee/tokenscope) — `npx @wartzar-bee/tokenscope --share`. Read-only, no upload; numbers only, no paths or content._");
  return L.join("\n");
}

// A self-contained "cost report card" SVG. No external fonts/images/scripts — renders
// inline on GitHub and is trivially shareable. Pure aggregate numbers only.
export function shareCardSVG(a) {
  const s = shareSummary(a);
  const esc = (str) => String(str).replace(/[&<>"]/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[ch]));

  const W = 600, H = 410; // extra height for CTA pill
  const segs = [
    { key: "output", label: "output", color: "#22d3ee" },
    { key: "cacheRead", label: "re-sent ctx", color: "#fbbf24" },
    { key: "cacheWrite", label: "new ctx", color: "#c084fc" },
    { key: "freshInput", label: "fresh in", color: "#34d399" }
  ];
  if (s.split.webTools) segs.push({ key: "webTools", label: "web", color: "#94a3b8" });

  // Stacked bar geometry.
  const barX = 36, barY = 150, barW = W - 72, barH = 30;
  let x = barX;
  const barParts = [];
  const legendParts = [];
  let lx = barX, ly = barY + 64;
  for (const seg of segs) {
    const v = s.split[seg.key];
    if (!v || (v.usd <= 0 && v.pct <= 0)) continue; // drop empty segments (incl. rounded-to-0)
    const w = Math.max(0, (v.pct / 100) * barW);
    if (w > 0) {
      barParts.push(`<rect x="${r2(x)}" y="${barY}" width="${r2(w)}" height="${barH}" fill="${seg.color}"/>`);
      // % label inside segment if wide enough
      if (w > 34) barParts.push(`<text x="${r2(x + w / 2)}" y="${barY + 20}" text-anchor="middle" font-size="13" font-weight="600" fill="#0f172a">${v.pct}%</text>`);
      x += w;
    }
    // legend chip
    const chip = `${seg.label} ${v.pct}%`;
    legendParts.push(
      `<rect x="${lx}" y="${ly - 11}" width="12" height="12" rx="2" fill="${seg.color}"/>` +
      `<text x="${lx + 18}" y="${ly}" font-size="13" fill="#cbd5e1">${esc(chip)}</text>`
    );
    lx += 28 + chip.length * 7.4;
    if (lx > W - 120) { lx = barX; ly += 24; }
  }

  const b = s.benchmark;
  const insight = b
    ? `${esc(s.split.cacheRead.pct)}% of spend was re-sent context  ·  median session ${esc(b.median.resentPct)}%`
    : `${esc(s.split.cacheRead.pct)}% of spend was re-sent (cached) context`;
  // compare text anchored from bottom of data area, above CTA pill
  const compare = b
    ? `<text x="36" y="${H - 96}" font-family="ui-sans-serif,system-ui,sans-serif" font-size="13" fill="#94a3b8">more cache-efficient than ~<tspan fill="#34d399" font-weight="700">${esc(b.cacheEffPctile)}%</tspan> of ${esc(b.ref.n)} measured sessions</text>`
    : "";
  // CTA pill — baked into every shared SVG so recipient=sender fires even when
  // the SVG is pasted directly into GitHub/Discord/Slack (no surrounding HTML).
  const pillY = H - 52, pillH = 34, pillW = 276;

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="img" aria-label="tokenscope cost report card">
  <rect width="${W}" height="${H}" rx="14" fill="#0f172a"/>
  <rect x="0.5" y="0.5" width="${W - 1}" height="${H - 1}" rx="14" fill="none" stroke="#1e293b"/>
  <text x="36" y="48" font-family="ui-monospace,Menlo,Consolas,monospace" font-size="20" font-weight="700" fill="#e2e8f0">tokenscope &#9187;</text>
  <text x="${W - 36}" y="48" text-anchor="end" font-family="ui-sans-serif,system-ui,sans-serif" font-size="13" fill="#64748b">Claude Code cost report</text>
  <text x="36" y="104" font-family="ui-sans-serif,system-ui,sans-serif" font-size="40" font-weight="800" fill="#34d399">${esc(usd(s.totalCost))}</text>
  <text x="36" y="130" font-family="ui-sans-serif,system-ui,sans-serif" font-size="14" fill="#94a3b8">over ${s.turns.toLocaleString()} model turns</text>
  <text x="${W - 36}" y="104" text-anchor="end" font-family="ui-sans-serif,system-ui,sans-serif" font-size="13" fill="#64748b">peak ~${esc(ktok(s.context.peak))} tok · avg ${esc(ktok(s.context.avg))}</text>
  <rect x="${barX}" y="${barY}" width="${barW}" height="${barH}" rx="4" fill="#1e293b"/>
  ${barParts.join("\n  ")}
  ${legendParts.join("\n  ")}
  <text x="36" y="${H - 130}" font-family="ui-sans-serif,system-ui,sans-serif" font-size="15" font-weight="600" fill="#fbbf24">${insight}</text>
  ${compare}
  <!-- CTA pill: self-distribution — every shared card invites the next user -->
  <rect x="36" y="${pillY}" width="${pillW}" height="${pillH}" rx="17" fill="#34d399"/>
  <text x="${36 + pillW / 2}" y="${pillY + 22}" text-anchor="middle" font-family="ui-sans-serif,system-ui,sans-serif" font-weight="800" font-size="15" fill="#06281b">Make your own → tokenscope.pages.dev</text>
</svg>`;
}

// --- shareable LINK (the self-distribution loop) --------------------------------
//
// We pack the privacy-safe summary into a SHORT, ordered numeric array and base64url
// it into the URL *fragment* (#...). Fragments are NEVER transmitted to a server, so:
//   - the comparison/render happens 100% client-side on a plain static host (no upload),
//   - the privacy guarantee is structural — only the same aggregate numbers --share
//     already prints ever leave the machine, and even those don't hit our server.
// The encode/decode pair is mirrored 1:1 in web/card/card.js (kept in sync by a test).

// base64url that works in Node and the browser without deps.
const toB64url = (str) => {
  const b64 = typeof Buffer !== "undefined"
    ? Buffer.from(str, "utf8").toString("base64")
    : btoa(unescape(encodeURIComponent(str)));
  return b64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
};

// Pack ONLY privacy-safe aggregate numbers into a positional array (v1 schema).
// Order is the contract with the decoder; never add free-text or anything content-derived.
export function packSummary(a) {
  const s = shareSummary(a);
  const sp = s.split;
  const cell = (v) => [v ? v.usd : 0, v ? v.pct : 0];
  // [schema, totalCost, turns, [outU,outP], [crU,crP], [cwU,cwP], [fiU,fiP],
  //  peak, avg, cacheEff, modelCount, [webU,webP]?]
  const arr = [
    1,
    s.totalCost,
    s.turns,
    cell(sp.output),
    cell(sp.cacheRead),
    cell(sp.cacheWrite),
    cell(sp.freshInput),
    s.context.peak,
    s.context.avg,
    s.cacheEfficiency,
    s.models.length
  ];
  if (sp.webTools) arr.push(cell(sp.webTools));
  return arr;
}

// Build the full frictionless share URL for a tokenscope analysis.
// base already ends in "#" (CARD_BASE_URL = ".../?utm_source=...#") so we
// append the payload directly.  A custom base without the trailing "#" is
// handled by the ternary below so callers passing a plain URL still work.
export function shareLink(a, base = CARD_BASE_URL) {
  if (!a || !(a.totalCost > 0)) return null; // nothing to flex on a zero-cost session
  const payload = toB64url(JSON.stringify(packSummary(a)));
  return base.endsWith("#") ? base + payload : base + "#" + payload;
}
