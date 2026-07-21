/** Recompute at-a-glance counts for whichever stocks are currently visible
 *  (the Shariah filter changes the set). */
export function buildSummary(stocks) {
  const buys = stocks.filter((s) => s.verdict === "BUY");
  const sells = stocks.filter((s) => s.verdict === "SELL");
  const avgRange = stocks.length
    ? +(stocks.reduce((a, s) => a + s.expectedRangePct, 0) / stocks.length).toFixed(1)
    : null;
  const avgWeekMove = stocks.length
    ? +(stocks.reduce((a, s) => a + (s.chg5d || 0), 0) / stocks.length).toFixed(1)
    : 0;

  const byConv = (a, b) => Math.abs(b.conviction) - Math.abs(a.conviction);
  return {
    leanBuys: buys.length,
    leanSells: sells.length,
    neutrals: stocks.length - buys.length - sells.length,
    avgExpectedRange: avgRange,
    avgWeekMove,
    topBuy: [...buys].sort(byConv)[0] || null,
    topSell: [...sells].sort(byConv)[0] || null,
  };
}
