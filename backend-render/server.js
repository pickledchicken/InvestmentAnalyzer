import express from "express";
import fetch from "node-fetch";
import dotenv from "dotenv";
import cors from "cors";

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;
const FMP_API_KEY = process.env.FMP_API_KEY;
const ALLOWED_ORIGIN = process.env.ALLOWED_ORIGIN || "*";

app.use(cors({
  origin: ALLOWED_ORIGIN === "*" ? "*" : ALLOWED_ORIGIN
}));

function num(value) {
  if (value === null || value === undefined || value === "" || Number.isNaN(Number(value))) return null;
  return Number(value);
}

function firstNumber(...values) {
  for (const value of values) {
    const n = num(value);
    if (n !== null) return n;
  }
  return null;
}

function passFail(value, testFn) {
  const n = num(value);
  if (n === null) return { pass: null, label: "N/A" };
  return testFn(n) ? { pass: true, label: "YES" } : { pass: false, label: "NO" };
}

function average(values) {
  const nums = values.map(num).filter(v => v !== null);
  if (!nums.length) return null;
  return nums.reduce((sum, v) => sum + v, 0) / nums.length;
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

async function fmp(path) {
  if (!FMP_API_KEY) {
    throw new Error("Missing FMP_API_KEY. Add it in Render Environment Variables.");
  }

  const separator = path.includes("?") ? "&" : "?";
  const url = `https://financialmodelingprep.com/stable/${path}${separator}apikey=${FMP_API_KEY}`;
  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(`Financial Modeling Prep request failed: ${response.status}`);
  }

  return response.json();
}

function calculateRevenueGrowth(incomeStatements) {
  if (!Array.isArray(incomeStatements) || incomeStatements.length < 2) return null;

  const latestRevenue = num(incomeStatements[0]?.revenue);
  const priorRevenue = num(incomeStatements[1]?.revenue);

  if (latestRevenue === null || priorRevenue === null || priorRevenue === 0) return null;

  return (latestRevenue - priorRevenue) / priorRevenue;
}

function calculatePeRatio(price, incomeStatements) {
  const eps = firstNumber(
    incomeStatements?.[0]?.eps,
    incomeStatements?.[0]?.epsdiluted,
    incomeStatements?.[0]?.weightedAverageShsOutDil
  );

  const p = num(price);

  if (p === null) return null;

  const epsValue = firstNumber(incomeStatements?.[0]?.eps, incomeStatements?.[0]?.epsdiluted);

  if (epsValue === null || epsValue <= 0) return null;

  return p / epsValue;
}

function calculatePegRatio(peRatio, incomeStatements) {
  if (!Array.isArray(incomeStatements) || incomeStatements.length < 3) return null;

  const latestEps = firstNumber(incomeStatements[0]?.eps, incomeStatements[0]?.epsdiluted);
  const oldEps = firstNumber(incomeStatements[2]?.eps, incomeStatements[2]?.epsdiluted);

  if (latestEps === null || oldEps === null || oldEps <= 0 || latestEps <= 0 || peRatio === null) return null;

  const years = 2;
  const epsCagr = Math.pow(latestEps / oldEps, 1 / years) - 1;

  if (epsCagr <= 0) return null;

  return peRatio / (epsCagr * 100);
}

