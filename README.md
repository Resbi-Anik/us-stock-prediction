# 📈 Weekly Picks — US Stocks

A React + Material UI web app (responsive — a full-page two-column dashboard on
desktop, a single stacked column on mobile, installable as a home-screen PWA)
that scans **~120 liquid US large-caps across all 11 GICS sectors** and
**ranks them by sector-neutral relative strength** with a pooled,
walk-forward-validated model, **tilted by a live fresh-info layer** (current
analyst consensus, price-target upside, one-month rating revisions, and
news-headline sentiment). Each stock shows its **rank / strength percentile**,
a **reliable expected-range and risk tier**, sector, live analyst/news
readings, an earnings-soon flag, and the model factors behind it. A **live
track record** records the app's own picks forward and scores them ~1 month
later. The app **auto-updates every 5 minutes** and has a light/dark theme
toggle.

> ⚠️ **Not financial advice, and deliberately honest about its limits.**
> Predicting a single stock's *absolute* up/down one month out barely beats
> assuming the market drifts up (~53% vs ~53% out-of-sample). What *does* work
> is **cross-sectional ranking** — predicting which stocks beat the others.
> Past performance never guarantees future results.

## Why it works this way (the honest part)

The path here was driven by out-of-sample tests, not vibes:

1. An early version reported a per-stock "prediction rate" of ~55%. That was a
   **selection artifact** — gating stocks on their in-sample hit rate, then
   reporting that number. A real holdout exposed it: selected stocks scored
   **42%** (worse than a coin flip) on the held-out year, persistence
   correlation **−0.28**.
2. A proper pooled model still couldn't predict **absolute direction**: 53% vs
   a 53% market-drift base rate. No classifier manufactures edge that isn't
   there at this horizon.
3. But **cross-sectional ranking works and is robust.** Training the model to
   predict whether a stock will *beat its peers* produces monotonic quintiles
   on held-out years — worst-ranked fifth ~+0.5%/mo, best-ranked ~+3%/mo, a
   long-short spread of **+2.5%** (last year) and **+3.4%** (year before),
   positive in both independent folds. Relative-strength ranking is exactly the
   "which stock to buy" question, so that is what the app now does.

The app displays its own true out-of-sample numbers (ranking spread, volatility
R², and the honest "absolute direction ≈ coin flip") in a reliability card, so
you can see how much to trust each output.

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

- **Shariah-compliant only toggle** — filters the whole app (and re-ranks
  within the filtered set) to the universe stocks that pass common Islamic
  index screenings (business-activity + financial-ratio screens in the style of
  Dow Jones Islamic Market / S&P Shariah). The classification lives in
  `universe.js` and is **approximate and informational — not a religious
  ruling**; verify individual stocks with a screening service such as Zoya or
  Musaffa. Your choice is remembered on the device.
- **Live track record** — the app snapshots its own ranking each trading day
  and, ~1 month later, scores how the day's top-ranked picks did versus the
  bottom-ranked. This is **forward, not backtested** — it starts empty and fills
  in as real time passes (`track.js`, stored under git-ignored `data/`).
- **Responsive layout** — on desktop, a sticky left rail (reliability card +
  summary + Shariah toggle) beside a wide main column of ranked cards and the
  full table; on mobile everything stacks into one column. No horizontal scroll
  at any width.
- **How much to trust this** — a reliability card whose headline is the
  **ranking edge**: a mini quintile bar chart of held-out-year returns by ranked
  fifth and the long-short spread. It also shows the volatility R² (reliable)
  and, for honesty, the absolute up/down accuracy vs base rate (≈ coin flip).
- **This week at a glance** — S&P 500 regime, counts of top/bottom/mid-pack, and
  average expected 1-month range.
- **Top ranked / Bottom ranked cards** — rank badge, price, sparkline, RSI, a
  **strength + live tilt percentile** bar, the **expected ±range** and **risk
  tier**, the **live analyst consensus / target upside / news tone** (hover the
  news reading for the actual headlines), an **earnings-soon chip**, an honest
  one-line read, and the top model factors.
- **Full ranked table** of all stocks: strength percentile, expected range,
  risk tier, and lean, strongest to weakest.

## How the decision engine works

The server pulls **~5 years of daily bars** for every stock (~120 names) plus
the S&P 500 (SPY) and builds **14 continuous technical features** per day:
1-week / 1-month / 3-month / 6-month momentum, RSI-14, RSI-2, MACD histogram,
distance from the 20- and 50-day averages, Bollinger-band position, relative
strength vs SPY, market regime (SPY vs its 200-day average), volatility, and
volume-vs-average.

