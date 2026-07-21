# 📈 Weekly Picks — US Stocks

A React + Material UI web app (works on desktop and mobile, installable as a
home-screen PWA) that scans 48 liquid US large-cap stocks with a **pooled,
walk-forward-validated model**. For each stock it shows a **calibrated
probability of being up over the next month**, a **reliable expected-range /
risk read**, and a **risk-adjusted conviction rank**. The app **auto-updates
every 5 minutes** and has a light/dark theme toggle.

> ⚠️ **Not financial advice, and deliberately honest about its limits.** An
> out-of-sample study baked into this app shows that predicting the *direction*
> of a single large-cap one month out barely beats assuming the market drifts
> up (~53% vs ~53%). What *is* reliably predictable is **volatility / risk**
> (out-of-sample R² ≈ 0.22), so the app leads with the risk read and presents
> the directional "lean" as low-confidence. Past performance never guarantees
> future results.

## Why it works this way (the honest part)

Earlier versions reported a per-stock "prediction rate" of ~55%, which looked
like edge but was a **selection artifact**: gating stocks on their in-sample
hit rate and then reporting that same number. A proper holdout test exposed it —
stocks selected on the first ~4 years scored **42%** (worse than a coin flip)
on the held-out final year, with a **negative** persistence correlation. A
fancier classifier cannot manufacture directional edge that isn't there at this
horizon. So the engine was rebuilt to (a) predict what's actually predictable
(risk), (b) show direction as a calibrated probability next to the market base
rate, and (c) display its own true out-of-sample accuracy so you can see how
much to trust each number.

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
- **How much to trust this** — a reliability card showing the model's *real*
  held-out-year direction accuracy vs the market base rate (≈ tied, flagged as
  "no proven edge"), the volatility-forecast R² (reliable), and the Brier score.
- **This week at a glance** — S&P 500 regime (risk-on/off), counts of buy/sell
  leans and neutrals, and average expected 1-month range.
- **Buy / Sell lean cards** — price, sparkline, RSI, a **chance-up probability**
  bar (with the neutral-50% marker) shown next to the base rate, the **expected
  ±range** and **risk tier**, an honest one-line read, and the top model
  factors behind the lean.
- **Full table** of all 48 stocks: chance-up, expected range, risk tier, and
  lean, ranked by risk-adjusted conviction.

## How the decision engine works

The server pulls **~5 years of daily bars** for every stock plus the S&P 500
(SPY) and builds **13 continuous technical features** per day: 1-week / 1-month
/ 3-month momentum, RSI-14, RSI-2, MACD histogram, distance from the 20- and
50-day averages, Bollinger-band position, relative strength vs SPY, market
regime (SPY vs its 200-day average), volatility, and volume-vs-average.

**Direction — pooled logistic regression.** A single logistic model is trained
across *all* stocks (≈48× more data than a per-stock fit, which is the main
driver of generalization), with standardized features and L2 regularization.
It outputs a **calibrated probability** the stock is higher in ~1 month. There
is **no selection gate** — that was removed because it overfit (see above). A
"lean" is shown only when the probability clears 57% (up) or 47% (down); most
stocks sit near even odds, which is the honest normal state.

**Reliability — a real train/holdout split, every refresh.** The final ~12
months are held out; the model trains only on earlier data and is scored on the
holdout. Those true out-of-sample numbers — direction accuracy vs base rate,
Brier score, and the volatility-forecast R² — are shown in the app's "How much
to trust this" card. Nothing shown to the user is an in-sample number.

**Risk / expected range — the reliable output.** Expected ±move over the
horizon comes from recent realized daily-return volatility scaled by √horizon;
each stock gets a cross-sectional **Low / Medium / High** risk tier. This is
the trustworthy part (out-of-sample vol correlation ≈ 0.47).

**Conviction & explanations.** Cards are ranked by risk-adjusted conviction,
`(probability − base rate) / expected volatility`. Each card's "top factors"
are the standardized logistic **feature contributions** (weight × value) for
that stock today — a faithful readout of what actually drove the number.

## Architecture

- `server.js` — zero-dependency Node server: fetches Yahoo Finance data (no API
  key), builds features, trains the pooled logistic model (twice: past-only for
  honest metrics, all-data for live predictions) + volatility forecast, serves
  `/api/screen` and the built React app from `dist/`. Results cached 5 min.
- `src/` — React app (Vite + Material UI): `App.jsx`, `components/`
  (ModelReliabilityCard, SummaryCard, StockCard, Sparkline, StockTable),
  `theme.js` (MUI light/dark themes — the header moon/sun button toggles them,
  defaulting to the system preference and remembered per device), `format.js`,
  `summary.js`.
- `public/` — PWA manifest and icons (copied into `dist/` at build).

## Customize

- **Watchlist:** edit `WATCHLIST` at the top of `server.js`.
- **Refresh interval:** `CACHE_TTL_MS` in `server.js` (server cache) and
  `AUTO_REFRESH_SECONDS` in `src/App.jsx` (client polling) — both 5 minutes.
- **Port:** `PORT=8080 node server.js`.
- **Horizon & lean thresholds:** `HORIZON`, `LEAN_BUY_PROB`, `LEAN_SELL_PROB`
  in `server.js`.
