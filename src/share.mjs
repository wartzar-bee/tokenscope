// Shareable, PRIVACY-SAFE summary of a tokenscope analysis.
// Emits aggregate numbers ONLY — NO file paths, NO prompt/response content, NO labels.
// Reuses the cost math from analyze() (src/core.mjs); does not recompute costs.
//
// Three outputs from one summary:
//   shareSummary(a)      -> a compact, privacy-safe data object
//   shareMarkdown(a)     -> markdown to paste into Reddit/Discord/GitHub issues
//   shareCardSVG(a)      -> a self-contained "cost report card" SVG (renders on GitHub)

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

  return {
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
  L.push("_Generated locally by [tokenscope](https://github.com/wartzar-bee/tokenscope) — `npx @wartzar-bee/tokenscope --share`. Read-only, no upload; numbers only, no paths or content._");
  return L.join("\n");
}

// A self-contained "cost report card" SVG. No external fonts/images/scripts — renders
// inline on GitHub and is trivially shareable. Pure aggregate numbers only.
export function shareCardSVG(a) {
  const s = shareSummary(a);
  const esc = (str) => String(str).replace(/[&<>"]/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[ch]));

  const W = 600, H = 340;
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
  <text x="36" y="${H - 64}" font-family="ui-sans-serif,system-ui,sans-serif" font-size="15" font-weight="600" fill="#fbbf24">${esc(s.split.cacheRead.pct)}% of spend was re-sent (cached) context</text>
  <text x="36" y="${H - 24}" font-family="ui-sans-serif,system-ui,sans-serif" font-size="12" fill="#64748b">npx @wartzar-bee/tokenscope --share  ·  read-only, local, numbers only</text>
</svg>`;
}
