const TIER_QUANTILE = 0.2;

/**
 * Re-rank a (possibly filtered) set of stocks by relative-strength score and
 * assign rank / percentile / tier locally, so the Shariah filter re-ranks
 * within its own universe instead of showing global ranks. Returns new objects
 * (does not mutate the server payload).
 */
export function rankAndTier(stocks) {
  const sorted = [...stocks].sort((a, b) => b.strengthScore - a.strengthScore);
  const N = sorted.length;
  const cut = Math.max(1, Math.round(N * TIER_QUANTILE));
  return sorted.map((s, i) => ({
    ...s,
    rank: i + 1,
    rankTotal: N,
    rankPct: N > 1 ? Math.round(((N - 1 - i) / (N - 1)) * 100) : 50,
    verdict: i < cut ? "BUY" : i >= N - cut ? "SELL" : "HOLD",
  }));
}

export function buildSummary(ranked) {
  const buys = ranked.filter((s) => s.verdict === "BUY");
  const sells = ranked.filter((s) => s.verdict === "SELL");
  const avgRange = ranked.length
    ? +(ranked.reduce((a, s) => a + s.expectedRangePct, 0) / ranked.length).toFixed(1)
    : null;
  const avgWeekMove = ranked.length
    ? +(ranked.reduce((a, s) => a + (s.chg5d || 0), 0) / ranked.length).toFixed(1)
    : 0;
  return {
    topRanked: buys.length,
    bottomRanked: sells.length,
    neutrals: ranked.length - buys.length - sells.length,
    avgExpectedRange: avgRange,
    avgWeekMove,
    top: ranked[0] || null,
  };
}
