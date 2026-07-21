import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ThemeProvider } from "@mui/material/styles";
import CssBaseline from "@mui/material/CssBaseline";
import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import Button from "@mui/material/Button";
import IconButton from "@mui/material/IconButton";
import Alert from "@mui/material/Alert";
import Paper from "@mui/material/Paper";
import Switch from "@mui/material/Switch";
import CircularProgress from "@mui/material/CircularProgress";
import LinearProgress from "@mui/material/LinearProgress";
import Stack from "@mui/material/Stack";
import RefreshIcon from "@mui/icons-material/Refresh";
import DarkModeIcon from "@mui/icons-material/DarkMode";
import LightModeIcon from "@mui/icons-material/LightMode";
import ShowChartIcon from "@mui/icons-material/ShowChart";
import ArrowUpwardIcon from "@mui/icons-material/ArrowUpward";
import ArrowDownwardIcon from "@mui/icons-material/ArrowDownward";
import SummaryCard from "./components/SummaryCard.jsx";
import ModelReliabilityCard from "./components/ModelReliabilityCard.jsx";
import StockCard from "./components/StockCard.jsx";
import StockTable from "./components/StockTable.jsx";
import { rankAndTier, buildSummary } from "./summary.js";
import { getTheme, BRAND_GRADIENT } from "./theme.js";

const AUTO_REFRESH_SECONDS = 5 * 60;
const MAXW = 1360;

function initialMode() {
  const saved = localStorage.getItem("theme");
  if (saved === "light" || saved === "dark") return saved;
  return window.matchMedia("(prefers-color-scheme: dark)").matches
    ? "dark"
    : "light";
}

function SectionTitle({ icon, color, children, sub }) {
  return (
    <Box sx={{ mt: 1, mb: 1.4 }}>
      <Typography
        variant="h2"
        sx={{ display: "flex", alignItems: "center", gap: 0.8 }}
      >
        {icon}
        {children}
      </Typography>
      {sub && (
        <Typography
          sx={{ fontSize: "0.72rem", color: "text.secondary", mt: 0.2 }}
        >
          {sub}
        </Typography>
      )}
    </Box>
  );
}

const cardGrid = {
  display: "grid",
  gridTemplateColumns: {
    xs: "minmax(0, 1fr)",
    sm: "repeat(2, minmax(0, 1fr))",
    xl: "repeat(3, minmax(0, 1fr))",
  },
  gap: 1.5,
};

