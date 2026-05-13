import express from "express";
import fetch from "node-fetch";
import dotenv from "dotenv";
import cors from "cors";

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;
const ALPHA_VANTAGE_API_KEY = process.env.ALPHA_VANTAGE_API_KEY;
const ALLOWED_ORIGIN = process.env.ALLOWED_ORIGIN || "*";

app.use(cors({
  origin: ALLOWED_ORIGIN === "*" ? "*" : ALLOWED_ORIGIN
}));

function num(value) {
  if (
    value === null ||
    value === undefined ||
    value === "" ||
    value === "None" ||
    value === "N/A" ||
    Number.isNaN(Number(value))
  ) {
    return null;
  }

  return Number(value);
}

function firstNumber(...values) {
  for (const value of values) {
    const n = num(value);
    if (n !== null) return n;
  }
  return null;
}

function average(values) {
  const nums = values.map(num).filter(v => v !== null);
  if (!nums.length) return null;
  return nums.reduce((sum, v) => sum + v, 0) / nums.length;
}

function passFail(value, testFn) {
  const n = num(value);
  if (n === null) return { pass: null, label: "N/A" };
  return testFn(n) ? { pass: true, label: "YES" } : { pass: false, label: "NO" };
}

function recommendationFromScore(score, totalApplicable) {
  if (totalApplicable === 0) return "Not enough data";

  const pct = score / totalApplicable;

  if (pct >= 0.9) return "Strong Buy Candidate";
  if (pct >= 0.75) return "Good Candidate";
  if (pct >= 0.55) return "Moderate / Needs More Analysis";
  if (pct >= 0.35) return "Speculative";
  return "Weak Fundamentals";
}

async function alphaVantage(params) {
  if (!ALPHA_VANTAGE_API_KEY) {
    throw new Error("Missing ALPHA_VANTAGE_API_KEY. Add it in Render Environment Variables.");
  }

  const url = new URL("https://www.alphavantage.co/query");

  Object.entries(params).forEach(([key, value]) => {
    url.searchParams.set(key, value);
  });

  url.searchParams.set("apikey", ALPHA_VANTAGE_API_KEY);

  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(`Alpha Vantage request failed: ${response.status}`);
  }

  const data = await response.json();

  if (data.Note) {
    throw new Error("Alpha Vantage rate limit reached. Try again later or reduce searches.");
  }

  if (data.Information) {
    throw new Error(data.Information);
  }

  if (data["Error Message"]) {
    throw new Error(data["Error Message"]);
  }

  return data;
}

function calculateRevenueGrowth(incomeStatement) {
  const reports = incomeStatement?.annualReports || [];

  if (reports.length < 2) return null;

  const latestRevenue = num(reports[0]?.totalRevenue);
  const priorRevenue = num(reports[1]?.totalRevenue);

  if (latestRevenue === null || priorRevenue === null || priorRevenue === 0) return null;

  return (latestRevenue - priorRevenue) / priorRevenue;
}

function calculateAvgRoe5Y(incomeStatement, balanceSheet) {
  const incomeReports = incomeStatement?.annualReports || [];
  const balanceReports = balanceSheet?.annualReports || [];

  const roes = [];

  for (let i = 0; i < Math.min(5, incomeReports.length, balanceReports.length); i++) {
    const netIncome = num(incomeReports[i]?.netIncome);
    const shareholderEquity = num(balanceReports[i]?.totalShareholderEquity);

    if (netIncome !== null && shareholderEquity !== null && shareholderEquity !== 0) {
      roes.push(netIncome / shareholderEquity);
    }
  }

  return average(roes);
}

function calculateQuickRatio(balanceSheet) {
  const latest = balanceSheet?.quarterlyReports?.[0] || balanceSheet?.annualReports?.[0];

  if (!latest) return null;

  const cash = firstNumber(
    latest.cashAndCashEquivalentsAtCarryingValue,
    latest.cashAndShortTermInvestments
  );

  const receivables = firstNumber(
    latest.currentNetReceivables,
    latest.netReceivables
  );

  const currentLiabilities = num(latest.totalCurrentLiabilities);

  if (cash === null || receivables === null || currentLiabilities === null || currentLiabilities === 0) {
    return null;
  }

  return (cash + receivables) / currentLiabilities;
}

