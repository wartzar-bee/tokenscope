// Parse Claude Code session JSONL → turns, then analyze. Pure (no I/O).
import { costOf, familyFor } from "./pricing.mjs";

// Each line is a JSON object; assistant lines carry message.usage + message.model.
export function parse(text) {
  const turns = [];
  for (const line of text.split("\n")) {
    const s = line.trim();
    if (!s) continue;
    let o;
    try { o = JSON.parse(s); } catch { continue; }
    if (o.type !== "assistant" || !o.message || !o.message.usage) continue;
    const content = Array.isArray(o.message.content) ? o.message.content : [];
    turns.push({
      model: o.message.model || "unknown",
      usage: o.message.usage,
      ts: o.timestamp || null,
      isSidechain: !!o.isSidechain,
      tools: content.filter((c) => c && c.type === "tool_use").map((c) => c.name || "tool"),
      requestId: o.requestId || o.message.id || null
    });
  }
  return turns;
}

function ctxSize(u) {
  return (u.input_tokens || 0) + (u.cache_read_input_tokens || 0) + (u.cache_creation_input_tokens || 0);
}

export function analyze(turns, pricing) {
  const sum = { total: 0, freshIn: 0, cacheWrite: 0, cacheRead: 0, out: 0, webTools: 0, webReq: 0 };
  const tok = { input: 0, cacheRead: 0, cacheCreate: 0, output: 0 };
  const byModel = {}, tools = {}, unknown = new Set();
  const mainSide = { main: { cost: 0, turns: 0 }, sidechain: { cost: 0, turns: 0 } };
  const curve = [], perTurn = [];
  let dedupReqIds = new Set();

  turns.forEach((t, i) => {
    const c = costOf(t.usage, t.model, pricing);
    for (const k of Object.keys(sum)) sum[k] += c[k] || 0;
    tok.input += t.usage.input_tokens || 0;
    tok.cacheRead += t.usage.cache_read_input_tokens || 0;
    tok.cacheCreate += t.usage.cache_creation_input_tokens || 0;
    tok.output += t.usage.output_tokens || 0;
    if (!c.known) unknown.add(t.model);
    const fam = familyFor(t.model, pricing) || t.model;
    (byModel[fam] = byModel[fam] || { cost: 0, turns: 0 }).cost += c.total;
    byModel[fam].turns++;
    (t.isSidechain ? mainSide.sidechain : mainSide.main).cost += c.total;
    (t.isSidechain ? mainSide.sidechain : mainSide.main).turns++;
    for (const name of t.tools) tools[name] = (tools[name] || 0) + 1;
    const cs = ctxSize(t.usage);
    curve.push(cs);
    perTurn.push({ i, cost: c.total, ctx: cs, model: fam, out: t.usage.output_tokens || 0 });
    if (t.requestId) dedupReqIds.add(t.requestId);
  });

  const n = turns.length;
  const peak = curve.length ? Math.max(...curve) : 0;
  const avgCtx = curve.length ? curve.reduce((a, b) => a + b, 0) / curve.length : 0;
  const cacheDenom = tok.input + tok.cacheRead + tok.cacheCreate;
  const cacheEff = cacheDenom ? tok.cacheRead / cacheDenom : 0;
  const topTurns = [...perTurn].sort((a, b) => b.cost - a.cost).slice(0, 5);
  const topTools = Object.entries(tools).sort((a, b) => b[1] - a[1]);

  const pct = (x) => (sum.total ? (x / sum.total) * 100 : 0);
  const insights = [];
  if (sum.total > 0) {
    insights.push(
      `Re-sent (cached) context cost $${sum.cacheRead.toFixed(2)} (${pct(sum.cacheRead).toFixed(0)}% of spend) across ${n} turns — that's context re-read every turn.`
    );
    insights.push(
      `Peak context ~${Math.round(peak).toLocaleString()} tokens (avg ${Math.round(avgCtx).toLocaleString()}). ` +
      (peak > 120000 ? "Large — /compact or a fresh session would cut per-turn cost." : "Reasonable.")
    );
    if (pct(sum.out) < 25 && sum.cacheRead + sum.freshIn + sum.cacheWrite > sum.out)
      insights.push(`Only ${pct(sum.out).toFixed(0)}% of spend is the model's actual output — most is moving context in/out. Tighten what stays in context.`);
    if (mainSide.sidechain.turns) insights.push(`Subagents: $${mainSide.sidechain.cost.toFixed(2)} over ${mainSide.sidechain.turns} turns (${pct(mainSide.sidechain.cost).toFixed(0)}%).`);
    if (sum.webReq) insights.push(`Web tool requests: ${sum.webReq} (~$${sum.webTools.toFixed(2)}).`);
  }

  return {
    turns: n, totalCost: sum.total, breakdown: sum, tokens: tok,
    pct: { freshIn: pct(sum.freshIn), cacheWrite: pct(sum.cacheWrite), cacheRead: pct(sum.cacheRead), out: pct(sum.out), webTools: pct(sum.webTools) },
    context: { peak, avg: avgCtx, last: curve[curve.length - 1] || 0, curve },
    cacheEfficiency: cacheEff, byModel, mainSide, topTurns, topTools,
    unknownModels: [...unknown], insights
  };
}
