/**
 * Live, forward-only track record.
 *
 * Each trading day the screener runs, it snapshots that day's ranking (every
 * symbol's price + lean). To measure performance HONESTLY — forward, never
 * backtested — each snapshot is later paired with the first snapshot taken
 * >= ~1 month afterward, and the realized return of that day's top-ranked
 * ("BUY") picks vs bottom-ranked ("SELL") picks is computed from the two
 * stored prices. Nothing here is simulated; results only appear once real
 * calendar time has passed since the app started recording.
 *
 * Storage: a single JSON file under ./data (git-ignored). Zero dependencies.
 */

const fs = require("fs");
const path = require("path");

const DIR = path.join(__dirname, "data");
const FILE = path.join(DIR, "track.json");
const HOLD_CAL_DAYS = 31; // ~21 trading days
const MAX_SNAPSHOTS = 520; // ~2 years of daily snapshots

function load() {
  try {
    return JSON.parse(fs.readFileSync(FILE, "utf8"));
  } catch {
    return { snapshots: [] };
  }
}

function save(data) {
  try {
    fs.mkdirSync(DIR, { recursive: true });
    fs.writeFileSync(FILE, JSON.stringify(data));
  } catch {
    /* read-only FS: track record simply won't persist; app still works */
  }
}

function daysBetween(a, b) {
  return Math.round((new Date(b) - new Date(a)) / 86400000);
}

/** Record one snapshot per data-date (idempotent within a trading day). */
function record(asOfDate, stocks) {
  if (!asOfDate || !stocks || !stocks.length) return;
  const data = load();
  if (data.snapshots.some((s) => s.date === asOfDate)) return;
  data.snapshots.push({
    date: asOfDate,
    picks: stocks.map((s) => ({ sym: s.symbol, price: s.price, verdict: s.verdict })),
  });
  data.snapshots.sort((a, b) => (a.date < b.date ? -1 : 1));
  if (data.snapshots.length > MAX_SNAPSHOTS) {
    data.snapshots = data.snapshots.slice(-MAX_SNAPSHOTS);
  }
  save(data);
}

/** Aggregate realized forward performance across matured snapshots. */
function summary() {
  const snaps = load().snapshots.slice().sort((a, b) => (a.date < b.date ? -1 : 1));
  if (!snaps.length) return { snapshots: 0, matured: 0, open: 0 };

  let matured = 0;
  let open = 0;
  let sumTop = 0;
  let sumBot = 0;
  let sumSpread = 0;
  let wins = 0;

  for (const S of snaps) {
    const T = snaps.find((x) => daysBetween(S.date, x.date) >= HOLD_CAL_DAYS);
    if (!T) {
      open++;
      continue;
    }
    const laterPrice = Object.fromEntries(T.picks.map((p) => [p.sym, p.price]));
    const meanRet = (verdict) => {
      const arr = S.picks.filter((x) => x.verdict === verdict && laterPrice[x.sym] != null);
      if (!arr.length) return null;
      return arr.reduce((a, x) => a + (laterPrice[x.sym] / x.price - 1), 0) / arr.length;
    };
    const top = meanRet("BUY");
    const bot = meanRet("SELL");
    if (top == null || bot == null) {
      open++;
      continue;
    }
    matured++;
    sumTop += top;
    sumBot += bot;
    sumSpread += top - bot;
    if (top > bot) wins++;
  }

  const pct = (x) => +(x * 100).toFixed(2);
  return {
    firstDate: snaps[0].date,
    lastDate: snaps[snaps.length - 1].date,
    snapshots: snaps.length,
    matured,
    open,
    daysToFirstResult:
      matured === 0 && snaps.length
        ? Math.max(0, HOLD_CAL_DAYS - daysBetween(snaps[0].date, snaps[snaps.length - 1].date))
        : 0,
    avgTopReturn: matured ? pct(sumTop / matured) : null,
    avgBottomReturn: matured ? pct(sumBot / matured) : null,
    avgSpread: matured ? pct(sumSpread / matured) : null,
    winRate: matured ? Math.round((wins / matured) * 100) : null,
  };
}

module.exports = { record, summary };
