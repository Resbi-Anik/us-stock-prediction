/**
 * US Stock Weekly Picks — zero-dependency Node server.
 *
 * Serves the React app from ./dist and exposes:
 *   GET /api/screen  -> scans the watchlist and returns, per stock, a
 *                       calibrated directional probability, a reliable
 *                       expected-range / risk forecast, and a risk-adjusted
 *                       conviction rank.
 *
 * DECISION ENGINE (v4) — built from an honest out-of-sample study:
 *
 *   Predicting the *absolute direction* of a single large-cap ~1 month out is
 *   near-random from technicals (pooled model ~53% vs ~53% market-drift base
 *   rate on a held-out year; Brier ~0.25). Selecting stocks on in-sample hit
 *   rate is actively HARMFUL (holdout 42%, persistence corr -0.28). So this
 *   engine does NOT chase absolute direction.
 *
 *   What DOES work, robustly and out-of-sample, is CROSS-SECTIONAL RANKING:
 *   a pooled model trained to predict whether a stock will BEAT its peers over
 *   the horizon produces monotonic quintiles on held-out years — worst-ranked
 *   fifth returned ~+0.5-0.9%/mo, best-ranked ~+3-4.3%/mo, a long-short spread
 *   of +2.5% (last year) and +3.4% (year before), positive in both folds.
 *   Relative-strength ranking is exactly the "which stock to buy" question.
 *
 *   Also reliably predictable: VOLATILITY (past vs next-horizon realized vol,
 *   corr ~0.61 / R^2 ~0.37 out-of-sample), used for a trustworthy expected
 *   range and risk tier.
 *
 *   - Strength score: pooled logistic regression over 14 continuous features,
 *     trained on the RELATIVE target (beat the cross-sectional mean return).
 *     Stocks are ranked by this score; top/bottom quintiles are the leans.
 *   - Reliability: each refresh re-runs a train/holdout split and reports the
 *     true out-of-sample quintile spread, ranking accuracy, absolute-direction
 *     accuracy (for honesty), Brier, and volatility R^2.
 *   - Volatility: expected +/- range (one sigma) + Low/Medium/High risk tier.
 *
 * FRESH-INFO TILT (v5): the price model only sees history. A second, LIVE
 * layer (sources.js) pulls current analyst consensus / price-target upside /
 * rating revisions and a news-headline sentiment read per stock, turns them
 * into a cross-sectional percentile, and tilts the final ranking by a modest
 * BLEND_EXTERNAL weight. This layer cannot be backtested from free endpoints,
 * so it is (a) weighted conservatively, (b) labeled in the UI as live info
 * rather than validated edge, and (c) scored forward by the live track record
 * (which snapshots the blended ranking from the day it ships).
 *
 * Data source: Yahoo Finance public chart API (no key required).
 * Results cached in memory for 5 minutes.
 */

const http = require("http");
const https = require("https");
const fs = require("fs");
const path = require("path");
const { WATCHLIST, SECTOR_BY_SYMBOL, SHARIAH_BY_SYMBOL } = require("./universe.js");
const track = require("./track.js");
const sources = require("./sources.js");

const PORT = process.env.PORT || 3000;
const CACHE_TTL_MS = 5 * 60 * 1000;

// Engine tuning
const HORIZON = 21; // trading days a call is judged against (~1 month)
const HOLDOUT_BARS = 252; // final ~12 months held out to measure honest accuracy
const WARMUP = 125; // bars before a stock has all features (needs 120d momentum)
const TIER_QUANTILE = 0.2; // top/bottom fifth by strength score become leans
const BLEND_EXTERNAL = 0.25; // weight of the live analyst/news tilt in the final rank
const GD_ITERS = 350;
const GD_LR = 0.1;
const GD_L2 = 1e-3;

