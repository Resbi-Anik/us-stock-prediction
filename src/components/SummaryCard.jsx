import Card from "@mui/material/Card";
import CardContent from "@mui/material/CardContent";
import Typography from "@mui/material/Typography";
import Paper from "@mui/material/Paper";
import Box from "@mui/material/Box";
import { useTheme } from "@mui/material/styles";
import { fmtPct } from "../format.js";
import { deltaColor } from "../theme.js";

function Tile({ value, label, color }) {
  return (
    <Paper variant="outlined" sx={{ p: 1.1, textAlign: "center" }}>
      <Typography sx={{ fontSize: "1.25rem", fontWeight: 700, color }}>{value}</Typography>
      <Typography sx={{ fontSize: "0.62rem", color: "text.secondary" }}>{label}</Typography>
    </Paper>
  );
}

export default function SummaryCard({ summary, scanned, market }) {
  const theme = useTheme();
  return (
    <Card>
      <CardContent>
        <Typography variant="h2" gutterBottom>
          This week at a glance
        </Typography>
        {market && (
          <Typography sx={{ fontSize: "0.78rem", mb: 1 }}>
            S&amp;P 500:{" "}
            <Box component="b" sx={{ color: market.spyAbove200 ? deltaColor(theme, 1) : theme.palette.error.main }}>
              {market.spyAbove200 ? "risk-on" : "risk-off"}
            </Box>
            {market.spyChg20d != null && (
              <Box component="span" sx={{ color: "text.secondary" }}>
                {" "}· {fmtPct(market.spyChg20d)} past month
              </Box>
            )}
          </Typography>
        )}
        <Box sx={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 0.8, my: 1 }}>
          <Tile value={summary.topRanked} label="top ranked" color={deltaColor(theme, 1)} />
          <Tile value={summary.bottomRanked} label="bottom ranked" color="error.main" />
          <Tile value={summary.neutrals} label="mid-pack" />
          <Tile value={summary.avgExpectedRange != null ? "±" + summary.avgExpectedRange + "%" : "–"} label="avg 1-mo range" />
        </Box>
        <Typography sx={{ fontSize: "0.72rem", color: "text.secondary" }}>
          {scanned} stocks ranked by relative strength. Avg move this week:{" "}
          <Box component="b" sx={{ color: deltaColor(theme, summary.avgWeekMove) }}>
            {fmtPct(summary.avgWeekMove)}
          </Box>
          {summary.top && (
            <>
              {" "}· Strongest: <b>{summary.top.symbol}</b>
            </>
          )}
          .
        </Typography>
      </CardContent>
    </Card>
  );
}
