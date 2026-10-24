import ReactECharts from './ChartRenderer'
import type { HistoricalPoint } from '../domain/types'

export function HistoryChart({ points }: { points: HistoricalPoint[] }) {
  if (points.length === 0) return <Empty message="No validated historical observations are available." />
  const seriesIds = [...new Set(points.map((point) => point.seriesId))]
  if (seriesIds.length > 1) return <div className="stack">{seriesIds.map((id) => <section key={id}>
    <h2>{points.find((point) => point.seriesId === id)?.name}</h2>
    <HistoryChart points={points.filter((point) => point.seriesId === id)} />
  </section>)}</div>
  const ordered = [...points].sort((a, b) => a.date.localeCompare(b.date))
  return (
    <ReactECharts
      style={{ height: 360 }}
      option={{
        backgroundColor: 'transparent',
        animation: false,
        grid: { left: 48, right: 20, top: 24, bottom: 42 },
        tooltip: { trigger: 'axis', backgroundColor: '#101216', borderColor: '#2a2e36', textStyle: { color: '#f3f4f6' } },
        xAxis: { type: 'category', data: ordered.map((point) => point.period ?? point.date), axisLine: { lineStyle: { color: '#393e48' } }, axisLabel: { color: '#8f96a3' } },
        yAxis: { type: 'value', scale: true, splitLine: { lineStyle: { color: '#20242b' } }, axisLabel: { color: '#8f96a3' } },
        dataZoom: [{ type: 'inside' }],
        series: [{ type: 'line', data: ordered.map((point) => point.value), showSymbol: false, smooth: false, lineStyle: { width: 2, color: '#4e9fe8' }, areaStyle: { color: 'rgba(78,159,232,.06)' } }],
      }}
    />
  )
}

export function Empty({ message }: { message: string }) {
  return <div className="empty">{message}</div>
}
