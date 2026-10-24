# Implementation research — 24 October 2026

This developer document is not bundled into the website.

- [REA](https://github.com/wolfcatalyst/reverse-engineer-anything), npm `rea-agents@6.7.0`, was run against the existing local `dist` bundle. Evidence `ev_788f5ab6c28750b0755973f4cbd0b745ecffa69dfc691237ff3a95d0d056725d` is retained locally in ignored `data/private/rea-analysis.json`. It reconstructed the existing JavaScript artifact graph. It did not establish proprietary features or predictive trading accuracy. No third-party binaries or paid screener code were copied.
- [cot_reports](https://github.com/NDelventhal/cot_reports) was reviewed for the CFTC annual archive URL structure and report families. The project's parser is an independent standard-library implementation, reads members in memory, and bounds expanded size. It does not use unrestricted extraction.
- [forfac](https://github.com/janickfarrell/forfac) was reviewed as a scheduled calendar collection example. Our parser reads the public page's JSON `days` array using `JSONDecoder`, never executes embedded JavaScript, and retains actual/forecast/revision fields. Three normal requests cover last/current/next week. A denied page is not bypassed.
- [OpenBB calendar reference](https://docs.openbb.co/odp/python/reference/economy/calendar/) was reviewed for provider separation. OpenBB is not a runtime dependency and its data-license terms do not grant redistribution rights to this project.
- [GitHub schedule limitations](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows#schedule) prevent an exact 10-minute or real-time uptime guarantee.

The implementation uses deterministic release comparisons and mapped positioning, not a trained forecast model. No backtest or claimed predictive accuracy has been fabricated. Feed health, actual publication times and missing-data states are preserved.
