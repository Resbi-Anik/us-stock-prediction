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
import { useTheme } from "@mui/material/styles";
import Sparkline from "./Sparkline.jsx";
import { fmtPct, fmtPrice, rateBucket, summarize } from "../format.js";
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

export default function StockCard({ stock, side }) {
  const theme = useTheme();
  const buy = side === "buy";
  const signals = stock.signals.filter((g) => g.side === side).slice(0, 3);
  const bucket = rateBucket(stock);
  const barColor =
    bucket.cls === "high" ? "success" : bucket.cls === "low" ? "error" : "primary";
  const bucketColor =
    bucket.cls === "high"
      ? deltaColor(theme, 1)
      : bucket.cls === "low"
      ? theme.palette.error.main
      : "text.secondary";

  return (
    <Card sx={{ mb: 1.2 }}>
      <CardContent>
        <Box sx={{ display: "flex", justifyContent: "space-between", gap: 1 }}>
          <Box>
            <Typography sx={{ fontSize: "1.05rem", fontWeight: 700 }}>
              {stock.symbol}
            </Typography>
            <Typography
              sx={{
                fontSize: "0.75rem",
                color: "text.secondary",
                maxWidth: 220,
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
            >
              {stock.name}
            </Typography>
            <Stack direction="row" spacing={0.8} sx={{ mt: 0.8 }}>
              <Chip
                size="small"
                icon={buy ? <TrendingUpIcon /> : <TrendingDownIcon />}
                label={buy ? "BUY CANDIDATE" : "SELL / AVOID"}
                color={buy ? "success" : "error"}
                variant="outlined"
                sx={{ fontSize: "0.68rem" }}
              />
              {stock.shariah && (
                <Chip
                  size="small"
                  label="☪ SHARIAH"
                  color="success"
                  variant="outlined"
                  sx={{ fontSize: "0.68rem" }}
                />
              )}
            </Stack>
          </Box>
          <Box sx={{ textAlign: "right" }}>
            <Typography sx={{ fontSize: "1.05rem", fontWeight: 600 }}>
              ${fmtPrice(stock.price)}
            </Typography>
            <Typography
              sx={{
                fontSize: "0.78rem",
                fontWeight: 600,
                color: deltaColor(theme, stock.chg5d),
              }}
            >
              {fmtPct(stock.chg5d)} this week
            </Typography>
          </Box>
        </Box>

        <Box sx={{ display: "flex", alignItems: "center", gap: 1.8, mt: 1.2 }}>
          <Sparkline values={stock.spark} />
          <Stack direction="row" spacing={1.8} flexWrap="wrap" useFlexGap>
            <Stat
              label="1mo"
              value={fmtPct(stock.chg20d)}
              color={deltaColor(theme, stock.chg20d)}
            />
            <Stat label="RSI" value={stock.rsi ?? "–"} />
            <Stat label="Strength" value={(buy ? stock.buyScore : stock.sellScore) + "/100"} />
            {stock.expectancy != null && (
              <Stat
                label="Edge"
                value={`${stock.expectancy > 0 ? "+" : ""}${stock.expectancy}%/wk`}
                color={deltaColor(theme, stock.expectancy)}
              />
            )}
          </Stack>
        </Box>

        <Divider sx={{ my: 1.2 }} />
        <Box sx={{ display: "flex", justifyContent: "space-between" }}>
          <Typography sx={{ fontSize: "0.75rem", color: "text.secondary" }}>
            Prediction rate
          </Typography>
          <Typography sx={{ fontSize: "0.75rem", fontWeight: 700 }}>
            {stock.predictionRate != null ? `${stock.predictionRate}%` : "n/a"}
            <Box component="span" sx={{ fontWeight: 500, color: bucketColor }}>
              {" "}· {bucket.label}
            </Box>
          </Typography>
        </Box>
        {stock.predictionRate != null && (
          <LinearProgress
            variant="determinate"
            value={stock.predictionRate}
            color={barColor}
            sx={{ height: 6, borderRadius: 999, mt: 0.8 }}
            aria-label="Historical prediction rate"
          />
        )}
        <Typography sx={{ fontSize: "0.72rem", color: "text.secondary", mt: 0.8 }}>
          {summarize(stock, side)}
        </Typography>

        {signals.length > 0 && (
          <Stack spacing={0.4} sx={{ mt: 1.2 }}>
            {signals.map((g, i) => (
              <Box key={i} sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                <Box
                  sx={{
                    width: 7,
                    height: 7,
                    borderRadius: "50%",
                    flexShrink: 0,
                    bgcolor: g.side === "buy" ? "success.main" : "error.main",
                  }}
                />
                <Typography sx={{ fontSize: "0.78rem", color: "text.secondary" }}>
                  {g.text}
                </Typography>
              </Box>
            ))}
          </Stack>
        )}
      </CardContent>
    </Card>
  );
}
