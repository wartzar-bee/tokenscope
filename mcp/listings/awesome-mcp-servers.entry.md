# Prepared entry — punkpeye/awesome-mcp-servers (and wong2/awesome-mcp-servers)

The server line to add, alphabetically, under a developer-tooling / monitoring category.
Format follows the list's convention: `[name](repo) emoji-flags - description.`

Legend used by punkpeye/awesome-mcp-servers (relevant flags):
- 📇 – TypeScript/JavaScript codebase
- 🏠 – Local service (runs on your machine, no remote)
- (no cloud/Apple/Windows flags apply)

## Entry line

```
- [tokenscope](https://github.com/wartzar-bee/tokenscope) 📇 🏠 - Analyze your Claude Code session's token cost and context attribution — see how much of the bill is re-sent (cached) context vs model output, with percentile benchmarks. Local, read-only.
```

Place it in the **Developer Tools** (or **Monitoring** / **Finance & FinOps**, whichever the
list currently uses for cost/observability tooling), keeping alphabetical order within the section.

## PR metadata
- Title: `Add tokenscope MCP server (Claude Code cost & context analysis)`
- Body:
  > Adds [tokenscope](https://github.com/wartzar-bee/tokenscope)'s MCP server — three tools
  > (`analyze_claude_cost`, `get_cost_benchmark`, `tokenscope_share_summary`) that let an agent
  > analyze a Claude Code session's token cost and context attribution. Local, read-only,
  > MIT, published as `@wartzar-bee/tokenscope-mcp` (`npx -y @wartzar-bee/tokenscope-mcp`).
  > Tested: 22 self-checks + a real stdio JSON-RPC end-to-end. One alphabetical line added.
