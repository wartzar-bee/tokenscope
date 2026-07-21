// Reference distribution for tokenscope's --share percentile comparison.
//
// SHIPPED with the package on purpose: --share stays 100% offline (no network, ever) —
// the comparison is computed locally against these baked-in breakpoints.
//
// HONESTY: this is a REFERENCE SET, not a population claim. It is NOT "all Claude Code
// users." It is n=66 real Claude Code sessions (cost>0, >=3 model turns) measured with
// default pricing from a single heavy user (this tool's own development), as of the date
// below. Treat it as a yardstick to answer "is my session unusual?", not a census.
// Re-measured + published openly as the set grows: tokenscope.pages.dev/benchmark
export const BENCHMARK = {
  n: 66,
  asOf: "2026-05-29",
  source: "single heavy user (tokenscope dev), default pricing — reference set, not a population",
  // Percentile breakpoints over PER-SESSION values.
  costUsd:   { p10: 1.63, p25: 2.10, p50: 4.08, p75: 8.31, p90: 11.42 },
  resentPct: { p10: 14,   p25: 19,   p50: 24,   p75: 31,   p90: 46 },
  cacheEff:  { p10: 69,   p25: 77,   p50: 83,   p75: 87,   p90: 94 }
};

// Estimate the percentile (1-99) of value x within {p10,p25,p50,p75,p90} breakpoints.
// Linear interpolation between adjacent breakpoints; gently clamped outside the range.
export function percentileOf(x, bp) {
  const pts = [[10, bp.p10], [25, bp.p25], [50, bp.p50], [75, bp.p75], [90, bp.p90]];
  if (x <= pts[0][1]) return Math.max(1, Math.round((10 * x) / (pts[0][1] || 1)));
  if (x >= pts[4][1]) {
    const over = (x - pts[4][1]) / (pts[4][1] || 1);
    return Math.min(99, 90 + Math.round(9 * Math.min(1, over)));
  }
  for (let i = 0; i < 4; i++) {
    const [pa, va] = pts[i], [pb, vb] = pts[i + 1];
    if (x >= va && x <= vb) {
      const t = vb === va ? 0 : (x - va) / (vb - va);
      return Math.round(pa + t * (pb - pa));
    }
  }
  return 50;
}

// "more cache-efficient than ~P% of measured sessions" — the share-worthy status hook.
// cacheEff: higher is better, so the percentile IS the "better than" figure.
export function benchmarkOf(summary) {
  const costP = percentileOf(summary.totalCost, BENCHMARK.costUsd);
  const resentP = percentileOf(summary.split.cacheRead.pct, BENCHMARK.resentPct);
  const effP = percentileOf(summary.cacheEfficiency, BENCHMARK.cacheEff);
  return {
    ref: { n: BENCHMARK.n, asOf: BENCHMARK.asOf },
    median: { costUsd: BENCHMARK.costUsd.p50, resentPct: BENCHMARK.resentPct.p50, cacheEff: BENCHMARK.cacheEff.p50 },
    costPctile: costP,        // this session is bigger than ~costP% of measured sessions
    resentPctile: resentP,    // descriptive (re-sent share vs the set)
    cacheEffPctile: effP      // more cache-efficient than ~effP% of measured sessions
  };
}
