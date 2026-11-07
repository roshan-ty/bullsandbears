# Bulls & Bears Screener — Free

Market research for desktop and mobile browsers. Includes Home, Data, Bias, Journal, Analysis, Economical Calendar, Partners and Get Full Version.

## Run

Node.js 24 and Python 3.13 are used by the hosted workflow.

```sh
npm ci
npm run dev
```

```sh
npm run lint
npm test
npm run build
```

## Hosted application

The main branch is published to GitHub Pages by `.github/workflows/publish.yml`. Set Pages to **GitHub Actions**. The site remains available independently of any personal computer. Shared market state is compressed in `data/state.json.gz`; only the restricted free dataset is included in the deployed site.

Core research updates every six hours. Economic releases update twice an hour. The browser checks the published snapshot every five minutes. Scheduled jobs may be delayed by the hosting platform; the app displays data freshness and retains the last successful publication if an update fails.

The optional `FRED_API_KEY` repository Actions secret extends collection coverage. Credentials must never be committed or exposed through frontend environment variables. No account passwords or user trades belong in this repository.

## Journal

Personal journals stay in the current browser on the current device. Manual accounts, open and closed trades, win rate, calendar P&L, CSV export, and JSON backup/restore are available. Use backups before clearing browser data or changing devices. No cloud account sync or desktop account connector is included in the free edition.

## Full version

The purchase page opens the user's mail application addressed to bullsandbears@gmail.com. It displays the $1,000 regular price and current $500 offer. Desktop application packages and activation assets are not part of this repository.
