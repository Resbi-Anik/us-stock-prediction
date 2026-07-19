import { createTheme } from "@mui/material/styles";

/**
 * App theme in both modes. Colors follow the validated data-viz palette:
 * series blue for neutral data marks, status green/red reserved for
 * good/critical (buy/sell), warm off-white / near-black surfaces.
 */
export function getTheme(mode) {
  const light = mode === "light";
  return createTheme({
    palette: {
      mode,
      primary: { main: light ? "#2a78d6" : "#3987e5" },
      success: {
        main: "#0ca30c",
        // readable "up" text on the light surface
        dark: light ? "#006300" : "#0ca30c",
      },
      error: { main: "#d03b3b" },
      background: {
        default: light ? "#f9f9f7" : "#0d0d0d",
        paper: light ? "#fcfcfb" : "#1a1a19",
      },
      text: {
        primary: light ? "#0b0b0b" : "#ffffff",
        secondary: light ? "#52514e" : "#c3c2b7",
      },
      divider: light ? "rgba(11,11,11,0.10)" : "rgba(255,255,255,0.10)",
    },
    shape: { borderRadius: 16 },
    typography: {
      fontFamily: 'system-ui, -apple-system, "Segoe UI", sans-serif',
      h1: { fontSize: "1.5rem", fontWeight: 800, letterSpacing: "-0.02em" },
      h2: { fontSize: "1rem", fontWeight: 700, letterSpacing: "-0.01em" },
    },
    components: {
      MuiButton: {
        styleOverrides: {
          root: { textTransform: "none", borderRadius: 999, fontWeight: 600 },
        },
      },
      MuiCard: {
        defaultProps: { variant: "outlined" },
        styleOverrides: {
          root: {
            transition: "box-shadow 0.2s ease, transform 0.2s ease",
            "&:hover": {
              boxShadow: light
                ? "0 8px 28px rgba(11, 11, 11, 0.08)"
                : "0 8px 28px rgba(0, 0, 0, 0.55)",
              transform: "translateY(-1px)",
            },
          },
        },
      },
      MuiChip: {
        styleOverrides: {
          label: { fontWeight: 700, letterSpacing: "0.04em" },
        },
      },
      MuiLinearProgress: {
        styleOverrides: {
          root: { borderRadius: 999 },
          bar: { borderRadius: 999 },
        },
      },
    },
  });
}

/** Gradient used for the brand title and accents (blue → aqua). */
export const BRAND_GRADIENT = "linear-gradient(90deg, #2a78d6, #1baf7a)";

/** Color for positive/negative delta text, readable in the current mode. */
export function deltaColor(theme, value) {
  if (value == null) return "text.secondary";
  return value >= 0 ? theme.palette.success.dark : theme.palette.error.main;
}
