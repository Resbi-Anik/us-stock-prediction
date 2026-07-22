import Table from "@mui/material/Table";
import TableBody from "@mui/material/TableBody";
import TableCell from "@mui/material/TableCell";
import TableContainer from "@mui/material/TableContainer";
import TableHead from "@mui/material/TableHead";
import TableRow from "@mui/material/TableRow";
import Paper from "@mui/material/Paper";
import Chip from "@mui/material/Chip";
import Box from "@mui/material/Box";
import { useTheme } from "@mui/material/styles";
import { fmtPct, fmtPrice, verdictMeta, riskMeta, analystMeta, newsMeta } from "../format.js";
import { deltaColor } from "../theme.js";

const num = { fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap" };

function toneColor(theme, tone) {
  return tone > 0 ? deltaColor(theme, 1) : tone < 0 ? theme.palette.error.main : undefined;
}

export default function StockTable({ stocks, showShariah = true }) {
  const theme = useTheme();
  return (
    <TableContainer component={Paper} variant="outlined">
      {/* denser cells: MUI's default 16px side padding wastes width across 14 columns */}
      <Table size="small" stickyHeader sx={{ "& .MuiTableCell-root": { px: 0.8 } }}>
        <TableHead>
          <TableRow>
            <TableCell>#</TableCell>
            <TableCell>Symbol</TableCell>
            <TableCell align="right">Price</TableCell>
            <TableCell align="right">1 wk</TableCell>
            <TableCell align="right">1 mo</TableCell>
            <TableCell align="right">RSI</TableCell>
            <TableCell align="right">Strength</TableCell>
            <TableCell align="right" title="Analyst consensus (number of analysts)">Analysts</TableCell>
            <TableCell align="right" title="Upside to the mean analyst price target">Target</TableCell>
            <TableCell align="right" title="News-headline tone over the last week">News</TableCell>
            <TableCell align="right">Range</TableCell>
            <TableCell align="center">Risk</TableCell>
            {showShariah && <TableCell align="center" title="Approximate Shariah screening">☪</TableCell>}
            <TableCell align="right">Lean</TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {stocks.map((s) => {
            const v = verdictMeta(s.verdict);
            const risk = riskMeta(s.riskTier);
            const scoreColor =
              s.verdict === "BUY" ? deltaColor(theme, 1) : s.verdict === "SELL" ? theme.palette.error.main : undefined;
            return (
              <TableRow key={s.symbol} hover sx={{ "&:last-child td": { border: 0 } }}>
                <TableCell sx={{ color: "text.secondary", ...num }}>{s.rank}</TableCell>
                <TableCell sx={{ fontWeight: 600 }}>{s.symbol}</TableCell>
                <TableCell align="right" sx={num}>${fmtPrice(s.price)}</TableCell>
                <TableCell align="right" sx={{ ...num, color: deltaColor(theme, s.chg5d) }}>{fmtPct(s.chg5d)}</TableCell>
                <TableCell align="right" sx={{ ...num, color: deltaColor(theme, s.chg20d) }}>{fmtPct(s.chg20d)}</TableCell>
                <TableCell align="right" sx={num}>{s.rsi ?? "–"}</TableCell>
                <TableCell align="right" sx={{ ...num, color: scoreColor, fontWeight: 600 }}>{s.rankPct}</TableCell>
                {(() => {
                  const a = analystMeta(s.analyst);
                  const n = newsMeta(s.news);
                  return (
                    <>
                      <TableCell align="right" sx={{ ...num, color: toneColor(theme, a?.tone ?? 0) }}>
                        {a ? `${a.label} (${s.analyst.count})` : "–"}
                      </TableCell>
                      <TableCell align="right" sx={{ ...num, color: deltaColor(theme, s.analyst?.targetUpsidePct) }}>
                        {s.analyst?.targetUpsidePct != null ? fmtPct(s.analyst.targetUpsidePct) : "–"}
                      </TableCell>
                      <TableCell align="right" sx={{ ...num, color: toneColor(theme, n?.tone ?? 0) }}>
                        {n ? n.label : "–"}
                      </TableCell>
                    </>
                  );
                })()}
                <TableCell align="right" sx={num}>±{s.expectedRangePct}%</TableCell>
                <TableCell align="center">
                  <Chip size="small" label={s.riskTier} color={risk.color} variant="outlined" sx={{ fontSize: "0.6rem", height: 20 }} />
                </TableCell>
                {showShariah && (
                  <TableCell align="center">
                    <Box component="span" sx={{ color: deltaColor(theme, 1), fontWeight: 700 }} aria-label={s.shariah ? "Shariah-compliant (approximate)" : "Not screened"}>
                      {s.shariah ? "✓" : "–"}
                    </Box>
                  </TableCell>
                )}
                <TableCell align="right">
                  <Chip size="small" label={v.label} color={v.color} variant="outlined" sx={{ fontSize: "0.58rem", height: 20 }} />
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </TableContainer>
  );
}
