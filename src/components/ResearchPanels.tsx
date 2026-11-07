import { Empty } from './Chart'
import ReactECharts from './ChartRenderer'
import type { DashboardSnapshot } from '../domain/types'
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
