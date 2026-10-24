# Implementation research — 24 October 2026

This developer document is not bundled into the website.

- [REA](https://github.com/wolfcatalyst/reverse-engineer-anything), npm `rea-agents@6.7.0`, was run against the existing local `dist` bundle. Evidence `ev_788f5ab6c28750b0755973f4cbd0b745ecffa69dfc691237ff3a95d0d056725d` is retained locally in ignored `data/private/rea-analysis.json`. It reconstructed the existing JavaScript artifact graph. It did not establish proprietary features or predictive trading accuracy. No third-party binaries or paid screener code were copied.
- [cot_reports](https://github.com/NDelventhal/cot_reports) was reviewed for the CFTC annual archive URL structure and report families. The project's parser is an independent standard-library implementation, reads members in memory, and bounds expanded size. It does not use unrestricted extraction.
- [forfac](https://github.com/janickfarrell/forfac) was reviewed as a scheduled calendar collection example. Our parser reads the public page's JSON `days` array using `JSONDecoder`, never executes embedded JavaScript, and retains actual/forecast/revision fields. Three normal requests cover last/current/next week. A denied page is not bypassed.
- [OpenBB calendar reference](https://docs.openbb.co/odp/python/reference/economy/calendar/) was reviewed for provider separation. OpenBB is not a runtime dependency and its data-license terms do not grant redistribution rights to this project.
- [GitHub schedule limitations](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows#schedule) prevent an exact 10-minute or real-time uptime guarantee.

The implementation uses deterministic release comparisons and mapped positioning, not a trained forecast model. No backtest or claimed predictive accuracy has been fabricated. Feed health, actual publication times and missing-data states are preserved.


## Coverage expansion

- The [official CFTC reporting portal](https://publicreporting.cftc.gov/stories/s/r4w3-av2u) and its `/api/views/{id}.json` metadata were checked for the seven datasets: `gpe5-46if`, `yw9f-hn96`, `72hh-3qpy`, `kh3c-gbw2`, `6dca-aqww`, `jun7-fc8e`, `4zgm-a668`. Live supplemental rows mix field-name casing despite metadata casing; the adapter normalizes keys before category mapping. Report overlap is excluded from the score.
- [FX Blue's public calendar](https://www.fxblue.com/calendar) exposes dated releases and linked history pages for the twelve supplemental currencies. The collector decodes server-rendered JSON strings, follows only validated release identities on the same host, and never runs embedded JavaScript. It scales K/M/B/T values explicitly, retains zero revisions and series identity, and retrieves previous values from the release's own page. It never shifts historical actuals to invent previous values.
- The public Nasdaq calendar was probed and compared with [OpenBB's provider implementation](https://github.com/OpenBB-finance/OpenBB/blob/develop/openbb_platform/providers/nasdaq/openbb_nasdaq/models/economic_calendar.py). Some duplicate entries omit periodicity, so it was not adopted for bias scoring. A direct FXStreet endpoint required authentication; no access control was bypassed.
- The asset sensitivity model is transparent code in `scripts/asset_models.py`. Higher growth and tighter monetary conditions are separate channels. Correlations and expected returns have not been estimated; a macro backdrop must not be represented as token-specific evidence.
