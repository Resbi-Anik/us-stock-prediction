/**
 * US Stock Weekly Picks — zero-dependency Node server.
 *
 * Serves the React app from ./dist and exposes:
 *   GET /api/screen  -> scans the watchlist and returns, per stock, a
 *                       calibrated directional probability, a reliable
 *                       expected-range / risk forecast, and a risk-adjusted
 *                       conviction rank.
 *
 * DECISION ENGINE (v3) — built from an honest out-of-sample study:
 *
 *   Empirically, 1-week/1-month *direction* of a single large-cap is close to
 *   unpredictable from technicals: a pooled logistic model scores ~53% on a
 *   held-out final year — statistically tied with the "market drifts up" base
 *   rate (~53%). Selecting stocks on their in-sample hit rate is actively
 *   HARMFUL (that selection's holdout hit rate was 42%, correlation -0.28).
 *   So this engine does NOT pretend to have directional edge it lacks.
 *
 *   What IS reliably predictable is VOLATILITY (past vol vs next-period vol:
 *   correlation ~0.48, R^2 ~0.23 out-of-sample). The engine therefore leads
 *   with a trustworthy expected-range / risk read, and treats direction as a
 *   modest, calibrated probability shown honestly next to the base rate.
 *
 *   - Direction: pooled logistic regression over 13 continuous technical
 *     features, trained on all history; probability is what it is (no gate).
 *   - Reliability: each refresh re-runs a train/holdout split so the app can
 *     show its own true out-of-sample accuracy vs the base rate + volatility
 *     forecast R^2 — the user sees exactly how much to trust each output.
 *   - Volatility: expected +/- range over the horizon from recent realized
 *     volatility; a cross-sectional risk tier (Low/Medium/High).
 *   - Conviction: risk-adjusted directional edge = (prob - base) / exp. vol.
 *
 * Data source: Yahoo Finance public chart API (no key required).
 * Results cached in memory for 5 minutes.
 */

const http = require("http");
const https = require("https");
const fs = require("fs");
const path = require("path");

const PORT = process.env.PORT || 3000;
const CACHE_TTL_MS = 5 * 60 * 1000;

// Engine tuning
const HORIZON = 21; // trading days a call is judged against (~1 month; more signal than 1wk)
const HOLDOUT_BARS = 252; // final ~12 months held out to measure honest accuracy
const WARMUP = 60; // bars before a stock has enough history for features
const LEAN_BUY_PROB = 0.57; // calibrated prob thresholds for a directional lean
const LEAN_SELL_PROB = 0.47;
const GD_ITERS = 300;
const GD_LR = 0.1;
const GD_L2 = 1e-3;

// Human-readable feature labels (must match FEATURE order below)
const FEATURES = [
  { key: "mom5", label: "1-week momentum" },
  { key: "mom20", label: "1-month momentum" },
  { key: "mom60", label: "3-month momentum" },
  { key: "rsi14", label: "RSI-14 level" },
  { key: "rsi2", label: "Short-term reversion (RSI-2)" },
  { key: "macd", label: "MACD histogram" },
  { key: "distSMA20", label: "Distance from 20-day average" },
  { key: "distSMA50", label: "Distance from 50-day average" },
  { key: "bollB", label: "Bollinger-band position" },
  { key: "relStr", label: "Relative strength vs S&P 500" },
  { key: "regime", label: "Market regime (S&P vs 200-day)" },
  { key: "vol20", label: "Volatility level" },
  { key: "volRatio", label: "Volume vs average" },
];
const D = FEATURES.length;

// Liquid large/mega-cap US stocks across sectors.
const WATCHLIST = [
  "AAPL", "MSFT", "NVDA", "GOOGL", "AMZN", "META", "TSLA", "AVGO", "AMD", "CRM",
  "ORCL", "ADBE", "NFLX", "INTC", "QCOM", "PLTR", "UBER", "SHOP",
  "JPM", "BAC", "GS", "MS", "V", "MA", "AXP", "BRK-B",
  "UNH", "JNJ", "LLY", "PFE", "MRK", "ABBV",
  "WMT", "COST", "HD", "MCD", "NKE", "SBUX", "KO", "PEP", "DIS",
  "CAT", "BA", "GE", "XOM", "CVX", "LIN", "T",
];

/**
 * Approximate Shariah-compliance classification per ticker, following common
 * Islamic index screenings. Informational, NOT a fatwa — verify with a service.
 */
