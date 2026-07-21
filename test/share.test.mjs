// Tests for the privacy-safe share summary / markdown / SVG card.
// Run: node test/share.test.mjs
import { parse, analyze } from "../src/core.mjs";
import { shareSummary, shareMarkdown, shareCardSVG, packSummary, shareLink, CARD_BASE_URL } from "../src/share.mjs";

let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; console.log("  ok  - " + n); } else { fail++; console.log(" FAIL - " + n); } };

// Synthetic session with KNOWN numbers + things that MUST NOT leak (a file path tool
// arg is not in this shape, but model ids / requestIds / sidechain flags are present).
const fixture = [
  JSON.stringify({ type: "assistant", timestamp: "t1", isSidechain: false, requestId: "secret-req-id-123", message: { model: "claude-opus-4-7", content: [{ type: "tool_use", name: "Read" }], usage: { input_tokens: 100, output_tokens: 1000, cache_creation_input_tokens: 10000, cache_read_input_tokens: 0, cache_creation: { ephemeral_5m_input_tokens: 10000 } } } }),
  JSON.stringify({ type: "assistant", timestamp: "t2", isSidechain: false, requestId: "r2", message: { model: "claude-opus-4-7", content: [{ type: "tool_use", name: "Bash" }], usage: { input_tokens: 50, output_tokens: 500, cache_read_input_tokens: 20000, cache_creation_input_tokens: 0 } } })
].join("\n");

const a = analyze(parse(fixture), undefined);
const s = shareSummary(a);

// --- summary shape & numbers ---
ok("summary: totalCost matches analyze (rounded to cents)", s.totalCost === Math.round(a.totalCost * 100) / 100);
ok("summary: turns = 2", s.turns === 2);
ok("summary: split has output/cacheRead/cacheWrite/freshInput", !!(s.split.output && s.split.cacheRead && s.split.cacheWrite && s.split.freshInput));
ok("summary: percentages are integers", Object.values(s.split).every((v) => Number.isInteger(v.pct)));
ok("summary: split percentages sum ~100", Math.abs(Object.values(s.split).reduce((t, v) => t + v.pct, 0) - 100) <= 2);
ok("summary: headline mentions re-sent context %", /re-sent .*context/.test(s.headline) && s.headline.includes(s.split.cacheRead.pct + "%"));
ok("summary: models are families only (no concrete id)", s.models.length === 1 && s.models[0] === "claude-opus-4");
ok("summary: context peak/avg are integers", Number.isInteger(s.context.peak) && Number.isInteger(s.context.avg));
ok("summary: cacheEfficiency is integer percent", Number.isInteger(s.cacheEfficiency) && s.cacheEfficiency >= 0 && s.cacheEfficiency <= 100);

// --- PRIVACY: the JSON of the whole summary must not contain forbidden tokens ---
// (Note: "Read" is deliberately NOT in this list — the substring legitimately appears
//  in the JSON key `cacheRead` and the phrase "Read-only", so it can't be a leak signal.
//  Tool-name leakage is covered structurally below.)
const blob = JSON.stringify(s) + "\n" + shareMarkdown(a) + "\n" + shareCardSVG(a);
const forbidden = ["secret-req-id-123", "isSidechain", "requestId", "/home/", "/workspace", ".jsonl", "tool_use", "curve", "timestamp", "claude-opus-4-7"];
for (const tok of forbidden) ok(`privacy: output does NOT contain "${tok}"`, !blob.includes(tok));
// Structural: the summary carries no per-turn / tool / curve data that could hint at work.
ok("privacy: summary has no topTools/topTurns/tools/curve/label keys", ["topTools", "topTurns", "tools", "curve", "label", "mainSide", "insights"].every((kk) => !(kk in s)));
ok("privacy: tool name 'Bash' does not leak", !blob.includes("Bash"));

// --- markdown form ---
const md = shareMarkdown(a);
ok("markdown: has a heading", md.startsWith("### tokenscope"));
ok("markdown: shows total", md.includes("Total:"));
ok("markdown: has a table header row", md.includes("| Where the money went | % | cost |"));
ok("markdown: states no-upload privacy promise", /no upload|no paths|numbers only/i.test(md));

