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

/** Confidence bucket for a backtested prediction rate. */
export function rateBucket(rate) {
  if (rate == null) return { label: "not enough history", cls: "na" };
  if (rate >= 60) return { label: "high confidence", cls: "high" };
  if (rate >= 50) return { label: "moderate confidence", cls: "mid" };
  return { label: "low confidence", cls: "low" };
}

/** One-line plain-English summary for a stock card. */
export function summarize(s, side) {
  const dir = side === "buy" ? "upward" : "downward";
  const rate =
    s.predictionRate != null
      ? `this setup called the next week right ${s.predictionRate}% of the time over the past 2 years (${s.backtestSamples} signals)`
      : `too few past signals to measure reliability`;
  return `Technical signals point ${dir} for this week — ${rate}.`;
}
