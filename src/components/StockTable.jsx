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
import { fmtPct, fmtPrice } from "../format.js";
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
            <TableCell align="right">1 mo</TableCell>
            <TableCell align="right">RSI</TableCell>
            <TableCell align="right">Pred. rate</TableCell>
            <TableCell align="right">Edge/wk</TableCell>
            {showShariah && (
              <TableCell align="center" title="Approximate Shariah screening">
                ☪
              </TableCell>
            )}
            <TableCell align="right">Signal</TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {stocks.map((s) => (
            <TableRow key={s.symbol} sx={{ "&:last-child td": { border: 0 } }}>
              <TableCell sx={{ fontWeight: 600 }}>{s.symbol}</TableCell>
              <TableCell align="right" sx={num}>
                ${fmtPrice(s.price)}
              </TableCell>
              <TableCell align="right" sx={{ ...num, color: deltaColor(theme, s.chg5d) }}>
                {fmtPct(s.chg5d)}
              </TableCell>
              <TableCell align="right" sx={{ ...num, color: deltaColor(theme, s.chg20d) }}>
                {fmtPct(s.chg20d)}
              </TableCell>
              <TableCell align="right" sx={num}>
                {s.rsi ?? "–"}
              </TableCell>
              <TableCell
                align="right"
                sx={num}
                title={
                  s.ciLow != null
                    ? `95% CI ${s.ciLow}–${s.ciHigh}% over ${s.backtestSamples} signals`
                    : undefined
                }
              >
                {s.predictionRate != null ? s.predictionRate + "%" : "–"}
              </TableCell>
              <TableCell
                align="right"
                sx={{
                  ...num,
                  color: s.expectancy != null ? deltaColor(theme, s.expectancy) : undefined,
                }}
              >
                {s.expectancy != null
                  ? (s.expectancy > 0 ? "+" : "") + s.expectancy + "%"
                  : "–"}
              </TableCell>
              {showShariah && (
                <TableCell align="center">
                  <Box
                    component="span"
                    sx={{ color: deltaColor(theme, 1), fontWeight: 700 }}
                    aria-label={
                      s.shariah
                        ? "Shariah-compliant (approximate)"
                        : "Not screened as compliant"
                    }
                  >
                    {s.shariah ? "✓" : "–"}
                  </Box>
                </TableCell>
              )}
              <TableCell align="right">
                <Chip
                  size="small"
                  label={s.verdict}
                  color={
                    s.verdict === "BUY"
                      ? "success"
                      : s.verdict === "SELL"
                      ? "error"
                      : "default"
                  }
                  variant="outlined"
                  sx={{ fontSize: "0.65rem" }}
                />
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </TableContainer>
  );
}
