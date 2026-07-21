# Anatomy of a Claude Code session: where the money actually goes

> A data study of **one real Claude Code session** (n=1), measured locally with the tokenscope CLI.
> No fabricated or aggregate statistics. No trackers.
> Web version: https://tokenscope.pages.dev/study/

**n = 1 · one real session** — measured with the [tokenscope](https://github.com/wartzar-bee/tokenscope) CLI.

## TL;DR

In **one real Claude Code session** (n=1, not an average), the bill was **~$1,278 across ~1,270 model turns**. Where it went:

- **66% — re-sent context (cache-read).** The conversation so far, re-sent and re-read on every single turn.
- **20% — cache-write.** New context (files, tool output) written into the cache the first time it appears.
- **14% — output.** The model actually generating code and text.
- **~0% — fresh input.** Negligible once caching is doing its job.

The headline: **most of a long session's cost is not the model thinking or writing — it's re-sending the same context again and again.** Peak context reached **~998k tokens** at a **~98% cache hit rate**. The fix is mundane: shrink what stays in context (`/compact`, fresh sessions, fewer resident files/tools).

## The numbers at a glance

| Metric | Value |
|---|---|
| Total session cost | ~$1,278 |
| Model turns | ~1,270 |
| Peak context | ~998,000 tokens |
| Cache hit rate (efficiency) | ~98% |
| Sample size | n = 1 (one real session) |

These are the actual numbers from **one** Claude Code session on a single project, read out of the local logs by tokenscope. They are **not** an average across users or sessions — treat them as a single, honest data point that illustrates a general mechanic.

## Where does Claude Code spend go?

Every API call in a session is billed in four buckets. Dashboards usually show only the running *total*; the interesting question is the *attribution* — which bucket the money actually went to. The split for this session:

| Cost bucket | Share | Cost (USD) | What it is |
|---|---:|---:|---|
| **Cache-read** (re-sent context) | 66% | ~$843 | Context re-sent & re-read every turn, at ~0.1× input. |
| **Cache-write** (new context) | 20% | ~$256 | New files/tool output written to cache the first time. |
| **Output** (model writing) | 14% | ~$179 | Tokens the model generated (code + text). |
| **Fresh input** | ~0% | ~$0 | Uncached prompt tokens; negligible once caching kicks in. |
| **Total** | 100% | ~$1,278 | Over ~1,270 model turns. |

(Percentages are rounded; $179 + $843 + $256 = $1,278, with fresh input rounding to ~$0.)

Two-thirds of the bill is **cache-read**: the cost of re-sending context the model had already received on earlier turns. The model *writing* was just 14%.

> The web version of this study renders this as a hand-coded segmented SVG bar chart:
> https://tokenscope.pages.dev/study/

## How context grew over the session

The reason cache-read dominates is visible in how the context window *grows*. Every file read, every tool result, and every reply stays in the conversation and is re-sent on subsequent turns, so the context climbs as the session goes on — here, all the way to a peak of about **998,000 tokens**, with brief dips at compaction events before it climbs again.

Every token in that rising area is re-sent on each following turn. A token added early is re-read hundreds of times before the session ends; a token added near the end is re-read only a few times. That is precisely why the *area under the growth curve* — not the model's output — sets the bill.

> The web version renders a hand-coded SVG context-growth curve rising to the ~998k peak.

## Why is re-sent context the biggest cost?

The model is stateless between requests: it has no memory of your session. To act on the conversation so far, the client re-sends the entire context on *every* turn — your instructions, every file it read, every tool result, and all prior replies. Prompt caching makes that affordable by billing the re-send at a steep discount (cache-read, about `0.1×` the input price) instead of full input price. But it is still paid every turn, on the whole accumulated context.

```
cache-read cost ≈ context size × number of turns × input price × 0.1
```

That formula is the whole story. A small context over a few turns is negligible. But multiply a **large** context (here peaking near a million tokens) by **many** turns (here ~1,270) and the 0.1× rate compounds past every other line combined. At a ~98% cache hit rate almost all of that context *was* on the cheap read path — and it still came to 66% of the bill. The discount is real; the repetition is just bigger.

## Why isn't the model writing the big cost?

This is the counter-intuitive part. Output tokens are priced *higher* per token than input, so it is natural to assume the model "thinking and typing" is where the money goes. But the model writes relatively few tokens per turn, while the context it must re-read each turn is enormous and only grows. Across the whole session the model's own output was just **14%** ($179) of the bill.

In other words: you are not mostly paying for answers. You are mostly paying to remind the model of everything it already knew, once per turn, for the life of the session.

## How to act on this

If 66% of the cost is re-sent context, the leverage is obvious: **keep the context small.** Optimizing output or fresh input barely moves a long-session bill; trimming context moves it a lot.

- **Run `/compact` when the window gets large.** It shrinks what gets re-sent from that point on. The saving is *going forward*, not retroactive — so compact *before* a long stretch of turns, not after.
- **Start a fresh session when a task is done.** Carrying a 900k-token history into an unrelated task means paying to re-read all of it on every new turn. A clean session resets the area under the curve to near zero.
- **Don't keep huge files or chatty tools resident.** A big file read or a verbose tool early in the session is re-billed on every turn that follows. Read what you need, then let it leave context.
- **Spend your attention on the dominant line.** Shaving output or fresh input is rounding error here; shaving context is the bill.

**The one-liner:** the cheapest token is the one you don't re-send. Measure your own split before you optimize — the dominant line is what to attack, and it's usually cache-read.

## Method & honesty (n=1)

Read this part. The numbers above are **one real Claude Code session** — a single run on one project — measured with the [tokenscope](https://github.com/wartzar-bee/tokenscope) CLI, which reads Claude Code's local session logs (`~/.claude/projects/**/*.jsonl`) read-only and attributes cost by multiplying the token counts in those logs by documented Anthropic prices.

- **n = 1.** This is not an average, not an aggregate across users or sessions, and not a benchmark. Your sessions will have different totals and splits depending on how big your context grows and how long you run.
- **The mechanic generalizes; the numbers don't.** "Re-sent cached context dominates long sessions" is a structural property of stateless models + per-turn context re-send. The exact 66/20/14 split is specific to this session.
- **No fabrication.** The figures (~$1,278, ~1,270 turns, ~998k peak, ~98% cache efficiency, and the cost split) are tokenscope's actual output for this session. We did not invent other statistics, and there are no aggregate or cross-model claims.
- **Charts are hand-coded SVG.** Both figures on the web version are deterministic SVG drawn in markup — no chart library, no image generation, no external assets. The cost-split segment widths and the ~998k peak are the real values; the intermediate context-growth curve *shape* is illustrative of typical accumulation (noted on-page).
- **Prices can change.** Anthropic's rates and cache multipliers are documented defaults and vary by tier/time — verify current pricing for your account. tokenscope lets you override prices in `.tokenscope.json`.
- **No trackers.** The web version loads no scripts, no fonts, no analytics, and sets no cookies.

## FAQ

**Where does Claude Code spend actually go?**
In this one real session (n=1), the split was re-sent cached context (cache-read) 66%, cache-write 20%, output 14%, and fresh input ~0%. About two-thirds was paying to re-send context the model had already seen; only about one-seventh was the model writing anything.

**Why is re-sent context the biggest cost in a long session?**
The model is stateless, so the whole conversation context is re-sent every turn. Prompt caching bills that at ~0.1× the input price, but it is paid every turn on the entire accumulated context. cache-read cost ≈ context size × number of turns × input price × 0.1 — so a large context over many turns becomes the biggest line even though each read is cheap.

**Does the model writing code cost a lot?**
Less than people expect. Output was only 14% of this session's cost. Output is priced higher per token than input, but the model writes far fewer tokens than the context it re-reads each turn, so output is usually a minority of a long agentic session's bill.

**How do I reduce Claude Code cost based on this?**
Attack the dominant line: re-sent context. Run `/compact` when the window gets large, start a fresh session once a task is done instead of carrying a huge history forward, and don't keep large files or chatty tool output resident in context. Because cache-read is paid every subsequent turn, trimming context early pays off going forward. Optimizing output or fresh input barely moves the bill.

**Is this an average or a benchmark?**
No. It is one real session, n=1, measured with tokenscope on a single project. It is not an average, an aggregate, or a benchmark. The shape (re-sent context dominating long sessions) is a general mechanic; the specific numbers are this one session's actual figures and yours will differ.

---

Measured with **tokenscope** — a local, read-only Claude Code cost & context attribution CLI.
`npx @wartzar-bee/tokenscope` · https://github.com/wartzar-bee/tokenscope · MIT · Not affiliated with Anthropic.
