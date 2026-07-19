/**
 * US Stock Weekly Picks — zero-dependency Node server.
 *
 * Serves the React app from ./dist and exposes:
 *   GET /api/screen  -> scans the watchlist, returns buy/sell candidates
 *                       ranked by validated decision quality
 *
 * Decision engine: an ensemble of 12 technical sub-signals is evaluated
 * walk-forward over ~5 years of history. For every stock, each sub-signal's
 * hit rate ON THAT STOCK is tracked as history replays, and votes are
 * weighted by that learned edge — so by "today", the model has learned
 * which signals actually work for each symbol, with no lookahead bias.
 * The composite verdict is backtested the same way and reported with a
 * 95% confidence interval and average edge per trade.
 *
 * Data source: Yahoo Finance public chart API (no key required).
 * Results are cached in memory for 5 minutes.
 */

const http = require("http");
const https = require("https");
const fs = require("fs");
const path = require("path");

const PORT = process.env.PORT || 3000;
const CACHE_TTL_MS = 5 * 60 * 1000;

// Decision-engine tuning
const HORIZON = 5; // trading days ahead a call is judged against (1 week)
const WARMUP = 60; // bars before the first evaluation
const SAMPLE_STEP = 5; // backtest verdicts on non-overlapping weekly steps
const SCORE_THRESHOLD = 0.28; // |composite| needed for a BUY/SELL verdict
const MIN_ACTIVE_VOTERS = 4; // how many sub-signals must be firing
const MIN_WEIGHT_MASS = 0.12; // total learned edge required (filters "all-unproven" setups)
// Decision gate: a live BUY/SELL is only surfaced when the stock's own
// backtest shows the composite actually worked on it — otherwise HOLD.
const DECISION_MIN_RATE = 52; // historical hit rate (%)
const DECISION_MIN_EDGE = 0; // average % return per trade must be positive

// Liquid large/mega-cap US stocks across sectors.
const WATCHLIST = [
  // Tech
  "AAPL", "MSFT", "NVDA", "GOOGL", "AMZN", "META", "TSLA", "AVGO", "AMD", "CRM",
  "ORCL", "ADBE", "NFLX", "INTC", "QCOM", "PLTR", "UBER", "SHOP",
  // Financials
  "JPM", "BAC", "GS", "MS", "V", "MA", "AXP", "BRK-B",
  // Healthcare
  "UNH", "JNJ", "LLY", "PFE", "MRK", "ABBV",
  // Consumer
  "WMT", "COST", "HD", "MCD", "NKE", "SBUX", "KO", "PEP", "DIS",
  // Industrial / Energy / Other
  "CAT", "BA", "GE", "XOM", "CVX", "LIN", "T",
];

/**
 * Approximate Shariah-compliance classification per ticker, following common
 * Islamic index screenings (business-activity + financial-ratio screens, in
 * the style of Dow Jones Islamic Market / S&P Shariah / Zoya). Excluded here:
 * conventional banks & insurers (JPM, BAC, GS, MS, AXP, BRK-B, UNH),
 * entertainment content (NFLX, DIS), pork/alcohol revenue (MCD, WMT, COST),
 * and high-debt or defense-heavy names (AVGO, ORCL, BA, GE, T).
 * This is informational, NOT a fatwa — verify with a screening service.
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
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, worker)
  );
  return results;
}

// ---------- Indicator series (computed once per stock, O(n)) ----------

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
  const k = 2 / 10; // signal EMA(9)
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

function rollingMax(v, p) {
  // O(n) sliding-window max via monotonic deque
  const out = new Array(v.length).fill(null);
  const dq = [];
  for (let i = 0; i < v.length; i++) {
    while (dq.length && v[dq[dq.length - 1]] <= v[i]) dq.pop();
    dq.push(i);
    if (dq[0] <= i - p) dq.shift();
    if (i >= p - 1) out[i] = v[dq[0]];
  }
  return out;
}

function rollingMin(v, p) {
  const out = new Array(v.length).fill(null);
  const dq = [];
  for (let i = 0; i < v.length; i++) {
    while (dq.length && v[dq[dq.length - 1]] >= v[i]) dq.pop();
    dq.push(i);
    if (dq[0] <= i - p) dq.shift();
    if (i >= p - 1) out[i] = v[dq[0]];
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
    chg20: pctSeries(spy.closes, 20),
  };
}

// ---------- Ensemble of sub-signals ----------

/**
 * Each voter looks at one aspect of the tape and votes +1 (up next week),
 * -1 (down next week), or 0 (no opinion) at a given bar index.
 */
