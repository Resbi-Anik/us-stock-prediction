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
    <Paper variant="outlined" sx={{ p: 1.2, textAlign: "center" }}>
      <Typography sx={{ fontSize: "1.3rem", fontWeight: 700, color }}>{value}</Typography>
      <Typography sx={{ fontSize: "0.65rem", color: "text.secondary" }}>{label}</Typography>
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
        {market && (
          <Typography sx={{ fontSize: "0.8rem", mb: 1 }}>
            S&amp;P 500 regime:{" "}
            <Box
              component="b"
              sx={{ color: market.spyAbove200 ? deltaColor(theme, 1) : theme.palette.error.main }}
            >
              {market.spyAbove200 ? "risk-on (above 200-day average)" : "risk-off (below 200-day average)"}
            </Box>
            {market.spyChg20d != null && (
              <Box component="span" sx={{ color: "text.secondary" }}>
                {" "}· {fmtPct(market.spyChg20d)} past month
              </Box>
            )}
          </Typography>
        )}
        <Box
          sx={{
            display: "grid",
            gridTemplateColumns: { xs: "repeat(2, 1fr)", sm: "repeat(4, 1fr)" },
            gap: 1,
            my: 1,
          }}
        >
          <Tile value={summary.leanBuys} label="buy leans" color={deltaColor(theme, 1)} />
          <Tile value={summary.leanSells} label="sell leans" color="error.main" />
          <Tile value={summary.neutrals} label="neutral" />
          <Tile
            value={summary.avgExpectedRange != null ? "±" + summary.avgExpectedRange + "%" : "–"}
            label="avg 1-mo range"
          />
        </Box>
        <Typography sx={{ fontSize: "0.75rem", color: "text.secondary" }}>
          Average move this week across {scanned} stocks:{" "}
          <Box component="b" sx={{ color: deltaColor(theme, summary.avgWeekMove) }}>
            {fmtPct(summary.avgWeekMove)}
          </Box>
          . Cards are ranked by risk-adjusted conviction; "leans" are directional
          hints only — size positions by the risk tier, not the arrow.
        </Typography>
      </CardContent>
    </Card>
  );
}
