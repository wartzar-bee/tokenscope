// Correctness tests: cost math + analysis on a synthetic fixture (controlled numbers).
// Run: node test/core.test.mjs
import { costOf, familyFor } from "../src/pricing.mjs";
import { parse, analyze } from "../src/core.mjs";

let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; console.log("  ok  - " + n); } else { fail++; console.log(" FAIL - " + n); } };
const near = (a, b, t = 1e-9) => Math.abs(a - b) <= t;

// --- pricing.familyFor ---
ok("family: opus-4-7 -> claude-opus-4", familyFor("claude-opus-4-7") === "claude-opus-4");
ok("family: sonnet-4-6 -> claude-sonnet-4", familyFor("claude-sonnet-4-6-20260101") === "claude-sonnet-4");
ok("family: unknown -> null", familyFor("mystery-model-9") === null);

// --- costOf (opus: in 15/M, out 75/M; cacheWrite5m 1.25x, cacheRead 0.1x) ---
const c1 = costOf({ input_tokens: 100, output_tokens: 1000, cache_creation_input_tokens: 10000, cache_read_input_tokens: 0, cache_creation: { ephemeral_5m_input_tokens: 10000, ephemeral_1h_input_tokens: 0 } }, "claude-opus-4-7");
ok("turn1 total = 0.264", near(c1.total, 0.264, 1e-6));
ok("turn1 cacheWrite = 0.1875", near(c1.cacheWrite, 0.1875, 1e-6));
ok("turn1 known pricing", c1.known === true);
const c2 = costOf({ input_tokens: 50, output_tokens: 500, cache_read_input_tokens: 20000, cache_creation_input_tokens: 0 }, "claude-opus-4-7");
ok("turn2 cacheRead = 0.03", near(c2.cacheRead, 0.03, 1e-6));
ok("turn2 total = 0.06825", near(c2.total, 0.06825, 1e-6));
const cu = costOf({ input_tokens: 1000, output_tokens: 1000 }, "unknown-model");
ok("unknown model -> known:false, total 0 (no silent guess)", cu.known === false && cu.total === 0);

// --- parse + analyze on synthetic JSONL ---
const fixture = [
  JSON.stringify({ type: "assistant", timestamp: "t1", isSidechain: false, requestId: "r1", message: { model: "claude-opus-4-7", content: [{ type: "tool_use", name: "Read" }, { type: "thinking" }], usage: { input_tokens: 100, output_tokens: 1000, cache_creation_input_tokens: 10000, cache_read_input_tokens: 0, cache_creation: { ephemeral_5m_input_tokens: 10000 } } } }),
  JSON.stringify({ type: "user", message: { content: [{ type: "tool_result" }] } }),
  JSON.stringify({ type: "assistant", timestamp: "t2", isSidechain: false, requestId: "r2", message: { model: "claude-opus-4-7", content: [{ type: "tool_use", name: "Read" }, { type: "tool_use", name: "Bash" }], usage: { input_tokens: 50, output_tokens: 500, cache_read_input_tokens: 20000, cache_creation_input_tokens: 0 } } }),
  JSON.stringify({ type: "assistant", timestamp: "t3", isSidechain: true, requestId: "r3", message: { model: "claude-sonnet-4-6", content: [], usage: { input_tokens: 10, output_tokens: 100, cache_read_input_tokens: 1000, cache_creation_input_tokens: 0 } } }),
  "not json — should be skipped",
  JSON.stringify({ type: "system", subtype: "info" })
].join("\n");

const turns = parse(fixture);
ok("parse: 3 assistant turns (skips user/system/garbage)", turns.length === 3);
const a = analyze(turns, undefined);
ok("analyze: turns = 3", a.turns === 3);
ok("analyze: total = 0.264+0.06825 + sonnet turn", near(a.totalCost, 0.264 + 0.06825 + (10 / 1e6 * 3 + 100 / 1e6 * 15 + 1000 / 1e6 * 3 * 0.1), 1e-6));
ok("analyze: peak context = 20050", a.context.peak === 20050);
ok("analyze: cacheEfficiency ~ 0.6798", near(a.cacheEfficiency, 21000 / (160 + 21000 + 10000), 1e-6));
ok("analyze: tool Read counted twice", a.topTools.find((t) => t[0] === "Read")[1] === 2);
ok("analyze: sidechain split has 1 turn", a.mainSide.sidechain.turns === 1);
ok("analyze: byModel has opus + sonnet", !!a.byModel["claude-opus-4"] && !!a.byModel["claude-sonnet-4"]);
ok("analyze: topTurns[0] is the priciest (turn1)", a.topTurns[0].cost > a.topTurns[1].cost && near(a.topTurns[0].cost, 0.264, 1e-6));
ok("analyze: produces insights", a.insights.length >= 2);
ok("analyze: no unknown models", a.unknownModels.length === 0);

console.log("\n" + pass + " passed, " + fail + " failed");
process.exit(fail ? 1 : 0);
