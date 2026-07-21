import Card from "@mui/material/Card";
import CardContent from "@mui/material/CardContent";
import Typography from "@mui/material/Typography";
import Box from "@mui/material/Box";
import LinearProgress from "@mui/material/LinearProgress";
import Tooltip from "@mui/material/Tooltip";
import InsightsIcon from "@mui/icons-material/Insights";
import { useTheme } from "@mui/material/styles";
import { deltaColor } from "../theme.js";

function Meter({ label, valueText, fraction, color, help }) {
  return (
    <Box sx={{ mb: 1.2 }}>
      <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
        <Typography sx={{ fontSize: "0.8rem", fontWeight: 600 }}>{label}</Typography>
        <Typography sx={{ fontSize: "0.8rem", fontWeight: 700, color }}>
          {valueText}
        </Typography>
      </Box>
      <LinearProgress
        variant="determinate"
        value={Math.max(2, Math.min(100, fraction * 100))}
        sx={{
          height: 6,
          borderRadius: 999,
          mt: 0.5,
          "& .MuiLinearProgress-bar": { bgcolor: color },
        }}
      />
      <Typography sx={{ fontSize: "0.68rem", color: "text.secondary", mt: 0.3 }}>
        {help}
      </Typography>
    </Box>
  );
}

export default function ModelReliabilityCard({ model }) {
  const theme = useTheme();
  if (!model) return null;

  const beats = model.beatsBaseline ?? 0;
  // Direction is only as trustworthy as its margin over the base rate.
  const dirColor =
    beats >= 3 ? deltaColor(theme, 1) : beats >= 1 ? theme.palette.warning.main : theme.palette.error.main;
  const dirVerdict =
    beats >= 3 ? "some edge" : beats >= 1 ? "slight edge" : "no proven edge";

  const volColor = deltaColor(theme, 1);

  return (
    <Card sx={{ mt: 2 }}>
      <CardContent>
        <Typography variant="h2" sx={{ display: "flex", alignItems: "center", gap: 0.8, mb: 0.5 }}>
          <InsightsIcon fontSize="small" color="primary" /> How much to trust this
        </Typography>
        <Typography sx={{ fontSize: "0.75rem", color: "text.secondary", mb: 1.2 }}>
          Measured on a held-out final year the model never trained on
          ({model.holdoutSamples?.toLocaleString()} test cases). No cherry-picking.
        </Typography>

        <Meter
          label="Direction accuracy"
          valueText={`${model.dirAccuracy}% vs ${model.baseRate}% base · ${dirVerdict}`}
          fraction={model.dirAccuracy / 100}
          color={dirColor}
          help={`Picking up/down a month out barely beats simply assuming the market drifts up (${model.baseRate}%). Treat every buy/sell lean as low-confidence.`}
        />

        <Meter
          label="Risk / range forecast"
          valueText={`R² ${model.volR2} · reliable`}
          fraction={model.volR2 != null ? Math.min(1, model.volR2 * 2.5) : 0}
          color={volColor}
          help={`How volatile each stock will be is genuinely predictable (correlation ${model.volCorr}). The expected-range and risk read is the trustworthy output.`}
        />

        <Tooltip title="Brier score: 0 is perfect, 0.25 is a coin flip. Lower is better.">
          <Typography sx={{ fontSize: "0.7rem", color: "text.secondary" }}>
            Probability calibration (Brier): <b>{model.brier}</b> — near the 0.25
            coin-flip line, as honest technicals should be.
          </Typography>
        </Tooltip>
      </CardContent>
    </Card>
  );
}
