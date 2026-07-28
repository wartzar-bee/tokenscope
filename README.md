# tokenscope ⏣

**See what your AI-coding session actually cost — and what's eating your context.**
A local, read-only CLI that parses your Claude Code session logs and shows where the money goes: model output vs. context being **re-sent every turn** (the hidden 60%+ of most bills).

```
$ npx @wartzar-bee/tokenscope

  tokenscope ⏣  latest session
  ──────────────────────────────────────────────────────
  Total cost   $868.84   over 967 model turns

  Where the money went
  output (model writing)     ████░░░░░░░░░░░░░░░░░░░░  16%  $137.24
  cache read (re-sent ctx)   ████████████████░░░░░░░░  66%  $577.59
  cache write (new ctx)      ████░░░░░░░░░░░░░░░░░░░░  18%  $153.67

  Context size per turn  (peak 822k · avg 404k · now 822k tokens)
  ▁▁▁▁▁▂▂▂▂▂▂▂▃▃▃▃▃▃▃▄▄▄▄▄▅▅▅▅▅▆▆▆▆▇▇▇▇▇▇█

  Insights
  • Re-sent (cached) context cost $577.59 (66% of spend) — context re-read every turn.
  • Peak context ~822k tokens — /compact or a fresh session would cut per-turn cost.
  • Only 16% of spend is the model's actual output.
```
*(A real session, default Opus pricing. Your numbers will differ — prices are overridable.)*

## Why
Agentic coding (Claude Code, etc.) produces surprise bills, and the cause is mundane: as a session grows, the **whole context is re-sent every turn**, so cost balloons even when the model writes little. Existing dashboards show *totals*; tokenscope shows the **attribution** — output vs. cache-read vs. cache-write vs. fresh input, the per-turn context-growth curve, cost by model, subagent spend, and which tools fill your context — with concrete "trim this" insights.

## Try it in 10 seconds (no Claude Code logs needed)
```
npx @wartzar-bee/tokenscope --demo
```
Runs on a bundled sample session so you see the full report before pointing it at your own logs — no setup, nothing to configure. (The sample is synthetic, for demonstration.)

## Install / run
No install — runs via npx:
```
npx @wartzar-bee/tokenscope               # your most recent Claude Code session
npx @wartzar-bee/tokenscope --demo        # a bundled sample session — no logs needed
npx @wartzar-bee/tokenscope --all         # aggregate every session
npx @wartzar-bee/tokenscope <file|dir>    # a specific session .jsonl
npx @wartzar-bee/tokenscope --version     # print the installed version and exit
npx @wartzar-bee/tokenscope --json        # machine-readable
npx @wartzar-bee/tokenscope --share       # privacy-safe shareable summary (markdown + SVG card)
npx @wartzar-bee/tokenscope --share-svg   # just the SVG "cost report card"
npx @wartzar-bee/tokenscope scan          # static token footprint of a source dir (the engine behind ci-guardrail)
npx @wartzar-bee/tokenscope scan --diff ../base   # cost delta of the current dir vs a base dir — catch a regression before you push
npx @wartzar-bee/tokenscope scan --max-total 50000            # exit 1 if the footprint exceeds a budget — a local cost gate
npx @wartzar-bee/tokenscope scan --diff ../base --max-delta 2000   # exit 1 if the diff adds more than N tokens
```
Reads `~/.claude/projects/**/*.jsonl`. **Read-only, local, no network, no telemetry** — open the source; nothing leaves your machine.

