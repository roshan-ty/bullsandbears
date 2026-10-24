import { useState } from 'react'
import type { DashboardSnapshot, HorizonBias, PairBias, CotPosition } from '../domain/types'
import ReactECharts from './ChartRenderer'
import { Empty } from './Chart'
import { formatTime } from '../lib/presentation'
import { positionContext } from '../domain/research'

type Horizon = 'shortTerm' | 'longTerm'
const signed = (value: number) => `${value >= 0 ? '+' : ''}${value.toFixed(3)}`

export function AnalystBriefing({ pair, horizon }: { pair: PairBias; horizon: Horizon }) {
  const reading = pair[horizon]
  const other = pair[horizon === 'shortTerm' ? 'longTerm' : 'shortTerm']
  const available = reading.label !== 'unavailable'
  const directional = reading.label === 'bullish' || reading.label === 'bearish'
  const opposed = directional && other.label !== 'unavailable' && other.label !== 'neutral' && other.label !== reading.label
  const cards = [...(reading.components ?? [])].filter((item) => item.available && Math.abs(item.contribution) > .001).sort((a,b) => Math.abs(b.contribution) - Math.abs(a.contribution))
  const driver = cards[0]
  const counter = directional ? cards.find((item) => item.contribution * reading.score < 0) : undefined
  const name = (value: string) => value.replace('Base ·', `${pair.base} ·`).replace('Quote ·', `${pair.quote} ·`)
  const stale = !reading.updatedAt || Date.now() - Date.parse(reading.updatedAt) > 12 * 3600000
  return <section className="panel analyst-briefing"><p className="eyebrow">ANALYST BRIEFING</p><h2>The thesis, the countercase, and what changes it.</h2><div className="briefing-grid">
    <article><h3>Working thesis</h3><p>{available ? `${pair.symbol} has a ${reading.label} ${horizon === 'shortTerm' ? 'short-term' : 'long-term'} model reading (${signed(reading.score)}).` : 'The available evidence cannot establish a directional thesis.'} {opposed ? 'The other horizon points the opposite way; treat the timing and structural pictures separately.' : other.label === 'unavailable' ? 'The other horizon lacks sufficient evidence for confirmation.' : directional && other.label === reading.label ? 'Both horizons agree on direction, but they share inputs and are not independent confirmation.' : 'There is no confirmed directional agreement across both horizons.'}</p></article>
    <article><h3>Evidence and countercase</h3><p>{driver ? `${name(driver.name)} is the largest absolute contribution (${signed(driver.contribution)}).` : 'No material component contribution is available.'} {counter ? `${name(counter.name)} pushes against the selected bias (${signed(counter.contribution)}).` : directional ? 'No material opposing component is recorded; unmeasured risks can still challenge the thesis.' : 'The net reading is too balanced or incomplete to justify a directional conclusion.'}</p></article>
    <article><h3>Evidence quality</h3><p>{Math.round(reading.coverage * 100)}% input coverage · {reading.evidenceQuality ?? 'limited'} evidence. {stale ? 'The calculation timestamp is missing or over 12 hours old; refresh before relying on this reading.' : `Calculated ${formatTime(reading.updatedAt)}. Individual releases and positions have their own publication lags.`} {reading.componentConflict && 'Components conflict, reducing conviction.'}</p></article>
    <article><h3>Reassessment triggers</h3><p>{available ? 'Reassess when supporting release trends reverse, opposing inputs strengthen, or a new calculation changes the bias. ' : 'Wait for fresh, dated inputs before forming a thesis. '}Check the next relevant release, revisions and positioning update. A scheduled event or headline alone does not change the score; its verified data must enter the model.</p></article>
  </div><p className="footnote">A conditional research assessment, not a trade instruction or a calibrated probability. Actual versus previous drives the official release score; expectations and price context require separate judgment.</p></section>
}

