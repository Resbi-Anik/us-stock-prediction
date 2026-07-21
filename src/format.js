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
      ? `Ranked #${s.rank} of ${s.rankTotal} — top ${100 - s.rankPct === 0 ? "" : ""}${s.rankPct}th percentile by relative strength.`
      : s.verdict === "SELL"
      ? `Ranked #${s.rank} of ${s.rankTotal} — near the bottom by relative strength.`
      : `Ranked #${s.rank} of ${s.rankTotal} — mid-pack.`;
  return `${pos}${spreadLine} Expected move: about ±${s.expectedRangePct}% over the next month (one-sigma, ${s.riskTier.toLowerCase()} risk).`;
}