function buildDecision(symbol, overview, quote, incomeStatement, balanceSheet) {
  const price = firstNumber(
    quote?.["Global Quote"]?.["05. price"],
    overview?.AnalystTargetPrice
  );

  const revenueGrowth = calculateRevenueGrowth(incomeStatement);

  const peRatio = firstNumber(
    overview?.PERatio,
    price && overview?.EPS ? price / num(overview.EPS) : null
  );

  const pegRatio = firstNumber(
    overview?.PEGRatio
  );

  const avgRoe5Y = firstNumber(
    overview?.ReturnOnEquityTTM,
    calculateAvgRoe5Y(incomeStatement, balanceSheet)
  );

  const quickRatio = calculateQuickRatio(balanceSheet);

  const checks = {
    revenueGrowth: passFail(revenueGrowth, v => v >= 0.10),
    peRatio: passFail(peRatio, v => v < 25),
    pegRatio: passFail(pegRatio, v => v < 2),
    avgRoe5Y: passFail(avgRoe5Y, v => v > 0.05),
    quickRatio: passFail(quickRatio, v => v > 1.5)
  };

  let score = 0;
  let totalApplicable = 0;

  Object.values(checks).forEach(check => {
    if (check.pass !== null) {
      totalApplicable += 1;
      if (check.pass) score += 1;
    }
  });

  const typeText = String(overview?.AssetType || "").toLowerCase();
  const isFund = ["etf", "fund", "mutual"].some(word => typeText.includes(word));

  const notes = [];

  if (isFund) {
    notes.push("This appears to be a fund or ETF. Company-style metrics such as ROE and quick ratio may be unavailable or less meaningful.");
  }

  if (checks.revenueGrowth.pass === false) notes.push("Revenue growth is below the 10% threshold.");
  if (checks.peRatio.pass === false) notes.push("P/E is above 25, which may indicate a richer valuation.");
  if (checks.pegRatio.pass === false) notes.push("PEG is above 2, suggesting valuation may be high relative to earnings growth.");
  if (checks.avgRoe5Y.pass === false) notes.push("Average ROE is below 5%, suggesting weak profitability.");
  if (checks.quickRatio.pass === false) notes.push("Quick ratio is below 1.5, suggesting possible liquidity concerns.");

  if (totalApplicable < 5) {
    notes.push("Some data was unavailable from the source, so the recommendation is based only on available fields.");
  }

  return {
    symbol,
    companyName: overview?.Name || "",
    type: overview?.Sector || overview?.AssetType || "",
    price,
    metrics: {
      revenueGrowth,
      peRatio,
      pegRatio,
      avgRoe5Y,
      quickRatio
    },
    checks,
    score,
    totalApplicable,
    recommendation: recommendationFromScore(score, totalApplicable),
    notes
  };
}

app.get("/", (req, res) => {
  res.json({
    status: "ok",
    message: "Investment Analyzer Backend is running with Alpha Vantage."
  });
});

app.get("/api/analyze/:symbol", async (req, res) => {
  try {
    const symbol = String(req.params.symbol || "").trim().toUpperCase();

    if (!/^[A-Z0-9.\-]{1,15}$/.test(symbol)) {
      return res.status(400).json({ error: "Invalid ticker symbol." });
    }

    const [overview, quote, incomeStatement, balanceSheet] = await Promise.all([
      alphaVantage({ function: "OVERVIEW", symbol }),
      alphaVantage({ function: "GLOBAL_QUOTE", symbol }),
      alphaVantage({ function: "INCOME_STATEMENT", symbol }),
      alphaVantage({ function: "BALANCE_SHEET", symbol })
    ]);

    if (!overview || Object.keys(overview).length === 0) {
      return res.status(404).json({ error: "No Alpha Vantage data found for that ticker." });
    }

    res.json(buildDecision(symbol, overview, quote, incomeStatement, balanceSheet));
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: error.message || "Unable to analyze ticker." });
  }
});

app.listen(PORT, () => {
  console.log(`Investment Analyzer Backend running on port ${PORT}`);
});