export function Scorecard({ pair, reading, snapshot }: { pair: PairBias; reading: HorizonBias; snapshot: DashboardSnapshot }) {
  const components = reading.components ?? []
  const context = snapshot.prices.find((row) => row.instrument === pair.symbol)?.context
  return <section className="panel stack"><div><p className="eyebrow">AUDITABLE SCORECARD</p><h2>What makes this reading?</h2></div>
    {components.length ? <div className="table-wrap"><table><thead><tr><th>Component</th><th>Input score</th><th>Signed weight</th><th>Contribution</th></tr></thead><tbody>{components.map((item) => <tr key={item.key}><td>{item.name.replace('Base ·', `${pair.base} ·`).replace('Quote ·', `${pair.quote} ·`)}</td><td>{item.score === null ? 'Unavailable' : signed(item.score)}</td><td>{item.available ? signed(item.weight) : '—'}</td><td className={item.contribution < 0 ? 'negative-text' : item.contribution > 0 ? 'positive-text' : ''}>{item.available ? signed(item.contribution) : '—'}</td></tr>)}<tr><td><strong>Total bias score</strong></td><td /><td /><td><strong>{signed(reading.score)}</strong></td></tr></tbody></table></div> : <Empty message="No complete score decomposition is available." />}
    <p className="footnote">Contributions sum to the unrounded score. Forex quote-currency weights are negative. Missing inputs contribute no vote; available weights are normalized within each model, while coverage still records the gaps.</p>
    <div><h2>Price confirmation · separate from bias</h2>{context ? <><div className="summary-strip"><div><span>Daily trend</span><strong>{context.trend}</strong><small>{context.asOf}</small></div><div><span>20-session return</span><strong>{context.return20 === null ? '—' : `${signed(context.return20)}%`}</strong></div><div><span>20-session realized volatility</span><strong>{context.realizedVolatility20 === null ? '—' : `${context.realizedVolatility20.toFixed(1)}%`}</strong><small>Annualized using {context.annualizationDays} days</small></div><div><span>Completed observations</span><strong>{context.observations}</strong></div></div><div className="filter-bar">{Object.entries(context.averages).map(([window, value]) => <span key={window}>SMA {window}: {value?.toLocaleString(undefined,{maximumFractionDigits:4}) ?? 'Unavailable'}</span>)}</div><p className="footnote">{context.scope} Trend requires the completed daily close above or below all four moving averages; otherwise it is mixed.</p></> : <p className="muted">No complete daily price context is available. Technical trend, retail sentiment and seasonality never substitute for missing fundamental data.</p>}</div>
    <details><summary>Economic rules and conditions where they can fail</summary><div className="rule-grid">{snapshot.methodology?.map((rule) => <article key={rule.id}><h3>{rule.name}</h3><p>{rule.mechanism}</p><p><strong>Model assumption:</strong> {rule.mapping}</p><p className="muted">{rule.limit}</p></article>)}</div></details>
  </section>
}

export function MacroMap({ snapshot }: { snapshot: DashboardSnapshot }) {
  const [horizon, setHorizon] = useState<Horizon>('shortTerm')
  const [currency, setCurrency] = useState('all')
  const rules = (snapshot.methodology ?? []).filter((row) => row.indicators.length)
  const currencies = snapshot.currencies.filter((row) => (row[horizon].factors?.length ?? 0) > 0)
  const rows = currencies.filter((row) => currency === 'all' || row.symbol === currency)
  const latest = new Map<string, DashboardSnapshot['events'][number]>()
  for (const event of [...snapshot.events].sort((a,b) => a.occurredAt.localeCompare(b.occurredAt))) {
    const age = (Date.now() - Date.parse(event.occurredAt)) / 86400000
    if (event.actual !== null && event.forecast !== null && age >= 0 && age <= (horizon === 'shortTerm' ? 30 : 180) && (currency === 'all' || event.currency === currency)) latest.set(`${event.currency}:${event.seriesKey ?? event.name}`, event)
  }
  const surprises = [...latest.values()].sort((a,b) => b.occurredAt.localeCompare(a.occurredAt)).slice(0,60)
  return <div className="stack"><section className="panel"><p className="eyebrow">MACRO MAP</p><h1>Compare independent economic themes.</h1><div className="filter-bar"><select aria-label="Macro horizon" value={horizon} onChange={(event) => setHorizon(event.target.value as Horizon)}><option value="shortTerm">Short term · 30-day evidence</option><option value="longTerm">Long term · 180-day evidence</option></select><select aria-label="Macro currency" value={currency} onChange={(event) => setCurrency(event.target.value)}><option value="all">All available currencies</option>{currencies.map((row) => <option key={row.symbol}>{row.symbol}</option>)}</select></div>
    <p className="muted">Colours show the model's currency effect, not whether an economy is healthy or an asset is certain to rise. Each theme is bounded to ±3 points before aggregation.</p>
    {rows.length ? <div className="table-wrap"><table className="macro-map"><thead><tr><th>Currency</th>{rules.map((rule) => <th key={rule.id} title={rule.limit}>{rule.name}</th>)}</tr></thead><tbody>{rows.map((row) => <tr key={row.symbol}><td className="symbol">{row.symbol}</td>{rules.map((rule) => {
      const factor = row[horizon].factors?.find((item) => item.name === rule.id)
      return <td key={rule.id}><div className={factor ? factor.score > .08 ? 'heat-positive' : factor.score < -.08 ? 'heat-negative' : 'heat-neutral' : 'heat-missing'} title={`${rule.mapping} ${rule.limit}`}>{factor ? signed(factor.score) : '—'}<small>{factor ? `${factor.count} releases` : 'No eligible evidence'}</small></div></td>
    })}</tr>)}</tbody></table></div> : <Empty message="No released economic factors are available." />}
  </section><section className="panel"><p className="eyebrow">EXPECTATIONS CONTEXT</p><h2>Actual versus forecast</h2><p className="muted">Forecast surprises are shown separately. The official bias continues to compare actual with previous. Differences retain each release's units (percentage points for percentage releases) and must not be ranked across unrelated series.</p>{surprises.length ? <div className="table-wrap"><table><thead><tr><th>Released</th><th>Currency</th><th>Indicator</th><th>Actual</th><th>Previous</th><th>Forecast</th><th>Actual − forecast</th></tr></thead><tbody>{surprises.map((event) => <tr key={event.id}><td>{formatTime(event.occurredAt)}</td><td>{event.currency}</td><td>{event.name}</td><td>{event.actual?.toLocaleString()}</td><td>{event.previous?.toLocaleString() ?? '—'}</td><td>{event.forecast?.toLocaleString()}</td><td>{signed(event.actual! - event.forecast!)} {event.unit === '%' ? 'pp' : event.unit ?? ''}</td></tr>)}</tbody></table></div> : <Empty message="No dated releases with both actual and forecast are available in this window." />}</section></div>
}

