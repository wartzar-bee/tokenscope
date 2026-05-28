// Terminal report formatter. Respects NO_COLOR.
const NC = process.env.NO_COLOR || !process.stdout.isTTY;
const c = (code, s) => (NC ? s : `\x1b[${code}m${s}\x1b[0m`);
const bold = (s) => c("1", s), dim = (s) => c("2", s), grn = (s) => c("32", s),
  ylw = (s) => c("33", s), cyn = (s) => c("36", s), red = (s) => c("31", s), mag = (s) => c("35", s);
const SPARK = "▁▂▃▄▅▆▇█";
const usd = (n) => "$" + n.toFixed(n < 10 ? 4 : 2);
const k = (n) => (n >= 1000 ? (n / 1000).toFixed(n >= 100000 ? 0 : 1) + "k" : String(Math.round(n)));

function sparkline(arr, width = 40) {
  if (!arr.length) return "";
  let a = arr;
  if (a.length > width) { // bucket down to width
    const out = [], step = a.length / width;
    for (let i = 0; i < width; i++) out.push(a[Math.floor(i * step)]);
    a = out;
  }
  const max = Math.max(...a) || 1;
  return a.map((v) => SPARK[Math.min(7, Math.floor((v / max) * 7))]).join("");
}

function bar(pct, width = 24) {
  const f = Math.round((pct / 100) * width);
  return "█".repeat(f) + dim("░".repeat(width - f));
}

export function render(a, meta = {}) {
  const L = [];
  L.push("");
  L.push(bold(mag("  tokenscope ⏣  ")) + dim(meta.label || "session"));
  L.push(dim("  " + "─".repeat(54)));
  L.push(`  ${bold("Total cost")}   ${bold(grn(usd(a.totalCost)))}   ${dim("over")} ${bold(String(a.turns))} ${dim("model turns")}`);
  if (a.unknownModels.length)
    L.push("  " + ylw(`⚠ unknown pricing for: ${a.unknownModels.join(", ")} — excluded from cost. Override via .tokenscope.json`));
  L.push("");
  // cost breakdown
  L.push(bold("  Where the money went"));
  const rows = [
    ["output (model writing)", a.breakdown.out, a.pct.out, cyn],
    ["cache read (re-sent ctx)", a.breakdown.cacheRead, a.pct.cacheRead, ylw],
    ["cache write (new ctx)", a.breakdown.cacheWrite, a.pct.cacheWrite, mag],
    ["fresh input", a.breakdown.freshIn, a.pct.freshIn, grn],
    ["web tools", a.breakdown.webTools, a.pct.webTools, dim]
  ];
  for (const [lbl, val, pct, color] of rows) {
    if (val <= 0 && pct <= 0) continue;
    L.push(`  ${lbl.padEnd(26)} ${color(bar(pct))} ${String(pct.toFixed(0)).padStart(3)}%  ${dim(usd(val))}`);
  }
  L.push("");
  // context
  L.push(bold("  Context size per turn  ") + dim(`(peak ${k(a.context.peak)} · avg ${k(a.context.avg)} · now ${k(a.context.last)} tokens)`));
  L.push("  " + cyn(sparkline(a.context.curve)));
  L.push(`  cache efficiency ${bold((a.cacheEfficiency * 100).toFixed(0) + "%")} ${dim("(context re-read vs total prompt tokens)")}`);
  L.push("");
  // models / subagents
  const models = Object.entries(a.byModel).sort((x, y) => y[1].cost - x[1].cost);
  if (models.length > 1) {
    L.push(bold("  By model"));
    for (const [m, v] of models) L.push(`  ${m.padEnd(20)} ${dim(v.turns + " turns")}  ${usd(v.cost)}`);
    L.push("");
  }
  if (a.topTools.length) {
    L.push(bold("  Tool calls ") + dim("(what filled context)"));
    L.push("  " + a.topTools.slice(0, 8).map(([n, ct]) => `${n} ${dim("×" + ct)}`).join("  "));
    L.push("");
  }
  // insights
  if (a.insights.length) {
    L.push(bold(ylw("  Insights")));
    for (const ins of a.insights) L.push("  • " + ins);
    L.push("");
  }
  L.push(dim("  prices: defaults — verify & override in .tokenscope.json. tokenscope is read-only & local."));
  L.push("");
  return L.join("\n");
}
