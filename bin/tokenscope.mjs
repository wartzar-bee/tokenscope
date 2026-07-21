#!/usr/bin/env node
// tokenscope — see what your AI-coding session actually cost & what's eating context.
// Local-first, read-only. Parses Claude Code session JSONL. No network, no telemetry.
import { readFileSync, writeFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { homedir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { parse, analyze } from "../src/core.mjs";
import { render } from "../src/report.mjs";
import { shareSummary, shareMarkdown, shareCardSVG, shareLink } from "../src/share.mjs";
import { DEFAULT_PRICING } from "../src/pricing.mjs";

const args = process.argv.slice(2);
const has = (f) => args.includes(f);

// `scan` subcommand: static token-cost estimate of a source directory (NOT session logs).
// This is the engine the CI cost-guardrail calls to compare a PR's HEAD vs BASE.
//   tokenscope scan [--dir <path>] [--json]
if (args[0] === "scan") {
  const { scanDir, renderScan } = await import("../src/scan.mjs");
  const di = args.indexOf("--dir");
  const dir = di > -1 && args[di + 1] ? args[di + 1]
            : (args.find((x, i) => i > 0 && !x.startsWith("-") && args[i - 1] !== "--dir") || ".");
  let result;
  try { result = scanDir(dir); }
  catch (e) { console.error(e.message); process.exit(1); }
  if (has("--json")) console.log(JSON.stringify(result));
  else console.log(renderScan(result, dir));
  process.exit(0);
}

if (has("-h") || has("--help")) {
  console.log(`tokenscope — what did your AI-coding session cost, and what's eating your context?

Usage:
  npx tokenscope                 analyze your most recent Claude Code session
  npx tokenscope --demo          run on a bundled sample session (no Claude Code logs needed)
  npx tokenscope --all           aggregate ALL sessions
  npx tokenscope <file|dir>      analyze a specific session JSONL (or every .jsonl in a dir)
  npx tokenscope scan [--dir D]  estimate the token footprint of a source dir (static; powers the CI cost-guardrail)
  --json                         machine-readable output
  --share                        privacy-safe shareable summary (markdown + SVG card + share link) — numbers only, no paths/content
  --share-svg                    emit only the SVG "cost report card" (renders on GitHub)
  --no-write                     with --share: don't write the .svg file to the current directory
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
if (has("--demo")) {
  // Bundled sample so anyone can see real output with zero setup (no ~/.claude logs needed).
  // Resolves relative to this package, so it works under `npx @wartzar-bee/tokenscope --demo`.
  const demoFile = join(dirname(fileURLToPath(import.meta.url)), "..", "examples", "demo-session.jsonl");
  if (!existsSync(demoFile)) { console.error("Demo session not found (expected at " + demoFile + ")"); process.exit(1); }
  files = [demoFile]; label = "demo session (synthetic sample)";
} else if (posArg) {
  if (existsSync(posArg) && statSync(posArg).isDirectory()) { files = findJsonl(posArg).map((f) => f.p); label = posArg; }
  else if (existsSync(posArg)) { files = [posArg]; label = posArg; }
  else { console.error("Not found: " + posArg); process.exit(1); }
} else {
  const all = findJsonl(projectsDir).filter((f) => f.s > 200); // skip tiny/empty
  if (!all.length) { console.error("No Claude Code sessions found under " + projectsDir + "\nSee a sample report right now (no logs needed):  npx tokenscope --demo\nOr pass a JSONL path explicitly, or run inside a project you've used Claude Code in."); process.exit(1); }
  if (has("--all")) { files = all.map((f) => f.p); label = `all sessions (${files.length})`; }
  else { const latest = all.sort((a, b) => b.m - a.m)[0]; files = [latest.p]; label = "latest session"; }
}

let turns = [];
for (const f of files) { try { turns = turns.concat(parse(readFileSync(f, "utf8"))); } catch {} }
if (!turns.length) { console.error("No assistant turns with usage found in the session(s).\nSee a sample report right now:  npx tokenscope --demo"); process.exit(1); }

const a = analyze(turns, pricing);
if (has("--share-svg")) {
  console.log(shareCardSVG(a));
} else if (has("--share")) {
  // Privacy-safe by construction: only aggregate numbers, never `label`/paths/content.
  if (has("--json")) {
    console.log(JSON.stringify(shareSummary(a), null, 2));
  } else {
    const svg = shareCardSVG(a);
    const link = shareLink(a);
    console.log(shareMarkdown(a));
    console.log("\n<!-- cost report card (SVG — paste into a .svg file or GitHub; renders inline) -->\n");
    console.log(svg);

    // Frictionless self-distribution: drop a ready-to-share .svg + a one-click link.
    // The .svg renders inline on GitHub/Discord/Slack (screenshot surface); the link's
    // numbers ride in the URL #fragment, which never reaches any server (privacy-safe).
    const lines = [];
    if (!has("--no-write")) {
      const out = "tokenscope-card.svg";
      try { writeFileSync(out, svg + "\n"); lines.push(`\n  Saved card → ./${out}  (drag into GitHub / Discord / Slack — renders inline)`); }
      catch { /* read-only dir etc. — the link below still works */ }
    }
    if (link) {
      lines.push(`  Share link  → ${link}`);
      lines.push(`               (renders your card in a browser + invites others to make their own; numbers ride in the #fragment — never sent to a server)`);
    }
    if (lines.length) console.error(lines.join("\n")); // to stderr so piping --share stays clean
  }
} else if (has("--json")) {
  console.log(JSON.stringify({ label, ...a, context: { ...a.context, curve: undefined } }, null, 2));
} else {
  console.log(render(a, { label }));
}
