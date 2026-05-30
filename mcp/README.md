# tokenscope MCP server ⏣

**Let your AI agent answer "what did my Claude Code session cost, and what's eating my context?"**

A tiny [Model Context Protocol](https://modelcontextprotocol.io) server that wraps
[tokenscope](https://github.com/wartzar-bee/tokenscope)'s cost-attribution engine.
It reuses the **exact same analysis code** as the `tokenscope` CLI (`src/core.mjs`,
`src/share.mjs`, `src/benchmark.mjs`) — no cost logic is reimplemented.

**Local & read-only.** It only reads Claude Code session JSONL under
`~/.claude/projects` (or a path you pass). Nothing is sent anywhere. MIT.

## Tools

| tool | what it does |
|------|--------------|
| `analyze_claude_cost` | Full cost + context attribution for a session (or your latest): total cost, output vs **re-sent cached context** vs cache-write vs fresh-input split, per-turn context peak/avg, cache efficiency, cost by model, subagent spend, tool counts, and plain-language insights. Optional `path`, `all`, and `pricing` overrides. |
| `get_cost_benchmark` | Percentiles vs tokenscope's shipped reference set (n=66 real sessions): how big your cost is, your re-sent-context share, and "more cache-efficient than ~P% of measured sessions". Pass a `path` or explicit `totalCost`/`resentPct`/`cacheEfficiency`. |
| `tokenscope_share_summary` | A privacy-safe shareable summary (aggregate numbers only — no paths or prompt/response content) plus a ready-to-paste markdown block. |

## Install

Requires Node ≥ 18.

### Claude Desktop / Claude Code / any MCP client

Add to your MCP config (e.g. `claude_desktop_config.json`, or `.mcp.json`):

```json
{
  "mcpServers": {
    "tokenscope": {
      "command": "npx",
      "args": ["-y", "@wartzar-bee/tokenscope-mcp"]
    }
  }
}
```

Or run it from a clone:

```json
{
  "mcpServers": {
    "tokenscope": {
      "command": "node",
      "args": ["/path/to/tokenscope/mcp/server.mjs"]
    }
  }
}
```

### Manual / from source

```bash
git clone https://github.com/wartzar-bee/tokenscope
cd tokenscope/mcp
npm install
npm start        # starts the stdio MCP server
npm test         # runs the self-test (22 checks against a synthetic session)
```

## Example

Once connected, ask your agent:

> "Use tokenscope to analyze my last Claude Code session and tell me what's eating my context."

The agent calls `analyze_claude_cost` and gets back the real breakdown — typically showing
that the majority of the bill is **context re-sent every turn** (cache reads), not model output.

## How it relates to the CLI

The MCP server is a thin transport over the same engine the CLI uses for `tokenscope --json`
and `tokenscope --share`. If you prefer a terminal: `npx @wartzar-bee/tokenscope`.

MIT. Not affiliated with Anthropic.
