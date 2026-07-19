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

/**
 * Confidence bucket for a backtested stock. Statistically honest:
 * "high confidence" requires the LOWER bound of the 95% CI to clear 50%
 * (i.e. even the pessimistic read of history says better than a coin flip)
 * plus a positive average edge.
 */
export function rateBucket(s) {
  if (s.predictionRate == null) return { label: "not enough history", cls: "na" };
  if (s.backtestSamples < 15) return { label: "limited history", cls: "na" };
  if (s.ciLow != null && s.ciLow >= 50 && s.expectancy > 0)
    return { label: "high confidence", cls: "high" };
  if (s.predictionRate >= 52 && s.expectancy > 0)
    return { label: "moderate confidence", cls: "mid" };
  return { label: "low confidence", cls: "low" };
}

/** One-line plain-English summary for a stock card. */
export function summarize(s, side) {
  const dir = side === "buy" ? "upward" : "downward";
  if (s.predictionRate == null) {
    return `Technical signals point ${dir}, but there are too few past signals to measure reliability.`;
  }
  const ci =
    s.ciLow != null ? `, 95% CI ${s.ciLow}–${s.ciHigh}%` : "";
  const edge =
    s.expectancy != null
      ? ` Average edge when it fired: ${s.expectancy > 0 ? "+" : ""}${s.expectancy}% per week.`
      : "";
  return (
    `Signals point ${dir} — this stock's setup called the next week right ` +
    `${s.predictionRate}% of the time over ~5 years (${s.backtestSamples} signals${ci}).${edge}`
  );
}
