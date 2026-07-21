import Card from "@mui/material/Card";
import CardContent from "@mui/material/CardContent";
import Typography from "@mui/material/Typography";
import Box from "@mui/material/Box";
import Tooltip from "@mui/material/Tooltip";
import InsightsIcon from "@mui/icons-material/Insights";
import { useTheme } from "@mui/material/styles";
import { deltaColor } from "../theme.js";

/** Mini quintile bar chart: mean monthly return of each ranked fifth (holdout). */
function QuintileBars({ qMeans }) {
  const theme = useTheme();
  if (!qMeans || qMeans.length !== 5) return null;
  const max = Math.max(...qMeans.map(Math.abs), 0.1);
  const labels = ["Worst", "", "Mid", "", "Best"];
  return (
    <Box sx={{ mt: 2 }}>
      <Box sx={{ display: "flex", alignItems: "flex-end", gap: 0.8, height: 72 }}>
        {qMeans.map((v, i) => {
          const h = Math.max(4, (Math.abs(v) / max) * 54);
          const good = i >= 3;
          return (
            <Box key={i} sx={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 0.4 }}>
              <Typography sx={{ fontSize: "0.6rem", color: "text.secondary", fontVariantNumeric: "tabular-nums" }}>
                {v > 0 ? "+" : ""}{v}
              </Typography>
              <Box
                sx={{
                  width: "100%",
                  height: h,
                  borderRadius: "5px 5px 0 0",
                  bgcolor: good ? deltaColor(theme, 1) : i === 2 ? "text.disabled" : theme.palette.error.main,
                  opacity: 0.35 + 0.15 * i,
                }}
              />
              <Typography sx={{ fontSize: "0.56rem", color: "text.secondary" }}>{labels[i]}</Typography>
            </Box>
          );
        })}
      </Box>
      <Typography sx={{ fontSize: "0.62rem", color: "text.secondary", mt: 0.4, textAlign: "center" }}>
        Held-out year: mean next-month return by ranked fifth
      </Typography>
    </Box>
  );
}

export default function ModelReliabilityCard({ model }) {
  const theme = useTheme();
  if (!model) return null;
  const good = deltaColor(theme, 1);

  return (
    <Card>
      <CardContent>
        <Typography variant="h2" sx={{ display: "flex", alignItems: "center", gap: 0.8, mb: 0.5 }}>
          <InsightsIcon fontSize="small" color="primary" /> How much to trust this
        </Typography>
        <Typography sx={{ fontSize: "0.73rem", color: "text.secondary", mb: 1 }}>
          Validated on a held-out final year the model never trained on
          ({model.holdoutSamples?.toLocaleString()} cases).
        </Typography>

        {/* The headline: cross-sectional ranking works. */}
        <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
          <Typography sx={{ fontSize: "0.82rem", fontWeight: 700 }}>Ranking edge</Typography>
          <Typography sx={{ fontSize: "0.82rem", fontWeight: 700, color: good }}>
            +{model.rankSpread}%/mo · reliable
          </Typography>
        </Box>
        <QuintileBars qMeans={model.qMeans} />
        <Typography sx={{ fontSize: "0.68rem", color: "text.secondary", mt: 0.6 }}>
          Stocks the model ranks highest have out-performed the lowest by{" "}
          <b>{model.rankSpread}%/month</b> out-of-sample ({model.rankAccuracy}% of relative
          calls correct). This ranking is the trustworthy output.
        </Typography>

        <Box sx={{ mt: 1.4, display: "grid", gap: 0.6 }}>
          <Metric
            label="Risk / range forecast"
            value={`R² ${model.volR2} · reliable`}
            color={good}
            help={`Each stock's volatility is genuinely predictable (corr ${model.volCorr}), so the ±range and risk tier are trustworthy.`}
          />
          <Metric
            label="Absolute up/down call"
            value={`${model.dirAccuracy}% vs ${model.baseRate}% base · no edge`}
            color={theme.palette.error.main}
            help="Predicting whether one stock rises in isolation barely beats the market's drift — which is why the app ranks stocks against each other instead."
          />
        </Box>

        <Tooltip title="Brier score: 0 is perfect, 0.25 is a coin flip.">
          <Typography sx={{ fontSize: "0.66rem", color: "text.secondary", mt: 1 }}>
            Probability calibration (Brier): <b>{model.brier}</b>.
          </Typography>
        </Tooltip>
      </CardContent>
    </Card>
  );
}

function Metric({ label, value, color, help }) {
  return (
    <Box>
      <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 1 }}>
        <Typography sx={{ fontSize: "0.76rem", fontWeight: 600 }}>{label}</Typography>
        <Typography sx={{ fontSize: "0.76rem", fontWeight: 700, color, textAlign: "right" }}>{value}</Typography>
      </Box>
      <Typography sx={{ fontSize: "0.65rem", color: "text.secondary" }}>{help}</Typography>
    </Box>
  );
}
