import Sparkline from "./Sparkline.jsx";
import { fmtPct, fmtPrice, deltaClass, rateBucket, summarize } from "../format.js";

export default function StockCard({ stock, side }) {
  const signals = stock.signals.filter((g) => g.side === side).slice(0, 3);
  const bucket = rateBucket(stock.predictionRate);

  return (
    <div className="card">
      <div className="card-top">
        <div>
          <div className="sym">{stock.symbol}</div>
          <div className="name">{stock.name}</div>
          <span className={`badge ${side}`}>
            {side === "buy" ? "▲ BUY CANDIDATE" : "▼ SELL / AVOID"}
          </span>
        </div>
        <div>
          <div className="price">${fmtPrice(stock.price)}</div>
          <div className={`chg ${deltaClass(stock.chg5d)}`}>
            {fmtPct(stock.chg5d)} this week
          </div>
        </div>
      </div>

      <div className="row2">
        <Sparkline values={stock.spark} />
        <div className="stats">
          <span>
            1mo <b className={deltaClass(stock.chg20d)}>{fmtPct(stock.chg20d)}</b>
          </span>
          <span>
            RSI <b>{stock.rsi ?? "–"}</b>
          </span>
          <span>
            Score <b>{side === "buy" ? stock.buyScore : stock.sellScore}</b>
          </span>
        </div>
      </div>

      <div className={`rate-line ${bucket.cls}`}>
        <div className="rate-head">
          <span>Prediction rate</span>
          <b>
            {stock.predictionRate != null ? `${stock.predictionRate}%` : "n/a"}
            <span className="rate-bucket"> · {bucket.label}</span>
          </b>
        </div>
        {stock.predictionRate != null && (
          <div
            className="rate-bar"
            role="meter"
            aria-valuemin="0"
            aria-valuemax="100"
            aria-valuenow={stock.predictionRate}
            aria-label="Historical prediction rate"
          >
            <div
              className="rate-fill"
              style={{ width: `${stock.predictionRate}%` }}
            />
          </div>
        )}
        <p className="rate-note">{summarize(stock, side)}</p>
      </div>

      {signals.length > 0 && (
        <ul className="signals">
          {signals.map((g, i) => (
            <li key={i} className={g.side}>
              {g.text}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
