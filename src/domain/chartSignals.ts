import type { DashboardSnapshot, PositioningObservation, PriceBar } from './types'

export type SignalPoint = { time: number; end: number; value: number | null; coverage: string; basis?: string }
export const signalValue = (value: number | null) => value === null ? 'Unavailable' : `${value > 0 ? '+' : ''}${(value * 100).toFixed(1)}`

/** Piecewise-constant observations on their actual timeline, never candle-rounded.
 * Extending to the next observation/expiry means "last known", not a new sample.
 */
export function signalCurve(points: SignalPoint[], now: number): [number, number | null][] {
  const result: [number, number | null][] = []
  for (let index = 0; index < points.length; index++) {
    const point = points[index]
    if (point.time > now) break
    const end = Math.min(point.end, points[index + 1]?.time ?? now, now)
    if (point.value === null || end < point.time) continue
    const previous = result.at(-1)
    if (previous && previous[0] < point.time) result.push([previous[0], null])
    result.push([point.time, point.value * 100], [end, point.value * 100])
    if (end < now && end < (points[index + 1]?.time ?? Infinity)) result.push([end, null])
  }
  return result
}

export function signalFocus(histories: SignalPoint[][], first: number, end: number, intervalMs: number, lastPriceTime = end) {
  const starts = histories.map(points => points.find(point => point.value !== null && point.end > first && point.time <= end)?.time).filter((time): time is number => time !== undefined)
  // Give the most recently started stream room to be read alongside price.
  const start = starts.length ? Math.max(first, Math.min(Math.max(...starts) - intervalMs * 2, end - intervalMs * 8)) : Math.max(first, end - intervalMs * 120)
  return { startValue: Math.max(first, Math.min(start, lastPriceTime - intervalMs * 8)), endValue: end }
}

export function signalHistory(snapshot: DashboardSnapshot, instrument: string, horizon: 'shortTerm' | 'longTerm') {
  const all = [...(snapshot.positioningHistory ?? []), ...(snapshot.positioning ?? [])].filter(row => row.instrument === instrument)
  const unique = new Map(all.map(row => [`${row.kind}:${row.recordedAt}`, row]))
  const rows = [...unique.values()].sort((a, b) => Date.parse(a.recordedAt) - Date.parse(b.recordedAt))
  const cot: SignalPoint[] = rows.filter(row => row.kind === 'cot').map(row => ({ time: Date.parse(row.recordedAt), end: Date.parse(row.expiresAt), value: row.score, coverage: `Holdings as of ${row.reportDate}` }))
  const blue: SignalPoint[] = []
  const flow = rows.filter(row => row.kind !== 'cot')
  // Evaluate both arrivals AND expiries, so an old component cannot silently persist.
  const times = [...new Set(flow.flatMap(row => [Date.parse(row.recordedAt), Date.parse(row.expiresAt)]))].sort((a, b) => a - b)
  let index = 0
  const latest: Partial<Record<'retail' | 'options', PositioningObservation>> = {}
  for (const time of times) {
    while (index < flow.length && Date.parse(flow[index].recordedAt) <= time) {
      const row = flow[index++]
      latest[row.kind as 'retail' | 'options'] = row
    }
    const eligible = Object.values(latest).filter(row => row.score !== null && Date.parse(row.expiresAt) > time)
    blue.push({ time, end: eligible.length ? Math.min(...eligible.map(row => Date.parse(row.expiresAt))) : time,
      value: eligible.length ? eligible.reduce((sum, row) => sum + row.score!, 0) / eligible.length : null,
      coverage: eligible.length === 2 ? 'Retail + options · equal weight' : eligible[0]?.kind === 'retail' ? 'Retail only · options unavailable' : eligible.length ? 'Options only · retail unavailable / small sample' : 'No eligible observations' })
  }
  const red: SignalPoint[] = (snapshot.scoreHistory ?? []).filter(row => row.instrument === instrument && row.horizon === horizon)
    .map(row => ({ time: Date.parse(row.recordedAt), end: Date.parse(row.recordedAt) + (horizon === 'shortTerm' ? 7 : 30) * 86400_000,
      value: row.label === 'unavailable' || row.coverage === 0 ? null : row.score, coverage: `${row.modelVersion} · ${(row.coverage * 100).toFixed(0)}% evidence coverage`, basis: row.modelVersion }))
    .sort((a, b) => a.time - b.time)
  return { red, blue, cot }
}

export function alignSignals(points: SignalPoint[], bars: PriceBar[], duration: number, now: number) {
  let index = -1
  return bars.map((bar, barIndex) => {
    const open = Date.parse(bar.time)
    // Closed candles use information known at their OPEN. Only the current,
    // forming candle can display an observation collected during that candle.
    const time = barIndex === bars.length - 1 && open <= now && now < open + duration ? now : open
    while (index + 1 < points.length && points[index + 1].time <= time) index++
    const point = points[index]
    return point && point.time <= time && time < point.end ? point : null
  })
}


/** A causal exponential display filter: a new reading only influences later times.
 * No interpolation toward a future observation, price input, or backward filling.
 */
export function smoothedSignalCurve(points: SignalPoint[], now: number, intervalMs: number, span: number, from: number): [number, number | null][] {
  if (span <= 1) return signalCurve(points, now)
  const tau = -intervalMs / Math.log(1 - 2 / (span + 1))
  const step = Math.max(intervalMs / 8, (now - from) / 4096, 1)
  const result: [number, number | null][] = []
  let value: number | null = null, previousEnd = -Infinity, basis: string | undefined
  for (let index = 0; index < points.length; index++) {
    const point = points[index]
    if (point.time > now) break
    const end = Math.min(point.end, points[index + 1]?.time ?? now, now)
    if (point.value === null || end < point.time) { value = null; previousEnd = -Infinity; continue }
    const reset = value === null || previousEnd < point.time || basis !== point.basis
    if (reset) {
      if (result.length) result.push([Math.max(from, point.time), null])
      value = point.value
    }
    const initial: number = value!
    const at = (time: number) => initial + (point.value! - initial) * -Math.expm1(-(time - point.time) / tau)
    const start = Math.max(point.time, from)
    if (end >= start) {
      result.push([start, at(start) * 100])
      // Bound display density for long histories; each value still uses only prior observations.
      for (let time = Math.floor(start / step + 1) * step; initial !== point.value && time < end; time += step) result.push([time, at(time) * 100])
      if (end > start) result.push([end, at(end) * 100])
      if (end < now && end < (points[index + 1]?.time ?? Infinity)) result.push([end, null])
    }
    value = at(end); previousEnd = end; basis = point.basis
  }
  return result
}

export function readingAt(points: SignalPoint[], time: number) {
  let low = 0, high = points.length
  while (low < high) {
    const middle = (low + high) >>> 1
    if (points[middle].time <= time) low = middle + 1
    else high = middle
  }
  const point = points[low - 1]
  return point && point.end > time ? point.value : null
}
