# tokenscope — distribution & launch package

Pattern: blocker-removal + "instrument the invisible." Gatekeeper-free dev distribution = **npm + GitHub + one launch post + panic-search SEO**.

## Ship steps (operator-gated — needs credentials)
1. **GitHub repo (primary):** create public repo `tokenscope` under the project account and push `businesses/tokenscope/` contents. Then `npx github:<user>/tokenscope` works immediately. (Needs a fine-grained PAT for the agent to push, or operator pushes.)
2. **npm publish (best discovery):** `npm publish` (name `tokenscope`). Needs an npm account + `npm login`/token. Then `npx tokenscope` is global. (Give the agent an npm automation token to publish, or operator runs it.)
3. The README is the landing page — it targets the panic-search ("claude code token usage / cost / expensive").

## Launch post (one genuine post; engage with every comment)
**Where:** r/ClaudeAI or r/ChatGPTCoding (tool-friendly), and/or **Show HN**. Pick one to start.

**Title:** I analyzed my Claude Code bill — 66% was just re-sending context every turn. Built a free local CLI to show where your tokens go.

**Body:**
> My agentic-coding sessions kept getting expensive and I couldn't see why. So I parsed Claude Code's own session logs: one session was **$869, and 66% of it was *cache-read* — the whole context being re-sent every single turn**. Only 16% was the model actually writing.
>
> `tokenscope` is a tiny local, read-only CLI (no account, nothing leaves your machine) that breaks down a session: output vs re-sent context vs new context, the per-turn context-growth curve, cost by model, subagent spend, and which tools are bloating your context — with concrete "trim this" tips.
>
> `npx tokenscope`  → (GitHub/npm link)
>
> Early + Claude-Code-only for now. What would make it useful for your workflow — budget alerts? a live `--watch` meter? OpenAI support? Feedback welcome.

## Measurement (the growth loop)
- It's a CLI, so "traffic" = npm downloads + GitHub stars/clones + post engagement (real signals, not vanity once normalized).
- Pre-registered hypotheses: (1) the "$X, 66% re-sent context" hook drives the post — if it lands, the acute insight is the wedge; (2) the top requested feature (alerts vs watch vs OpenAI) tells us the next iteration. Log to `iterations.md`.
- No fabricated numbers — report npm/GitHub stats only from their real dashboards/APIs.

## Iteration backlog (evidence-driven)
- `--watch` live meter; budget/threshold alerts; per-tool token attribution; daily rollups; OpenAI/Codex logs; a shareable HTML report (mild recipient=sender loop among devs).
