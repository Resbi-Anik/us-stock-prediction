import Card from "@mui/material/Card";
import CardContent from "@mui/material/CardContent";
import Typography from "@mui/material/Typography";
import Box from "@mui/material/Box";
import Paper from "@mui/material/Paper";
import HistoryIcon from "@mui/icons-material/History";
import { useTheme } from "@mui/material/styles";
import { deltaColor } from "../theme.js";

function Tile({ value, label, color }) {
  return (
    <Paper variant="outlined" sx={{ p: 1, textAlign: "center" }}>
      <Typography sx={{ fontSize: "1.05rem", fontWeight: 700, color }}>{value}</Typography>
      <Typography sx={{ fontSize: "0.6rem", color: "text.secondary" }}>{label}</Typography>
    </Paper>
  );
}

export default function TrackRecordCard({ track }) {
  const theme = useTheme();
  if (!track || !track.snapshots) return null;

  const fmt = (v) => (v == null ? "–" : (v > 0 ? "+" : "") + v + "%");
  const matured = track.matured > 0;

  return (
    <Card>
      <CardContent>
        <Typography variant="h2" sx={{ display: "flex", alignItems: "center", gap: 0.8, mb: 0.5 }}>
          <HistoryIcon fontSize="small" color="primary" /> Live track record
        </Typography>

        {matured ? (
          <>
            <Typography sx={{ fontSize: "0.73rem", color: "text.secondary", mb: 1 }}>
              Forward results — the app's own past picks, scored ~1 month later.
              Real, not backtested. Since {track.firstDate} · {track.matured} matured.
            </Typography>
            <Box sx={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 0.8 }}>
              <Tile
                value={fmt(track.avgSpread)}
                label="top − bottom / mo"
                color={track.avgSpread >= 0 ? deltaColor(theme, 1) : theme.palette.error.main}
              />
              <Tile value={track.winRate != null ? track.winRate + "%" : "–"} label="weeks top beat bottom" />
              <Tile
                value={fmt(track.avgTopReturn)}
                label="avg top-pick return"
                color={track.avgTopReturn >= 0 ? deltaColor(theme, 1) : theme.palette.error.main}
              />
              <Tile
                value={fmt(track.avgBottomReturn)}
                label="avg bottom-pick return"
                color={track.avgBottomReturn >= 0 ? deltaColor(theme, 1) : theme.palette.error.main}
              />
            </Box>
          </>
        ) : (
          <Typography sx={{ fontSize: "0.75rem", color: "text.secondary" }}>
            Recording live since <b>{track.firstDate}</b> — {track.snapshots}{" "}
            snapshot{track.snapshots === 1 ? "" : "s"} so far. This tracks the app's{" "}
            <b>actual future picks</b> (not a backtest); the first realized results
            appear in about <b>{track.daysToFirstResult} days</b>, once a month of
            picks has matured.
          </Typography>
        )}
      </CardContent>
    </Card>
  );
}
