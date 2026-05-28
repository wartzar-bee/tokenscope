#!/usr/bin/env node
// tokenscope — see what your AI-coding session actually cost & what's eating context.
// Local-first, read-only. Parses Claude Code session JSONL. No network, no telemetry.
import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { parse, analyze } from "../src/core.mjs";
import { render } from "../src/report.mjs";
import { DEFAULT_PRICING } from "../src/pricing.mjs";

const args = process.argv.slice(2);
const has = (f) => args.includes(f);
if (has("-h") || has("--help")) {
  console.log(`tokenscope — what did your AI-coding session cost, and what's eating your context?

Usage:
  npx tokenscope                 analyze your most recent Claude Code session
  npx tokenscope --all           aggregate ALL sessions
  npx tokenscope <file|dir>      analyze a specific session JSONL (or every .jsonl in a dir)
  --json                         machine-readable output
  --pricing <file.json>          override model prices  (or put {"pricing":{...}} in ./.tokenscope.json)
  --no-color                     plain output

Reads Claude Code logs under ~/.claude/projects. Read-only & local — nothing is sent anywhere.`);
  process.exit(0);
}
if (has("--no-color")) process.env.NO_COLOR = "1";

function findJsonl(dir, out = []) {
  let entries = [];
  try { entries = readdirSync(dir, { withFileTypes: true }); } catch { return out; }
  for (const e of entries) {
    const p = join(dir, e.name);
    if (e.isDirectory()) findJsonl(p, out);
    else if (e.name.endsWith(".jsonl")) { try { out.push({ p, m: statSync(p).mtimeMs, s: statSync(p).size }); } catch {} }
  }
  return out;
}

// pricing override
let pricing = DEFAULT_PRICING;
const pIdx = args.indexOf("--pricing");
const pFile = pIdx > -1 ? args[pIdx + 1] : (existsSync(".tokenscope.json") ? ".tokenscope.json" : null);
if (pFile && existsSync(pFile)) {
  try { const j = JSON.parse(readFileSync(pFile, "utf8")); pricing = { ...DEFAULT_PRICING, ...(j.pricing || j) }; }
  catch { console.error("Could not read pricing file: " + pFile); }
}

const projectsDir = join(homedir(), ".claude", "projects");
const posArg = args.find((x) => !x.startsWith("-") && x !== pFile);

let files = [], label = "";
if (posArg) {
  if (existsSync(posArg) && statSync(posArg).isDirectory()) { files = findJsonl(posArg).map((f) => f.p); label = posArg; }
  else if (existsSync(posArg)) { files = [posArg]; label = posArg; }
  else { console.error("Not found: " + posArg); process.exit(1); }
} else {
  const all = findJsonl(projectsDir).filter((f) => f.s > 200); // skip tiny/empty
  if (!all.length) { console.error("No Claude Code sessions found under " + projectsDir + "\nPass a JSONL path explicitly, or run inside a project you've used Claude Code in."); process.exit(1); }
  if (has("--all")) { files = all.map((f) => f.p); label = `all sessions (${files.length})`; }
  else { const latest = all.sort((a, b) => b.m - a.m)[0]; files = [latest.p]; label = "latest session"; }
}

let turns = [];
for (const f of files) { try { turns = turns.concat(parse(readFileSync(f, "utf8"))); } catch {} }
if (!turns.length) { console.error("No assistant turns with usage found in the session(s)."); process.exit(1); }

const a = analyze(turns, pricing);
if (has("--json")) { console.log(JSON.stringify({ label, ...a, context: { ...a.context, curve: undefined } }, null, 2)); }
else { console.log(render(a, { label })); }
