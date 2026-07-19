# 📈 Weekly Picks — US Stocks

A React + Material UI web app (works on desktop and mobile, installable as a
home-screen PWA) that scans 48 liquid US large-cap stocks and ranks the best
**buy candidates** and **sell / avoid candidates** for the current week — each
with a backtested **prediction rate** showing how often that stock's setup
called the next week correctly over the past 2 years. The app **auto-updates
from the API every 5 minutes** (live countdown chip in the UI) and has a
light/dark theme toggle.

> ⚠️ **Not financial advice.** Prediction rates are historical backtest hit
> rates — past performance does not guarantee future results. Signals look only
> at price/volume technicals and ignore news, earnings, and fundamentals.

## Run it

```bash
npm install        # first time only
npm run build      # build the React app into dist/
node server.js     # serve app + API
```

Then open **http://localhost:3000**.

**On your phone:** same Wi-Fi network, find this computer's IP
(`ipconfig getifaddr en0` on macOS) and open `http://<that-ip>:3000`. Use
"Add to Home Screen" for an app-like experience (icon + manifest included).

**Development** (hot reload): run `node server.js` in one terminal and
`npm run dev` in another, then open the Vite URL (proxies `/api` to :3000).

## What's on screen

- **Shariah-compliant only toggle** — filters the whole app (summary, picks,
  table) to the ~31 watchlist stocks that pass common Islamic index screenings
  (business-activity + financial-ratio screens in the style of Dow Jones
  Islamic Market / S&P Shariah). The classification lives in the
  `SHARIAH_COMPLIANT` set in `server.js` and is **approximate and
  informational — not a religious ruling**; verify individual stocks with a
  screening service such as Zoya or Musaffa. Your choice is remembered on the
  device.
- **This week at a glance** — market breadth (bullish/bearish/mixed), counts of
  buy/sell/hold signals, average weekly move, average prediction rate, and the
  strongest/weakest names.
- **Buy candidates** / **Sell-avoid** cards — price, sparkline, RSI, momentum,
  the reasons behind the call, and a **prediction rate** bar with a
  plain-English summary (e.g. "this setup called the next week right 62% of the
  time over the past 2 years (60 signals)"). ≥60% = high confidence,
  50–59% = moderate, <50% = low.
- **Full table** of all 48 stocks with weekly/monthly change, RSI, prediction
  rate, and BUY/HOLD/SELL signal.

## How the decision engine works

For each stock the server pulls **~5 years of daily bars** and evaluates an
**ensemble of 12 sub-signals**, each voting up / down / no-opinion for the
coming week:

trend structure (20d/50d averages) · 1-month momentum · 1-week momentum ·
RSI strength zone · RSI extremes · RSI-2 dip/spike reversion · MACD ·
Bollinger-band reversion · relative strength vs S&P 500 · overall market
regime (SPY vs its 200-day average) · volume confirmation · 20-day
breakout/breakdown.

**Walk-forward learning (no lookahead):** history is replayed day by day.
Each sub-signal's hit rate *on that particular stock* is tracked as the replay
progresses, and votes are combined weighted by each signal's proven edge so
far — so by today, the model has learned which signals actually work for each
symbol. The composite verdict is sampled weekly along the way, giving each
stock an honest backtest of the exact rule the app uses live.

**Reported per stock:** prediction rate (backtest hit rate) with a **95%
Wilson confidence interval**, sample count, and **expectancy** (average %
return per signaled week — a hit rate means little if wins are small and
losses big).

**Decision gate:** a live BUY/SELL is only surfaced when that stock's own
backtest shows hit rate ≥ 52% *and* positive expectancy. Everything else is
HOLD — fewer picks, but each one validated. Picks are ranked by validated
edge (rate + expectancy, tempered by sample size) rather than raw signal
strength, and each card lists the strongest contributing signals with their
per-stock track record (e.g. "Relative strength vs S&P 500 — right 58% of
892 past calls on this stock").

## Architecture

- `server.js` — zero-dependency Node server: fetches Yahoo Finance data (no API
  key), runs the walk-forward ensemble + backtests, serves `/api/screen` and
  the built React app from `dist/`. Results cached 5 min.
- `src/` — React app (Vite + Material UI): `App.jsx`, `components/`
  (SummaryCard, StockCard, Sparkline, StockTable), `theme.js` (MUI light/dark
  themes — the header moon/sun button toggles them, defaulting to the system
  preference and remembered per device), `format.js`, `summary.js`.
- `public/` — PWA manifest and icons (copied into `dist/` at build).

## Customize

- **Watchlist:** edit `WATCHLIST` at the top of `server.js`.
- **Refresh interval:** `CACHE_TTL_MS` in `server.js` (server cache) and
  `AUTO_REFRESH_SECONDS` in `src/App.jsx` (client polling) — both 5 minutes.
- **Port:** `PORT=8080 node server.js`.