function buildDecision(symbol, profile, ratiosTtm, keyMetricsTtm, incomeStatements, ratiosAnnual) {
  const price = firstNumber(profile?.price, profile?.price);

  const revenueGrowth = firstNumber(
    incomeStatements?.[0]?.revenueGrowth,
    calculateRevenueGrowth(incomeStatements)
  );

  const peRatio = firstNumber(
    ratiosTtm?.priceEarningsRatioTTM,
    ratiosTtm?.peRatioTTM,
    keyMetricsTtm?.peRatioTTM,
    keyMetricsTtm?.peRatio,
    calculatePeRatio(price, incomeStatements)
  );

  const pegRatio = firstNumber(
    keyMetricsTtm?.pegRatioTTM,
    keyMetricsTtm?.pegRatio,
    ratiosTtm?.priceEarningsToGrowthRatioTTM,
    calculatePegRatio(peRatio, incomeStatements)
  );

  const quickRatio = firstNumber(
    ratiosTtm?.quickRatioTTM,
    ratiosTtm?.quickRatio
  );

  const annualRoes = Array.isArray(ratiosAnnual)
    ? ratiosAnnual.slice(0, 5).map(row =>
        firstNumber(row.returnOnEquity, row.returnOnEquityRatio, row.roe)
      )
    : [];

  const avgRoe5Y = average(annualRoes);

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

  const typeText = String(profile?.type || profile?.sector || "").toLowerCase();
  const isFund = ["etf", "fund", "mutual"].some(word => typeText.includes(word));

  const notes = [];

  if (isFund) {
    notes.push("This appears to be a fund or ETF. Company-style metrics such as ROE and quick ratio may be unavailable or less meaningful.");
  }

  if (checks.revenueGrowth.pass === false) notes.push("Revenue growth is below the 10% threshold.");
  if (checks.peRatio.pass === false) notes.push("P/E is above 25, which may indicate a richer valuation.");
  if (checks.pegRatio.pass === false) notes.push("PEG is above 2, suggesting valuation may be high relative to earnings growth.");
  if (checks.avgRoe5Y.pass === false) notes.push("Average 5-year ROE is below 5%, suggesting weak profitability.");
  if (checks.quickRatio.pass === false) notes.push("Quick ratio is below 1.5, suggesting possible liquidity concerns.");

  if (totalApplicable < 5) {
    notes.push("Some data was unavailable from the source, so the recommendation is based only on available fields.");
  }

  return {
    symbol,
    companyName: profile?.companyName || profile?.name || "",
    type: profile?.type || profile?.sector || "",
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
    message: "Investment Analyzer Backend is running."
  });
});

app.get("/api/analyze/:symbol", async (req, res) => {
  try {
    const symbol = String(req.params.symbol || "").trim().toUpperCase();

    if (!/^[A-Z0-9.\-]{1,15}$/.test(symbol)) {
      return res.status(400).json({ error: "Invalid ticker symbol." });
    }

    const [
      profileData,
      ratiosTtmData,
      keyMetricsTtmData,
      incomeStatementData,
      ratiosAnnualData
    ] = await Promise.all([
      fmp(`profile?symbol=${symbol}`),
      fmp(`ratios-ttm?symbol=${symbol}`),
      fmp(`key-metrics-ttm?symbol=${symbol}`),
      fmp(`income-statement?symbol=${symbol}&period=annual&limit=5`),
      fmp(`ratios?symbol=${symbol}&period=annual&limit=5`)
    ]);

    const profile = Array.isArray(profileData) ? profileData[0] : profileData;
    const ratiosTtm = Array.isArray(ratiosTtmData) ? ratiosTtmData[0] : ratiosTtmData;
    const keyMetricsTtm = Array.isArray(keyMetricsTtmData) ? keyMetricsTtmData[0] : keyMetricsTtmData;
    const incomeStatements = Array.isArray(incomeStatementData) ? incomeStatementData : [];
    const ratiosAnnual = Array.isArray(ratiosAnnualData) ? ratiosAnnualData : [];

    if (!profile && !ratiosTtm && !keyMetricsTtm && incomeStatements.length === 0) {
      return res.status(404).json({ error: "No source data found for that ticker." });
    }

    res.json(buildDecision(symbol, profile, ratiosTtm, keyMetricsTtm, incomeStatements, ratiosAnnual));
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: error.message || "Unable to analyze ticker." });
  }
});

app.listen(PORT, () => {
  console.log(`Investment Analyzer Backend running on port ${PORT}`);
});
