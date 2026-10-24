import type { CotPosition } from './types'

export function positionContext(row: CotPosition, archive: CotPosition[]) {
  const end = Date.parse(row.reportDate)
  const points = [...new Map([...archive, row].filter((item) => item.marketId === row.marketId && item.instrument === row.instrument
    && item.category === row.category && item.reportFamily === row.reportFamily && (item.openInterest ?? 0) > 0
    && Date.parse(item.reportDate) <= end && Date.parse(item.reportDate) >= end - 13 * 7 * 86400000)
    .map((item) => [item.reportDate, item])).values()].sort((a, b) => a.reportDate.localeCompare(b.reportDate))
  const ratio = (item: CotPosition) => item.net / item.openInterest! * 100
  const current = (row.openInterest ?? 0) > 0 ? ratio(row) : null
  const before = points.find((item) => Date.parse(item.reportDate) === end - 28 * 86400000)
  const enough = points.length >= 10 && end - Date.parse(points[0].reportDate) >= 9 * 7 * 86400000
  const values = points.map(ratio)
  const percentile = enough && current !== null ? (values.filter((v) => v < current).length + .5 * values.filter((v) => v === current).length) / values.length * 100 : null
  return { current, change4w: before && current !== null ? current - ratio(before) : null, percentile, observations: points.length }
}
