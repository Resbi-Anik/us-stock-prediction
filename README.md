# 📈 Weekly Picks — US Stocks

A React web app (works on desktop and mobile, installable as a home-screen PWA)
that scans 48 liquid US large-cap stocks and ranks the best **buy candidates**
and **sell / avoid candidates** for the current week — each with a backtested
**prediction rate** showing how often that stock's setup called the next week
correctly over the past 2 years.

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

## How the ranking works

For each stock the server pulls 2 years of daily bars and computes:

| Signal | Buy points | Sell points |
|---|---|---|
| Trend (price vs 20d / 50d moving averages) | up to 30 | up to 30 |
| Momentum (1-week and 1-month % change) | up to 30 | up to 30 |
| RSI-14 (rewards 50–65, flags >72 overbought) | up to 20 | up to 20 |
| Volume confirmation (5d vs 20d average) | 10 | 10 |
| 20-day breakout / breakdown proximity | 10 | 10 |

A stock is **BUY** when its buy score is ≥ 55 and clearly beats its sell score,
**SELL** when the reverse holds, otherwise **HOLD**.

**Prediction rate (backtest):** the same scoring is replayed through the past
2 years in 5-trading-day steps. Each historical BUY/SELL call is checked
against the *following* week's actual move; the prediction rate is the share of
calls that were right. Fewer than 5 historical signals → "n/a".

## Architecture

- `server.js` — zero-dependency Node server: fetches Yahoo Finance data (no API
  key), computes indicators + backtests, serves `/api/screen` and the built
  React app from `dist/`. Results cached 15 min.
- `src/` — React app (Vite): `App.jsx`, `components/` (SummaryCard, StockCard,
  Sparkline, StockTable), `format.js`, `index.css` (light + dark mode).
- `public/` — PWA manifest and icons (copied into `dist/` at build).

## Customize

- **Watchlist:** edit `WATCHLIST` at the top of `server.js`.
- **Refresh interval:** `CACHE_TTL_MS` in `server.js`.
- **Port:** `PORT=8080 node server.js`.
