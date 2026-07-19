import { fmtPct, fmtPrice, deltaClass } from "../format.js";

export default function StockTable({ stocks }) {
  return (
    <div className="tablebox">
      <table>
        <thead>
          <tr>
            <th>Symbol</th>
            <th>Price</th>
            <th>1 wk</th>
            <th>1 mo</th>
            <th>RSI</th>
            <th>Pred. rate</th>
            <th>Signal</th>
          </tr>
        </thead>
        <tbody>
          {stocks.map((s) => (
            <tr key={s.symbol}>
              <td>
                <span className="tsym">{s.symbol}</span>
              </td>
              <td>${fmtPrice(s.price)}</td>
              <td className={deltaClass(s.chg5d)}>{fmtPct(s.chg5d)}</td>
              <td className={deltaClass(s.chg20d)}>{fmtPct(s.chg20d)}</td>
              <td>{s.rsi ?? "–"}</td>
              <td>{s.predictionRate != null ? s.predictionRate + "%" : "–"}</td>
              <td>
                <span className={`pill ${s.verdict}`}>
                  {s.verdict === "BUY" ? "▲ " : s.verdict === "SELL" ? "▼ " : ""}
                  {s.verdict}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
