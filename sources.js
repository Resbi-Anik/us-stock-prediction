/**
 * Fresh-info layer — live analyst & news data from free, keyless endpoints.
 *
 * Two sources, both public Yahoo Finance endpoints (no API key):
 *
 *  1. quoteSummary (needs the cookie+crumb handshake):
 *     - analyst consensus: recommendation mean/key, number of analysts
 *     - mean price target -> implied upside vs current price
 *     - recommendation REVISIONS: change in the buy-share of ratings vs a
 *       month ago (revisions carry cross-sectional signal in the literature)
 *     - next earnings date (shown as an event-risk flag, never a direction)
 *
 *  2. per-symbol news RSS: recent headlines scored with a small
 *     finance-tuned lexicon -> a crude but current sentiment reading.
 *
 * Everything degrades gracefully: any symbol or the whole layer may come back
 * null (network hiccup, consent wall, endpoint change) and the app keeps
 * working on the price model alone.
 *
 * IMPORTANT HONESTY NOTE: unlike the price model, this layer CANNOT be
 * backtest-validated from these endpoints (no history). It is therefore
 * blended with a modest weight and labeled as live info; the forward track
 * record is what scores the blend over time.
 */

const https = require("https");

const CACHE_TTL_MS = 30 * 60 * 1000; // refresh the layer at most every 30 min
const SESSION_TTL_MS = 6 * 60 * 60 * 1000; // cookie+crumb lifetime
const NEWS_WINDOW_DAYS = 7;
const MIN_ANALYSTS = 3; // below this, consensus/target are too noisy to use
// NOTE: keep this UA in sync with server.js. Yahoo answers 429 to a
// full fake-Chrome UA coming from a Node HTTP/1.1 client; this shorter
// signature is accepted.
const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36";

// ---------- tiny HTTP client (redirects + cookie capture) ----------

function httpGet(url, { cookie, maxRedirects = 3, collect } = {}) {
  return new Promise((resolve, reject) => {
    const req = https.get(
      url,
      {
        headers: {
          "User-Agent": UA,
          Accept: "*/*",
          ...(cookie ? { Cookie: cookie } : {}),
        },
        timeout: 15000,
      },
      (res) => {
        const setCookies = res.headers["set-cookie"] || [];
        if (collect) {
          for (const c of setCookies) {
            const kv = c.split(";")[0];
            const name = kv.split("=")[0];
            collect.set(name, kv);
          }
        }
        if (
          res.statusCode >= 300 &&
          res.statusCode < 400 &&
          res.headers.location &&
          maxRedirects > 0
        ) {
          res.resume();
          const next = new URL(res.headers.location, url).toString();
          resolve(httpGet(next, { cookie, maxRedirects: maxRedirects - 1, collect }));
          return;
        }
        let body = "";
        res.on("data", (c) => (body += c));
        res.on("end", () =>
          resolve({ status: res.statusCode, body, location: res.headers.location || null })
        );
      }
    );
    req.on("timeout", () => req.destroy(new Error("timeout")));
    req.on("error", reject);
  });
}

