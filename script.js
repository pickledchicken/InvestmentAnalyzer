const form = document.getElementById("tickerForm");
const tickerInput = document.getElementById("ticker");
const statusBox = document.getElementById("status");
const resultCard = document.getElementById("resultCard");
const companyTitle = document.getElementById("companyTitle");
const securityMeta = document.getElementById("securityMeta");
const scoreText = document.getElementById("scoreText");
const recommendation = document.getElementById("recommendation");
const criteriaBody = document.getElementById("criteriaBody");
const notesBox = document.getElementById("notes");

function formatPercent(value) {
  if (value === null || value === undefined) return "N/A";
  return `${(value * 100).toFixed(2)}%`;
}

function formatNumber(value) {
  if (value === null || value === undefined) return "N/A";
  return Number(value).toFixed(2);
}

function passClass(check) {
  if (check.pass === true) return "pass";
  if (check.pass === false) return "fail";
  return "na";
}

function row(label, value, check, interpretation) {
  return `
    <tr>
      <td>${label}</td>
      <td>${value}</td>
      <td class="${passClass(check)}">${check.label}</td>
      <td>${interpretation}</td>
    </tr>
  `;
}

function showStatus(message, isError = false) {
  statusBox.textContent = message;
  statusBox.classList.remove("hidden");
  statusBox.style.background = isError ? "#fde8e8" : "#fff7df";
  statusBox.style.color = isError ? "#8a1f1f" : "#6b5100";
}

function hideStatus() {
  statusBox.classList.add("hidden");
}

function renderResult(data) {
  companyTitle.textContent = `${data.symbol}${data.companyName ? " — " + data.companyName : ""}`;
  securityMeta.textContent = `${data.type || "Security"}${data.price ? " • Price: $" + data.price.toFixed(2) : ""}`;
  scoreText.textContent = `${data.score}/${data.totalApplicable}`;
  recommendation.textContent = data.recommendation;

  criteriaBody.innerHTML = [
    row(
      "Revenue Growth ≥ 10%",
      formatPercent(data.metrics.revenueGrowth),
      data.checks.revenueGrowth,
      "No = low growth or slower recent expansion."
    ),
    row(
      "P/E Ratio < 25",
      formatNumber(data.metrics.peRatio),
      data.checks.peRatio,
      "No = may be richly valued or overvalued."
    ),
    row(
      "PEG Ratio < 2",
      formatNumber(data.metrics.pegRatio),
      data.checks.pegRatio,
      "No = valuation may be high relative to earnings growth."
    ),
    row(
      "Average ROE > 5% over 5 years",
      formatPercent(data.metrics.avgRoe5Y),
      data.checks.avgRoe5Y,
      "No = weaker profitability or inefficient equity use."
    ),
    row(
      "Quick Ratio > 1.5",
      formatNumber(data.metrics.quickRatio),
      data.checks.quickRatio,
      "No = possible liquidity concerns."
    )
  ].join("");

  const notes = data.notes?.length
    ? data.notes.map(note => `<li>${note}</li>`).join("")
    : "<li>No major automatic warnings based on the selected criteria.</li>";

  notesBox.innerHTML = `
    <h3>Automatic Notes</h3>
    <ul>${notes}</ul>
  `;

  resultCard.classList.remove("hidden");
}

form.addEventListener("submit", async (event) => {
  event.preventDefault();

  const ticker = tickerInput.value.trim().toUpperCase();
  if (!ticker) return;

  if (!API_BASE_URL || API_BASE_URL.includes("REPLACE-WITH")) {
    showStatus("Please update config.js with your Render backend URL first.", true);
    return;
  }

  resultCard.classList.add("hidden");
  showStatus(`Analyzing ${ticker}...`);

  try {
    const response = await fetch(`${API_BASE_URL}/api/analyze/${encodeURIComponent(ticker)}`);
    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || "Unable to analyze ticker.");
    }

    hideStatus();
    renderResult(data);
  } catch (error) {
    showStatus(error.message, true);
  }
});
