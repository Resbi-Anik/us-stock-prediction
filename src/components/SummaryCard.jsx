import { fmtPct } from "../format.js";

const BREADTH_TEXT = {
  bullish: "Market breadth is bullish — more stocks are set up to rise than fall.",
  bearish: "Market breadth is bearish — more stocks are breaking down than rising.",
  mixed: "Market breadth is mixed — no clear direction across the watchlist.",
};

export default function SummaryCard({ summary, scanned }) {
  return (
    <section className="summary-card">
      <h2 className="summary-title">This week at a glance</h2>
      <p className="summary-text">{BREADTH_TEXT[summary.breadth]}</p>
      <div className="tiles">
        <div className="tile">
          <div className="tile-value up">{summary.buys}</div>
          <div className="tile-label">buy signals</div>
        </div>
        <div className="tile">
          <div className="tile-value down">{summary.sells}</div>
          <div className="tile-label">sell signals</div>
        </div>
        <div className="tile">
          <div className="tile-value">{summary.holds}</div>
          <div className="tile-label">holds</div>
        </div>
        <div className="tile">
          <div className="tile-value">
            {summary.avgPredictionRate != null
              ? summary.avgPredictionRate + "%"
              : "–"}
          </div>
          <div className="tile-label">avg prediction rate</div>
        </div>
      </div>
      <p className="summary-foot">
        Average move this week across {scanned} stocks:{" "}
        <b className={summary.avgWeekMove >= 0 ? "up" : "down"}>
          {fmtPct(summary.avgWeekMove)}
        </b>
        {summary.topBuy && (
          <>
            {" "}· Strongest buy: <b>{summary.topBuy.symbol}</b>
            {summary.topBuy.predictionRate != null &&
              ` (${summary.topBuy.predictionRate}% hit rate)`}
          </>
        )}
        {summary.topSell && (
          <>
            {" "}· Weakest: <b>{summary.topSell.symbol}</b>
            {summary.topSell.predictionRate != null &&
              ` (${summary.topSell.predictionRate}% hit rate)`}
          </>
        )}
      </p>
    </section>
  );
}
