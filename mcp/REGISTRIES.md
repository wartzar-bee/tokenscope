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
| 1 | **punkpeye/awesome-mcp-servers** (the dominant awesome list, >50k★) | Fork → add one alphabetical line under the right category in `README.md` → PR (agents may append `🤖🤖🤖` to the PR title for the fast-track lane) | ✅ PR via PAT — **DEFERRED** (repo age) | artifact prepared (see `listings/awesome-mcp-servers.entry.md`) |
| 2 | **wong2/awesome-mcp-servers** (2nd major awesome list) | Fork → add entry to `README.md` → PR | ✅ PR via PAT — **DEFERRED** (repo age) | artifact prepared (same entry, that list's format) |
| 3 | **Official MCP registry** (`registry.modelcontextprotocol.io`, repo `modelcontextprotocol/registry`) | Add `server.json` to the repo root of OUR repo → `mcp-publisher login github` → `mcp-publisher publish`. Namespace `io.github.wartzar-bee/*` is authenticated by GitHub OAuth device flow. | ⚠️ semi — `server.json` prepared & committed; publish needs an interactive GitHub OAuth device-code login (browser one-shot). API/CI path also exists with a GitHub OIDC token. | `server.json` prepared (see `server.json`) |
| 4 | **mcp.so** (large web directory) | Web form / GitHub submission; primarily auto-crawls public GitHub repos tagged for MCP + npm packages | ⚠️ mostly auto-crawl; optional account to claim listing | will be picked up via npm + repo topics; claim = gated (account) |
| 5 | **Glama.ai MCP directory** | Auto-indexes public GitHub repos that contain a valid MCP server; ranks by repo signals | ✅ passive (no submit) — ensure repo topic `mcp` + README | set repo topics (auto) |
| 6 | **Smithery.ai** | Connect GitHub → add `smithery.yaml`; for stdio servers a `smithery.yaml` + Dockerfile or npm command | ⚠️ gated — requires Smithery account/GitHub-app authorization (login wall) | deferred (account gate) |
| 7 | **PulseMCP / mcpservers.org / Awesome lists mirrors** | Most ingest from the two awesome lists + npm | ✅ passive (downstream of #1/#2) | follows from #1/#2 |
| 8 | **There's An AI For That / Futurepedia (XV-DIR-01)** | Web submit form | ⚠️ gated — account + manual form | tracked under XV-DIR-01, not MCP-specific |

## Autonomy summary
- **Done now (passive, crawler-driven):** repo topics set (`mcp`, `mcp-server`, …) + npm package published → **Glama, mcp.so, PulseMCP mirrors auto-index** the public repo + package with no submit step.
- **Autonomous but DEFERRED on policy (our GitHub PAT):** PRs to the awesome lists (#1, #2). The mechanism works (classic PAT can fork+PR third-party repos), BUT the tokenscope repo is **2 days old / 2★** and quality awesome-lists age-gate (≥1 wk/30/90 days); a PR to a brand-new repo risks rejection/ban = off the non-spam line (`reports/infrastructure.md`). **Re-evaluate + submit after ~2026-06-04** (repo ≥1 week) when it's a clean, on-policy listing. Entry artifact is ready.
- **Gated (one operator step each):** official registry `mcp-publisher publish` (GitHub OAuth device login), Smithery (account/app authorization). The `server.json` is prepared so the publish is a single command once logged in.

## The one operator unblock (optional, to maximize reach)
> Run once on a machine with a browser, from the repo root:
> `npm i -g @modelcontextprotocol/registry` then `mcp-publisher login github` (approve the device code) then `mcp-publisher publish`.
> (The `server.json` is already committed; this publishes to the official registry under `io.github.wartzar-bee/tokenscope`.)
