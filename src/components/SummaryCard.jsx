import Card from "@mui/material/Card";
import CardContent from "@mui/material/CardContent";
import Typography from "@mui/material/Typography";
import Paper from "@mui/material/Paper";
import Box from "@mui/material/Box";
import { useTheme } from "@mui/material/styles";
import { fmtPct } from "../format.js";
import { deltaColor } from "../theme.js";

const BREADTH_TEXT = {
  bullish: "Market breadth is bullish — more stocks lean upward than downward.",
  bearish: "Market breadth is bearish — more stocks lean downward than upward.",
  mixed: "Market breadth is mixed — no clear direction across the watchlist.",
};

function Tile({ value, label, color }) {
  return (
    <Paper variant="outlined" sx={{ p: 1.2, textAlign: "center" }}>
      <Typography sx={{ fontSize: "1.3rem", fontWeight: 700, color }}>
        {value}
      </Typography>
      <Typography sx={{ fontSize: "0.65rem", color: "text.secondary" }}>
        {label}
      </Typography>
    </Paper>
  );
}

export default function SummaryCard({ summary, scanned, market }) {
  const theme = useTheme();
  return (
    <Card sx={{ mt: 2 }}>
      <CardContent>
        <Typography variant="h2" gutterBottom>
          This week at a glance
        </Typography>
        <Typography sx={{ fontSize: "0.82rem", color: "text.secondary" }}>
          {BREADTH_TEXT[summary.breadth]}
          {" "}Only setups that historically hit ≥52% with a positive edge on
          their own stock are shown as picks.
        </Typography>
        {market && (
          <Typography sx={{ fontSize: "0.78rem", mt: 0.6 }}>
            S&amp;P 500 regime:{" "}
            <Box
              component="b"
              sx={{
                color: market.spyAbove200
                  ? deltaColor(theme, 1)
                  : theme.palette.error.main,
              }}
            >
              {market.spyAbove200
                ? "risk-on (above its 200-day average)"
                : "risk-off (below its 200-day average)"}
            </Box>
            {market.spyChg20d != null && (
              <Box component="span" sx={{ color: "text.secondary" }}>
                {" "}· {fmtPct(market.spyChg20d)} over the past month
              </Box>
            )}
          </Typography>
        )}
        <Box
          sx={{
            display: "grid",
            gridTemplateColumns: { xs: "repeat(2, 1fr)", sm: "repeat(4, 1fr)" },
            gap: 1,
            my: 1.5,
          }}
        >
          <Tile value={summary.buys} label="qualified buys" color={deltaColor(theme, 1)} />
          <Tile value={summary.sells} label="qualified sells" color="error.main" />
          <Tile
            value={summary.avgPredictionRate != null ? summary.avgPredictionRate + "%" : "–"}
            label="picks' avg hit rate"
          />
          <Tile
            value={
              summary.avgEdge != null
                ? (summary.avgEdge > 0 ? "+" : "") + summary.avgEdge + "%"
                : "–"
            }
            label="picks' avg edge / week"
            color={summary.avgEdge > 0 ? deltaColor(theme, 1) : undefined}
          />
        </Box>
        <Typography sx={{ fontSize: "0.75rem", color: "text.secondary" }}>
          Average move this week across {scanned} stocks:{" "}
          <Box component="b" sx={{ color: deltaColor(theme, summary.avgWeekMove) }}>
            {fmtPct(summary.avgWeekMove)}
          </Box>
          {summary.topBuy && (
            <>
              {" "}· Top buy: <b>{summary.topBuy.symbol}</b>
              {summary.topBuy.predictionRate != null &&
                ` (${summary.topBuy.predictionRate}% hit rate)`}
            </>
          )}
          {summary.topSell && (
            <>
              {" "}· Top sell: <b>{summary.topSell.symbol}</b>
              {summary.topSell.predictionRate != null &&
                ` (${summary.topSell.predictionRate}% hit rate)`}
            </>
          )}
        </Typography>
      </CardContent>
    </Card>
  );
}
