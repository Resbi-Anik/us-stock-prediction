/** Build the "week at a glance" summary from whichever stocks are visible. */
export function buildSummary(stocks) {
  const byRank = (a, b) => (b.rank ?? 0) - (a.rank ?? 0);
  const buys = stocks.filter((s) => s.verdict === "BUY").sort(byRank);
  const sells = stocks.filter((s) => s.verdict === "SELL").sort(byRank);
  const picks = [...buys, ...sells];

  // Averages describe the actionable picks — all of which passed the
  // server's reliability gate (hit rate ≥ 52% and positive edge).
  const avgPredictionRate = picks.length
    ? Math.round(picks.reduce((a, s) => a + (s.predictionRate ?? 0), 0) / picks.length)
    : null;
  const avgEdge = picks.length
    ? +(picks.reduce((a, s) => a + (s.expectancy ?? 0), 0) / picks.length).toFixed(2)
    : null;

  const avgWeekMove = stocks.length
    ? +(stocks.reduce((a, s) => a + (s.chg5d || 0), 0) / stocks.length).toFixed(1)
    : 0;

  // Breadth reads the whole tape (composite lean of every stock),
  // not just the few picks that passed the gate.
  const bulls = stocks.filter((s) => s.buyScore >= 15).length;
  const bears = stocks.filter((s) => s.sellScore >= 15).length;
  const breadth =
    bulls > bears * 1.5 ? "bullish" : bears > bulls * 1.5 ? "bearish" : "mixed";

  return {
    buys: buys.length,
    sells: sells.length,
    holds: stocks.length - picks.length,
    breadth,
    avgWeekMove,
    avgPredictionRate,
    avgEdge,
    topBuy: buys[0]
      ? { symbol: buys[0].symbol, predictionRate: buys[0].predictionRate }
      : null,
    topSell: sells[0]
      ? { symbol: sells[0].symbol, predictionRate: sells[0].predictionRate }
      : null,
  };
}
