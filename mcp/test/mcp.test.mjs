// Self-validating test for the tokenscope MCP server.
// Builds a synthetic Claude Code session JSONL, runs each tool through the REAL
// MCP request handlers, and asserts the returned data is real (non-zero cost,
// correct attribution math, working benchmark percentiles).
//
// Run: node test/mcp.test.mjs   (from the mcp/ dir, after `npm install`)
import { writeFileSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import assert from "node:assert/strict";
import { server, TOOLS } from "../server.mjs";

let pass = 0;
const ok = (cond, msg) => { assert.ok(cond, msg); console.log("  ok -", msg); pass++; };

// --- The MCP SDK keeps handlers private; drive them via a thin protocol shim ---
// We reconstruct the call by invoking the registered handlers through the server's
// internal request handling. The SDK exposes `setRequestHandler`; to call them we
// emulate a request object matching the schema.
//
// Simpler + robust: import the same engine path the handlers use, but ALSO verify
// the handlers were registered by listing tools through the public TOOLS export and
// by invoking the handler map the SDK stored.
const handlers = server["_requestHandlers"]; // Map<method, handler>
assert.ok(handlers && handlers.size, "server registered request handlers");

async function call(method, params) {
  // The MCP SDK registers handlers under the JSON-RPC method names.
  const m = method === "list" ? "tools/list" : "tools/call";
  const h = handlers.get(m);
  assert.ok(h, `handler for ${m} exists`);
  return h({ method: m, params }, {});
}

async function main() {
  console.log("tokenscope MCP — self-test\n");

  // 1) Build a realistic synthetic Claude Code session.
  const dir = mkdtempSync(join(tmpdir(), "tokenscope-mcp-"));
  const file = join(dir, "session.jsonl");
  const turn = (i, ctx, out) => JSON.stringify({
    type: "assistant",
    timestamp: new Date(1717000000000 + i * 60000).toISOString(),
    requestId: "req-" + i,
    isSidechain: i % 7 === 0,
    message: {
      id: "msg-" + i,
      model: "claude-opus-4-20260101",
      content: [
        { type: "text", text: "..." },
        ...(i % 3 === 0 ? [{ type: "tool_use", name: "Bash" }] : []),
        ...(i % 4 === 0 ? [{ type: "tool_use", name: "Read" }] : []),
      ],
      usage: {
        input_tokens: 200,
        output_tokens: out,
        cache_read_input_tokens: ctx,          // big re-sent context (the headline cost)
        cache_creation_input_tokens: 1500,
      },
    },
  });
  const lines = [];
  // A couple of noise lines that must be ignored.
  lines.push(JSON.stringify({ type: "user", message: { content: "hi" } }));
  lines.push("not json at all");
  for (let i = 1; i <= 30; i++) lines.push(turn(i, 10000 + i * 4000, 400 + i * 10));
  writeFileSync(file, lines.join("\n") + "\n");

  // 2) list_tools returns our 3 tools.
  const listed = await call("list", {});
  ok(Array.isArray(listed.tools) && listed.tools.length === 3, "list_tools returns 3 tools");
  const names = listed.tools.map((t) => t.name).sort();
  ok(
    JSON.stringify(names) === JSON.stringify(["analyze_claude_cost", "get_cost_benchmark", "tokenscope_share_summary"]),
    "tool names match: " + names.join(", ")
  );
  ok(listed.tools.every((t) => t.inputSchema && t.inputSchema.type === "object"), "every tool has an object inputSchema");

  // 3) analyze_claude_cost on the fixture → real numbers.
  const aRes = await call("call", { name: "analyze_claude_cost", arguments: { path: file } });
  ok(!aRes.isError, "analyze_claude_cost did not error");
  const a = JSON.parse(aRes.content[0].text);
  ok(a.turns === 30, `analyzed 30 turns (got ${a.turns})`);
  ok(a.totalCost > 0, `totalCost is real (> 0): $${a.totalCost.toFixed?.(2) ?? a.totalCost}`);
  ok(a.breakdown.cacheRead > a.breakdown.out, "re-sent context costs more than output (as designed)");
  // attribution sums to the total (within float tolerance).
  const sum = a.breakdown.out + a.breakdown.cacheRead + a.breakdown.cacheWrite + a.breakdown.freshIn + a.breakdown.webTools;
  ok(Math.abs(sum - a.totalCost) < 1e-6, "component costs sum to total");
  ok(Array.isArray(a.insights) && a.insights.length > 0, `insights present (${a.insights.length})`);
  ok(a.context && a.context.peak > 0, `context peak computed (${a.context.peak})`);
  ok(a.mainSide.sidechain.turns > 0, "subagent (sidechain) turns detected");

  // 4) pricing override changes the cost.
  const pRes = await call("call", { name: "analyze_claude_cost", arguments: { path: file, pricing: { "claude-opus-4": { in: 30, out: 150 } } } });
  const pA = JSON.parse(pRes.content[0].text);
  ok(pA.totalCost > a.totalCost, `pricing override raised cost ($${a.totalCost.toFixed(2)} -> $${pA.totalCost.toFixed(2)})`);

  // 5) get_cost_benchmark from the same session → percentiles in range.
  const bRes = await call("call", { name: "get_cost_benchmark", arguments: { path: file } });
  ok(!bRes.isError, "get_cost_benchmark did not error");
  const b = JSON.parse(bRes.content[0].text);
  ok(b.benchmark && b.benchmark.ref.n === 66, "benchmark references the n=66 set");
  const cp = b.benchmark.cacheEffPctile;
  ok(cp >= 1 && cp <= 99, `cacheEff percentile in [1,99]: ${cp}`);

  // 6) get_cost_benchmark from explicit numbers.
  const b2Res = await call("call", { name: "get_cost_benchmark", arguments: { totalCost: 4.08, resentPct: 24, cacheEfficiency: 83 } });
  const b2 = JSON.parse(b2Res.content[0].text);
  ok(Math.abs(b2.benchmark.costPctile - 50) <= 1, `median cost maps to ~p50 (got ${b2.benchmark.costPctile})`);

  // 7) get_cost_benchmark with no args → describes the reference set.
  const b3Res = await call("call", { name: "get_cost_benchmark", arguments: {} });
  const b3 = JSON.parse(b3Res.content[0].text);
  ok(b3.reference && b3.reference.n === 66, "no-arg benchmark returns the reference set");

  // 8) tokenscope_share_summary → privacy-safe (no paths/content) + markdown.
  const sRes = await call("call", { name: "tokenscope_share_summary", arguments: { path: file } });
  ok(!sRes.isError, "tokenscope_share_summary did not error");
  const s = JSON.parse(sRes.content[0].text);
  ok(s.summary && s.summary.tool === "tokenscope", "share summary present");
  ok(typeof s.markdown === "string" && s.markdown.includes("tokenscope"), "markdown block present");
  const blob = JSON.stringify(s);
  ok(!blob.includes(file) && !blob.includes(dir), "share output leaks NO file paths (privacy-safe)");

  // 9) error path: bad path is reported, not thrown.
  const eRes = await call("call", { name: "analyze_claude_cost", arguments: { path: "/no/such/file.jsonl" } });
  ok(eRes.isError === true, "missing file returns an MCP error result (not a crash)");

  console.log(`\nALL ${pass} CHECKS PASSED`);
}

main().catch((e) => { console.error("\nTEST FAILED:", e); process.exit(1); });