function buildVoters(stock, market) {
  const c = stock.closes;
  const sma20 = smaSeries(c, 20);
  const sma50 = smaSeries(c, 50);
  const rsi14 = rsiSeries(c, 14);
  const rsi2 = rsiSeries(c, 2);
  const macd = macdHistSeries(c);
  const std20 = stdSeries(c, 20);
  const chg5 = pctSeries(c, 5);
  const chg20 = pctSeries(c, 20);
  const hi20 = rollingMax(c, 20);
  const lo20 = rollingMin(c, 20);
  const vol5 = smaSeries(stock.volumes, 5);
  const vol20 = smaSeries(stock.volumes, 20);

  const spyAt = (i) => {
    if (!market) return null;
    const k = market.idxByDate.get(stock.dates[i]);
    return k == null ? null : k;
  };

  const voters = [
    {
      key: "trend",
      label: "Trend structure (price vs 20d/50d averages)",
      dir(i) {
        if (sma20[i] == null || sma50[i] == null) return 0;
        if (c[i] > sma20[i] && sma20[i] > sma50[i]) return 1;
        if (c[i] < sma20[i] && sma20[i] < sma50[i]) return -1;
        return 0;
      },
    },
    {
      key: "mom20",
      label: "1-month momentum",
      dir(i) {
        if (chg20[i] == null) return 0;
        return chg20[i] > 4 ? 1 : chg20[i] < -4 ? -1 : 0;
      },
    },
    {
      key: "mom5",
      label: "1-week momentum",
      dir(i) {
        if (chg5[i] == null) return 0;
        return chg5[i] > 2.5 ? 1 : chg5[i] < -2.5 ? -1 : 0;
      },
    },
    {
      key: "rsiZone",
      label: "RSI strength zone",
      dir(i) {
        const r = rsi14[i];
        if (r == null) return 0;
        if (r >= 50 && r <= 68) return 1;
        if (r >= 32 && r <= 45) return -1;
        return 0;
      },
    },
    {
      key: "rsiExtreme",
      label: "RSI extreme (overbought/oversold)",
      dir(i) {
        const r = rsi14[i];
        if (r == null) return 0;
        return r > 72 ? -1 : r < 28 ? 1 : 0;
      },
    },
    {
      key: "rsi2",
      label: "Short-term dip/spike reversion (RSI-2)",
      dir(i) {
        const r = rsi2[i];
        if (r == null) return 0;
        return r < 10 ? 1 : r > 90 ? -1 : 0;
      },
    },
    {
      key: "macd",
      label: "MACD trend confirmation",
      dir(i) {
        const h = macd[i];
        if (h == null) return 0;
        return h > 0 ? 1 : h < 0 ? -1 : 0;
      },
    },
    {
      key: "boll",
      label: "Bollinger-band reversion",
      dir(i) {
        if (sma20[i] == null || std20[i] == null || std20[i] === 0) return 0;
        const pb = (c[i] - (sma20[i] - 2 * std20[i])) / (4 * std20[i]);
        return pb < 0.05 ? 1 : pb > 0.95 ? -1 : 0;
      },
    },
    {
      key: "relStrength",
      label: "Relative strength vs S&P 500",
      dir(i) {
        const k = spyAt(i);
        if (k == null || chg20[i] == null || market.chg20[k] == null) return 0;
        const rel = chg20[i] - market.chg20[k];
        return rel > 3 ? 1 : rel < -3 ? -1 : 0;
      },
    },
    {
      key: "regime",
      label: "Overall market regime (S&P 500 vs 200d average)",
      dir(i) {
        const k = spyAt(i);
        if (k == null || market.sma200[k] == null) return 0;
        return market.closes[k] > market.sma200[k] ? 1 : -1;
      },
    },
    {
      key: "volume",
      label: "Volume confirmation",
      dir(i) {
        if (vol5[i] == null || vol20[i] == null || vol20[i] === 0) return 0;
        if (vol5[i] / vol20[i] <= 1.3 || chg5[i] == null) return 0;
        return chg5[i] > 0 ? 1 : chg5[i] < 0 ? -1 : 0;
      },
    },
    {
      key: "breakout",
      label: "20-day breakout / breakdown",
      dir(i) {
        if (hi20[i] == null) return 0;
        if (c[i] >= hi20[i] * 0.999) return 1;
        if (c[i] <= lo20[i] * 1.001) return -1;
        return 0;
      },
    },
  ];

  return {
    voters,
    series: { sma20, sma50, rsi14, chg5, chg20, vol5, vol20 },
  };
}

