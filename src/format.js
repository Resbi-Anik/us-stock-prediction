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

/** Human label + MUI color key for a verdict. Deliberately hedged wording:
 *  the backtest shows direction has almost no edge, so these are "leans". */
export function verdictMeta(verdict) {
  switch (verdict) {
    case "BUY":
      return { label: "LEAN BUY", color: "success", side: "buy" };
    case "SELL":
      return { label: "LEAN SELL", color: "error", side: "sell" };
    default:
      return { label: "NEUTRAL", color: "default", side: "buy" };
  }
}

/** Risk tier -> label + MUI color (paired with the text label, never color-only). */
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

/**
 * Honest confidence wording for the directional probability, keyed off how far
 * the model's own out-of-sample accuracy sits above the market base rate.
 * When the model barely beats the base rate (it does), direction is low
 * confidence regardless of how extreme a single probability looks.
 */
export function directionConfidence(model) {
  const beats = model?.beatsBaseline;
  if (beats == null) return { label: "unvalidated", cls: "na" };
  if (beats >= 3) return { label: "some edge", cls: "high" };
  if (beats >= 1) return { label: "slight edge", cls: "mid" };
  return { label: "no proven edge", cls: "low" };
}

/** One-line, honest read for a stock card. */
export function summarize(s, model) {
  const range = `Expected move over the next month: about ±${s.expectedRangePct}% (one-sigma — roughly 2 of 3 months land inside; ${s.riskTier.toLowerCase()} risk). This range forecast is the reliable part.`;
  const dir =
    s.edgePts > 0
      ? `Model leans up (${s.probUp}% vs ${(s.probUp - s.edgePts).toFixed(0)}% base rate)`
      : s.edgePts < 0
      ? `Model leans down (${s.probUp}% up vs ${(s.probUp - s.edgePts).toFixed(0)}% base rate)`
      : `Model is neutral (${s.probUp}% up)`;
  const conf = directionConfidence(model);
  return `${dir} — but direction has ${conf.label} out-of-sample, so treat it lightly. ${range}`;
}
