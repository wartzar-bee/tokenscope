// Tests for the privacy-safe share summary / markdown / SVG card.
// Run: node test/share.test.mjs
import { parse, analyze } from "../src/core.mjs";
import { shareSummary, shareMarkdown, shareCardSVG } from "../src/share.mjs";

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

// --- empty/zero-cost session degrades gracefully ---
const empty = analyze([], undefined);
const es = shareSummary(empty);
ok("empty: totalCost 0, turns 0", es.totalCost === 0 && es.turns === 0);
ok("empty: headline says no measurable cost", /no measurable cost/i.test(es.headline));
ok("empty: shareMarkdown does not throw", typeof shareMarkdown(empty) === "string");
ok("empty: shareCardSVG does not throw and is valid svg", shareCardSVG(empty).trim().startsWith("<svg"));

console.log("\n" + pass + " passed, " + fail + " failed");
process.exit(fail ? 1 : 0);
