import Card from "@mui/material/Card";
import CardContent from "@mui/material/CardContent";
import Typography from "@mui/material/Typography";
import Chip from "@mui/material/Chip";
import Box from "@mui/material/Box";
import Stack from "@mui/material/Stack";
import Divider from "@mui/material/Divider";
import LinearProgress from "@mui/material/LinearProgress";
import { useTheme } from "@mui/material/styles";
import Sparkline from "./Sparkline.jsx";
import { fmtPct, fmtPrice, verdictMeta, riskMeta, summarize } from "../format.js";
import { deltaColor } from "../theme.js";

function Stat({ label, value, color }) {
  return (
    <Typography sx={{ fontSize: "0.75rem", color: "text.secondary" }}>
      {label}{" "}
      <Box component="b" sx={{ color: color || "text.primary", fontVariantNumeric: "tabular-nums" }}>
        {value}
      </Box>
    </Typography>
  );
}

export default function StockCard({ stock, model }) {
  const theme = useTheme();
  const v = verdictMeta(stock.verdict);
  const risk = riskMeta(stock.riskTier);
  const signals = stock.signals.slice(0, 3);

  const strongSide = stock.verdict === "BUY";
  const scoreColor = strongSide
    ? deltaColor(theme, 1)
    : stock.verdict === "SELL"
    ? theme.palette.error.main
    : theme.palette.text.secondary;

  return (
    <Card sx={{ height: "100%", display: "flex", flexDirection: "column" }}>
      <CardContent sx={{ flex: 1 }}>
        <Box sx={{ display: "flex", justifyContent: "space-between", gap: 1 }}>
          <Box sx={{ display: "flex", gap: 1, alignItems: "flex-start", minWidth: 0 }}>
            <Box
              sx={{
                flexShrink: 0,
                width: 34,
                height: 34,
                borderRadius: "10px",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: "0.8rem",
                fontWeight: 800,
                color: "text.secondary",
                border: 1,
                borderColor: "divider",
              }}
              aria-label={`Rank ${stock.rank} of ${stock.rankTotal}`}
            >
              #{stock.rank}
            </Box>
            <Box sx={{ minWidth: 0 }}>
              <Typography sx={{ fontSize: "1.05rem", fontWeight: 700, lineHeight: 1.1 }}>
                {stock.symbol}
              </Typography>
              <Typography
                sx={{
                  fontSize: "0.72rem",
                  color: "text.secondary",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
              >
                {stock.name}
              </Typography>
            </Box>
          </Box>
          <Box sx={{ textAlign: "right" }}>
            <Typography sx={{ fontSize: "1.02rem", fontWeight: 600 }}>${fmtPrice(stock.price)}</Typography>
            <Typography sx={{ fontSize: "0.76rem", fontWeight: 600, color: deltaColor(theme, stock.chg5d) }}>
              {fmtPct(stock.chg5d)} wk
            </Typography>
          </Box>
        </Box>

        <Stack direction="row" spacing={0.6} sx={{ mt: 1 }} flexWrap="wrap" useFlexGap>
          <Chip size="small" label={v.label} color={v.color} variant={stock.verdict === "HOLD" ? "outlined" : "filled"} sx={{ fontSize: "0.66rem", height: 22 }} />
          <Chip size="small" label={risk.label} color={risk.color} variant="outlined" sx={{ fontSize: "0.66rem", height: 22 }} />
          {stock.shariah && (
            <Chip size="small" label="☪" color="success" variant="outlined" sx={{ fontSize: "0.66rem", height: 22 }} title="Approx. Shariah-compliant" />
          )}
          {stock.sector && (
            <Chip size="small" label={stock.sector} variant="outlined" sx={{ fontSize: "0.62rem", height: 22, color: "text.secondary" }} />
          )}
        </Stack>

        <Box sx={{ display: "flex", alignItems: "center", gap: 1.5, mt: 1.2 }}>
          <Sparkline values={stock.spark} />
          <Stack spacing={0.3}>
            <Stat label="1mo" value={fmtPct(stock.chg20d)} color={deltaColor(theme, stock.chg20d)} />
            <Stat label="RSI" value={stock.rsi ?? "–"} />
            <Stat label="Range" value={`±${stock.expectedRangePct}%`} />
          </Stack>
        </Box>

        <Divider sx={{ my: 1.1 }} />

        <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
          <Typography sx={{ fontSize: "0.74rem", color: "text.secondary" }}>Relative strength</Typography>
          <Typography sx={{ fontSize: "0.78rem", fontWeight: 700, color: scoreColor }}>
            {stock.rankPct}
            <Box component="span" sx={{ fontWeight: 500, color: "text.secondary" }}>
              {" "}pctile · #{stock.rank}/{stock.rankTotal}
            </Box>
          </Typography>
        </Box>
        <LinearProgress
          variant="determinate"
          value={stock.rankPct}
          sx={{ height: 6, borderRadius: 999, mt: 0.6, "& .MuiLinearProgress-bar": { bgcolor: scoreColor } }}
          aria-label="Relative-strength percentile"
        />

        <Typography sx={{ fontSize: "0.71rem", color: "text.secondary", mt: 0.9 }}>
          {summarize(stock, model)}
        </Typography>

        {signals.length > 0 && (
          <Stack direction="row" spacing={0.5} sx={{ mt: 1 }} flexWrap="wrap" useFlexGap>
            {signals.map((g, i) => (
              <Chip key={i} size="small" label={g.text} variant="outlined" sx={{ fontSize: "0.62rem", height: 20 }} />
            ))}
          </Stack>
        )}
      </CardContent>
    </Card>
  );
}