**Ranking — pooled logistic regression on a sector-neutral cross-sectional
target.** A single model is trained across *all* stocks (standardized features,
L2) to predict whether a stock will **beat its own sector's peers** over the
next ~month. Its output is a **relative-strength score**; stocks are ranked by
it and the top / bottom fifth become the leans. There is no in-sample selection
gate. A wider, sector-neutral universe was adopted because a bake-off showed it
keeps the validated spread positive across two independent folds while
spreading the top picks across ~8 sectors instead of clustering in high-vol
tech.

**Reliability — a real train/holdout split, every refresh.** The final ~12
months are held out; the model trains only on earlier data. The app reports the
true out-of-sample **quintile spread** (best-ranked minus worst-ranked fifth),
ranking accuracy, the absolute-direction accuracy vs base rate (shown as ≈ a
coin flip, on purpose), Brier score, and volatility R². Nothing shown is an
in-sample number.

**Risk / expected range — the reliable output.** Expected ±move (one sigma) over
the horizon comes from recent realized daily-return volatility scaled by
√horizon; each stock gets a cross-sectional **Low / Medium / High** risk tier.
Volatility is genuinely predictable (out-of-sample R² ≈ 0.37, corr ≈ 0.61 at the
displayed 21-day horizon).

**Explanations.** Each card's "top factors" are the standardized logistic
**feature contributions** (weight × value) for that stock today — a faithful
readout of what actually drove its score.

## The fresh-info tilt (live analyst + news layer)

The price model only sees history, so `sources.js` adds a **live layer** from
free, keyless Yahoo endpoints (quoteSummary via the cookie+crumb handshake, and
the per-symbol news RSS feed):

- **Analyst consensus** — recommendation mean (1 = Strong Buy … 5 = Sell) and
  the number of covering analysts (ignored below 3 analysts).
- **Price-target upside** — mean analyst target vs the current price,
  winsorized at ±50% so stale/extreme targets can't dominate.
- **Rating revisions** — the change in the buy-share of ratings vs one month
  ago (revisions carry cross-sectional signal in the literature).
- **News sentiment** — headlines from the last 7 days scored with a small
  finance-tuned lexicon (beats/upgrades/records vs misses/downgrades/probes),
  dampened when few headlines carry signal.
- **Earnings proximity** — shown as an event-risk chip ("Earnings 7d"), never
  as a direction.

The four signals become cross-sectional percentiles and combine into an
**external score** (weights 30/25/25/20); the final ranking blends
`75% model percentile + 25% external percentile`. **Honesty note:** this layer
has no free historical feed, so it *cannot* be backtest-validated like the
model — which is why it gets a modest weight, is labeled "live" in the
reliability card, and is scored forward by the live track record (which
snapshots the blended ranking). It refreshes every ~30 minutes and degrades
gracefully: if the endpoints fail, the app ranks on the validated model alone.

## Architecture

- `server.js` — zero-dependency Node server: fetches Yahoo Finance data (no API
  key), builds features, trains the pooled ranking model (past-only for honest
  metrics, all-data for the live ranking) + volatility forecast, serves
  `/api/screen` and the built React app from `dist/`. Results cached 5 min.
- `universe.js` — the ~120-name universe with sector and approximate Shariah
  tags.
- `sources.js` — the live fresh-info layer: analyst consensus / targets /
  revisions / earnings dates (Yahoo quoteSummary, cookie+crumb) and news-RSS
  sentiment. Cached ~30 min, zero dependencies, never throws.
- `track.js` — the forward-only live track record (persists to `data/`).
- `src/` — React app (Vite + Material UI): `App.jsx`, `components/`
  (ModelReliabilityCard, TrackRecordCard, SummaryCard, StockCard, Sparkline,
  StockTable), `theme.js` (MUI light/dark themes — the header moon/sun button
  toggles them, defaulting to the system preference and remembered per device),
  `format.js`, `summary.js`.
- `public/` — PWA manifest and icons (copied into `dist/` at build).
- `data/` — git-ignored; holds the accruing track-record snapshots.

## Customize

- **Universe / sectors / Shariah tags:** edit `universe.js`.
- **Refresh interval:** `CACHE_TTL_MS` in `server.js` (server cache) and
  `AUTO_REFRESH_SECONDS` in `src/App.jsx` (client polling) — both 5 minutes.
- **Port:** `PORT=8080 node server.js`.
- **Horizon & tier size:** `HORIZON` (default 21 trading days) and
  `TIER_QUANTILE` (default 0.2 → top/bottom fifth become leans) in `server.js`.
- **Fresh-info tilt:** `BLEND_EXTERNAL` in `server.js` (default 0.25; set 0 to
  rank on the validated model alone) and the component weights / news window in
  `sources.js`.
