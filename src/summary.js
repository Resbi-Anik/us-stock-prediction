/** Build the "week at a glance" summary from whichever stocks are visible. */
export function buildSummary(stocks) {
  const buys = stocks.filter((s) => s.verdict === "BUY");
  const sells = stocks.filter((s) => s.verdict === "SELL");
  const holds = stocks.filter((s) => s.verdict === "HOLD");

  const rated = stocks.filter((s) => s.predictionRate != null);
  const avgPredictionRate = rated.length
    ? Math.round(rated.reduce((a, s) => a + s.predictionRate, 0) / rated.length)
    : null;

  const avgWeekMove = stocks.length
    ? +(stocks.reduce((a, s) => a + (s.chg5d || 0), 0) / stocks.length).toFixed(1)
    : 0;

  const breadth =
    buys.length > sells.length * 1.5
      ? "bullish"
      : sells.length > buys.length * 1.5
      ? "bearish"
      : "mixed";

  const topBuy = [...buys].sort(
    (a, b) =>
      b.buyScore - a.buyScore ||
      (b.predictionRate || 0) - (a.predictionRate || 0)
  )[0];
  const topSell = [...sells].sort(
    (a, b) =>
      b.sellScore - a.sellScore ||
      (b.predictionRate || 0) - (a.predictionRate || 0)
  )[0];

  return {
    buys: buys.length,
    sells: sells.length,
    holds: holds.length,
    breadth,
    avgWeekMove,
    avgPredictionRate,
    topBuy: topBuy
      ? { symbol: topBuy.symbol, predictionRate: topBuy.predictionRate }
      : null,
    topSell: topSell
      ? { symbol: topSell.symbol, predictionRate: topSell.predictionRate }
      : null,
  };
}