// Human-readable feature labels (must match FEATURE order below)
const FEATURES = [
  { key: "mom5", label: "1-week momentum" },
  { key: "mom20", label: "1-month momentum" },
  { key: "mom60", label: "3-month momentum" },
  { key: "mom120", label: "6-month momentum" },
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

// Universe (~120 liquid US large-caps across all 11 GICS sectors, each tagged
// with sector for sector-neutral ranking and an approximate Shariah flag) is
// defined in universe.js and imported above as WATCHLIST / SECTOR_BY_SYMBOL /
// SHARIAH_BY_SYMBOL.

// Minimum peers in a sector on a given day before the ranking target is
// demeaned within that sector (else it falls back to the whole-market mean).
const MIN_SECTOR_PEERS = 3;

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
  const m120 = pctSeries(c, 120);
  const v5 = smaSeries(stock.volumes, 5);
  const v20 = smaSeries(stock.volumes, 20);
  const vol20d = volSeries(c, 20);

  const X = new Array(c.length).fill(null);
  for (let i = 0; i < c.length; i++) {
    const k = market ? market.idxByDate.get(stock.dates[i]) : null;
    if (
      s50[i] == null || m120[i] == null || r14[i] == null || mh[i] == null ||
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
      m120[i],
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
//
// Primary target is CROSS-SECTIONAL: label 1 if the stock's forward return
// beats the average forward return of all stocks that same day (i.e. it is a
// relative-strength winner). A secondary absolute label (up/down) is kept only
// to report — honestly — that absolute direction is ~a coin flip.

function buildDataset(stocks, market) {
  const cutoff = market.dates[market.dates.length - HOLDOUT_BARS];

  // group forward observations by calendar date to compute the peer mean
  const byDate = new Map(); // date -> [{si, i, x, fwd}]
  const perStock = [];

  stocks.forEach((stock, si) => {
    const { X, vol20d } = featureMatrix(stock, market);
    const c = stock.closes;
    const n = c.length;
    const sector = SECTOR_BY_SYMBOL[stock.symbol] || "Other";
    let lastValid = -1;
    for (let i = WARMUP; i < n; i++) {
      if (X[i]) lastValid = i;
      if (!X[i] || i + HORIZON >= n) continue;
      const fwd = c[i + HORIZON] / c[i] - 1;
      const d = stock.dates[i];
      if (!byDate.has(d)) byDate.set(d, []);
      byDate.get(d).push({ si, i, x: X[i], fwd, sector });
    }
    perStock.push({ stock, X, vol20d, lastValid, sector });
  });

  const trainRel = { X: [], Y: [] };
  const trainAbs = { X: [], Y: [] };
  const allRel = { X: [], Y: [] };
  const holdout = []; // {x, relY, absY, fwd, date}
  const holdoutVol = [];

  for (const [date, arr] of byDate) {
    if (arr.length < 5) continue;
    const mean = arr.reduce((s, e) => s + e.fwd, 0) / arr.length;
    // per-sector mean forward return for sector-neutral labelling
    const secSum = {};
    const secCnt = {};
    for (const e of arr) {
      secSum[e.sector] = (secSum[e.sector] || 0) + e.fwd;
      secCnt[e.sector] = (secCnt[e.sector] || 0) + 1;
    }
    for (const e of arr) {
      // Sector-neutral target: beat your sector's peers (fall back to the
      // whole-market mean when the sector has too few names that day).
      const secMean =
        secCnt[e.sector] >= MIN_SECTOR_PEERS ? secSum[e.sector] / secCnt[e.sector] : mean;
      const relY = e.fwd > secMean ? 1 : 0;
      const absY = e.fwd > 0 ? 1 : 0;
      allRel.X.push(e.x);
      allRel.Y.push(relY);
      if (date < cutoff) {
        trainRel.X.push(e.x);
        trainRel.Y.push(relY);
        trainAbs.X.push(e.x);
        trainAbs.Y.push(absY);
      } else {
        holdout.push({ x: e.x, relY, absY, fwd: e.fwd, date });
        const entry = perStock[e.si];
        const c = entry.stock.closes;
        if (entry.vol20d[e.i] != null && e.i + HORIZON + 1 < c.length) {
          const fut = volSeries(c.slice(e.i, e.i + HORIZON + 1), HORIZON)[HORIZON];
          if (fut != null) holdoutVol.push({ past: entry.vol20d[e.i], future: fut });
        }
      }
    }
  }
  return { trainRel, trainAbs, allRel, holdout, holdoutVol, perStock };
}

function linR2(pairs) {
  if (pairs.length < 30) return { r2: null, corr: null };
  const xs = pairs.map((d) => d.past);
  const ys = pairs.map((d) => d.future);
  const mx = xs.reduce((a, b) => a + b, 0) / xs.length;
  const my = ys.reduce((a, b) => a + b, 0) / ys.length;
  let cov = 0, sx = 0, sy = 0;
  for (let i = 0; i < xs.length; i++) {
    cov += (xs[i] - mx) * (ys[i] - my);
    sx += (xs[i] - mx) ** 2;
    sy += (ys[i] - my) ** 2;
  }
  const corr = cov / Math.sqrt(sx * sy);
  const beta = cov / sx;
  const alpha = my - beta * mx;
  let ssRes = 0;
  for (let i = 0; i < xs.length; i++) ssRes += (ys[i] - (alpha + beta * xs[i])) ** 2;
  return { r2: 1 - ssRes / sy, corr };
}

/**
 * Out-of-sample reliability:
 *  - ranking: sort each holdout day by the relative model's score, bucket into
 *    quintiles, measure each quintile's mean forward return and the Q5-Q1 spread
 *    (the honest validation of a ranking model), plus relative-direction accuracy.
 *  - direction (absolute): accuracy vs base rate + Brier, to show it is ~a coin flip.
 *  - volatility: forecast R^2 at the displayed horizon.
 */
function evaluate(relModel, absModel, holdout, holdoutVol) {
  // absolute direction
  let n = 0, hitAbs = 0, brier = 0, up = 0;
  for (const e of holdout) {
    const p = absModel.predict(e.x);
    n++;
    if ((p > 0.5) === (e.absY === 1)) hitAbs++;
    brier += (p - e.absY) ** 2;
    up += e.absY;
  }

  // ranking quintiles per day
  const byDate = new Map();
  for (const e of holdout) {
    if (!byDate.has(e.date)) byDate.set(e.date, []);
    byDate.get(e.date).push(e);
  }
  const q = [[], [], [], [], []];
  let relN = 0, relHit = 0;
  for (const [, arr] of byDate) {
    const scored = arr.map((e) => ({ ...e, sc: relModel.predict(e.x) }));
    if (scored.length < 10) continue;
    scored.sort((a, b) => a.sc - b.sc);
    const per = scored.length / 5;
    scored.forEach((e, idx) => {
      q[Math.min(4, Math.floor(idx / per))].push(e.fwd);
      relN++;
      if ((e.sc > 0.5) === (e.relY === 1)) relHit++;
    });
  }
  const mean = (a) => (a.length ? a.reduce((s, v) => s + v, 0) / a.length : 0);
  const qMeans = q.map((a) => +(mean(a) * 100).toFixed(2));
  const spread = +(qMeans[4] - qMeans[0]).toFixed(2);

  const vol = linR2(holdoutVol);
  return {
    holdoutSamples: n,
    rankSpread: spread,
    qMeans,
    rankAccuracy: relN ? +((relHit / relN) * 100).toFixed(1) : null,
    dirAccuracy: n ? +((hitAbs / n) * 100).toFixed(1) : null,
    baseRate: n ? +((up / n) * 100).toFixed(1) : null,
    brier: n ? +(brier / n).toFixed(4) : null,
    volCorr: vol.corr != null ? +vol.corr.toFixed(2) : null,
    volR2: vol.r2 != null ? +vol.r2.toFixed(2) : null,
  };
}

// ---------- Live per-stock read ----------

function analyzeStock(entry, relModel, riskBands) {
  const { stock, X, vol20d, lastValid } = entry;
  if (lastValid < 0) return null;
  const c = stock.closes;
  const i = lastValid;

  const score = relModel.predict(X[i]); // P(beat peers this horizon)

  const dailyVol = vol20d[i];
  const horizonSigma = dailyVol * Math.sqrt(HORIZON);
  const expectedRangePct = +(horizonSigma * 100).toFixed(1);
  const riskTier =
    horizonSigma <= riskBands.low ? "Low" : horizonSigma >= riskBands.high ? "High" : "Medium";

  // feature contributions (standardized weight x value) toward the score
  const xn = relModel.std.norm(X[i]);
  const contrib = relModel.w.map((wj, j) => ({ j, c: wj * xn[j] }));
  const side = score >= 0.5 ? "buy" : "sell";
  const signals = contrib
    .filter((x) => (side === "buy" ? x.c > 0 : x.c < 0))
    .sort((a, b) => Math.abs(b.c) - Math.abs(a.c))
    .slice(0, 4)
    .map((x) => ({ side, text: FEATURES[x.j].label }));

  const rsi14 = rsiSeries(c, 14);
  const m5 = pctSeries(c, 5);
  const m20 = pctSeries(c, 20);

  return {
    symbol: stock.symbol,
    name: stock.name,
    sector: entry.sector,
    shariah: !!SHARIAH_BY_SYMBOL[stock.symbol],
    price: +c[i].toFixed(2),
    chg1d: i >= 1 ? +(((c[i] - c[i - 1]) / c[i - 1]) * 100).toFixed(2) : null,
    chg5d: m5[i] != null ? +m5[i].toFixed(2) : null,
    chg20d: m20[i] != null ? +m20[i].toFixed(2) : null,
    rsi: rsi14[i] != null ? +rsi14[i].toFixed(1) : null,
    strengthScore: +(score * 100).toFixed(1), // 0-100, P(beat peers)
    expectedRangePct,
    riskTier,
    signals,
    spark: c.slice(-30).map((x) => +x.toFixed(2)),
    // rank / rankPct / verdict assigned after all stocks are scored
  };
}

// ---------- Fresh-info tilt (live analyst + news layer) ----------

/** Tie-aware percentile rank (0-100) for [{sym, v}] pairs. */
function pctileBySym(pairs) {
  const sorted = [...pairs].sort((a, b) => a.v - b.v);
  const out = new Map();
  const n = sorted.length;
  let i = 0;
  while (i < n) {
    let j = i;
    while (j + 1 < n && sorted[j + 1].v === sorted[i].v) j++;
    const pct = n > 1 ? (((i + j) / 2) / (n - 1)) * 100 : 50;
    for (let k = i; k <= j; k++) out.set(sorted[k].sym, pct);
    i = j + 1;
  }
  return out;
}

/**
 * Attach live analyst/news facts to each stock and compute externalScore:
 * a 0-100 cross-sectional percentile combining price-target upside, consensus
 * strength, one-month rating revisions, and news-headline sentiment. Stocks
 * with fewer than two available components get null (no tilt applied).
 */
function attachFreshInfo(analyzed, fresh) {
  const info = (fresh && fresh.bySymbol) || {};
  for (const s of analyzed) {
    const f = info[s.symbol];
    s.analyst = f?.analyst || null;
    s.news = f?.news || null;
    s.earningsDate = f?.earningsDate || null;
    s.earningsInDays = f?.earningsInDays ?? null;
    // insights fallback ships only a raw target price; compute upside here
    if (s.analyst && s.analyst.targetUpsidePct == null && s.analyst.targetMeanPrice != null && s.price > 0) {
      s.analyst.targetUpsidePct = +(((s.analyst.targetMeanPrice - s.price) / s.price) * 100).toFixed(1);
    }
  }
  const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
  const comps = [
    {
      w: 0.3, // mean price-target upside (winsorized: extreme targets are stale/noisy)
      map: pctileBySym(
        analyzed
          .filter((s) => s.analyst?.targetUpsidePct != null)
          .map((s) => ({ sym: s.symbol, v: clamp(s.analyst.targetUpsidePct, -50, 50) }))
      ),
    },
    {
      w: 0.25, // consensus strength (1 = strong buy … 5 = sell, so negate)
      map: pctileBySym(
        analyzed
          .filter((s) => s.analyst?.recMean != null)
          .map((s) => ({ sym: s.symbol, v: -s.analyst.recMean }))
      ),
    },
    {
      w: 0.25, // rating revisions: buy-share change vs one month ago
      map: pctileBySym(
        analyzed
          .filter((s) => s.analyst?.revisionDelta != null)
          .map((s) => ({ sym: s.symbol, v: s.analyst.revisionDelta }))
      ),
    },
    {
      w: 0.2, // news sentiment over the last week
      map: pctileBySym(
        analyzed
          .filter((s) => s.news?.sentiment != null)
          .map((s) => ({ sym: s.symbol, v: s.news.sentiment }))
      ),
    },
  ];
  for (const s of analyzed) {
    let acc = 0;
    let wsum = 0;
    let have = 0;
    for (const c of comps) {
      const v = c.map.get(s.symbol);
      if (v == null) continue;
      acc += c.w * v;
      wsum += c.w;
      have++;
    }
    s.externalScore = have >= 2 ? Math.round(acc / wsum) : null;
  }
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
    topRanked: buys,
    bottomRanked: sells,
    neutrals: stocks.length - buys - sells,
    avgExpectedRange: avgRange,
    avgWeekMove,
  };
}

async function runScreen() {
  const symbols = ["SPY", ...WATCHLIST];
  // Price history and the live analyst/news layer fetch concurrently; the
  // fresh layer never throws (degrades to an empty map on failure).
  const [raw, freshInfo] = await Promise.all([
    mapWithConcurrency(symbols, 6, fetchHistory),
    sources.getFreshInfo(WATCHLIST),
  ]);
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
  const relEval = trainLogistic(ds.trainRel.X, ds.trainRel.Y);
  const absEval = trainLogistic(ds.trainAbs.X, ds.trainAbs.Y);
  const metrics = evaluate(relEval, absEval, ds.holdout, ds.holdoutVol);

  // 2) train on all history (relative target) -> live ranking
  const relLive = trainLogistic(ds.allRel.X, ds.allRel.Y);

  // Cross-sectional risk bands from today's horizon volatility (terciles)
  const sigmas = ds.perStock
    .filter((e) => e.lastValid >= 0 && e.vol20d[e.lastValid] != null)
    .map((e) => e.vol20d[e.lastValid] * Math.sqrt(HORIZON))
    .sort((a, b) => a - b);
  const q = (arr, p) => (arr.length ? arr[Math.floor(p * (arr.length - 1))] : 0);
  const riskBands = { low: q(sigmas, 1 / 3), high: q(sigmas, 2 / 3) };

  let analyzed = [];
  for (const entry of ds.perStock) {
    const a = analyzeStock(entry, relLive, riskBands);
    if (a) analyzed.push(a);
  }
  // Live tilt: attach analyst/news facts and the external percentile.
  attachFreshInfo(analyzed, freshInfo);

  // Model percentile (from the validated relative-strength score) blended
  // with the live external percentile -> composite that drives the ranking.
  analyzed.sort((a, b) => b.strengthScore - a.strengthScore);
  const N = analyzed.length;
  analyzed.forEach((s, idx) => {
    s.modelPct = N > 1 ? Math.round(((N - 1 - idx) / (N - 1)) * 100) : 50;
    s.compositeScore =
      s.externalScore == null
        ? s.modelPct
        : +((1 - BLEND_EXTERNAL) * s.modelPct + BLEND_EXTERNAL * s.externalScore).toFixed(1);
  });

  // Rank by the composite; assign rank, percentile, and lean tiers.
  analyzed.sort((a, b) => b.compositeScore - a.compositeScore);
  const topCut = Math.max(1, Math.round(N * TIER_QUANTILE));
  analyzed.forEach((s, idx) => {
    s.rank = idx + 1;
    s.rankTotal = N;
    s.rankPct = N > 1 ? +(((N - 1 - idx) / (N - 1)) * 100).toFixed(0) : 50;
    s.verdict = idx < topCut ? "BUY" : idx >= N - topCut ? "SELL" : "HOLD";
  });

  const k = market.closes.length - 1;
  const spyAbove200 = market.sma200[k] != null && market.closes[k] > market.sma200[k];

  // Record today's ranking (idempotent per data-date) and read back the
  // forward-only, realized track record accrued so far.
  const asOf = market.dates[k];
  track.record(asOf, analyzed);
  const trackRecord = track.summary();

  return {
    generatedAt: new Date().toISOString(),
    asOf,
    scanned: N,
    universe: WATCHLIST.length,
    failed,
    horizonDays: HORIZON,
    horizonLabel: "~1 month (21 trading days)",
    model: metrics,
    freshInfo: {
      fetchedAt: freshInfo.fetchedAt,
      analystCoverage: freshInfo.analystCoverage,
      newsCoverage: freshInfo.newsCoverage,
      blendWeight: BLEND_EXTERNAL,
    },
    market: {
      regime: spyAbove200 ? "risk-on" : "risk-off",
      spyAbove200,
      spyChg20d: market.mom20[k] != null ? +market.mom20[k].toFixed(1) : null,
    },
    summary: buildSummary(analyzed),
    trackRecord,
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
