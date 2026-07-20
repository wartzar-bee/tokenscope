# tokenscope ⏣

**See what your AI-coding session actually cost — and what's eating your context.**
A local, read-only CLI that parses your Claude Code session logs and shows where the money goes: model output vs. context being **re-sent every turn** (the hidden 60%+ of most bills).


> **Why this exists:** I put an AI agent on a timer and it burned 136M tokens overnight, most of it re-reading its own context. tokenscope is how I found that. [Read the postmortem →](https://dev.to/wartzarbee/i-put-an-ai-agent-on-a-timer-overnight-it-burned-136m-tokens-doing-almost-nothing-2ae2)

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

## Install / run
No install — runs via npx:
```
npx @wartzar-bee/tokenscope               # your most recent Claude Code session
npx @wartzar-bee/tokenscope --all         # aggregate every session
npx @wartzar-bee/tokenscope <file|dir>    # a specific session .jsonl
npx @wartzar-bee/tokenscope --json        # machine-readable
npx @wartzar-bee/tokenscope --share       # privacy-safe shareable summary (markdown + SVG card)
npx @wartzar-bee/tokenscope --share-svg   # just the SVG "cost report card"
```
Reads `~/.claude/projects/**/*.jsonl`. **Read-only, local, no network, no telemetry** — open the source; nothing leaves your machine.

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

## Status / roadmap
- v0.1: Claude Code session cost + context attribution + insights. **20/20 unit tests** on the cost math (`npm test`).
- Next (evidence-driven): per-tool/-file token attribution; daily/budget alerts; a `--watch` live meter; OpenAI/Codex log support.

MIT. Not affiliated with Anthropic.