/**
 * Combine the active votes at one bar, weighting each voter by the edge it
 * has PROVEN on this stock so far (Laplace-smoothed hit rate above 50%).
 * Unproven or losing voters contribute only a tiny base weight, so early on
 * this behaves like majority voting and sharpens as evidence accumulates.
 */
function composite(dirs, stats) {
  let num = 0;
  let mass = 0; // learned-edge mass only (excludes base weight)
  let den = 0;
  let active = 0;
  for (let v = 0; v < dirs.length; v++) {
    const d = dirs[v];
    if (!d) continue;
    active++;
    const s = stats[v];
    const hr = (s.hit + 3) / (s.n + 6); // smoothed toward 0.5
    const edge = Math.max(0, hr - 0.5);
    const w = edge + 0.02;
    num += d * w;
    den += w;
    mass += edge;
  }
  return { score: den ? num / den : 0, active, mass };
}

function verdictFrom(score, active, mass) {
  if (active < MIN_ACTIVE_VOTERS || mass < MIN_WEIGHT_MASS) return 0;
  if (score >= SCORE_THRESHOLD) return 1;
  if (score <= -SCORE_THRESHOLD) return -1;
  return 0;
}

function wilson95(k, n) {
  if (!n) return null;
  const z = 1.96;
  const p = k / n;
  const d = 1 + (z * z) / n;
  const center = (p + (z * z) / (2 * n)) / d;
  const hw = (z * Math.sqrt((p * (1 - p)) / n + (z * z) / (4 * n * n))) / d;
  return { lo: Math.max(0, center - hw), hi: Math.min(1, center + hw) };
}

// ---------- Walk-forward analysis of one stock ----------

function analyze(stock, market) {
  const c = stock.closes;
  const n = c.length;
  if (n < WARMUP + HORIZON + 10) return null;

  const { voters, series } = buildVoters(stock, market);
  const stats = voters.map(() => ({ hit: 0, n: 0 }));
  const pending = []; // FIFO of {v, dir, idx} awaiting their outcome
  let btTotal = 0;
  let btCorrect = 0;
  const btRets = [];

  for (let i = WARMUP; i < n; i++) {
    // 1) resolve votes whose outcome window has closed (no lookahead)
    while (pending.length && pending[0].idx + HORIZON <= i) {
      const p = pending.shift();
      const fwd = c[p.idx + HORIZON] / c[p.idx] - 1;
      stats[p.v].n++;
      if ((fwd > 0 && p.dir === 1) || (fwd < 0 && p.dir === -1)) stats[p.v].hit++;
    }

    const dirs = voters.map((v) => v.dir(i));

    // 2) backtest the composite verdict on weekly steps
    if ((i - WARMUP) % SAMPLE_STEP === 0 && i + HORIZON < n) {
      const { score, active, mass } = composite(dirs, stats);
      const v = verdictFrom(score, active, mass);
      if (v !== 0) {
        const fwd = c[i + HORIZON] / c[i] - 1;
        btTotal++;
        if ((fwd > 0 && v === 1) || (fwd < 0 && v === -1)) btCorrect++;
        btRets.push(v * fwd);
      }
    }

    // 3) queue today's individual votes for later stat updates
    if (i + HORIZON < n) {
      for (let v = 0; v < dirs.length; v++) {
        if (dirs[v] !== 0) pending.push({ v, dir: dirs[v], idx: i });
      }
    }
  }

  // Live verdict at the last bar, using everything learned so far
  const last = n - 1;
  const dirs = voters.map((v) => v.dir(last));
  const { score, active, mass } = composite(dirs, stats);
  const liveVerdict = verdictFrom(score, active, mass);
  let verdict = liveVerdict === 1 ? "BUY" : liveVerdict === -1 ? "SELL" : "HOLD";

  // Explain: active voters agreeing with the composite, strongest edge first
  const side = score >= 0 ? "buy" : "sell";
  const signals = voters
    .map((v, vi) => ({ v, vi, d: dirs[vi] }))
    .filter((x) => x.d !== 0 && x.d === Math.sign(score || 1))
    .map((x) => {
      const s = stats[x.vi];
      const hr = s.n ? Math.round((s.hit / s.n) * 100) : null;
      return {
        side,
        weight: Math.max(0, (s.hit + 3) / (s.n + 6) - 0.5),
        text:
          hr != null && s.n >= 10
            ? `${x.v.label} — right ${hr}% of ${s.n} past calls on this stock`
            : `${x.v.label} (limited history on this stock)`,
      };
    })
    .sort((a, b) => b.weight - a.weight)
    .slice(0, 4)
    .map(({ side: sd, text }) => ({ side: sd, text }));

  // Backtest metrics
  const predictionRate =
    btTotal >= 5 ? Math.round((btCorrect / btTotal) * 100) : null;
  const ci = btTotal >= 5 ? wilson95(btCorrect, btTotal) : null;
  const expectancy = btRets.length
    ? +((btRets.reduce((a, r) => a + r, 0) / btRets.length) * 100).toFixed(2)
    : null;

  // Decision gate: don't surface a live call this method hasn't earned
  // on this particular stock.
  const qualified =
    predictionRate != null &&
    predictionRate >= DECISION_MIN_RATE &&
    expectancy != null &&
    expectancy > DECISION_MIN_EDGE;
  if (verdict !== "HOLD" && !qualified) verdict = "HOLD";

  // Decision rank: validated edge first, tempered by sample size,
  // plus current signal strength.
  const sampleFactor = Math.min(1, btTotal / 30);
  const rank =
    ((predictionRate != null ? predictionRate - 50 : 0) * 1.5 +
      (expectancy != null ? expectancy * 8 : 0)) *
      sampleFactor +
    Math.abs(score) * 20;

  const rsiLast = series.rsi14[last];
  const volRatio =
    series.vol20[last] ? series.vol5[last] / series.vol20[last] : 1;

  return {
    symbol: stock.symbol,
    name: stock.name,
    shariah: SHARIAH_COMPLIANT.has(stock.symbol),
    price: +c[last].toFixed(2),
    chg1d: n > 1 ? +(((c[last] - c[last - 1]) / c[last - 1]) * 100).toFixed(2) : null,
    chg5d: series.chg5[last] != null ? +series.chg5[last].toFixed(2) : null,
    chg20d: series.chg20[last] != null ? +series.chg20[last].toFixed(2) : null,
    rsi: rsiLast != null ? +rsiLast.toFixed(1) : null,
    volRatio: +volRatio.toFixed(2),
    buyScore: score > 0 ? Math.round(score * 100) : 0,
    sellScore: score < 0 ? Math.round(-score * 100) : 0,
    verdict,
    signals,
    predictionRate,
    ciLow: ci ? Math.round(ci.lo * 100) : null,
    ciHigh: ci ? Math.round(ci.hi * 100) : null,
    expectancy,
    backtestSamples: btTotal,
    rank: +rank.toFixed(1),
    spark: c.slice(-30).map((x) => +x.toFixed(2)),
  };
}