export default function App() {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [nextIn, setNextIn] = useState(AUTO_REFRESH_SECONDS);
  const [mode, setMode] = useState(initialMode);
  const [shariahOnly, setShariahOnly] = useState(
    () => localStorage.getItem("shariahOnly") === "1",
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

  const ranked = useMemo(() => {
    if (!data) return [];
    const visible = shariahOnly
      ? data.stocks.filter((s) => s.shariah)
      : data.stocks;
    return rankAndTier(visible);
  }, [data, shariahOnly]);

  const summary = data ? buildSummary(ranked) : null;
  const buys = ranked.filter((s) => s.verdict === "BUY");
  const sells = ranked
    .filter((s) => s.verdict === "SELL")
    .sort((a, b) => a.strengthScore - b.strengthScore);

  const headerInner = {
    maxWidth: MAXW,
    mx: "auto",
    px: { xs: 2, md: 3 },
    width: "100%",
  };

  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />

      {/* Sticky header */}
      <Box
        component="header"
        sx={{
          position: "sticky",
          top: 0,
          zIndex: 20,
          backdropFilter: "blur(14px)",
          WebkitBackdropFilter: "blur(14px)",
          bgcolor:
            mode === "light" ? "rgba(249,249,247,0.82)" : "rgba(13,13,13,0.82)",
          borderBottom: 1,
          borderColor: "divider",
        }}
      >
        <Box
          sx={{
            ...headerInner,
            py: 1.2,
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            gap: 1,
          }}
        >
          <Box>
            <Typography
              variant="h1"
              sx={{ display: "flex", alignItems: "center", gap: 0.8 }}
            >
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
            <Typography
              sx={{ fontSize: "0.75rem", color: "text.secondary", mt: 0.2 }}
            >
              {data
                ? `Updated ${new Date(data.generatedAt).toLocaleTimeString()} · ${ranked.length} stocks ranked${shariahOnly ? " (Shariah)" : ""}`
                : loading
                  ? "Scanning US stocks…"
                  : "Update failed"}
            </Typography>
          </Box>
          <Stack direction="row" spacing={1} alignItems="center">
            <Box
              sx={{
                display: { xs: "none", sm: "inline-flex" },
                alignItems: "center",
                gap: 0.7,
                height: 26,
                px: 1.1,
                borderRadius: 999,
                border: 1,
                borderColor: "divider",
                fontSize: "0.7rem",
                fontWeight: 500,
                lineHeight: 1,
                color: "text.primary",
                fontVariantNumeric: "tabular-nums",
                whiteSpace: "nowrap",
              }}
            >
              <Box
                sx={{
                  width: 7,
                  height: 7,
                  borderRadius: "50%",
                  flexShrink: 0,
                  bgcolor: "#0ca30c",
                  animation: "pulse 2s ease-in-out infinite",
                  "@keyframes pulse": {
                    "0%, 100%": { opacity: 1 },
                    "50%": { opacity: 0.3 },
                  },
                }}
              />
              <Box component="span" sx={{ lineHeight: 1 }}>
                {refreshing ? "Updating…" : `Live · ${countdown}`}
              </Box>
            </Box>
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
        {refreshing && <LinearProgress sx={{ height: 2 }} />}
      </Box>

      <Box sx={{ ...headerInner, py: 2 }}>
        <Alert
          severity="warning"
          variant="outlined"
          sx={{ fontSize: "0.76rem", mb: 2 }}
        >
          Educational tool, <b>not financial advice</b>. This ranks stocks by{" "}
          <b>relative strength</b> — a signal that held up out-of-sample —
          rather than claiming to call absolute up/down (which barely beats a
          coin flip). Size positions by the risk tier.
        </Alert>

        {loading && (
          <Box sx={{ textAlign: "center", py: 8, color: "text.secondary" }}>
            <CircularProgress size={30} sx={{ mb: 1.5 }} />
            <Typography>
              Fetching market data, training the model &amp; validating
              out-of-sample…
            </Typography>
          </Box>
        )}

        {error && !loading && (
          <Alert severity="error">
            Could not load market data ({error}). Check your connection and
            retry.
          </Alert>
        )}

        {data && !loading && (
          <Box
            sx={{
              display: "grid",
              gridTemplateColumns: {
                xs: "minmax(0, 1fr)",
                lg: "minmax(300px, 350px) minmax(0, 1fr)",
              },
              gap: { xs: 2, lg: 3 },
              alignItems: "start",
            }}
          >
            {/* Left rail — sticky on desktop */}
            <Box
              sx={{
                minWidth: 0,
                display: "flex",
                flexDirection: "column",
                gap: 2,
                position: { lg: "sticky" },
                top: { lg: 84 },
              }}
            >
              <Paper
                variant="outlined"
                sx={{
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
                  <Typography
                    sx={{ fontSize: "0.66rem", color: "text.secondary" }}
                  >
                    approximate — verify with Zoya or Musaffa
                  </Typography>
                </Box>
                <Switch
                  checked={shariahOnly}
                  onChange={toggleShariah}
                  color="success"
                  inputProps={{
                    "aria-label": "Show Shariah-compliant stocks only",
                  }}
                />
              </Paper>
              <ModelReliabilityCard model={data.model} />
              <SummaryCard
                summary={summary}
                scanned={ranked.length}
                market={data.market}
              />
            </Box>

            {/* Main content */}
            <Box sx={{ minWidth: 0 }}>
              <SectionTitle
                icon={
                  <ArrowUpwardIcon
                    fontSize="small"
                    sx={{ color: "success.main" }}
                  />
                }
                sub={`Strongest relative strength this ${data.horizonLabel.includes("month") ? "month" : "period"} — top ${buys.length} of ${ranked.length}. Ranked by the validated model.`}
              >
                Top ranked
              </SectionTitle>
              {buys.length > 0 ? (
                <Box sx={cardGrid}>
                  {buys.map((s) => (
                    <StockCard key={s.symbol} stock={s} model={data.model} />
                  ))}
                </Box>
              ) : (
                <Paper
                  variant="outlined"
                  sx={{ p: 2, color: "text.secondary", fontSize: "0.85rem" }}
                >
                  Nothing to show.
                </Paper>
              )}

              <Box sx={{ mt: 3 }}>
                <SectionTitle
                  icon={
                    <ArrowDownwardIcon
                      fontSize="small"
                      sx={{ color: "error.main" }}
                    />
                  }
                  sub={`Weakest relative strength — bottom ${sells.length}. Historically these lagged the top group.`}
                >
                  Bottom ranked (avoid)
                </SectionTitle>
                {sells.length > 0 ? (
                  <Box sx={cardGrid}>
                    {sells.map((s) => (
                      <StockCard key={s.symbol} stock={s} model={data.model} />
                    ))}
                  </Box>
                ) : (
                  <Paper
                    variant="outlined"
                    sx={{ p: 2, color: "text.secondary", fontSize: "0.85rem" }}
                  >
                    Nothing to show.
                  </Paper>
                )}
              </Box>

              <Box sx={{ mt: 3 }}>
                <SectionTitle sub="Full ranking, strongest to weakest.">
                  All {ranked.length}
                  {shariahOnly ? " Shariah-compliant" : ""} stocks
                </SectionTitle>
                <StockTable stocks={ranked} showShariah={!shariahOnly} />
              </Box>
            </Box>
          </Box>
        )}

        <Typography
          sx={{
            fontSize: "0.7rem",
            color: "text.secondary",
            textAlign: "center",
            py: 3,
          }}
        >
          Data: Yahoo Finance · Model retrained &amp; validated every refresh ·
          Auto-updates every 5 minutes ·
        </Typography>
      </Box>
    </ThemeProvider>
  );
}
