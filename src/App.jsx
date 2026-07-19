import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ThemeProvider } from "@mui/material/styles";
import CssBaseline from "@mui/material/CssBaseline";
import Container from "@mui/material/Container";
import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import Button from "@mui/material/Button";
import IconButton from "@mui/material/IconButton";
import Alert from "@mui/material/Alert";
import Paper from "@mui/material/Paper";
import Switch from "@mui/material/Switch";
import Chip from "@mui/material/Chip";
import CircularProgress from "@mui/material/CircularProgress";
import LinearProgress from "@mui/material/LinearProgress";
import Stack from "@mui/material/Stack";
import RefreshIcon from "@mui/icons-material/Refresh";
import DarkModeIcon from "@mui/icons-material/DarkMode";
import LightModeIcon from "@mui/icons-material/LightMode";
import ShowChartIcon from "@mui/icons-material/ShowChart";
import CircleIcon from "@mui/icons-material/Circle";
import SummaryCard from "./components/SummaryCard.jsx";
import StockCard from "./components/StockCard.jsx";
import StockTable from "./components/StockTable.jsx";
import { buildSummary } from "./summary.js";
import { getTheme, BRAND_GRADIENT } from "./theme.js";

const AUTO_REFRESH_SECONDS = 5 * 60;

function initialMode() {
  const saved = localStorage.getItem("theme");
  if (saved === "light" || saved === "dark") return saved;
  return window.matchMedia("(prefers-color-scheme: dark)").matches
    ? "dark"
    : "light";
}

function SectionTitle({ color, children }) {
  return (
    <Typography variant="h2" sx={{ mt: 3, mb: 1.2, display: "flex", alignItems: "center", gap: 1 }}>
      {color && <CircleIcon sx={{ fontSize: 10, color }} />}
      {children}
    </Typography>
  );
}