## Local cost gate (pre-push / pre-commit)
`--max-total N` / `--max-delta N` make `scan` **exit 1** when the token footprint (or a diff's delta) blows a budget — the same check [ci-guardrail](https://github.com/wartzar-bee/ci-guardrail) runs in CI, but locally, before you push. Wire the absolute budget into a git hook so a runaway prompt/config never leaves your machine:
```sh
# .git/hooks/pre-push  (chmod +x)
npx -y @wartzar-bee/tokenscope scan --dir prompts --max-total 50000 \
  || { echo "prompt token footprint over budget — trim before pushing"; exit 1; }
```
Under budget it prints the report and exits 0; over budget it prints a `BLOCKED:` line and exits 1. Without a `--max-*` flag `scan` just reports (exit 0), so it's opt-in. `--max-delta` gates the delta between **two directories on disk** (`scan --diff <baseDir> --max-delta N`) — point it at a checked-out base tree when you want a regression gate rather than an absolute cap.

Using the [pre-commit](https://pre-commit.com) framework? Add tokenscope to your `.pre-commit-config.yaml` — no git-hook scripting:
```yaml
repos:
  - repo: https://github.com/wartzar-bee/tokenscope
    rev: v0.2.6
    hooks:
      - id: tokenscope
        args: ["--dir", "prompts", "--max-total", "50000"]   # optional — omit to just report
```
`language: node`, zero dependencies. With no `args` it prints the footprint (exit 0); add `--max-total N` (or `--diff <baseDir> --max-delta N`) to fail the commit over budget.

## Share your bill (privacy-safe)
`--share` emits a compact summary built from **aggregate numbers only** — **no file paths, no prompt/response content** — so it's safe to paste in public:
- **Markdown** for Reddit / Discord / a GitHub issue (total, the output/cache-read/cache-write/fresh split with %, peak/avg context, and the headline "X% of spend was re-sent context").
- A self-contained **SVG "cost report card"** (`--share-svg`) — no binary deps; renders inline on GitHub and is trivially shareable.
- **How you compare** — both forms now answer "is my session unusual?" against a shipped, offline reference set of real sessions (e.g. _"more cache-efficient than ~80% of measured sessions; median session re-sends 24%"_). It's a reference yardstick, not a census — full honest distribution at [tokenscope.pages.dev/benchmark](https://tokenscope.pages.dev/benchmark/).

Prefer not to touch a terminal flag? The same render runs **entirely in your browser** at the web surface in [`web/`](web/): paste your `--json` output and it draws the full report + the SVG card locally — nothing is uploaded.

## Use it from an AI agent (MCP server)
There's an [**MCP server**](mcp/) that exposes the same engine to AI agents / MCP clients (Claude Desktop, Claude Code, etc.) as tools: `analyze_claude_cost`, `get_cost_benchmark`, and `tokenscope_share_summary`. Add it to your MCP config:
```json
{ "mcpServers": { "tokenscope": { "command": "npx", "args": ["-y", "@wartzar-bee/tokenscope-mcp"] } } }
```
Then ask your agent *"use tokenscope to analyze my last Claude Code session."* It's the same local, read-only engine — see [`mcp/README.md`](mcp/README.md).

## Pricing
Uses documented default prices (Anthropic cache multipliers: write 1.25×/2×, read 0.1× of input). **Verify and override** for your exact model/tier via `./.tokenscope.json`:
```json
{ "pricing": { "claude-opus-4": { "in": 15, "out": 75 } } }
```
Unknown models are flagged (never silently counted as $0). Token counts are read straight from the logs; cost = those counts × the prices shown.

## Part of the wartzar-bee cost toolkit
tokenscope is the measurement engine behind a sibling tool, and one of three open-source cost projects:
- [**ci-guardrail**](https://github.com/wartzar-bee/ci-guardrail) — a GitHub Action that runs tokenscope in CI to predict a pull request's token-cost delta and comment on the responsible files (report-only, or fail the build past a threshold): `uses: wartzar-bee/ci-guardrail@v1`.
- [**enclave**](https://github.com/wartzar-bee/enclave) — the security-first, self-hosted runtime & sandbox the wartzar-bee agent fleet runs on (Apache-2.0).

If you find tokenscope useful, ci-guardrail is the zero-config way to run it on every PR.

## Why this exists — further reading
tokenscope came out of running autonomous agents and watching the bill. The write-ups behind it:
- [I put an agent on a timer — overnight it burned 136M tokens doing almost nothing](https://dev.to/wartzarbee/i-put-an-ai-agent-on-a-timer-overnight-it-burned-136m-tokens-doing-almost-nothing-2ae2) — the runaway-cost postmortem that started this.
- [Where your Claude Code bill actually goes — I measured 66 of my own sessions](https://dev.to/wartzarbee/where-your-claude-code-bill-actually-goes-i-measured-66-of-my-own-sessions-471e) — the empirical breakdown tokenscope automates.
- [The Claude Code cost formula: why the same session can cost 10× more tomorrow](https://dev.to/wartzarbee/the-claude-code-cost-formula-why-the-same-session-can-cost-10x-more-tomorrow-16df) — the cost mechanics tokenscope surfaces.
- [Cost-audit series](https://dev.to/wartzarbee/langchain-cost-audit-what-conversationbuffermemory-actually-costs-you-at-scale-4f8n) — reproducible token-cost audits of popular agent frameworks (LangChain, AutoGen, CrewAI, …).
- [Catch token-cost regressions in CI before they ship](https://dev.to/wartzarbee/catch-token-cost-regressions-in-ci-before-they-ship-35o3) — tokenscope as a GitHub Action cost gate on your PRs.

## Status / roadmap
- v0.1: Claude Code session cost + context attribution + insights. **20/20 unit tests** on the cost math (`npm test`).
- Next (evidence-driven): per-tool/-file token attribution; daily/budget alerts; a `--watch` live meter; OpenAI/Codex log support.

MIT. Not affiliated with Anthropic.
