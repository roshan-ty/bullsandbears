import type { DashboardSnapshot, HorizonBias, PairBias } from '../domain/types'
import { Empty } from './Chart'
import { formatTime } from '../lib/presentation'

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
  const name = (value: string) => value.replace('Base Â·', `${pair.base} Â·`).replace('Quote Â·', `${pair.quote} Â·`)
  const stale = !reading.updatedAt || Date.now() - Date.parse(reading.updatedAt) > 12 * 3600000
  return <section className="panel analyst-briefing"><h2>Market assessment</h2><div className="briefing-grid">
    <article><h3>Working thesis</h3><p>{available ? `${pair.symbol} has a ${reading.label} ${horizon === 'shortTerm' ? 'short-term' : 'long-term'} model reading (${signed(reading.score)}).` : 'The available evidence cannot establish a directional thesis.'} {opposed ? 'The other horizon points the opposite way; treat the timing and structural pictures separately.' : other.label === 'unavailable' ? 'The other horizon lacks sufficient evidence for confirmation.' : directional && other.label === reading.label ? 'Both horizons agree on direction, but they share inputs and are not independent confirmation.' : 'There is no confirmed directional agreement across both horizons.'}</p></article>
    <article><h3>Evidence and countercase</h3><p>{driver ? `${name(driver.name)} is the largest absolute contribution (${signed(driver.contribution)}).` : 'No material component contribution is available.'} {counter ? `${name(counter.name)} pushes against the selected bias (${signed(counter.contribution)}).` : directional ? 'No material opposing component is recorded; unmeasured risks can still challenge the thesis.' : 'The net reading is too balanced or incomplete to justify a directional conclusion.'}</p></article>
    <article><h3>Evidence quality</h3><p>{Math.round(reading.coverage * 100)}% input coverage Â· {reading.evidenceQuality ?? 'limited'} evidence. {stale ? 'The calculation timestamp is missing or over 12 hours old; refresh before relying on this reading.' : `Calculated ${formatTime(reading.updatedAt)}. Individual releases and positions have their own publication lags.`} {reading.componentConflict && 'Components conflict, reducing conviction.'}</p></article>
    <article><h3>Reassessment triggers</h3><p>{available ? 'Reassess when supporting release trends reverse, opposing inputs strengthen, or a new calculation changes the bias. ' : 'Wait for fresh, dated inputs before forming a thesis. '}Check the next relevant release, revisions and positioning update. A scheduled event or headline alone does not change the score; its verified data must enter the model.</p></article>
  </div></section>
}

export function Scorecard({ pair, reading, snapshot }: { pair: PairBias; reading: HorizonBias; snapshot: DashboardSnapshot }) {
  const components = reading.components ?? []
  const context = snapshot.prices.find((row) => row.instrument === pair.symbol)?.context
  return <section className="panel stack"><div><h2>What makes this reading?</h2></div>
    {components.length ? <div className="table-wrap"><table><thead><tr><th>Component</th><th>Input score</th><th>Signed weight</th><th>Contribution</th></tr></thead><tbody>{components.map((item) => <tr key={item.key}><td>{item.name.replace('Base Â·', `${pair.base} Â·`).replace('Quote Â·', `${pair.quote} Â·`)}</td><td>{item.score === null ? 'Unavailable' : signed(item.score)}</td><td>{item.available ? signed(item.weight) : 'â€”'}</td><td className={item.contribution < 0 ? 'negative-text' : item.contribution > 0 ? 'positive-text' : ''}>{item.available ? signed(item.contribution) : 'â€”'}</td></tr>)}<tr><td><strong>Total bias score</strong></td><td /><td /><td><strong>{signed(reading.score)}</strong></td></tr></tbody></table></div> : <Empty message="No complete score decomposition is available." />}

    <div><h2>Price confirmation Â· separate from bias</h2>{context ? <><div className="summary-strip"><div><span>Daily trend</span><strong>{context.trend}</strong><small>{context.asOf}</small></div><div><span>20-session return</span><strong>{context.return20 === null ? 'â€”' : `${signed(context.return20)}%`}</strong></div><div><span>20-session realized volatility</span><strong>{context.realizedVolatility20 === null ? 'â€”' : `${context.realizedVolatility20.toFixed(1)}%`}</strong><small>Annualized using {context.annualizationDays} days</small></div><div><span>Completed observations</span><strong>{context.observations}</strong></div></div><div className="filter-bar">{Object.entries(context.averages).map(([window, value]) => <span key={window}>SMA {window}: {value?.toLocaleString(undefined,{maximumFractionDigits:4}) ?? 'Unavailable'}</span>)}</div></> : <p className="muted">Daily price context unavailable.</p>}</div>
    <details><summary>Economic rules and conditions where they can fail</summary><div className="rule-grid">{snapshot.methodology?.map((rule) => <article key={rule.id}><h3>{rule.name}</h3><p>{rule.mechanism}</p><p><strong>Model assumption:</strong> {rule.mapping}</p><p className="muted">{rule.limit}</p></article>)}</div></details>
  </section>
}