export default function App() {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [nextIn, setNextIn] = useState(AUTO_REFRESH_SECONDS);
  const [mode, setMode] = useState(initialMode);
  const [shariahOnly, setShariahOnly] = useState(
    () => localStorage.getItem("shariahOnly") === "1"
  );
  const loadingRef = useRef(false);

  const theme = useMemo(() => getTheme(mode), [mode]);

  const toggleMode = () =>
    setMode((m) => {
      const next = m === "light" ? "dark" : "light";
      localStorage.setItem("theme", next);
      return next;
    });

  const toggleShariah = (e) => {
    const on = e.target.checked;
    localStorage.setItem("shariahOnly", on ? "1" : "0");
    setShariahOnly(on);
  };

  /** background=true refreshes silently, keeping current data on screen. */
  const load = useCallback(async (background = false) => {
    if (loadingRef.current) return;
    loadingRef.current = true;
    if (background) setRefreshing(true);
    else setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/screen");
      if (!res.ok) throw new Error("Server error " + res.status);
      setData(await res.json());
    } catch (e) {
      if (!background) setError(e.message);
    } finally {
      loadingRef.current = false;
      setLoading(false);
      setRefreshing(false);
      setNextIn(AUTO_REFRESH_SECONDS);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  // Countdown tick: auto-refresh from the API when it reaches zero.
  useEffect(() => {
    const id = setInterval(() => {
      setNextIn((s) => {
        if (s <= 1) {
          load(true);
          return AUTO_REFRESH_SECONDS;
        }
        return s - 1;
      });
    }, 1000);
    return () => clearInterval(id);
  }, [load]);

  const countdown = `${Math.floor(nextIn / 60)}:${String(nextIn % 60).padStart(2, "0")}`;

  const visible = data
    ? shariahOnly
      ? data.stocks.filter((s) => s.shariah)
      : data.stocks
    : [];
  const summary = data ? buildSummary(visible) : null;
  const byRank = (a, b) => (b.rank ?? 0) - (a.rank ?? 0);
  const buys = visible.filter((s) => s.verdict === "BUY").sort(byRank).slice(0, 5);
  const sells = visible.filter((s) => s.verdict === "SELL").sort(byRank).slice(0, 5);

  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <Box
        component="header"
        sx={{
          position: "sticky",
          top: 0,
          zIndex: 10,
          backdropFilter: "blur(14px)",
          WebkitBackdropFilter: "blur(14px)",
          bgcolor:
            mode === "light" ? "rgba(249,249,247,0.82)" : "rgba(13,13,13,0.82)",
          borderBottom: 1,
          borderColor: "divider",
        }}
      >
        <Container maxWidth="sm" sx={{ py: 1.2 }}>
          <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 1 }}>
            <Box>
              <Typography variant="h1" sx={{ display: "flex", alignItems: "center", gap: 0.8 }}>
                <ShowChartIcon color="primary" />
                <Box
                  component="span"
                  sx={{
                    background: BRAND_GRADIENT,
                    WebkitBackgroundClip: "text",
                    WebkitTextFillColor: "transparent",
                    backgroundClip: "text",
                  }}
                >
                  Weekly Picks
                </Box>
              </Typography>
              <Typography sx={{ fontSize: "0.75rem", color: "text.secondary", mt: 0.2 }}>
                {data
                  ? `Updated ${new Date(data.generatedAt).toLocaleTimeString()} · ${
                      visible.length
                    } stocks${shariahOnly ? " (Shariah)" : ""}`
                  : loading
                  ? "Scanning US stocks…"
                  : "Update failed"}
              </Typography>
            </Box>
            <Stack direction="row" spacing={0.5} alignItems="center">
              <IconButton
                onClick={toggleMode}
                aria-label={`Switch to ${mode === "light" ? "dark" : "light"} theme`}
              >
                {mode === "light" ? <DarkModeIcon /> : <LightModeIcon />}
              </IconButton>
              <Button
                variant="outlined"
                size="small"
                startIcon={<RefreshIcon />}
                onClick={() => load(false)}
                disabled={loading || refreshing}
              >
                Refresh
              </Button>
            </Stack>
          </Box>
        </Container>
        {refreshing && (
          <LinearProgress sx={{ height: 2, position: "absolute", bottom: 0, left: 0, right: 0 }} />
        )}
      </Box>

      <Container maxWidth="sm" sx={{ py: 2 }}>
        <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap>
          <Chip
            size="small"
            icon={
              <CircleIcon
                sx={{
                  fontSize: 9,
                  color: "#0ca30c !important",
                  animation: "pulse 2s ease-in-out infinite",
                  "@keyframes pulse": {
                    "0%, 100%": { opacity: 1 },
                    "50%": { opacity: 0.35 },
                  },
                }}
              />
            }
            label={refreshing ? "Updating now…" : `Live · next update in ${countdown}`}
            variant="outlined"
            sx={{ fontSize: "0.7rem" }}
          />
        </Stack>

        <Alert severity="warning" variant="outlined" sx={{ mt: 1.5, fontSize: "0.75rem" }}>
          Educational tool, <b>not financial advice</b>. Prediction rates are
          historical backtest hit rates — past performance does not guarantee
          future results. Signals ignore news, earnings, and fundamentals.
        </Alert>

        <Paper
          variant="outlined"
          sx={{
            mt: 1,
            px: 1.5,
            py: 1,
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 1.5,
          }}
        >
          <Box>
            <Typography sx={{ fontSize: "0.85rem", fontWeight: 600 }}>
              ☪ Shariah-compliant only
            </Typography>
            <Typography sx={{ fontSize: "0.68rem", color: "text.secondary" }}>
              approximate screening — not a religious ruling; verify with a
              service like Zoya or Musaffa
            </Typography>
          </Box>
          <Switch
            checked={shariahOnly}
            onChange={toggleShariah}
            color="success"
            inputProps={{ "aria-label": "Show Shariah-compliant stocks only" }}
          />
        </Paper>

        {loading && (
          <Box sx={{ textAlign: "center", py: 6, color: "text.secondary" }}>
            <CircularProgress size={28} sx={{ mb: 1.5 }} />
            <Typography sx={{ fontSize: "0.9rem" }}>
              Fetching live market data &amp; running backtests…
            </Typography>
          </Box>
        )}

        {error && !loading && (
          <Alert severity="error" sx={{ mt: 2 }}>
            Could not load market data ({error}). Check your internet
            connection and try again.
          </Alert>
        )}

        {data && !loading && (
          <>
            <SummaryCard summary={summary} scanned={visible.length} market={data.market} />

            <SectionTitle color="success.main">
              Buy candidates this week
            </SectionTitle>
            {buys.length > 0 ? (
              buys.map((s) => <StockCard key={s.symbol} stock={s} side="buy" />)
            ) : (
              <Paper variant="outlined" sx={{ p: 2, color: "text.secondary", fontSize: "0.85rem" }}>
                No stock passes the reliability bar for buys right now
                (historical hit rate ≥ 52% with positive edge). Waiting is a
                position too.
              </Paper>
            )}

            <SectionTitle color="error.main">
              Sell / avoid this week
            </SectionTitle>
            {sells.length > 0 ? (
              sells.map((s) => <StockCard key={s.symbol} stock={s} side="sell" />)
            ) : (
              <Paper variant="outlined" sx={{ p: 2, color: "text.secondary", fontSize: "0.85rem" }}>
                No stock passes the reliability bar for sells right now.
              </Paper>
            )}

            <SectionTitle>
              All {visible.length}
              {shariahOnly ? " Shariah-compliant" : ""} stocks
            </SectionTitle>
            <StockTable stocks={visible} showShariah={!shariahOnly} />
          </>
        )}

        <Typography
          sx={{ fontSize: "0.7rem", color: "text.secondary", textAlign: "center", py: 3 }}
        >
          Data: Yahoo Finance · Auto-updates every 5 minutes · Built with
          Claude Code (Fable)
        </Typography>
      </Container>
    </ThemeProvider>
  );
}
