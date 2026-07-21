/**
 * Expanded ranking universe: ~120 liquid US large-caps across all 11 GICS
 * sectors, each tagged with sector (for sector-neutral ranking) and an
 * approximate Shariah-compliance flag.
 *
 * Shariah flags follow the spirit of common Islamic index screens
 * (exclude conventional banking/insurance, alcohol, tobacco, gambling,
 * pork, adult media, and heavily interest-leveraged balance sheets).
 * They are APPROXIMATE and informational — NOT a religious ruling. Verify
 * individual names with a screening service such as Zoya or Musaffa.
 *
 * Each entry: [symbol, sector, shariahCompliant]
 */
const SEC = {
  TECH: "Technology",
  COMM: "Communication",
  DISC: "Consumer Discretionary",
  STAP: "Consumer Staples",
  FIN: "Financials",
  HLTH: "Health Care",
  INDU: "Industrials",
  ENER: "Energy",
  MATL: "Materials",
  UTIL: "Utilities",
  RE: "Real Estate",
};

const RAW = [
  // Technology
  ["AAPL", SEC.TECH, true], ["MSFT", SEC.TECH, true], ["NVDA", SEC.TECH, true],
  ["AVGO", SEC.TECH, false], ["AMD", SEC.TECH, true], ["CRM", SEC.TECH, true],
  ["ORCL", SEC.TECH, false], ["ADBE", SEC.TECH, true], ["INTC", SEC.TECH, true],
  ["QCOM", SEC.TECH, true], ["TXN", SEC.TECH, true], ["AMAT", SEC.TECH, true],
  ["MU", SEC.TECH, true], ["LRCX", SEC.TECH, true], ["KLAC", SEC.TECH, true],
  ["NOW", SEC.TECH, true], ["INTU", SEC.TECH, true], ["ACN", SEC.TECH, true],
  ["IBM", SEC.TECH, false], ["CSCO", SEC.TECH, true], ["PANW", SEC.TECH, true],
  ["SNPS", SEC.TECH, true], ["CDNS", SEC.TECH, true], ["ANET", SEC.TECH, true],
  // Communication Services
  ["GOOGL", SEC.COMM, true], ["META", SEC.COMM, true], ["NFLX", SEC.COMM, false],
  ["DIS", SEC.COMM, false], ["CMCSA", SEC.COMM, false], ["T", SEC.COMM, false],
  ["VZ", SEC.COMM, false], ["TMUS", SEC.COMM, false], ["CHTR", SEC.COMM, false],
  // Consumer Discretionary
  ["AMZN", SEC.DISC, true], ["TSLA", SEC.DISC, true], ["HD", SEC.DISC, true],
  ["MCD", SEC.DISC, false], ["NKE", SEC.DISC, true], ["SBUX", SEC.DISC, true],
  ["LOW", SEC.DISC, true], ["BKNG", SEC.DISC, false], ["TJX", SEC.DISC, true],
  ["ORLY", SEC.DISC, true], ["CMG", SEC.DISC, true], ["MAR", SEC.DISC, false],
  ["GM", SEC.DISC, false], ["F", SEC.DISC, false],
  // Consumer Staples
  ["WMT", SEC.STAP, false], ["COST", SEC.STAP, false], ["PG", SEC.STAP, true],
  ["KO", SEC.STAP, true], ["PEP", SEC.STAP, true], ["PM", SEC.STAP, false],
  ["MO", SEC.STAP, false], ["MDLZ", SEC.STAP, true], ["CL", SEC.STAP, true],
  ["TGT", SEC.STAP, false],
  // Financials (conventional finance -> not compliant; V/MA payments kept)
  ["JPM", SEC.FIN, false], ["BAC", SEC.FIN, false], ["WFC", SEC.FIN, false],
  ["GS", SEC.FIN, false], ["MS", SEC.FIN, false], ["C", SEC.FIN, false],
  ["AXP", SEC.FIN, false], ["BLK", SEC.FIN, false], ["SCHW", SEC.FIN, false],
  ["SPGI", SEC.FIN, false], ["V", SEC.FIN, true], ["MA", SEC.FIN, true],
  ["BRK-B", SEC.FIN, false],
  // Health Care
  ["UNH", SEC.HLTH, false], ["JNJ", SEC.HLTH, true], ["LLY", SEC.HLTH, true],
  ["PFE", SEC.HLTH, true], ["MRK", SEC.HLTH, true], ["ABBV", SEC.HLTH, true],
  ["TMO", SEC.HLTH, true], ["ABT", SEC.HLTH, true], ["DHR", SEC.HLTH, true],
  ["AMGN", SEC.HLTH, true], ["BMY", SEC.HLTH, true], ["GILD", SEC.HLTH, true],
  ["CVS", SEC.HLTH, false], ["MDT", SEC.HLTH, true], ["ISRG", SEC.HLTH, true],
  ["VRTX", SEC.HLTH, true],
  // Industrials
  ["CAT", SEC.INDU, true], ["BA", SEC.INDU, false], ["GE", SEC.INDU, false],
  ["HON", SEC.INDU, true], ["UNP", SEC.INDU, true], ["UPS", SEC.INDU, true],
  ["RTX", SEC.INDU, false], ["LMT", SEC.INDU, false], ["DE", SEC.INDU, true],
  ["MMM", SEC.INDU, true], ["GD", SEC.INDU, false], ["NOC", SEC.INDU, false],
  ["ETN", SEC.INDU, true], ["EMR", SEC.INDU, true], ["CSX", SEC.INDU, true],
  // Energy
  ["XOM", SEC.ENER, true], ["CVX", SEC.ENER, true], ["COP", SEC.ENER, true],
  ["SLB", SEC.ENER, true], ["EOG", SEC.ENER, true], ["MPC", SEC.ENER, true],
  ["PSX", SEC.ENER, true], ["OXY", SEC.ENER, false], ["WMB", SEC.ENER, false],
  ["KMI", SEC.ENER, false],
  // Materials
  ["LIN", SEC.MATL, true], ["SHW", SEC.MATL, true], ["APD", SEC.MATL, true],
  ["FCX", SEC.MATL, true], ["NEM", SEC.MATL, true], ["NUE", SEC.MATL, true],
  ["DOW", SEC.MATL, true], ["ECL", SEC.MATL, true],
  // Utilities (interest-leveraged -> not compliant)
  ["NEE", SEC.UTIL, false], ["DUK", SEC.UTIL, false], ["SO", SEC.UTIL, false],
  ["D", SEC.UTIL, false],
  // Real Estate (REIT interest income -> not compliant)
  ["PLD", SEC.RE, false], ["AMT", SEC.RE, false], ["EQIX", SEC.RE, false],
];

const UNIVERSE = RAW.map(([symbol, sector, shariah]) => ({ symbol, sector, shariah }));
const WATCHLIST = UNIVERSE.map((u) => u.symbol);
const SECTOR_BY_SYMBOL = Object.fromEntries(UNIVERSE.map((u) => [u.symbol, u.sector]));
const SHARIAH_BY_SYMBOL = Object.fromEntries(UNIVERSE.map((u) => [u.symbol, u.shariah]));

module.exports = { UNIVERSE, WATCHLIST, SECTOR_BY_SYMBOL, SHARIAH_BY_SYMBOL, SEC };
