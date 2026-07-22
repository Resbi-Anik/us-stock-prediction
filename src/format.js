export function fmtPct(v) {
  if (v == null) return "–";
  return (v > 0 ? "+" : "") + v.toFixed(1) + "%";
}

export function fmtPrice(v) {
  return v.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

export function deltaClass(v) {
  return v == null ? "" : v >= 0 ? "up" : "down";
}

/** Verdict -> label + MUI color. Verdicts come from relative-strength rank tiers. */
export function verdictMeta(verdict) {
  switch (verdict) {
    case "BUY":
      return { label: "BUY LEAN", color: "success" };
    case "SELL":
      return { label: "AVOID", color: "error" };
    default:
      return { label: "NEUTRAL", color: "default" };
  }
}

/** Risk tier -> label + MUI color (always paired with the text label). */
export function riskMeta(tier) {
  switch (tier) {
    case "Low":
      return { label: "Low risk", color: "success" };
    case "High":
      return { label: "High risk", color: "error" };
    default:
      return { label: "Medium risk", color: "warning" };
  }
}

/** Analyst recommendation mean (1 strong buy … 5 sell) -> label + tone. */
export function analystMeta(a) {
  if (!a || a.recMean == null) return null;
  const m = a.recMean;
  const label =
    m <= 1.6 ? "Strong Buy" : m <= 2.4 ? "Buy" : m <= 3.4 ? "Hold" : m <= 4.2 ? "Sell" : "Strong Sell";
  return { label, tone: m <= 2.4 ? 1 : m <= 3.4 ? 0 : -1 };
}

/** News sentiment (−1…1) -> short label + tone for coloring. */
export function newsMeta(n) {
  if (!n || n.sentiment == null) return null;
  const s = n.sentiment;
  const label = s > 0.15 ? "positive" : s < -0.15 ? "negative" : "mixed";
  return { label, tone: s > 0.15 ? 1 : s < -0.15 ? -1 : 0 };
}

/** One-line, honest read for a stock card, grounded in the ranking backtest. */
export function summarize(s, model) {
  const q5 = model?.qMeans?.[4];
  const q1 = model?.qMeans?.[0];
  const spreadLine =
    q5 != null && q1 != null
      ? ` In backtests the top-ranked fifth returned about ${q5 > 0 ? "+" : ""}${q5}%/mo vs ${q1 > 0 ? "+" : ""}${q1}%/mo for the bottom fifth.`
      : "";
  const pos =
    s.verdict === "BUY"
      ? `Ranked #${s.rank} of ${s.rankTotal} — top ${100 - s.rankPct === 0 ? "" : ""}${s.rankPct}th percentile.`
      : s.verdict === "SELL"
      ? `Ranked #${s.rank} of ${s.rankTotal} — near the bottom.`
      : `Ranked #${s.rank} of ${s.rankTotal} — mid-pack.`;
  const tilt =
    s.externalScore != null && s.modelPct != null
      ? ` Model ${s.modelPct} + live analyst/news ${s.externalScore} pctile.`
      : "";
  return `${pos}${tilt}${spreadLine} Expected move: about ±${s.expectedRangePct}% over the next month (one-sigma, ${s.riskTier.toLowerCase()} risk).`;
}
