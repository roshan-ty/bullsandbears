import { useState } from 'react'
import ReactECharts from 'echarts-for-react'
import type { DashboardSnapshot } from '../domain/types'
import { Empty, HistoryChart } from './Chart'

export function HistoryExplorer({ points }: { points: DashboardSnapshot['history'] }) {
  const series = [...new Map(points.map((point) => [point.seriesId, point])).values()]
  const [chosen, setChosen] = useState('')
  const [range, setRange] = useState('365')
  const active = series.find((item) => item.seriesId === chosen) ?? series[0]
  if (!active) return <Empty message="Historical observations are not available yet." />
  const all = points.filter((point) => point.seriesId === active.seriesId).sort((a, b) => a.date.localeCompare(b.date))
  const latest = all.at(-1)!
  const cutoff = Date.parse(latest.date) - Number(range) * 86400000
  const visible = range === 'all' ? all : all.filter((point) => Date.parse(point.date) >= cutoff)
  return <section className="panel stack">
    <div className="page-head"><div><p className="eyebrow">HISTORICAL DATA</p><h2>{active.name}</h2></div>
      <select aria-label="Historical series" value={active.seriesId} onChange={(event) => setChosen(event.target.value)}>{series.map((item) => <option key={item.seriesId} value={item.seriesId}>{item.instrument} · {item.name}</option>)}</select>
      <select aria-label="History range" value={range} onChange={(event) => setRange(event.target.value)}><option value="90">3 months</option><option value="365">1 year</option><option value="1825">5 years</option><option value="all">All observations</option></select>
    </div>
    <div className="summary-strip"><div><span>Latest observation</span><strong>{latest.value.toLocaleString()}</strong><small>{latest.unit}</small></div><div><span>Observation date</span><strong>{latest.date}</strong></div><div><span>Visible observations</span><strong>{visible.length}</strong></div></div>
    <HistoryChart points={visible} />
    <details><summary>View latest 50 observations</summary><div className="table-wrap"><table><thead><tr><th>Date</th><th>Value</th><th>Unit</th></tr></thead><tbody>{[...visible].reverse().slice(0, 50).map((point) => <tr key={point.date}><td>{point.date}</td><td>{point.value.toLocaleString()}</td><td>{point.unit}</td></tr>)}</tbody></table></div></details>
  </section>
}

export function StrengthChart({ snapshot }: { snapshot: DashboardSnapshot }) {
  const rows = snapshot.currencies.filter((item) => item.shortTerm.label !== 'unavailable')
  if (!rows.length) return <Empty message="Currency strength needs released values or mapped positioning. Missing data is not neutral." />
  return <ReactECharts style={{ height: Math.max(260, rows.length * 34) }} option={{
    backgroundColor: 'transparent', tooltip: { trigger: 'axis' }, grid: { left: 50, right: 30, top: 20, bottom: 30 },
    xAxis: { type: 'value', min: -1, max: 1, axisLabel: { color: '#8993a3' } },
    yAxis: { type: 'category', data: rows.map((row) => row.symbol), axisLabel: { color: '#8993a3' } },
    series: [{ type: 'bar', barMaxWidth: 18, data: rows.map((row) => ({ value: row.shortTerm.score, itemStyle: { color: row.shortTerm.score > 0 ? '#3ddc97' : row.shortTerm.score < 0 ? '#ff626e' : '#8993a3' } })) }],
  }} />
}

export function PositionChart({ rows }: { rows: DashboardSnapshot['cot'] }) {
  const symbols = [...new Set(rows.map((row) => row.instrument))].sort()
  const [selected, setSelected] = useState('')
  const active = symbols.includes(selected) ? selected : symbols[0]
  if (!active) return <Empty message="No positioning observations are available." />
  const filtered = rows.filter((row) => row.instrument === active)
  return <section className="stack"><div className="page-head"><h2>Long and short exposure</h2><select aria-label="Positioning instrument" value={active} onChange={(event) => setSelected(event.target.value)}>{symbols.map((symbol) => <option key={symbol}>{symbol}</option>)}</select></div>
    <p className="muted">Contracts by reported category. Non-reportable positions are not a direct measure of retail traders. These are current report snapshots, not historical curves.</p>
    <ReactECharts style={{ height: 360 }} option={{ tooltip: { trigger: 'axis' }, legend: { textStyle: { color: '#8993a3' } }, grid: { left: 70, right: 30, bottom: 100 },
      xAxis: { type: 'category', data: filtered.map((row) => `${row.category} · ${row.marketId}`), axisLabel: { color: '#8993a3', rotate: 25 } },
      yAxis: { type: 'value', axisLabel: { color: '#8993a3' } }, series: [
        { name: 'Long', type: 'bar', itemStyle: { color: '#3ddc97' }, data: filtered.map((row) => row.long) },
        { name: 'Short', type: 'bar', itemStyle: { color: '#ff626e' }, data: filtered.map((row) => row.short) },
      ],
    }} />
  </section>
}