// ---------- Screen ----------

function buildSummary(stocks) {
  const picks = stocks.filter((s) => s.verdict !== "HOLD");
  const buys = stocks.filter((s) => s.verdict === "BUY").length;
  return {
    buys,
    sells: picks.length - buys,
    holds: stocks.length - picks.length,
    // averages describe the actionable picks (all of which passed the gate)
    avgPredictionRate: picks.length
      ? Math.round(picks.reduce((a, s) => a + s.predictionRate, 0) / picks.length)
      : null,
    avgEdge: picks.length
      ? +(picks.reduce((a, s) => a + s.expectancy, 0) / picks.length).toFixed(2)
      : null,
  };
}

async function runScreen() {
  let market = null;
  let spyLast = null;
  try {
    const spy = await fetchHistory("SPY");
    market = prepMarket(spy);
    const k = spy.closes.length - 1;
    spyLast = {
      above200: market.sma200[k] != null && spy.closes[k] > market.sma200[k],
      chg20d: market.chg20[k] != null ? +market.chg20[k].toFixed(1) : null,
    };
  } catch (e) {
    // proceed without market context; regime/rel-strength voters go silent
  }

  const raw = await mapWithConcurrency(WATCHLIST, 6, fetchHistory);
  const analyzed = [];
  const failed = [];
  for (const r of raw) {
    if (r.error) {
      failed.push(r.symbol);
      continue;
    }
    const a = analyze(r, market);
    if (a) analyzed.push(a);
  }
  analyzed.sort((a, b) => b.rank - a.rank);
  return {
    generatedAt: new Date().toISOString(),
    scanned: analyzed.length,
    failed,
    market: spyLast
      ? {
          regime: spyLast.above200 ? "risk-on" : "risk-off",
          spyAbove200: spyLast.above200,
          spyChg20d: spyLast.chg20d,
        }
      : null,
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

  // Static files (React build)
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
      // SPA fallback
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

module.exports = { runScreen };
