#!/usr/bin/env node
// tokenscope MCP server — exposes tokenscope's Claude Code cost-attribution engine
// as Model Context Protocol tools, so AI agents / MCP clients can ask
// "what did my Claude Code session cost, and what's eating my context?"
//
// It REUSES tokenscope's existing analysis engine (src/core.mjs, src/share.mjs,
// src/benchmark.mjs) — the exact same code path as the `--json` CLI output.
// No cost logic is reimplemented here; this is a thin MCP wrapper.
//
// Read-only & local: it only reads Claude Code session JSONL under
// ~/.claude/projects (or a path you pass). Nothing is sent anywhere.
// MIT. Not affiliated with Anthropic.

import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { homedir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  ListToolsRequestSchema,
  CallToolRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";

// Reuse the venture's REAL engine — no cost logic is reimplemented here.
// We import the exact same modules the `tokenscope` CLI uses. When this package
// is installed standalone (npx), they resolve from the `@wartzar-bee/tokenscope`
// dependency; when run from a clone of the monorepo, they resolve from ../src.
const __dir = dirname(fileURLToPath(import.meta.url));
async function loadEngine() {
  // Prefer the local monorepo src (dev / clone), else the installed dependency.
  const localSrc = join(__dir, "..", "src", "core.mjs");
  const useLocal = existsSync(localSrc);
  const base = useLocal ? join(__dir, "..", "src") + "/" : "@wartzar-bee/tokenscope/src/";
  const imp = (m) => import(base + m);
  const core = await imp("core.mjs");
  const share = await imp("share.mjs");
  const bench = await imp("benchmark.mjs");
  const pricing = await imp("pricing.mjs");
  return { ...core, ...share, ...bench, ...pricing };
}
const ENGINE = await loadEngine();
const { parse, analyze, shareSummary, shareMarkdown, benchmarkOf, BENCHMARK, percentileOf, DEFAULT_PRICING } = ENGINE;

const PKG = JSON.parse(readFileSync(join(__dir, "package.json"), "utf8"));

// ---- session discovery (same rules as bin/tokenscope.mjs) --------------------
function findJsonl(dir, out = []) {
  let entries = [];
  try { entries = readdirSync(dir, { withFileTypes: true }); } catch { return out; }
  for (const e of entries) {
    const p = join(dir, e.name);
    if (e.isDirectory()) findJsonl(p, out);
    else if (e.name.endsWith(".jsonl")) {
      try { out.push({ p, m: statSync(p).mtimeMs, s: statSync(p).size }); } catch {}
    }
  }
  return out;
}

function resolveFiles({ path, all } = {}) {
  if (path) {
    if (!existsSync(path)) throw new Error(`Not found: ${path}`);
    if (statSync(path).isDirectory()) {
      const files = findJsonl(path).map((f) => f.p);
      if (!files.length) throw new Error(`No .jsonl session files under ${path}`);
      return { files, label: path };
    }
    return { files: [path], label: path };
  }
  const projectsDir = join(homedir(), ".claude", "projects");
  const found = findJsonl(projectsDir).filter((f) => f.s > 200);
  if (!found.length) {
    throw new Error(
      `No Claude Code sessions found under ${projectsDir}. ` +
      `Pass {"path": "<file-or-dir>.jsonl"} explicitly.`
    );
  }
  if (all) return { files: found.map((f) => f.p), label: `all sessions (${found.length})` };
  const latest = found.sort((a, b) => b.m - a.m)[0];
  return { files: [latest.p], label: "latest session" };
}

function analyzePath({ path, all, pricing } = {}) {
  const { files, label } = resolveFiles({ path, all });
  let turns = [];
  for (const f of files) {
    try { turns = turns.concat(parse(readFileSync(f, "utf8"))); } catch {}
  }
  if (!turns.length) throw new Error("No assistant turns with usage found in the session(s).");
  const pr = pricing ? { ...DEFAULT_PRICING, ...pricing } : DEFAULT_PRICING;
  return { label, analysis: analyze(turns, pr) };
}

// JSON shape mirrors the CLI's `--json` (curve dropped to stay compact).
function toJson(label, a) {
  return { label, ...a, context: { ...a.context, curve: undefined } };
}

// ---- MCP tool definitions ----------------------------------------------------
const TOOLS = [
  {
    name: "analyze_claude_cost",
    description:
      "Analyze a Claude Code session's token cost and context attribution. " +
      "Reads Claude Code session JSONL (read-only, local) and returns the total cost, " +
      "the spend breakdown (model output vs re-sent cached context vs cache-write vs fresh input), " +
      "the per-turn context-growth peak/avg, cache efficiency, cost by model, subagent spend, " +
      "tool-call counts, and plain-language insights. With no path it analyzes your most recent " +
      "Claude Code session under ~/.claude/projects.",
    inputSchema: {
      type: "object",
      properties: {
        path: {
          type: "string",
          description: "Optional path to a session .jsonl file or a directory of them. Omit to use your latest Claude Code session.",
        },
        all: {
          type: "boolean",
          description: "Aggregate ALL sessions under ~/.claude/projects (ignored if `path` is set). Default false.",
        },
        pricing: {
          type: "object",
          description: 'Optional per-model price overrides, e.g. {"claude-opus-4": {"in": 15, "out": 75}} (USD per 1M tokens).',
        },
      },
    },
  },
  {
    name: "get_cost_benchmark",
    description:
      "Compare a Claude Code session against tokenscope's shipped reference set of real sessions " +
      "(n=66) and report percentiles: how big the session's cost is vs the set, its re-sent-context share, " +
      "and how cache-efficient it is ('more cache-efficient than ~P% of measured sessions'). " +
      "Either pass a `path` to a session, or pass explicit `totalCost`/`resentPct`/`cacheEfficiency` numbers. " +
      "This is a yardstick reference set, not a population census.",
    inputSchema: {
      type: "object",
      properties: {
        path: { type: "string", description: "Optional session .jsonl path/dir to derive the metrics from." },
        all: { type: "boolean", description: "With no path-derived metrics, aggregate ALL sessions. Default false." },
        totalCost: { type: "number", description: "Session total cost (USD). Used if `path` is omitted." },
        resentPct: { type: "number", description: "Percent of spend that was re-sent (cached) context. Used if `path` is omitted." },
        cacheEfficiency: { type: "number", description: "Cache efficiency percent (0-100). Used if `path` is omitted." },
      },
    },
  },
  {
    name: "tokenscope_share_summary",
    description:
      "Produce a privacy-safe, shareable summary of a Claude Code session built ONLY from aggregate " +
      "numbers (no file paths, no prompt/response content) — safe to paste in public. Returns both a " +
      "structured summary object and a ready-to-paste markdown block. With no path it uses your latest session.",
    inputSchema: {
      type: "object",
      properties: {
        path: { type: "string", description: "Optional session .jsonl path/dir. Omit to use your latest session." },
        all: { type: "boolean", description: "Aggregate ALL sessions. Default false." },
      },
    },
  },
];

const server = new Server(
  { name: "tokenscope", version: PKG.version },
  { capabilities: { tools: {} } }
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: TOOLS }));

