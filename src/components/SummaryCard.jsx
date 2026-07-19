import Card from "@mui/material/Card";
import CardContent from "@mui/material/CardContent";
import Typography from "@mui/material/Typography";
import Paper from "@mui/material/Paper";
import Box from "@mui/material/Box";
import { useTheme } from "@mui/material/styles";
import { fmtPct } from "../format.js";
import { deltaColor } from "../theme.js";

const BREADTH_TEXT = {
  bullish: "Market breadth is bullish — more stocks are set up to rise than fall.",
  bearish: "Market breadth is bearish — more stocks are breaking down than rising.",
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

export default function SummaryCard({ summary, scanned }) {
  const theme = useTheme();
  return (
    <Card sx={{ mt: 2 }}>
      <CardContent>
        <Typography variant="h2" gutterBottom>
          This week at a glance
        </Typography>
        <Typography sx={{ fontSize: "0.82rem", color: "text.secondary" }}>
          {BREADTH_TEXT[summary.breadth]}
        </Typography>
        <Box
          sx={{
            display: "grid",
            gridTemplateColumns: { xs: "repeat(2, 1fr)", sm: "repeat(4, 1fr)" },
            gap: 1,
            my: 1.5,
          }}
        >
          <Tile value={summary.buys} label="buy signals" color={deltaColor(theme, 1)} />
          <Tile value={summary.sells} label="sell signals" color="error.main" />
          <Tile value={summary.holds} label="holds" />
          <Tile
            value={summary.avgPredictionRate != null ? summary.avgPredictionRate + "%" : "–"}
            label="avg prediction rate"
          />
        </Box>
        <Typography sx={{ fontSize: "0.75rem", color: "text.secondary" }}>
          Average move this week across {scanned} stocks:{" "}
          <Box component="b" sx={{ color: deltaColor(theme, summary.avgWeekMove) }}>
            {fmtPct(summary.avgWeekMove)}
          </Box>
          {summary.topBuy && (
            <>
              {" "}· Strongest buy: <b>{summary.topBuy.symbol}</b>
              {summary.topBuy.predictionRate != null &&
                ` (${summary.topBuy.predictionRate}% hit rate)`}
            </>
          )}
          {summary.topSell && (
            <>
              {" "}· Weakest: <b>{summary.topSell.symbol}</b>
              {summary.topSell.predictionRate != null &&
                ` (${summary.topSell.predictionRate}% hit rate)`}
            </>
          )}
        </Typography>
      </CardContent>
    </Card>
  );
}
