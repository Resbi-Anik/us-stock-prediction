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
import { fmtPct, fmtPrice, verdictMeta, riskMeta } from "../format.js";
import { deltaColor } from "../theme.js";

const num = { fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap" };

export default function StockTable({ stocks, showShariah = true }) {
  const theme = useTheme();
  return (
    <TableContainer component={Paper} variant="outlined">
      <Table size="small">
        <TableHead>
          <TableRow>
            <TableCell>Symbol</TableCell>
            <TableCell align="right">Price</TableCell>
            <TableCell align="right">1 wk</TableCell>
            <TableCell align="right">Chance&nbsp;↑</TableCell>
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
            return (
              <TableRow key={s.symbol} sx={{ "&:last-child td": { border: 0 } }}>
                <TableCell sx={{ fontWeight: 600 }}>{s.symbol}</TableCell>
                <TableCell align="right" sx={num}>${fmtPrice(s.price)}</TableCell>
                <TableCell align="right" sx={{ ...num, color: deltaColor(theme, s.chg5d) }}>
                  {fmtPct(s.chg5d)}
                </TableCell>
                <TableCell
                  align="right"
                  sx={{ ...num, color: s.edgePts >= 1 ? deltaColor(theme, 1) : s.edgePts <= -1 ? theme.palette.error.main : undefined }}
                >
                  {s.probUp}%
                </TableCell>
                <TableCell align="right" sx={num}>±{s.expectedRangePct}%</TableCell>
                <TableCell align="center">
                  <Chip size="small" label={s.riskTier} color={risk.color} variant="outlined" sx={{ fontSize: "0.6rem", height: 20 }} />
                </TableCell>
                {showShariah && (
                  <TableCell align="center">
                    <Box
                      component="span"
                      sx={{ color: deltaColor(theme, 1), fontWeight: 700 }}
                      aria-label={s.shariah ? "Shariah-compliant (approximate)" : "Not screened as compliant"}
                    >
                      {s.shariah ? "✓" : "–"}
                    </Box>
                  </TableCell>
                )}
                <TableCell align="right">
                  <Chip size="small" label={v.label.replace("LEAN ", "")} color={v.color} variant="outlined" sx={{ fontSize: "0.6rem", height: 20 }} />
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </TableContainer>
  );
}
