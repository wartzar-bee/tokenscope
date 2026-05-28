// Model pricing (USD per 1M tokens). Prompt-cache multipliers per Anthropic's
// documented model: cache WRITE 5m = 1.25x input, 1h = 2x input; cache READ = 0.1x input.
// ⚠ These are DEFAULTS and can go stale — verify at the provider's pricing page and
// override via a .tokenscope.json {"pricing": {...}} or --pricing. The tool prints
// which prices it used and warns on unknown models (never silently guesses to $0).

export const DEFAULT_PRICING = {
  // Anthropic Claude (per 1M tokens, input/output)
  "claude-opus-4":   { in: 15, out: 75 },
  "claude-sonnet-4": { in: 3,  out: 15 },
  "claude-haiku-4":  { in: 1,  out: 5 },
  // OpenAI (rough; override for accuracy)
  "gpt-5":     { in: 1.25, out: 10 },
  "gpt-4.1":   { in: 2,    out: 8 },
};
export const WEB_SEARCH_PER_1K = 10; // USD per 1,000 web_search requests

// Map a concrete model id (e.g. "claude-opus-4-7", "claude-sonnet-4-6-20260101")
// to a pricing family key. Returns the matched key or null (unknown → warn, don't guess).
export function familyFor(model, pricing = DEFAULT_PRICING) {
  if (!model) return null;
  const m = String(model).toLowerCase();
  if (pricing[m]) return m;                        // exact override
  if (/opus-4/.test(m)) return "claude-opus-4";
  if (/sonnet-4/.test(m)) return "claude-sonnet-4";
  if (/haiku-4/.test(m)) return "claude-haiku-4";
  if (/gpt-5/.test(m)) return "gpt-5";
  if (/gpt-4\.1/.test(m)) return "gpt-4.1";
  return null;
}

// Cost (USD) of one turn's usage under a model. Returns a breakdown by component.
// usage fields (Anthropic): input_tokens, output_tokens, cache_read_input_tokens,
// cache_creation_input_tokens, cache_creation.{ephemeral_5m,ephemeral_1h}, server_tool_use.
export function costOf(usage, model, pricing = DEFAULT_PRICING) {
  const fam = familyFor(model, pricing);
  const p = fam ? pricing[fam] : null;
  const u = usage || {};
  const M = 1e6;
  const inP = p ? p.in : 0, outP = p ? p.out : 0;
  const cc = u.cache_creation || {};
  const c5 = cc.ephemeral_5m_input_tokens || 0;
  const c1 = cc.ephemeral_1h_input_tokens || 0;
  // If the split isn't present, treat all cache_creation as 5m (the common case).
  const ccTotal = u.cache_creation_input_tokens || 0;
  const c5eff = (c5 || c1) ? c5 : ccTotal;
  const c1eff = c1;
  const freshIn = (u.input_tokens || 0) / M * inP;
  const cacheWrite = (c5eff / M * inP * 1.25) + (c1eff / M * inP * 2.0);
  const cacheRead = (u.cache_read_input_tokens || 0) / M * inP * 0.10;
  const out = (u.output_tokens || 0) / M * outP;
  const stu = u.server_tool_use || {};
  const webReq = (stu.web_search_requests || 0) + (stu.web_fetch_requests || 0);
  const webTools = webReq / 1000 * WEB_SEARCH_PER_1K;
  const total = freshIn + cacheWrite + cacheRead + out + webTools;
  return { total, freshIn, cacheWrite, cacheRead, out, webTools, webReq, known: !!p, family: fam };
}