server.setRequestHandler(CallToolRequestSchema, async (req) => {
  const { name, arguments: args = {} } = req.params;
  try {
    if (name === "analyze_claude_cost") {
      const { label, analysis } = analyzePath(args);
      return { content: [{ type: "text", text: JSON.stringify(toJson(label, analysis), null, 2) }] };
    }

    if (name === "get_cost_benchmark") {
      let metrics;
      if (args.path || args.all) {
        const { analysis } = analyzePath({ path: args.path, all: args.all });
        const s = shareSummary(analysis);
        metrics = { totalCost: s.totalCost, resentPct: s.split.cacheRead.pct, cacheEfficiency: s.cacheEfficiency };
      } else if (args.totalCost != null || args.resentPct != null || args.cacheEfficiency != null) {
        metrics = {
          totalCost: args.totalCost ?? BENCHMARK.costUsd.p50,
          resentPct: args.resentPct ?? BENCHMARK.resentPct.p50,
          cacheEfficiency: args.cacheEfficiency ?? BENCHMARK.cacheEff.p50,
        };
      } else {
        // No input at all → describe the reference set itself.
        return {
          content: [{
            type: "text",
            text: JSON.stringify({
              reference: BENCHMARK,
              note: "Pass `path` or explicit totalCost/resentPct/cacheEfficiency to get your percentiles.",
            }, null, 2),
          }],
        };
      }
      const bench = benchmarkOf({
        totalCost: metrics.totalCost,
        split: { cacheRead: { pct: metrics.resentPct } },
        cacheEfficiency: metrics.cacheEfficiency,
      });
      return {
        content: [{ type: "text", text: JSON.stringify({ input: metrics, benchmark: bench }, null, 2) }],
      };
    }

    if (name === "tokenscope_share_summary") {
      const { analysis } = analyzePath({ path: args.path, all: args.all });
      const summary = shareSummary(analysis);
      const markdown = shareMarkdown(analysis);
      return {
        content: [{ type: "text", text: JSON.stringify({ summary, markdown }, null, 2) }],
      };
    }

    throw new Error(`Unknown tool: ${name}`);
  } catch (err) {
    return {
      isError: true,
      content: [{ type: "text", text: `tokenscope error: ${err && err.message ? err.message : String(err)}` }],
    };
  }
});

// expose helpers for the test harness without starting the transport
export { TOOLS, analyzePath, server, percentileOf };

// Start stdio transport unless imported for tests.
const isMain = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isMain) {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  // stderr is fine; stdout is the MCP channel.
  console.error(`tokenscope MCP server v${PKG.version} ready (stdio) — tools: ${TOOLS.map((t) => t.name).join(", ")}`);
}
