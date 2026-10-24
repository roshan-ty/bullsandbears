# Public feature reconstruction — 24 October 2026

We used [REA](https://github.com/morluto/rea) to inspect public EdgeFinder assets and [Scrapling](https://github.com/d4vinci/Scrapling) to collect public HTML. This is an independent implementation of documented research features. It is not EdgeFinder's proprietary model, a recovered set of private weights, or an empirically validated return forecast.

## Evidence and scope

Scrapling 0.5 fetched six public pages: the [overview](https://www.a1trading.com/edgefinder/), [asset scorecards](https://www.a1trading.com/asset-scorecards/), [top setups](https://www.a1trading.com/top-setups/), [economic heatmap](https://www.a1trading.com/economic-heatmap/), [COT data](https://www.a1trading.com/cot-data/) and [retail sentiment](https://www.a1trading.com/retail-sentiment/). Eight same-origin external JavaScript files and 47 deduplicated inline bodies were saved with content hashes. No login or protected application was accessed. Target JavaScript was not executed.

REA CLI `rea-agents@6.7.0` ran `analyze-javascript-application` against that local directory with `--json`. The final evidence ID is `ev_c679d3c80da2da3fd2588392684499a90567332cb4dbe84baefff95bab9afb07`, with root digest `65c4b3644ffbe7ee60f53aa026dce0f915da07d552d8f0628fc6e19575a7948a`. It inventoried 63 relevant files, processed 55 JavaScript files, visited 57,009 AST nodes and found no integrity contradictions. One extracted body failed JavaScript parsing: it is JSON containing browser prefetch/speculation rules, not a scoring formula. Four other files have partial parse status. REA's HTML-inline coverage warning remains in the evidence; the separate extracted files cover those bodies, subject to these parse limits. Static results cannot establish runtime behavior or the absence of private functionality.

The inspected public code consists of site, plugin, analytics and presentation behavior. It does not establish a proprietary trading algorithm. Raw HTML, third-party scripts, manifests and full REA evidence remain in ignored local `data/private/` research artifacts; third-party code is not incorporated into the application.

## Feature mapping

| Publicly described feature | Independent implementation | Boundary |
| --- | --- | --- |
| Asset scorecards | Analysis shows input scores, signed weights, contributions and the exact reconciled total for both horizons. | Existing actual-versus-previous model and its own scale remain authoritative. |
| Economic heatmap | Macro Map compares independent policy, inflation, labour, growth, external and inventory factors across currencies. | Missing evidence is distinct from neutral. Actual-versus-forecast differences are separate context, in original units. |
| COT analysis | Family/contract/category-specific net/open-interest, exact four-week change and 13-week percentile. | At least ten observations spanning nine weeks for a percentile; no automatic contrarian rule. |
| Trend/volatility context | Completed daily prices provide 20/50/100/200 simple moving averages, 20-session return and annualized realized volatility. | Excluded from fundamental scores. Futures rolls and benchmark basis affect commodity context. |
| Watchlists and setups | Persistent personal watchlist complements existing asset filters and coverage-gated setup ranking. | Browser-local preferences; no private EdgeFinder ranking thresholds copied. |
| Score history | First published daily observation per instrument, horizon and model is retained with an observed reference price. | No fabricated historical scores or return backtest; different model versions are separated. |
| Retail sentiment | No substitute dataset added. | CFTC non-reportable positions are not retail sentiment. A verified appropriate feed is still needed. |
| Seasonality | Not scored or fabricated. | A sufficiently long, adjusted and validated asset-specific history is still needed. |

## Economic rulebook

`scripts/fundamental_rules.py` defines mechanisms, implemented mappings, failure conditions and references. Those rules feed both classification and human-readable analysis. Primary references include the [Federal Reserve policy transmission explanation](https://www.federalreserve.gov/monetarypolicy/monetary-policy-what-are-its-goals-how-does-it-work.htm), [BLS labour definitions](https://www.bls.gov/cps/definitions.htm), [BEA GDP explanation](https://www.bea.gov/resources/learning-center/what-to-know-gdp), [EIA weekly petroleum statistics](https://www.eia.gov/petroleum/supply/weekly/), [CFTC explanatory notes](https://www.cftc.gov/MarketReports/CommitmentsofTraders/ExplanatoryNotes/index.htm) and [Coin Metrics API documentation](https://docs.coinmetrics.io/api/v4/). These pages were successfully fetched during the research pass.

These references support the economic concepts or data definitions. They do **not** validate our chosen trading signs, weights, thresholds or profitability. Inflation can weaken a currency through credibility effects; strong employment can depress equities through rates; on-chain activity need not accrue value to a token. The app states these conditional relationships. Prices, news and forecast surprises remain outside the official actual-versus-previous bias. Existing factor caps, freshness checks, incomplete-coverage penalties and horizon separation remain in force.

The journal starts with real observations on 24 October 2026. It is infrastructure for later prospective evaluation, not evidence of forecasting accuracy. Revised historical macro data cannot reconstruct what was known at an earlier trading decision.

## Scraping and operational checks

Production calendar HTML now uses pinned `scrapling[fetchers]==0.5`, HTTPS host allowlisting, certificate verification, no redirects, two bounded attempts and bounded Retry-After handling. Strict selectors and JSON decoding extract data without executing target scripts. Adaptive financial selectors, CAPTCHA circumvention and stealth browser fallback are disabled. API and RSS collectors retain their existing transports. Collection failures preserve dated prior observations and surface feed-health warnings; no library guarantees uninterrupted access.

Tests cover contribution reconciliation, FX quote signs, missing crypto factors, immutable daily records and concurrent publication, completed-day price windows, asset-specific volatility annualization, COT history isolation and percentile ties, scraping denial/retries, watchlists, heatmap missing values and model-separated journals. Production archive verification checks that historical arrays, including the score journal, match the source snapshot and content hash.
