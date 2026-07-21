import Card from "@mui/material/Card";
import CardContent from "@mui/material/CardContent";
import Typography from "@mui/material/Typography";
import Chip from "@mui/material/Chip";
import Box from "@mui/material/Box";
import Stack from "@mui/material/Stack";
import Divider from "@mui/material/Divider";
import LinearProgress from "@mui/material/LinearProgress";
import TrendingUpIcon from "@mui/icons-material/TrendingUp";
import TrendingDownIcon from "@mui/icons-material/TrendingDown";
import RemoveIcon from "@mui/icons-material/Remove";
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
  const signals = stock.signals.slice(0, 4);

  const Icon =
    stock.verdict === "BUY" ? TrendingUpIcon : stock.verdict === "SELL" ? TrendingDownIcon : RemoveIcon;

  // Direction bar: 50% is the neutral midpoint; fill shows the probability.
  const probColor =
    stock.edgePts >= 1 ? deltaColor(theme, 1) : stock.edgePts <= -1 ? theme.palette.error.main : theme.palette.text.secondary;

  return (
    <Card sx={{ mb: 1.2 }}>
      <CardContent>
        <Box sx={{ display: "flex", justifyContent: "space-between", gap: 1 }}>
          <Box>
            <Typography sx={{ fontSize: "1.05rem", fontWeight: 700 }}>{stock.symbol}</Typography>
            <Typography
              sx={{
                fontSize: "0.75rem",
                color: "text.secondary",
                maxWidth: 210,
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
            >
              {stock.name}
            </Typography>
            <Stack direction="row" spacing={0.8} sx={{ mt: 0.8 }} flexWrap="wrap" useFlexGap>
              <Chip
                size="small"
                icon={<Icon />}
                label={v.label}
                color={v.color}
                variant="outlined"
                sx={{ fontSize: "0.68rem" }}
              />
              <Chip
                size="small"
                label={risk.label}
                color={risk.color}
                variant="outlined"
                sx={{ fontSize: "0.68rem" }}
              />
              {stock.shariah && (
                <Chip size="small" label="☪ SHARIAH" color="success" variant="outlined" sx={{ fontSize: "0.68rem" }} />
              )}
            </Stack>
          </Box>
          <Box sx={{ textAlign: "right" }}>
            <Typography sx={{ fontSize: "1.05rem", fontWeight: 600 }}>${fmtPrice(stock.price)}</Typography>
            <Typography sx={{ fontSize: "0.78rem", fontWeight: 600, color: deltaColor(theme, stock.chg5d) }}>
              {fmtPct(stock.chg5d)} this week
            </Typography>
          </Box>
        </Box>

        <Box sx={{ display: "flex", alignItems: "center", gap: 1.8, mt: 1.2 }}>
          <Sparkline values={stock.spark} />
          <Stack direction="row" spacing={1.8} flexWrap="wrap" useFlexGap>
            <Stat label="1mo" value={fmtPct(stock.chg20d)} color={deltaColor(theme, stock.chg20d)} />
            <Stat label="RSI" value={stock.rsi ?? "–"} />
            <Stat
              label="Range"
              value={`±${stock.expectedRangePct}%`}
            />
          </Stack>
        </Box>

        <Divider sx={{ my: 1.2 }} />

        {/* Direction probability — honestly framed */}
        <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
          <Typography sx={{ fontSize: "0.75rem", color: "text.secondary" }}>
            Chance up (next month)
          </Typography>
          <Typography sx={{ fontSize: "0.8rem", fontWeight: 700, color: probColor }}>
            {stock.probUp}%
            <Box component="span" sx={{ fontWeight: 500, color: "text.secondary" }}>
              {" "}({stock.edgePts > 0 ? "+" : ""}{stock.edgePts} pts vs base)
            </Box>
          </Typography>
        </Box>
        <Box sx={{ position: "relative", mt: 0.6 }}>
          <LinearProgress
            variant="determinate"
            value={stock.probUp}
            sx={{
              height: 6,
              borderRadius: 999,
              "& .MuiLinearProgress-bar": { bgcolor: probColor },
            }}
          />
          {/* neutral 50% marker */}
          <Box
            sx={{
              position: "absolute",
              top: -2,
              left: "50%",
              width: "1px",
              height: 10,
              bgcolor: "text.secondary",
              opacity: 0.5,
            }}
          />
        </Box>

        <Typography sx={{ fontSize: "0.72rem", color: "text.secondary", mt: 0.8 }}>
          {summarize(stock, model)}
        </Typography>

        {signals.length > 0 && (
          <Box sx={{ mt: 1 }}>
            <Typography sx={{ fontSize: "0.68rem", color: "text.secondary", mb: 0.4 }}>
              Top factors behind this lean:
            </Typography>
            <Stack direction="row" spacing={0.6} flexWrap="wrap" useFlexGap>
              {signals.map((g, i) => (
                <Chip
                  key={i}
                  size="small"
                  label={g.text}
                  variant="outlined"
                  sx={{ fontSize: "0.64rem", height: 22 }}
                />
              ))}
            </Stack>
          </Box>
        )}
      </CardContent>
    </Card>
  );
}
