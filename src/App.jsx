import { useCallback, useEffect, useState } from "react";
import SummaryCard from "./components/SummaryCard.jsx";
import StockCard from "./components/StockCard.jsx";
import StockTable from "./components/StockTable.jsx";
import { buildSummary } from "./summary.js";

export default function App() {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);
  const [shariahOnly, setShariahOnly] = useState(
    () => localStorage.getItem("shariahOnly") === "1"
  );

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

  const toggleShariah = () => {
    setShariahOnly((v) => {
      localStorage.setItem("shariahOnly", v ? "0" : "1");
      return !v;
    });
  };

  const visible = data
    ? shariahOnly
      ? data.stocks.filter((s) => s.shariah)
      : data.stocks
    : [];
  const summary = data ? buildSummary(visible) : null;
  const buys = visible.filter((s) => s.verdict === "BUY").slice(0, 5);
  const sells = visible
    .filter((s) => s.verdict === "SELL")
    .sort((a, b) => b.sellScore - a.sellScore)
    .slice(0, 5);

  return (
    <div className="wrap">
      <header>
        <div>
          <h1>📈 Weekly Picks</h1>
          <div className="sub">
            {data
              ? `Updated ${new Date(data.generatedAt).toLocaleString()} · ${
                  visible.length
                } stocks${shariahOnly ? " (Shariah-compliant)" : " scanned"}`
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

      <div className="filterbar">
        <label className="switch-row">
          <span className="switch-label">
            ☪ Shariah-compliant only
            <span className="switch-note">
              approximate screening — not a religious ruling; verify with a
              service like Zoya or Musaffa
            </span>
          </span>
          <button
            type="button"
            role="switch"
            aria-checked={shariahOnly}
            className={`switch ${shariahOnly ? "on" : ""}`}
            onClick={toggleShariah}
          >
            <span className="knob" />
          </button>
        </label>
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
          <SummaryCard summary={summary} scanned={visible.length} />

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

          <h2>
            All {visible.length}
            {shariahOnly ? " Shariah-compliant" : ""} stocks
          </h2>
          <StockTable stocks={visible} showShariah={!shariahOnly} />
        </>
      )}

      <footer>
        Data: Yahoo Finance · Signals & backtests recalculated every 15 min ·
        Built with Claude Code
      </footer>
    </div>
  );
}