const SHARIAH_COMPLIANT = new Set([
  "AAPL", "MSFT", "NVDA", "GOOGL", "AMZN", "META", "TSLA", "AMD", "CRM",
  "ADBE", "INTC", "QCOM", "PLTR", "UBER", "SHOP", "V", "MA",
  "JNJ", "LLY", "PFE", "MRK", "ABBV",
  "HD", "NKE", "SBUX", "KO", "PEP",
  "CAT", "XOM", "CVX", "LIN",
]);

let cache = { at: 0, payload: null };
let inflight = null;

// ---------- Yahoo fetch ----------

function fetchJson(url) {
  return new Promise((resolve, reject) => {
    const req = https.get(
      url,
      {
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
          Accept: "application/json",
        },
        timeout: 15000,
      },
      (res) => {
        let body = "";
        res.on("data", (c) => (body += c));
        res.on("end", () => {
          if (res.statusCode !== 200) {
            reject(new Error(`HTTP ${res.statusCode} for ${url}`));
            return;
          }
          try {
            resolve(JSON.parse(body));
          } catch (e) {
            reject(e);
          }
        });
      }
    );
    req.on("timeout", () => req.destroy(new Error("timeout")));
    req.on("error", reject);
  });
}

async function fetchHistory(symbol) {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(
    symbol
  )}?range=5y&interval=1d`;
  const json = await fetchJson(url);
  const result = json?.chart?.result?.[0];
  if (!result) throw new Error(`no data for ${symbol}`);
  const quote = result.indicators.quote[0];
  const closes = [];
  const volumes = [];
  const dates = [];
  for (let i = 0; i < result.timestamp.length; i++) {
    if (quote.close[i] == null) continue;
    closes.push(quote.close[i]);
    volumes.push(quote.volume[i] || 0);
    dates.push(new Date(result.timestamp[i] * 1000).toISOString().slice(0, 10));
  }
  return { symbol, name: result.meta.longName || symbol, closes, volumes, dates };
}

async function mapWithConcurrency(items, limit, fn) {
  const results = new Array(items.length);
  let next = 0;
  async function worker() {
    while (next < items.length) {
      const i = next++;
      try {
        results[i] = await fn(items[i]);
      } catch (e) {
        results[i] = { error: e.message, symbol: items[i] };
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}

// ---------- Indicator series (O(n)) ----------

function smaSeries(v, p) {
  const out = new Array(v.length).fill(null);
  let s = 0;
  for (let i = 0; i < v.length; i++) {
    s += v[i];
    if (i >= p) s -= v[i - p];
    if (i >= p - 1) out[i] = s / p;
  }
  return out;
}

function stdSeries(v, p) {
  const out = new Array(v.length).fill(null);
  let s = 0;
  let sq = 0;
  for (let i = 0; i < v.length; i++) {
    s += v[i];
    sq += v[i] * v[i];
    if (i >= p) {
      s -= v[i - p];
      sq -= v[i - p] * v[i - p];
    }
    if (i >= p - 1) {
      const mean = s / p;
      out[i] = Math.sqrt(Math.max(0, sq / p - mean * mean));
    }
  }
  return out;
}

function emaSeries(v, p) {
  const out = new Array(v.length).fill(null);
  const k = 2 / (p + 1);
  let e = null;
  let seed = 0;
  for (let i = 0; i < v.length; i++) {
    if (e == null) {
      seed += v[i];
      if (i === p - 1) {
        e = seed / p;
        out[i] = e;
      }
    } else {
      e = v[i] * k + e * (1 - k);
      out[i] = e;
    }
  }
  return out;
}

function rsiSeries(v, p) {
  const out = new Array(v.length).fill(null);
  if (v.length <= p) return out;
  let g = 0;
  let l = 0;
  for (let i = 1; i <= p; i++) {
    const d = v[i] - v[i - 1];
    if (d >= 0) g += d;
    else l -= d;
  }
  let ag = g / p;
  let al = l / p;
  out[p] = al === 0 ? 100 : 100 - 100 / (1 + ag / al);
  for (let i = p + 1; i < v.length; i++) {
    const d = v[i] - v[i - 1];
    ag = (ag * (p - 1) + Math.max(d, 0)) / p;
    al = (al * (p - 1) + Math.max(-d, 0)) / p;
    out[i] = al === 0 ? 100 : 100 - 100 / (1 + ag / al);
  }
  return out;
}

function pctSeries(v, d) {
  const out = new Array(v.length).fill(null);
  for (let i = d; i < v.length; i++) {
    out[i] = ((v[i] - v[i - d]) / v[i - d]) * 100;
  }
  return out;
}

function macdHistSeries(closes) {
  const e12 = emaSeries(closes, 12);
  const e26 = emaSeries(closes, 26);
  const out = new Array(closes.length).fill(null);
  const k = 2 / 10;
  let sig = null;
  let cnt = 0;
  let seed = 0;
  for (let i = 0; i < closes.length; i++) {
    if (e12[i] == null || e26[i] == null) continue;
    const m = e12[i] - e26[i];
    if (sig == null) {
      seed += m;
      cnt++;
      if (cnt === 9) {
        sig = seed / 9;
        out[i] = m - sig;
      }
    } else {
      sig = m * k + sig * (1 - k);
      out[i] = m - sig;
    }
  }
  return out;
}

/** Rolling std of daily log returns (volatility proxy). */
function volSeries(closes, p) {
  const r = new Array(closes.length).fill(null);
  for (let i = 1; i < closes.length; i++) r[i] = Math.log(closes[i] / closes[i - 1]);
  const out = new Array(closes.length).fill(null);
  let s = 0;
  let sq = 0;
  let cnt = 0;
  for (let i = 1; i < closes.length; i++) {
    s += r[i];
    sq += r[i] * r[i];
    cnt++;
    if (cnt > p) {
      s -= r[i - p];
      sq -= r[i - p] * r[i - p];
      cnt--;
    }
    if (cnt === p) {
      const m = s / p;
      out[i] = Math.sqrt(Math.max(0, sq / p - m * m));
    }
  }
  return out;
}

// ---------- Market context (SPY) ----------

function prepMarket(spy) {
  return {
    dates: spy.dates,
    closes: spy.closes,
    idxByDate: new Map(spy.dates.map((d, i) => [d, i])),
    sma200: smaSeries(spy.closes, 200),
    mom20: pctSeries(spy.closes, 20),
  };
}

// ---------- Feature engineering ----------

/**
 * Continuous feature vectors per bar for one stock (null where not yet defined).
 * Also returns the daily-return volatility series used for range forecasting.
 */
function featureMatrix(stock, market) {
  const c = stock.closes;
  const s20 = smaSeries(c, 20);
  const s50 = smaSeries(c, 50);
  const st20 = stdSeries(c, 20);
  const r14 = rsiSeries(c, 14);
  const r2 = rsiSeries(c, 2);
  const mh = macdHistSeries(c);
  const m5 = pctSeries(c, 5);
  const m20 = pctSeries(c, 20);
  const m60 = pctSeries(c, 60);
  const v5 = smaSeries(stock.volumes, 5);
  const v20 = smaSeries(stock.volumes, 20);
  const vol20d = volSeries(c, 20);

  const X = new Array(c.length).fill(null);
  for (let i = 0; i < c.length; i++) {
    const k = market ? market.idxByDate.get(stock.dates[i]) : null;
    if (
      s50[i] == null || m60[i] == null || r14[i] == null || mh[i] == null ||
      st20[i] == null || v20[i] == null || vol20d[i] == null ||
      k == null || market.sma200[k] == null
    ) {
      continue;
    }
    const pB = st20[i] > 0 ? (c[i] - (s20[i] - 2 * st20[i])) / (4 * st20[i]) : 0.5;
    X[i] = [
      m5[i],
      m20[i],
      m60[i],
      r14[i] - 50,
      r2[i] - 50,
      (mh[i] / c[i]) * 100,
      ((c[i] - s20[i]) / s20[i]) * 100,
      ((c[i] - s50[i]) / s50[i]) * 100,
      (pB - 0.5) * 100,
      m20[i] - (market.mom20[k] || 0),
      ((market.closes[k] - market.sma200[k]) / market.sma200[k]) * 100,
      st20[i] / c[i] * 100,
      v20[i] > 0 ? (v5[i] / v20[i] - 1) * 100 : 0,
    ];
  }
  return { X, vol20d };
}

// ---------- Logistic regression (batch GD, L2, standardized) ----------

function sigmoid(z) {
  return 1 / (1 + Math.exp(-z));
}

function standardizer(rows) {
  const mean = new Array(D).fill(0);
  const sd = new Array(D).fill(0);
  for (const x of rows) for (let j = 0; j < D; j++) mean[j] += x[j];
  for (let j = 0; j < D; j++) mean[j] /= rows.length || 1;
  for (const x of rows) for (let j = 0; j < D; j++) sd[j] += (x[j] - mean[j]) ** 2;
  for (let j = 0; j < D; j++) sd[j] = Math.sqrt(sd[j] / (rows.length || 1)) || 1;
  return {
    mean,
    sd,
    norm: (x) => x.map((v, j) => (v - mean[j]) / sd[j]),
  };
}

function trainLogistic(X, Y) {
  const std = standardizer(X);
  const Xn = X.map(std.norm);
  const w = new Array(D).fill(0);
  let b = 0;
  const n = Xn.length || 1;
  for (let it = 0; it < GD_ITERS; it++) {
    const gw = new Array(D).fill(0);
    let gb = 0;
    for (let i = 0; i < Xn.length; i++) {
      let z = b;
      for (let j = 0; j < D; j++) z += w[j] * Xn[i][j];
      const diff = sigmoid(z) - Y[i];
      for (let j = 0; j < D; j++) gw[j] += diff * Xn[i][j];
      gb += diff;
    }
    for (let j = 0; j < D; j++) w[j] -= GD_LR * (gw[j] / n + GD_L2 * w[j]);
    b -= GD_LR * (gb / n);
  }
  const predictStd = (xn) => sigmoid(xn.reduce((s, v, j) => s + v * w[j], 0) + b);
  return { w, b, std, predict: (x) => predictStd(std.norm(x)), predictStd };
}

// ---------- Assemble dataset across all stocks ----------

function buildDataset(stocks, market) {
  const cutoff = market.dates[market.dates.length - HOLDOUT_BARS];
  const train = { X: [], Y: [] };
  const holdout = []; // {x, y}
  const holdoutVol = []; // {past, future} for vol-forecast R^2
  const all = { X: [], Y: [] };
  const perStock = [];

  for (const stock of stocks) {
    const { X, vol20d } = featureMatrix(stock, market);
    const c = stock.closes;
    const n = c.length;
    let lastValid = -1;
    for (let i = WARMUP; i < n; i++) {
      if (X[i]) lastValid = i;
      if (!X[i] || i + HORIZON >= n) continue;
      const y = c[i + HORIZON] > c[i] ? 1 : 0;
      all.X.push(X[i]);
      all.Y.push(y);
      if (stock.dates[i + HORIZON] < cutoff) {
        train.X.push(X[i]);
        train.Y.push(y);
      } else if (stock.dates[i] >= cutoff) {
        holdout.push({ x: X[i], y });
        // Volatility validation AT THE HORIZON WE DISPLAY: past 20d daily vol
        // vs realized daily vol over the next HORIZON days (the same quantity,
        // scaled by sqrt(HORIZON), that drives the shown expected range).
        if (vol20d[i] != null && i + HORIZON + 1 < n) {
          const fut = volSeries(c.slice(i, i + HORIZON + 1), HORIZON)[HORIZON];
          if (fut != null) holdoutVol.push({ past: vol20d[i], future: fut });
        }
      }
    }
    perStock.push({ stock, X, vol20d, lastValid });
  }
  return { train, holdout, holdoutVol, all, perStock };
}

function evaluate(model, holdout, holdoutVol) {
  let n = 0;
  let hit = 0;
  let brier = 0;
  let up = 0;
  for (const e of holdout) {
    const p = model.predict(e.x);
    n++;
    if ((p > 0.5) === (e.y === 1)) hit++;
    brier += (p - e.y) ** 2;
    up += e.y;
  }
  // volatility forecast R^2 (linear fit past->future)
  let volR2 = null;
  let volCorr = null;
  if (holdoutVol.length > 30) {
    const xs = holdoutVol.map((d) => d.past);
    const ys = holdoutVol.map((d) => d.future);
    const mx = xs.reduce((a, b) => a + b, 0) / xs.length;
    const my = ys.reduce((a, b) => a + b, 0) / ys.length;
    let cov = 0, sx = 0, sy = 0;
    for (let i = 0; i < xs.length; i++) {
      cov += (xs[i] - mx) * (ys[i] - my);
      sx += (xs[i] - mx) ** 2;
      sy += (ys[i] - my) ** 2;
    }
    volCorr = cov / Math.sqrt(sx * sy);
    const beta = cov / sx;
    const alpha = my - beta * mx;
    let ssRes = 0;
    for (let i = 0; i < xs.length; i++) ssRes += (ys[i] - (alpha + beta * xs[i])) ** 2;
    volR2 = 1 - ssRes / sy;
  }
  return {
    holdoutSamples: n,
    dirAccuracy: n ? +((hit / n) * 100).toFixed(1) : null,
    baseRate: n ? +((up / n) * 100).toFixed(1) : null,
    brier: n ? +(brier / n).toFixed(4) : null,
    volCorr: volCorr != null ? +volCorr.toFixed(2) : null,
    volR2: volR2 != null ? +volR2.toFixed(2) : null,
  };
}

// ---------- Live per-stock read ----------

function analyzeStock(entry, liveModel, baseRate, riskBands, market) {
  const { stock, X, vol20d, lastValid } = entry;
  if (lastValid < 0) return null;
  const c = stock.closes;
  const i = lastValid;

  const probUp = liveModel.predict(X[i]);
  const edgePts = +((probUp - baseRate / 100) * 100).toFixed(1);

  // Expected +/- range over the horizon from recent daily-return volatility
  const dailyVol = vol20d[i];
  const horizonSigma = dailyVol * Math.sqrt(HORIZON);
  const expectedRangePct = +(horizonSigma * 100).toFixed(1);

  // Cross-sectional risk tier
  const riskTier =
    horizonSigma <= riskBands.low ? "Low" : horizonSigma >= riskBands.high ? "High" : "Medium";

  // Risk-adjusted directional conviction
  const conviction = horizonSigma > 0 ? (probUp - baseRate / 100) / horizonSigma : 0;

  const verdict =
    probUp >= LEAN_BUY_PROB ? "BUY" : probUp <= LEAN_SELL_PROB ? "SELL" : "HOLD";
  const side = probUp >= 0.5 ? "buy" : "sell";

  // Explanation: standardized feature contributions to the log-odds
  const xn = liveModel.std.norm(X[i]);
  const contrib = liveModel.w.map((wj, j) => ({
    j,
    c: wj * xn[j],
  }));
  const signals = contrib
    .filter((x) => (side === "buy" ? x.c > 0 : x.c < 0))
    .sort((a, b) => Math.abs(b.c) - Math.abs(a.c))
    .slice(0, 4)
    .map((x) => ({
      side,
      text: FEATURES[x.j].label,
      strength: +Math.abs(x.c).toFixed(2),
    }));

  const rsi14 = rsiSeries(c, 14);
  const m5 = pctSeries(c, 5);
  const m20 = pctSeries(c, 20);

  return {
    symbol: stock.symbol,
    name: stock.name,
    shariah: SHARIAH_COMPLIANT.has(stock.symbol),
    price: +c[i].toFixed(2),
    chg1d: i >= 1 ? +(((c[i] - c[i - 1]) / c[i - 1]) * 100).toFixed(2) : null,
    chg5d: m5[i] != null ? +m5[i].toFixed(2) : null,
    chg20d: m20[i] != null ? +m20[i].toFixed(2) : null,
    rsi: rsi14[i] != null ? +rsi14[i].toFixed(1) : null,
    probUp: +(probUp * 100).toFixed(1),
    edgePts,
    expectedRangePct,
    riskTier,
    conviction: +conviction.toFixed(3),
    verdict,
    signals,
    spark: c.slice(-30).map((x) => +x.toFixed(2)),
  };
}

// ---------- Screen ----------

function buildSummary(stocks) {
  const buys = stocks.filter((s) => s.verdict === "BUY").length;
  const sells = stocks.filter((s) => s.verdict === "SELL").length;
  const avgRange = stocks.length
    ? +(stocks.reduce((a, s) => a + s.expectedRangePct, 0) / stocks.length).toFixed(1)
    : null;
  const avgWeekMove = stocks.length
    ? +(stocks.reduce((a, s) => a + (s.chg5d || 0), 0) / stocks.length).toFixed(1)
    : 0;
  return {
    leanBuys: buys,
    leanSells: sells,
    neutrals: stocks.length - buys - sells,
    avgExpectedRange: avgRange,
    avgWeekMove,
  };
}

async function runScreen() {
  const symbols = ["SPY", ...WATCHLIST];
  const raw = await mapWithConcurrency(symbols, 6, fetchHistory);
  const bySym = {};
  const failed = [];
  for (const r of raw) {
    if (r.error) failed.push(r.symbol);
    else bySym[r.symbol] = r;
  }
  if (!bySym.SPY) throw new Error("could not load market index (SPY)");

  const market = prepMarket(bySym.SPY);
  const stocks = WATCHLIST.map((s) => bySym[s]).filter(Boolean);

  const ds = buildDataset(stocks, market);

  // 1) train on the past only -> honest out-of-sample reliability metrics
  const evalModel = trainLogistic(ds.train.X, ds.train.Y);
  const metrics = evaluate(evalModel, ds.holdout, ds.holdoutVol);

  // 2) train on all history -> live predictions
  const liveModel = trainLogistic(ds.all.X, ds.all.Y);
  const baseRate = metrics.baseRate != null ? metrics.baseRate : 52;

  // Cross-sectional risk bands from today's horizon volatility (terciles)
  const sigmas = ds.perStock
    .filter((e) => e.lastValid >= 0 && e.vol20d[e.lastValid] != null)
    .map((e) => e.vol20d[e.lastValid] * Math.sqrt(HORIZON))
    .sort((a, b) => a - b);
  const q = (arr, p) => (arr.length ? arr[Math.floor(p * (arr.length - 1))] : 0);
  const riskBands = { low: q(sigmas, 1 / 3), high: q(sigmas, 2 / 3) };

  const analyzed = [];
  for (const entry of ds.perStock) {
    const a = analyzeStock(entry, liveModel, baseRate, riskBands, market);
    if (a) analyzed.push(a);
  }
  // Rank by risk-adjusted conviction magnitude (strongest signal, either side)
  analyzed.sort((a, b) => Math.abs(b.conviction) - Math.abs(a.conviction));

  const k = market.closes.length - 1;
  const spyAbove200 = market.sma200[k] != null && market.closes[k] > market.sma200[k];

  return {
    generatedAt: new Date().toISOString(),
    scanned: analyzed.length,
    failed,
    horizonDays: HORIZON,
    horizonLabel: "~1 month (21 trading days)",
    model: {
      ...metrics,
      // honest read: is directional accuracy above the drift base rate?
      beatsBaseline:
        metrics.dirAccuracy != null && metrics.baseRate != null
          ? +(metrics.dirAccuracy - metrics.baseRate).toFixed(1)
          : null,
    },
    market: {
      regime: spyAbove200 ? "risk-on" : "risk-off",
      spyAbove200,
      spyChg20d: market.mom20[k] != null ? +market.mom20[k].toFixed(1) : null,
    },
    summary: buildSummary(analyzed),
    stocks: analyzed,
  };
}

async function getScreen() {
  if (cache.payload && Date.now() - cache.at < CACHE_TTL_MS) return cache.payload;
  if (!inflight) {
    inflight = runScreen()
      .then((payload) => {
        cache = { at: Date.now(), payload };
        return payload;
      })
      .finally(() => {
        inflight = null;
      });
  }
  return inflight;
}

// ---------- HTTP server ----------

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".webmanifest": "application/manifest+json",
};

const STATIC_DIR = path.join(__dirname, "dist");

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);

  if (url.pathname === "/api/screen") {
    try {
      const payload = await getScreen();
      res.writeHead(200, {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*",
      });
      res.end(JSON.stringify(payload));
    } catch (e) {
      res.writeHead(502, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: e.message }));
    }
    return;
  }

  let filePath = url.pathname === "/" ? "/index.html" : url.pathname;
  filePath = path.normalize(filePath).replace(/^(\.\.[\/\\])+/, "");
  const full = path.join(STATIC_DIR, filePath);
  if (!full.startsWith(STATIC_DIR)) {
    res.writeHead(403);
    res.end("Forbidden");
    return;
  }
  fs.readFile(full, (err, data) => {
    if (err) {
      fs.readFile(path.join(STATIC_DIR, "index.html"), (err2, html) => {
        if (err2) {
          res.writeHead(404, { "Content-Type": "text/plain" });
          res.end("Not found — run `npm run build` first");
          return;
        }
        res.writeHead(200, { "Content-Type": MIME[".html"] });
        res.end(html);
      });
      return;
    }
    res.writeHead(200, {
      "Content-Type": MIME[path.extname(full)] || "application/octet-stream",
    });
    res.end(data);
  });
});

if (require.main === module) {
  server.listen(PORT, () => {
    console.log(`US Stock Weekly Picks running at http://localhost:${PORT}`);
  });
}

module.exports = { runScreen, fetchHistory, WATCHLIST };
