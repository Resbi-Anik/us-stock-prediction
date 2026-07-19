import { useTheme } from "@mui/material/styles";

export default function Sparkline({ values, width = 132, height = 40 }) {
  const theme = useTheme();
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const points = values
    .map(
      (v, i) =>
        `${(i / (values.length - 1)) * (width - 4) + 2},${
          height - 3 - ((v - min) / range) * (height - 6)
        }`
    )
    .join(" ");
  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      role="img"
      aria-label="30-day price trend"
      style={{ flex: `0 0 ${width}px` }}
    >
      <polyline
        points={points}
        fill="none"
        stroke={theme.palette.primary.main}
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
