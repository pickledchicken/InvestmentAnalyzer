# Investment Analyzer Setup: GitHub Pages + Render + Financial Modeling Prep

This package has two parts:

1. `frontend-github-pages`
   - This goes to GitHub Pages.
   - It contains the public website files:
     - `index.html`
     - `style.css`
     - `script.js`
     - `config.js`

2. `backend-render`
   - This goes to Render.
   - It contains the private backend:
     - `server.js`
     - `package.json`
     - `.env.example`

## Why the app is split into two folders

GitHub Pages can host your website, but it cannot run a Node.js backend.

Render runs the backend. The backend keeps your Financial Modeling Prep API key private.

The final flow is:

User opens GitHub Pages website  
→ Website sends ticker to Render backend  
→ Render backend securely calls Financial Modeling Prep  
→ Data comes back to website  
→ Website shows score and recommendation

---

# Part 1: Get a Financial Modeling Prep API Key

1. Go to Financial Modeling Prep.
2. Create a free account.
3. Copy your API key.

You will use this key on Render only.

Do not paste the key into your frontend files.

---

# Part 2: Create a GitHub Repository

1. Go to GitHub.
2. Create a new repository.
3. Recommended name:
   `investment-analyzer`
4. Upload both folders:
   - `frontend-github-pages`
   - `backend-render`
   - `README-SETUP-INSTRUCTIONS.md`

---

# Part 3: Deploy the Backend on Render

1. Go to Render.
2. Create a new Web Service.
3. Connect your GitHub repository.
4. For the root directory, select:
   `backend-render`
5. Use these settings:

   Name:
   `investment-analyzer-backend`

   Runtime:
   `Node`

   Build Command:
   `npm install`

   Start Command:
   `npm start`

6. Add Environment Variables on Render:

   Key:
   `FMP_API_KEY`

   Value:
   Your Financial Modeling Prep API key

7. Optional environment variable while testing:

   Key:
   `ALLOWED_ORIGIN`

   Value:
   `*`

8. Deploy the service.

9. After deployment, Render will give you a URL like:

   `https://investment-analyzer-backend.onrender.com`

10. Test the backend by opening:

   `https://investment-analyzer-backend.onrender.com`

You should see a message saying the backend is running.

---

# Part 4: Connect the Frontend to Render

1. Open this file:

   `frontend-github-pages/config.js`

2. Replace this line:

```js
const API_BASE_URL = "https://REPLACE-WITH-YOUR-RENDER-URL.onrender.com";
```

with your real Render backend URL:

```js
const API_BASE_URL = "https://investment-analyzer-backend.onrender.com";
```

3. Save the file.
4. Commit and push the change to GitHub.

---

# Part 5: Enable GitHub Pages

1. Go to your GitHub repository.
2. Click Settings.
3. Click Pages.
4. Under Build and deployment:
   - Source: Deploy from a branch
   - Branch: main
   - Folder: `/frontend-github-pages`
5. Save.

GitHub will give you a website URL like:

`https://yourusername.github.io/investment-analyzer/`

Open it and test a ticker such as:

- MSFT
- AAPL
- COST
- SCHD

---

# Part 6: Lock Down CORS Later

At first, you can leave this Render environment variable as:

```text
ALLOWED_ORIGIN=*
```

After your GitHub Pages site is working, update it to your real GitHub Pages URL.

Example:

```text
ALLOWED_ORIGIN=https://yourusername.github.io
```

or, depending on how Render handles your site request:

```text
ALLOWED_ORIGIN=https://yourusername.github.io/investment-analyzer
```

If your site stops working after changing it, temporarily switch back to `*`.

---

# How the Recommendation Works

The app checks:

1. Revenue growth greater than or equal to 10%
2. P/E ratio less than 25
3. PEG ratio less than 2
4. Average ROE over the last 5 years greater than 5%
5. Quick ratio greater than 1.5

Recommendation scale:

| Score | Recommendation |
|---|---|
| 5/5 | Strong Buy Candidate |
| 4/5 | Good Candidate |
| 3/5 | Moderate / Needs More Analysis |
| 2/5 | Speculative |
| 0–1/5 | Weak Fundamentals |

If source data is missing, the app scores only the available fields.

---

# Important Analyst Notes

This tool is only a first-pass screen.

Also review:

- Free cash flow growth
- Debt-to-equity ratio
- Gross and operating margins
- Insider ownership
- Competitive moat
- Industry cyclicality
- Macroeconomic sensitivity
- Management quality

Special cases:

- Banks: quick ratio is less useful.
- Utilities: lower growth can be normal.
- REITs: FFO/AFFO may matter more than P/E.
- ETFs and mutual funds: company-level ROE and quick ratio may be unavailable or less meaningful.
- High-growth technology companies: high P/E may be normal if growth supports it.

---

# Troubleshooting

## Website says “Please update config.js”

You need to replace the placeholder URL in:

`frontend-github-pages/config.js`

with your real Render backend URL.

## Website says “Failed to fetch”

Possible causes:

1. Render backend is sleeping. Open your Render backend URL first.
2. Your Render service failed to deploy.
3. CORS setting is too strict.
4. API URL in `config.js` is wrong.

## Backend says “Missing FMP_API_KEY”

You did not add the `FMP_API_KEY` environment variable in Render.

## Ticker returns N/A values

That means the API did not return all company-style metrics.

This is common for:

- ETFs
- Mutual funds
- Banks
- REITs
- Some foreign securities
