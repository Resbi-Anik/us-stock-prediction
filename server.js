/**
 * US Stock Weekly Picks — zero-dependency Node server.
 *
 * Serves the React app from ./dist and exposes:
 *   GET /api/screen  -> scans the watchlist, returns scored buy/sell candidates
 *                       with a backtested per-stock prediction rate
 *
 * Data source: Yahoo Finance public chart API (no key required).
 * Results are cached in memory for 15 minutes.
 */

const http = require("http");
const https = require("https");
const fs = require("fs");
const path = require("path");

const PORT = process.env.PORT || 3000;
const CACHE_TTL_MS = 15 * 60 * 1000;

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
  )}?range=2y&interval=1d`;
  const json = await fetchJson(url);
  const result = json?.chart?.result?.[0];
  if (!result) throw new Error(`no data for ${symbol}`);
  const quote = result.indicators.quote[0];
  const bars = [];
  for (let i = 0; i < result.timestamp.length; i++) {
    if (quote.close[i] == null) continue;
    bars.push({
      close: quote.close[i],
      volume: quote.volume[i] || 0,
    });
  }
  return { symbol, name: result.meta.longName || symbol, bars };
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

// ---------- Indicators (all index-based so they work at any point in history) ----------

function sma(values, period, endIdx) {
  if (endIdx + 1 < period) return null;
  let sum = 0;
  for (let i = endIdx - period + 1; i <= endIdx; i++) sum += values[i];
  return sum / period;
}

function rsiAt(closes, endIdx, period = 14) {
  const start = Math.max(1, endIdx - 90);
  if (endIdx - start < period) return null;
  let gain = 0;
  let loss = 0;
  for (let i = start; i < start + period; i++) {
    const d = closes[i] - closes[i - 1];
    if (d >= 0) gain += d;
    else loss -= d;
  }
  let avgGain = gain / period;
  let avgLoss = loss / period;
  for (let i = start + period; i <= endIdx; i++) {
    const d = closes[i] - closes[i - 1];
    avgGain = (avgGain * (period - 1) + Math.max(d, 0)) / period;
    avgLoss = (avgLoss * (period - 1) + Math.max(-d, 0)) / period;
  }
  if (avgLoss === 0) return 100;
  return 100 - 100 / (1 + avgGain / avgLoss);
}

function pctChangeAt(closes, days, endIdx) {
  const prev = endIdx - days;
  if (prev < 0) return null;
  return ((closes[endIdx] - closes[prev]) / closes[prev]) * 100;
}

// ---------- Scoring (usable at any historical index for backtesting) ----------

function computeSignals(closes, volumes, endIdx, withText) {
  if (endIdx + 1 < 60) return null;

  const price = closes[endIdx];
  const sma20 = sma(closes, 20, endIdx);
  const sma50 = sma(closes, 50, endIdx);
  const rsi14 = rsiAt(closes, endIdx);
  const chg5d = pctChangeAt(closes, 5, endIdx);
  const chg20d = pctChangeAt(closes, 20, endIdx);

  const avgVol20 = sma(volumes, 20, endIdx);
  const avgVol5 = sma(volumes, 5, endIdx);
  const volRatio = avgVol20 ? avgVol5 / avgVol20 : 1;

  const win = closes.slice(endIdx - 19, endIdx + 1);
  const hi20 = Math.max(...win);
  const lo20 = Math.min(...win);
  const offHigh = ((price - hi20) / hi20) * 100;
  const offLow = ((price - lo20) / lo20) * 100;

  const signals = [];
  const say = (side, text) => withText && signals.push({ side, text });
  let buyScore = 0;
  let sellScore = 0;

  // Trend structure
  if (price > sma20 && sma20 > sma50) {
    buyScore += 30;
    say("buy", "Uptrend: price above 20d & 50d average");
  } else if (price < sma20 && sma20 < sma50) {
    sellScore += 30;
    say("sell", "Downtrend: price below 20d & 50d average");
  } else if (price > sma50 && price < sma20) {
    buyScore += 8;
    say("buy", "Pullback within longer-term uptrend");
  }

  // Momentum
  if (chg20d != null) {
    if (chg20d > 5) {
      buyScore += 20;
      say("buy", `Strong 1-month momentum (+${chg20d.toFixed(1)}%)`);
    } else if (chg20d > 2) {
      buyScore += 10;
    } else if (chg20d < -5) {
      sellScore += 20;
      say("sell", `Weak 1-month momentum (${chg20d.toFixed(1)}%)`);
    } else if (chg20d < -2) {
      sellScore += 10;
    }
  }
  if (chg5d != null) {
    if (chg5d > 2) buyScore += 10;
    else if (chg5d < -2) sellScore += 10;
  }

  // RSI — reward healthy strength, flag extremes
  if (rsi14 != null) {
    if (rsi14 >= 50 && rsi14 <= 65) {
      buyScore += 20;
      say("buy", `Healthy RSI ${rsi14.toFixed(0)} — strong but not overbought`);
    } else if (rsi14 > 65 && rsi14 <= 72) {
      buyScore += 8;
    } else if (rsi14 > 72) {
      sellScore += 20;
      say("sell", `Overbought RSI ${rsi14.toFixed(0)} — pullback risk`);
    } else if (rsi14 < 30) {
      buyScore += 10;
      say("buy", `Oversold RSI ${rsi14.toFixed(0)} — possible bounce (risky)`);
      sellScore += 8;
    } else if (rsi14 >= 30 && rsi14 < 45) {
      sellScore += 10;
    }
  }

  // Volume confirmation
  if (volRatio > 1.3) {
    if (chg5d != null && chg5d > 0) {
      buyScore += 10;
      say("buy", "Rising volume confirms buying interest");
    } else if (chg5d != null && chg5d < 0) {
      sellScore += 10;
      say("sell", "Heavy volume on decline — distribution");
    }
  }

  // Breakout / breakdown proximity
  if (offHigh > -1) {
    buyScore += 10;
    say("buy", "Trading at 20-day highs (breakout zone)");
  }
  if (offLow < 1 && offLow >= 0) {
    sellScore += 10;
    say("sell", "Sitting at 20-day lows (breakdown zone)");
  }

  const verdict =
    buyScore >= 55 && buyScore > sellScore + 15
      ? "BUY"
      : sellScore >= 45 && sellScore > buyScore + 10
      ? "SELL"
      : "HOLD";

  return {
    price, sma20, sma50, rsi14, chg5d, chg20d, volRatio,
    buyScore, sellScore, verdict, signals,
  };
}

/**
 * Backtest: walk history in 5-trading-day steps, generate the verdict the
 * screener would have given on that day, and check whether the NEXT 5 trading
 * days moved in the predicted direction (up for BUY, down for SELL).
 * Prediction rate = correct calls / total calls.
 */
function backtest(closes, volumes) {
  let total = 0;
  let correct = 0;
  let buySignals = 0;
  let sellSignals = 0;
  for (let t = 60; t <= closes.length - 6; t += 5) {
    const s = computeSignals(closes, volumes, t, false);
    if (!s || s.verdict === "HOLD") continue;
    const fwd = (closes[t + 5] - closes[t]) / closes[t];
    total++;
    if (s.verdict === "BUY") {
      buySignals++;
      if (fwd > 0) correct++;
    } else {
      sellSignals++;
      if (fwd < 0) correct++;
    }
  }
  return {
    predictionRate: total >= 5 ? +((correct / total) * 100).toFixed(0) : null,
    samples: total,
    buySignals,
    sellSignals,
  };
}

function analyze(stock) {
  const closes = stock.bars.map((b) => b.close);
  const volumes = stock.bars.map((b) => b.volume);
  const last = closes.length - 1;
  const s = computeSignals(closes, volumes, last, true);
  if (!s) return null;
  const bt = backtest(closes, volumes);

  return {
    symbol: stock.symbol,
    name: stock.name,
    shariah: SHARIAH_COMPLIANT.has(stock.symbol),
    price: +s.price.toFixed(2),
    chg1d: +pctChangeAt(closes, 1, last).toFixed(2),
    chg5d: s.chg5d != null ? +s.chg5d.toFixed(2) : null,
    chg20d: s.chg20d != null ? +s.chg20d.toFixed(2) : null,
    rsi: s.rsi14 != null ? +s.rsi14.toFixed(1) : null,
    sma20: +s.sma20.toFixed(2),
    sma50: +s.sma50.toFixed(2),
    volRatio: +s.volRatio.toFixed(2),
    buyScore: s.buyScore,
    sellScore: s.sellScore,
    verdict: s.verdict,
    signals: s.signals,
    predictionRate: bt.predictionRate,
    backtestSamples: bt.samples,
    spark: closes.slice(-30).map((c) => +c.toFixed(2)),
  };
}

// ---------- Screen ----------

function buildSummary(stocks) {
  const buys = stocks.filter((s) => s.verdict === "BUY");
  const sells = stocks.filter((s) => s.verdict === "SELL");
  const holds = stocks.filter((s) => s.verdict === "HOLD");

  const rated = stocks.filter((s) => s.predictionRate != null);
  const avgPredictionRate = rated.length
    ? +(
        rated.reduce((a, s) => a + s.predictionRate, 0) / rated.length
      ).toFixed(0)
    : null;

  const avgWeekMove = +(
    stocks.reduce((a, s) => a + (s.chg5d || 0), 0) / stocks.length
  ).toFixed(1);

  const breadth =
    buys.length > sells.length * 1.5
      ? "bullish"
      : sells.length > buys.length * 1.5
      ? "bearish"
      : "mixed";

  // Best pick: strongest buy, breaking ties by historical prediction rate.
  const topBuy = [...buys].sort(
    (a, b) =>
      b.buyScore - a.buyScore ||
      (b.predictionRate || 0) - (a.predictionRate || 0)
  )[0];
  const topSell = [...sells].sort(
    (a, b) =>
      b.sellScore - a.sellScore ||
      (b.predictionRate || 0) - (a.predictionRate || 0)
  )[0];

  return {
    buys: buys.length,
    sells: sells.length,
    holds: holds.length,
    breadth,
    avgWeekMove,
    avgPredictionRate,
    topBuy: topBuy
      ? { symbol: topBuy.symbol, score: topBuy.buyScore, predictionRate: topBuy.predictionRate }
      : null,
    topSell: topSell
      ? { symbol: topSell.symbol, score: topSell.sellScore, predictionRate: topSell.predictionRate }
      : null,
  };
}

async function runScreen() {
  const raw = await mapWithConcurrency(WATCHLIST, 6, fetchHistory);
  const analyzed = [];
  const failed = [];
  for (const r of raw) {
    if (r.error) {
      failed.push(r.symbol);
      continue;
    }
    const a = analyze(r);
    if (a) analyzed.push(a);
  }
  analyzed.sort((a, b) => b.buyScore - a.buyScore);
  return {
    generatedAt: new Date().toISOString(),
    scanned: analyzed.length,
    failed,
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

server.listen(PORT, () => {
  console.log(`US Stock Weekly Picks running at http://localhost:${PORT}`);
});
