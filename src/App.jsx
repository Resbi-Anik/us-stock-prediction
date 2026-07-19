import { useCallback, useEffect, useState } from "react";
import SummaryCard from "./components/SummaryCard.jsx";
import StockCard from "./components/StockCard.jsx";
import StockTable from "./components/StockTable.jsx";

export default function App() {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/screen");
      if (!res.ok) throw new Error("Server error " + res.status);
      setData(await res.json());
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const buys = data
    ? data.stocks.filter((s) => s.verdict === "BUY").slice(0, 5)
    : [];
  const sells = data
    ? data.stocks
        .filter((s) => s.verdict === "SELL")
        .sort((a, b) => b.sellScore - a.sellScore)
        .slice(0, 5)
    : [];

  return (
    <div className="wrap">
      <header>
        <div>
          <h1>📈 Weekly Picks</h1>
          <div className="sub">
            {data
              ? `Updated ${new Date(data.generatedAt).toLocaleString()} · ${
                  data.scanned
                } stocks scanned`
              : loading
              ? "Scanning US stocks…"
              : "Update failed"}
          </div>
        </div>
        <button className="refresh" onClick={load} disabled={loading}>
          ↻ Refresh
        </button>
      </header>

      <div className="disclaimer">
        ⚠️ Educational tool, <b>not financial advice</b>. Prediction rates are
        historical backtest hit rates — past performance does not guarantee
        future results. Signals ignore news, earnings, and fundamentals. Do your
        own research.
      </div>

      {loading && (
        <div className="loading">
          <div className="spin" />
          Fetching live market data & running backtests…
        </div>
      )}

      {error && !loading && (
        <div className="error">
          Could not load market data ({error}).<br />
          Check your internet connection and try again.
        </div>
      )}

      {data && !loading && (
        <>
          <SummaryCard summary={data.summary} scanned={data.scanned} />

          <h2>
            <span className="dot buy" />
            Buy candidates this week
          </h2>
          {buys.length > 0 ? (
            buys.map((s) => <StockCard key={s.symbol} stock={s} side="buy" />)
          ) : (
            <div className="card empty">
              No strong buy setups this week — market signals are mixed.
              Waiting is a position too.
            </div>
          )}

          <h2>
            <span className="dot sell" />
            Sell / avoid this week
          </h2>
          {sells.length > 0 ? (
            sells.map((s) => <StockCard key={s.symbol} stock={s} side="sell" />)
          ) : (
            <div className="card empty">No strong sell signals this week.</div>
          )}

          <h2>All {data.scanned} stocks scanned</h2>
          <StockTable stocks={data.stocks} />
        </>
      )}

      <footer>
        Data: Yahoo Finance · Signals & backtests recalculated every 15 min ·
        Built with Claude Code
      </footer>
    </div>
  );
}