export function PositionMetrics({ rows, history }: { rows: CotPosition[]; history: CotPosition[] }) {
  return rows.length ? <section><h2>Positioning change and historical context</h2><p className="muted">Compare each category with its own contract history. Four-week change uses exactly 28 days; the 13-week percentile needs at least 10 weekly observations. Extremes are context, not automatic reversal signals.</p><div className="table-wrap"><table><thead><tr><th>Contract / category</th><th>Net / open interest</th><th>4-week change</th><th>13-week percentile</th><th>Reports</th></tr></thead><tbody>{rows.map((row) => {
    const context = positionContext(row, history)
    return <tr key={`${row.marketId}-${row.category}`}><td>{row.marketId} · {row.category}</td><td>{context.current === null ? '—' : `${context.current.toFixed(1)}%`}</td><td>{context.change4w === null ? '—' : `${signed(context.change4w)} pp`}</td><td>{context.percentile === null ? 'Insufficient history' : `${context.percentile.toFixed(0)}th`}</td><td>{context.observations}</td></tr>
  })}</tbody></table></div></section> : null
}

export function ScoreJournal({ snapshot, instrument, horizon }: { snapshot: DashboardSnapshot; instrument: string; horizon: Horizon }) {
  const records = (snapshot.scoreHistory ?? []).filter((row) => row.instrument === instrument && row.horizon === horizon).sort((a,b) => a.recordedAt.localeCompare(b.recordedAt))
  const versions = [...new Set(records.map((row) => row.modelVersion))]
  const [chosenVersion, setVersion] = useState('')
  const version = versions.includes(chosenVersion) ? chosenVersion : versions.at(-1)
  const rows = records.filter((row) => row.modelVersion === version)
  return <section className="panel stack"><div className="page-head"><div><p className="eyebrow">LIVE SCORE JOURNAL</p><h2>What the model knew at the time</h2></div>{versions.length > 0 && <select aria-label="Journal model version" value={version} onChange={(event) => setVersion(event.target.value)}>{versions.map((item) => <option key={item}>{item}</option>)}</select>}</div><p className="muted">The first recorded score each UTC day is preserved. Historical prices and revised releases are never used to invent past scores. Reference prices are contemporaneously observed context, not executable entries or a return backtest.</p>
    {rows.length ? <><ReactECharts style={{height:300}} option={{tooltip:{trigger:'axis'},legend:{textStyle:{color:'#8993a3'}},grid:{left:55,right:70,bottom:45},xAxis:{type:'category',data:rows.map((row) => row.recordedAt.slice(0,10)),axisLabel:{color:'#8993a3'}},yAxis:[{type:'value',min:-1,max:1,axisLabel:{color:'#8993a3'}},{type:'value',scale:true,axisLabel:{color:'#8993a3'}}],series:[{name:'Recorded bias',type:'line',data:rows.map((row) => row.label === 'unavailable' ? null : row.score),showSymbol:true,connectNulls:false,lineStyle:{color:'#4e9fe8'}},{name:'Observed price (context)',type:'line',yAxisIndex:1,data:rows.map((row) => row.referencePrice),showSymbol:true,connectNulls:false,lineStyle:{color:'#8993a3'}}]}} /><p className="footnote">{rows.length} recorded day{rows.length === 1 ? '' : 's'} · Since {rows[0].recordedAt.slice(0,10)} · {rows.length < 30 ? 'Insufficient observations for performance evaluation.' : 'Predictive performance has not been validated.'}</p></> : <Empty message="No published score observations have been recorded for this instrument and horizon yet." />}
  </section>
}