async function mapWithConcurrency(items, limit, fn) {
  const results = new Array(items.length);
  let next = 0;
  async function worker() {
    while (next < items.length) {
      const i = next++;
      try {
        results[i] = await fn(items[i]);
      } catch {
        results[i] = null;
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}

// ---------- Yahoo cookie + crumb session ----------

let session = null; // { cookie, crumb, at }

async function getSession(force = false) {
  if (!force && session && Date.now() - session.at < SESSION_TTL_MS) return session;
  const jar = new Map();
  // fc.yahoo.com answers 404 but sets the auth cookie we need
  await httpGet("https://fc.yahoo.com", { collect: jar }).catch(() => {});
  const cookie = [...jar.values()].join("; ");
  if (!cookie) throw new Error("no yahoo cookie");
  const res = await httpGet("https://query1.finance.yahoo.com/v1/test/getcrumb", { cookie });
  const crumb = (res.body || "").trim();
  if (res.status !== 200 || !crumb || crumb.includes("<") || crumb.length > 30) {
    throw new Error("no yahoo crumb");
  }
  session = { cookie, crumb, at: Date.now() };
  return session;
}

// ---------- analyst consensus / targets / revisions / earnings ----------

async function fetchAnalyst(symbol) {
  let s = await getSession();
  const url = () =>
    `https://query1.finance.yahoo.com/v10/finance/quoteSummary/${encodeURIComponent(symbol)}` +
    `?modules=financialData,recommendationTrend,calendarEvents&crumb=${encodeURIComponent(s.crumb)}`;
  let res = await httpGet(url(), { cookie: s.cookie });
  if (res.status === 401 || res.status === 403) {
    s = await getSession(true); // crumb expired -> one re-handshake
    res = await httpGet(url(), { cookie: s.cookie });
  }
  if (res.status !== 200) return null;
  const out = JSON.parse(res.body)?.quoteSummary?.result?.[0];
  if (!out) return null;

  const fin = out.financialData || {};
  const count = fin.numberOfAnalystOpinions?.raw ?? 0;
  const price = fin.currentPrice?.raw;
  const target = fin.targetMeanPrice?.raw;

  let analyst = null;
  if (count >= MIN_ANALYSTS && fin.recommendationMean?.raw != null) {
    analyst = {
      recMean: +fin.recommendationMean.raw.toFixed(2), // 1 strong buy … 5 sell
      recKey: fin.recommendationKey || null,
      count,
      targetMeanPrice: target != null ? +target.toFixed(2) : null,
      targetUpsidePct:
        target != null && price > 0 ? +(((target - price) / price) * 100).toFixed(1) : null,
      revisionDelta: null, // buy-share change vs 1 month ago, in pct points
    };
    const trend = out.recommendationTrend?.trend || [];
    const now = trend.find((t) => t.period === "0m");
    const prev = trend.find((t) => t.period === "-1m");
    const buyShare = (t) => {
      const tot = t.strongBuy + t.buy + t.hold + t.sell + t.strongSell;
      return tot >= 5 ? (t.strongBuy + t.buy) / tot : null;
    };
    if (now && prev) {
      const a = buyShare(now);
      const b = buyShare(prev);
      if (a != null && b != null) analyst.revisionDelta = +((a - b) * 100).toFixed(1);
    }
  }

  const eRaw = out.calendarEvents?.earnings?.earningsDate?.[0];
  const earningsDate = eRaw?.fmt || (eRaw?.raw ? new Date(eRaw.raw * 1000).toISOString().slice(0, 10) : null);

  return { analyst, earningsDate };
}

// ---------- news headlines -> lexicon sentiment ----------

const POS_RE = [
  /\b(beats?|tops?|exceed(s|ed)?|surg(e|es|ed|ing)|soar(s|ed|ing)?|jump(s|ed|ing)?|rall(y|ies|ied)|climb(s|ed|ing)?|gain(s|ed|ing)?|advanc(e|es|ed|ing))\b/,
  /\b(upgrade[sd]?|raises?|boost(s|ed)?|hik(e|es|ed)|outperform(s|ed)?|overweight|buy rating|price target raised)\b/,
  /\b(record|all-time high|breakthrough|approval|approved|wins?|won|strong|robust|bullish|momentum|buyback|dividend (increase|hike))\b/,
  /\b(better[- ]than[- ]expected|blowout|smash(es|ed)?)\b/,
];
const NEG_RE = [
  /\b(miss(es|ed)?|fall(s|ing)?|fell|drop(s|ped|ping)?|plung(e|es|ed|ing)|sink(s|ing)?|sank|tumbl(e|es|ed|ing)|slump(s|ed|ing)?|slid(e|es)?|declin(e|es|ed|ing)|los(es|ing)|crash(es|ed)?|sell-?off)\b/,
  /\b(downgrade[sd]?|cuts?|lower(s|ed)?|underperform(s|ed)?|underweight|sell rating|price target (cut|lowered))\b/,
  /\b(lawsuit|sue[sd]?|probe|investigation|recall(s|ed)?|layoffs?|bankrupt(cy)?|fraud|warn(s|ing|ed)?|halt(s|ed)?|weak|bearish|short seller|delays?)\b/,
  /\b(worse[- ]than[- ]expected|guidance cut)\b/,
];

function decodeEntities(s) {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&(#39|apos);/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(+n));
}

function rssField(item, tag) {
  const m = item.match(new RegExp(`<${tag}>(?:<!\\[CDATA\\[)?([\\s\\S]*?)(?:\\]\\]>)?</${tag}>`));
  return m ? decodeEntities(m[1].trim()) : null;
}

function scoreText(text) {
  const t = text.toLowerCase();
  let pos = 0;
  let neg = 0;
  for (const re of POS_RE) if (re.test(t)) pos++;
  for (const re of NEG_RE) if (re.test(t)) neg++;
  return pos > neg ? 1 : neg > pos ? -1 : 0;
}

async function fetchNews(symbol) {
  const url = `https://feeds.finance.yahoo.com/rss/2.0/headline?s=${encodeURIComponent(
    symbol
  )}&region=US&lang=en-US`;
  const res = await httpGet(url);
  if (res.status !== 200) return null;
  const items = [...res.body.matchAll(/<item>([\s\S]*?)<\/item>/g)].map((m) => m[1]);
  if (!items.length) return null;

  const cutoff = Date.now() - NEWS_WINDOW_DAYS * 86400000;
  const heads = [];
  for (const it of items) {
    const title = rssField(it, "title");
    if (!title) continue;
    const pub = rssField(it, "pubDate");
    const ts = pub ? Date.parse(pub) : NaN;
    if (!Number.isNaN(ts) && ts < cutoff) continue;
    heads.push({
      title,
      link: rssField(it, "link"),
      published: Number.isNaN(ts) ? null : new Date(ts).toISOString().slice(0, 10),
      s: scoreText(title + " " + (rssField(it, "description") || "")),
    });
  }
  if (!heads.length) return null;

  const pos = heads.filter((h) => h.s > 0).length;
  const neg = heads.filter((h) => h.s < 0).length;
  const classified = pos + neg;
  // net tone in [-1, 1], dampened when only 1-2 headlines carried any signal
  const sentiment =
    classified > 0
      ? +(((pos - neg) / classified) * Math.min(1, classified / 3)).toFixed(2)
      : null;

  return {
    sentiment,
    pos,
    neg,
    total: heads.length,
    headlines: heads.slice(0, 3).map(({ title, link, published }) => ({ title, link, published })),
  };
}

// ---------- the cached layer ----------

let cache = { at: 0, payload: null };
let inflight = null;

async function buildFreshInfo(symbols) {
  // Session first, so 120 symbol fetches don't each race the handshake.
  const haveSession = await getSession().then(() => true).catch(() => false);

  const [analystArr, newsArr] = await Promise.all([
    haveSession
      ? mapWithConcurrency(symbols, 6, fetchAnalyst)
      : Promise.resolve(symbols.map(() => null)),
    mapWithConcurrency(symbols, 6, fetchNews),
  ]);

  const bySymbol = {};
  let analystCoverage = 0;
  let newsCoverage = 0;
  symbols.forEach((sym, i) => {
    const a = analystArr[i];
    const n = newsArr[i];
    if (!a && !n) return;
    let earningsInDays = null;
    if (a?.earningsDate) {
      const d = Math.round((new Date(a.earningsDate) - Date.now()) / 86400000);
      earningsInDays = d < 0 ? null : d + 0; // null when stale; -0 -> 0 (today)
    }
    bySymbol[sym] = {
      analyst: a?.analyst || null,
      earningsDate: a?.earningsDate || null,
      earningsInDays,
      news: n || null,
    };
    if (a?.analyst) analystCoverage++;
    if (n) newsCoverage++;
  });

  return {
    fetchedAt: new Date().toISOString(),
    analystCoverage,
    newsCoverage,
    bySymbol,
  };
}

/**
 * Fresh analyst + news info for the universe, cached ~30 min.
 * Never throws; on total failure returns an empty layer.
 */
async function getFreshInfo(symbols) {
  if (cache.payload && Date.now() - cache.at < CACHE_TTL_MS) return cache.payload;
  if (!inflight) {
    inflight = buildFreshInfo(symbols)
      .then((payload) => {
        cache = { at: Date.now(), payload };
        return payload;
      })
      .catch(() => {
        const empty = { fetchedAt: null, analystCoverage: 0, newsCoverage: 0, bySymbol: {} };
        // brief negative cache so a dead network doesn't hammer the endpoints
        cache = { at: Date.now() - CACHE_TTL_MS + 2 * 60 * 1000, payload: empty };
        return empty;
      })
      .finally(() => {
        inflight = null;
      });
  }
  return inflight;
}

/**
 * TEMPORARY deployment diagnostic: probes each stage of the Yahoo handshake
 * and reports raw statuses, so a blocked datacenter IP can be debugged from
 * the deployed server itself. Exposed at /api/fresh-debug; remove when done.
 */
async function diagnose() {
  const out = { at: new Date().toISOString(), node: process.version, steps: {} };
  const step = async (name, fn) => {
    try {
      out.steps[name] = await fn();
    } catch (e) {
      out.steps[name] = { error: e.message };
    }
  };

  const jar1 = new Map();
  await step("1_fc_cookie", async () => {
    const r = await httpGet("https://fc.yahoo.com", { collect: jar1, maxRedirects: 0 });
    return { status: r.status, location: r.location, cookies: [...jar1.keys()] };
  });
  const cookie1 = [...jar1.values()].join("; ");

  await step("2_getcrumb_q1", async () => {
    const r = await httpGet("https://query1.finance.yahoo.com/v1/test/getcrumb", { cookie: cookie1 });
    return { status: r.status, body: r.body.slice(0, 60) };
  });

  await step("3_getcrumb_q2", async () => {
    const r = await httpGet("https://query2.finance.yahoo.com/v1/test/getcrumb", { cookie: cookie1 });
    return { status: r.status, body: r.body.slice(0, 60) };
  });

  const jar2 = new Map();
  await step("4_homepage_cookie", async () => {
    const r = await httpGet("https://finance.yahoo.com/quote/AAPL/", { collect: jar2 });
    return { status: r.status, location: r.location, cookies: [...jar2.keys()], len: r.body.length };
  });
  const cookie2 = [...jar2.values()].join("; ");

  await step("5_getcrumb_with_homepage_cookie", async () => {
    if (!cookie2) return { skipped: "no cookies from homepage" };
    const r = await httpGet("https://query1.finance.yahoo.com/v1/test/getcrumb", { cookie: cookie2 });
    return { status: r.status, body: r.body.slice(0, 60) };
  });

  await step("6_quoteSummary_via_session", async () => {
    const a = await fetchAnalyst("AAPL");
    return { ok: !!a, recKey: a?.analyst?.recKey || null, earnings: a?.earningsDate || null };
  });

  await step("7_insights_no_crumb", async () => {
    const r = await httpGet(
      "https://query1.finance.yahoo.com/ws/insights/v2/finance/insights?symbol=AAPL"
    );
    let rec = null;
    try {
      rec = JSON.parse(r.body)?.finance?.result?.recommendation || null;
    } catch {}
    return { status: r.status, hasRecommendation: !!rec, rec };
  });

  return out;
}

module.exports = { getFreshInfo, diagnose, MIN_ANALYSTS };