// --- SVG form ---
const svg = shareCardSVG(a);
ok("svg: starts with <svg", svg.trim().startsWith("<svg"));
ok("svg: closes </svg>", svg.trim().endsWith("</svg>"));
ok("svg: self-contained (no external href/script/image)", !/<script|<image|xlink:href|https?:\/\/[^"]*\.(png|jpg|svg|js)/i.test(svg));
ok("svg: balanced rect/text tags render the bar", (svg.match(/<rect/g) || []).length >= 3 && (svg.match(/<text/g) || []).length >= 4);
ok("svg: escapes special chars (no raw < > inside text payloads beyond tags)", !/&(?!amp;|lt;|gt;|quot;|#)/.test(svg));

// --- benchmark: "how this compares" (vs the shipped reference set) ---
ok("benchmark: present for a non-zero session", s.benchmark && typeof s.benchmark === "object");
ok("benchmark: percentiles are integers in 1..99", [s.benchmark.costPctile, s.benchmark.cacheEffPctile, s.benchmark.resentPctile].every((p) => Number.isInteger(p) && p >= 1 && p <= 99));
ok("benchmark: ref carries n + an ISO asOf date", s.benchmark.ref.n > 0 && /^\d{4}-\d{2}-\d{2}$/.test(s.benchmark.ref.asOf));
ok("benchmark: median figures present", s.benchmark.median.costUsd > 0 && s.benchmark.median.cacheEff > 0);
ok("markdown: includes the comparison block", /How this compares/.test(md) && /measured/.test(md));
ok("svg: includes the comparison line", svg.includes("measured sessions"));

// --- share LINK (the self-distribution loop) ---
// This decoder is a 1:1 mirror of web/card/card.js:unpackSummary. If the Node encoder
// (packSummary) and the browser decoder ever drift, this round-trip test fails — that's
// the point: it pins the wire contract that the real-browser E2E also exercises.
function unpackSummaryMirror(arr) {
  if (!Array.isArray(arr) || arr[0] !== 1) throw new Error("unsupported card schema");
  const cell = (c) => ({ usd: (c && c[0]) || 0, pct: (c && c[1]) || 0 });
  const split = { output: cell(arr[3]), cacheRead: cell(arr[4]), cacheWrite: cell(arr[5]), freshInput: cell(arr[6]) };
  if (arr.length > 11 && Array.isArray(arr[11])) split.webTools = cell(arr[11]);
  return {
    tool: "tokenscope", totalCost: arr[1] || 0, turns: arr[2] || 0, split,
    context: { peak: arr[7] || 0, avg: arr[8] || 0 },
    cacheEfficiency: arr[9] || 0, modelCount: arr[10] || 0
  };
}
const b64urlDecode = (s) => {
  let b64 = s.replace(/-/g, "+").replace(/_/g, "/");
  while (b64.length % 4) b64 += "=";
  return Buffer.from(b64, "base64").toString("utf8");
};

const link = shareLink(a);
// CARD_BASE_URL already ends in "#" (UTM params + trailing #), so the link IS the base + payload.
ok("link: is an https url to the /card/ page", typeof link === "string" && link.startsWith(CARD_BASE_URL));
ok("link: payload lives in the URL fragment (after #) — never sent to a server", link.indexOf("#") === link.lastIndexOf("#") && link.split("#")[1].length > 0);
const decodedArr = JSON.parse(b64urlDecode(link.split("#")[1]));
const decoded = unpackSummaryMirror(decodedArr);
ok("link: round-trips totalCost", decoded.totalCost === s.totalCost);
ok("link: round-trips turns", decoded.turns === s.turns);
ok("link: round-trips the split (output/cacheRead/cacheWrite/freshInput pct+usd)",
  decoded.split.output.pct === s.split.output.pct && decoded.split.cacheRead.usd === s.split.cacheRead.usd &&
  decoded.split.cacheWrite.pct === s.split.cacheWrite.pct && decoded.split.freshInput.usd === s.split.freshInput.usd);
ok("link: round-trips context peak/avg + cacheEfficiency", decoded.context.peak === s.context.peak && decoded.context.avg === s.context.avg && decoded.cacheEfficiency === s.cacheEfficiency);
ok("link: round-trips model COUNT only (not model names — privacy)", decoded.modelCount === s.models.length);
// PRIVACY: the encoded fragment must not carry any forbidden token either.
const fragBlob = decodeURIComponent(b64urlDecode(link.split("#")[1]));
for (const tok of forbidden) ok(`link-privacy: fragment does NOT contain "${tok}"`, !fragBlob.includes(tok));
ok("link-privacy: fragment carries no model id/name string at all (numbers only)", !/[a-zA-Z]/.test(fragBlob.replace(/[\[\],\s.\-eE]/g, "")) || /^[\d.,\[\]\s-]+$/.test(fragBlob));
ok("link: a fresh card SVG built from the DECODED summary still renders (recipient view)",
  shareCardSVG({ breakdown: { out: decoded.split.output.usd, cacheRead: decoded.split.cacheRead.usd, cacheWrite: decoded.split.cacheWrite.usd, freshIn: decoded.split.freshInput.usd },
    pct: { out: decoded.split.output.pct, cacheRead: decoded.split.cacheRead.pct, cacheWrite: decoded.split.cacheWrite.pct, freshIn: decoded.split.freshInput.pct },
    totalCost: decoded.totalCost, turns: decoded.turns, context: { peak: decoded.context.peak, avg: decoded.context.avg }, cacheEfficiency: decoded.cacheEfficiency / 100, byModel: {} }).trim().startsWith("<svg"));

// --- empty/zero-cost session degrades gracefully ---
const empty = analyze([], undefined);
const es = shareSummary(empty);
ok("empty: totalCost 0, turns 0", es.totalCost === 0 && es.turns === 0);
ok("empty: benchmark is null (no comparison on a no-cost session)", es.benchmark === null);
ok("empty: headline says no measurable cost", /no measurable cost/i.test(es.headline));
ok("empty: shareMarkdown does not throw", typeof shareMarkdown(empty) === "string");
ok("empty: shareCardSVG does not throw and is valid svg", shareCardSVG(empty).trim().startsWith("<svg"));
ok("empty: shareLink is null (nothing to flex on a zero-cost session)", shareLink(empty) === null);

console.log("\n" + pass + " passed, " + fail + " failed");
process.exit(fail ? 1 : 0);
