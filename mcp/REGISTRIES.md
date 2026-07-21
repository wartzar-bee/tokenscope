# MCP / Agent registry listing targets — tokenscope MCP server (TS-AGT-01 / TS-AGT-02)

Where we can list the tokenscope MCP server, the **exact** submission path, and whether it's
**autonomous** (our classic GitHub PAT can open the PR / call the API) or **gated** (needs an
account/login/operator). Only list a **genuinely working** server (it is — 22/22 self-tests + a
real stdio JSON-RPC end-to-end pass). Non-spam: one accurate entry per registry.

Server facts to put in every listing:
- **Name:** tokenscope
- **Package:** `@wartzar-bee/tokenscope-mcp` (npm) — run via `npx -y @wartzar-bee/tokenscope-mcp`
- **Repo:** https://github.com/wartzar-bee/tokenscope (server in `/mcp`)
- **One-liner:** Analyze Claude Code session token cost & context attribution (local, read-only).
- **Category:** Developer Tools / Observability / FinOps (cost analysis)
- **Tools:** `analyze_claude_cost`, `get_cost_benchmark`, `tokenscope_share_summary`
- **Transport:** stdio · **License:** MIT · **Language:** TypeScript/Node (📇), local-only (🏠)

| # | registry | submission path | autonomous? | status |
|---|----------|-----------------|-------------|--------|
| 1 | **punkpeye/awesome-mcp-servers** (88k★ — the dominant awesome list) | Fork → add alphabetical line under Developer Tools → PR with `🤖🤖🤖` fast-track | ✅ SUBMITTED | **PR #7184 OPEN** https://github.com/punkpeye/awesome-mcp-servers/pull/7184 |
| 2 | **wong2/awesome-mcp-servers** (4k★) | Fork → add entry → PR | ❌ blocked — pulls API returns 404 (PRs disabled by owner) | commits staged in `wartzar-bee/awesome-mcp-servers-1:add-tokenscope-mcp` but cannot PR |
| 3 | **rohitg00/awesome-devops-mcp-servers** (992★, DevOps-focused) | Fork → add entry to API Cost Management section → PR | ✅ SUBMITTED | **PR #235 OPEN** https://github.com/rohitg00/awesome-devops-mcp-servers/pull/235 |
| 4 | **punkpeye/awesome-mcp-devtools** (459★, dev-tools focused) | Fork → add entry to Development Tools section → PR with `🤖🤖🤖` fast-track | ✅ SUBMITTED | **PR #178 OPEN** https://github.com/punkpeye/awesome-mcp-devtools/pull/178 |
| 5 | **appcypher/awesome-mcp-servers** (5.6k★) | Fork → add entry | ❌ blocked — pulls API returns 404 (PRs disabled) | commits in `wartzar-bee/awesome-mcp-servers-2:add-tokenscope-mcp` |
| 6 | **Official MCP registry** (`registry.modelcontextprotocol.io`) | `mcp-publisher login github` (device OAuth) → `mcp-publisher publish`. NOT a PR repo (CONTRIBUTING.md says do NOT PR `data/seed.json`). | ⚠️ gated — interactive GitHub OAuth device-code login (browser one-shot) | `server.json` committed; publish = one `mcp-publisher publish` command once logged in |
| 7 | **mcp.so** (large web directory) | Primarily auto-crawls public GitHub repos tagged for MCP + npm packages | ⚠️ mostly auto-crawl | will be picked up via npm + repo topics; claim = gated (account) |
| 8 | **Glama.ai MCP directory** | Auto-indexes public GitHub repos that contain a valid MCP server | ✅ passive (no submit) | not yet indexed (fresh repo) — will auto-index; re-check in 24-48h |
| 9 | **Smithery.ai** (the "npm of MCP" — high install-intent) | Connect GitHub → `smithery.yaml` at repo root | ⚠️ gated — Smithery account/GitHub-app authorization | ✅ **`smithery.yaml` committed at repo root** (2026-07-21, stdio/npx, no config needed). Operator: connect the repo at smithery.ai (GitHub app) → it auto-detects the config → published. |
| 10 | **PulseMCP / mcpservers.org / Awesome lists mirrors** | Most ingest from the two awesome lists + npm | ✅ passive (downstream of punkpeye PRs) | will follow once PR #7184 merges |

## Live status (2026-05-31)
- **3 genuine PRs submitted** (punkpeye #7184, rohitg00 #235, punkpeye-devtools #178) — all OPEN
- **2 PRs blocked by platform** (wong2, appcypher disable their pull_requests API — not a repo/entry quality issue)
- **npm published** → passive crawler pickup (Glama, mcp.so, PulseMCP) in progress
- **Repo topics set** (`mcp`, `mcp-server`, `model-context-protocol`, etc.) → crawler signals ready

## The one operator unblock (optional, to maximize reach)
> Run once on a machine with a browser, from the repo root:
> `npm i -g @modelcontextprotocol/registry` then `mcp-publisher login github` (approve the device code) then `mcp-publisher publish`.
> (The `server.json` is already committed; this publishes to the official registry under `io.github.wartzar-bee/tokenscope`.)
