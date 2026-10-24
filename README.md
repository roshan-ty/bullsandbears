# Bulls & Bears Fundamentals

Bulls & Bears is an educational market-research dashboard for exploring economic releases, currency strength, market positioning, historical trends, and fundamental analysis.

## Using the dashboard

1. Start with **Home** for an overview of available market information and news.
2. Open **Data** and select an instrument to explore its economic context.
3. Use **Bias** to compare short-term and long-term model assessments.
4. Visit **CFTC** to review available trader-positioning reports.
5. Open **Historical Data** to explore observations over time.
6. Use **Analysis** to read the available fundamental assessment for your selected instrument.
7. Review **Top Setups** for instruments meeting the model's coverage and alignment criteria.
8. Check **Economic Calendar** for release times, previous values, forecasts, and reported actuals.

Use the instrument selector where available, switch between light and dark themes, and scroll wide tables horizontally on smaller screens. Click a news headline to read the linked article.

## Understanding the information

- **Bullish, bearish, and neutral** describe model assessments, not guaranteed outcomes.
- **Short term and long term** represent different research horizons and can disagree.
- **Coverage** indicates the available model inputs; it is not a probability of profit.
- **Unavailable** means there is insufficient information to display a result.
- **Stale or degraded** warnings mean information may be outdated or a refresh was incomplete.
- A dash indicates a missing value, not zero. Scheduled releases may not yet have actual values.

Always check timestamps and availability warnings. Prices are snapshots, not a live trading feed. The seven commodity price panels use explicitly labeled futures benchmarks with units; they are not spot/CFD execution quotes. Empty sections should not be interpreted as neutral market conditions.

## Run locally

Node 24 and Python 3.13+ are supported. On Windows, use `npm.cmd` if PowerShell blocks npm.ps1.

```powershell
npm.cmd ci
python -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r requirements.txt
npm.cmd run dev
```

Copy `.env.example` to `.env` and set `FRED_API_KEY`. The environment file, downloads, raw archives, research evidence and virtual environment are ignored by Git. Never use a `VITE_` variable for secrets.

```powershell
.\.venv\Scripts\python.exe scripts/pipeline.py core
.\.venv\Scripts\python.exe scripts/pipeline.py news
python -m unittest discover -s tests
npm.cmd test
npm.cmd run build
```

## GitHub operations

Pages uses the `Validate and deploy Pages` workflow. The two collection schedules are `Refresh news` at minutes 3/13/23/33/43/53 and `Refresh core fundamentals` at minute 17 every six hours (UTC). A separate deployment workflow publishes their output. They run on GitHub-hosted runners with the PC off. Scheduled execution can be delayed or dropped; public repository schedules can be disabled after 60 days without repository activity. These are scheduled snapshots, not a guaranteed real-time service.

The encrypted `FRED_API_KEY` repository Actions secret supplies the historical collector. Optional authorized calendar/news adapters accept JSON through the URL/key secrets shown in `.env.example`. They are not required for the default public collectors. Failed inputs retain their last validated observations. Check Actions failures and dataset timestamps; a successful build alone does not prove every feed is available.

## Scoring contract

The final request's **actual versus previous** rule is authoritative. Forecast remains visible but does not affect scoring. Revised previous values are used when explicitly published; the original is retained. Missing values, unknown indicator directions, speeches and policy text are unavailable, not neutral. No textual policy inference is fabricated.

Known indicator directions and impact weights are in `scripts/indicator_registry.py`. Currency contributions use the most recent released observation of each named indicator within each horizon, with time decay. A fixed scale and tanh keep scores bounded while preserving differences in the number of weighted bullish/bearish points. Pair strength is base minus quote, divided by two. Horizons use 30/180-day maximum ages and 10/60-day half lives. Positioning records older than 21 days cannot score. One futures-only report family and the largest open-interest contract per instrument are selected. TFF takes precedence for financial contracts, disaggregated for commodities, with legacy futures-only as a fallback. Selected trader categories contribute net contracts divided by open interest; TFF asset-manager and leveraged-money readings are averaged. Combined/supplemental reports never add a second vote; non-reportable is not a retail classification.

Setup alignment is a model magnitude, **not a probability of success**. Candidates require at least 60% input coverage, three scored releases, magnitude >= 0.30 and no opposing directional horizons. News, prices and yield history are excluded from both score calculation and driver selection. Their pipeline does not recalculate bias.

## Coverage limits

The watchlist contains all 81 requested markets and supports the supplied aliases. Available data does not cover every market equally. The default calendar covers the previous, current and next week, retaining observations for 180 days as they accumulate. A supplemental public calendar covers HKD, HUF, NOK, PLN, SEK, SGD, TRY, ZAR, BRL, CZK, DKK and MXN, completing calendar ingestion for all 21 watchlist currencies. Dated release pages backfill reported actual/previous values and six months of available observations. Historical entries without an explicit previous value remain display-only. The coverage table shows how much evidence is available; inclusion is not full coverage of every indicator. Historical charts include 17 fetched macro/yield series plus collected calendar observations; this is not a complete global historical archive.

The COT collector covers all seven structured report families: TFF, disaggregated and legacy (each futures-only and combined), plus supplemental commodity-index-trader reports. The main six are mapped to the watchlist; supplemental agricultural contracts are available as context. Pagination uses a bounded 100-day collection window, with a bounded annual ZIP/CSV fallback, independent family failure retention and up to three years of accumulated position curves. Report-family identity is retained through archives and chart filters. Weekly change requires consecutive seven-day report dates. The structured datasets replace any need to parse the same figures from arbitrary PDF/DOC/RAR files.

Crypto uses released US policy-rate and inflation changes as a shared liquidity backdrop, with direct futures positioning when available. It does not infer token fundamentals from every USD release. Macro-only crypto coverage is capped at 35%, excluding it from Top Setups. Index models separate positive growth/employment effects from negative inflation/policy-rate effects, include local and US policy context, and use direct index positioning when available. Regional proxies, assumed sensitivities and unmeasured sector/token fundamentals are stated in Analysis. These rules are not statistically calibrated forecasts. No trade entry, stop-loss or profit target is invented.

Public feed access varies. Some publishers block requests or require licensed feeds; the application does not bypass those restrictions or claim complete Bloomberg/Reuters coverage. News displays dated metadata with article links. Redistribution rights for a commercial launch need to be checked with the respective providers.

Source names are omitted from dashboard labels. **A public GitHub repository exposes its collector code and endpoints, and a static site's data can be downloaded.** `.gitignore` protects untracked credentials, not source-code confidentiality. Keeping collector implementation private requires a private repository/runner arrangement and suitable Pages plan; it cannot be achieved by hiding labels in HTML.

Research and verification notes: [docs/research.md](docs/research.md).

## Educational use

Bulls & Bears is for learning and independent research. Scores, analysis, and setups are not investment advice or promises of performance. Verify important information before making financial decisions.
