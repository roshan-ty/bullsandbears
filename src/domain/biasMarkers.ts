import type { DashboardSnapshot, PriceBar, ScoreObservation } from './types'

export type BiasMarker = {
  recordedAt: string; time: number; barTime: number; price: number
  label: 'bullish' | 'bearish'; score: number; initial: boolean
  previousLabel: string | null; modelVersion: string; delayed: boolean
}

/** Marker classifications always come from the published model, never a smoothed crossing. */
export function biasMarkers(snapshot: DashboardSnapshot, instrument: string, horizon: 'shortTerm' | 'longTerm', bars: PriceBar[], intervalMs: number, now: number): BiasMarker[] {
  if (!bars.length) return []
  const observations = [...new Map((snapshot.scoreHistory ?? []).filter(row => row.instrument === instrument && row.horizon === horizon && Date.parse(row.recordedAt) <= now)
    .map(row => [`${row.recordedAt}:${row.modelVersion}`, row])).values()].sort((a, b) => Date.parse(a.recordedAt) - Date.parse(b.recordedAt))
  const result: BiasMarker[] = []
  const times = bars.map(bar => Date.parse(bar.time))
  let previous: ScoreObservation | undefined
  for (let index = 0; index < observations.length; index++) {
    const row = observations[index], time = Date.parse(row.recordedAt)
    const known = previous && previous.label !== 'unavailable' && previous.coverage > 0 && previous.modelVersion === row.modelVersion
      && time - Date.parse(previous.recordedAt) < (horizon === 'shortTerm' ? 7 : 30) * 86400_000
    const initial = !known
    const changed = initial || previous?.label !== row.label
    const previousLabel = known ? previous!.label : null
    previous = row
    if (!changed || row.coverage <= 0 || (row.label !== 'bullish' && row.label !== 'bearish') || time < times[0]) continue
    let low = 0, high = times.length
    while (low < high) { const mid = (low + high) >>> 1; if (times[mid] <= time) low = mid + 1; else high = mid }
    let barIndex = low - 1
    const delayed = time >= times[barIndex] + intervalMs
    if (delayed) barIndex++
    if (barIndex >= bars.length || times[barIndex] > now || times[barIndex] >= time + (horizon === 'shortTerm' ? 7 : 30) * 86400_000) continue
    // During a closed-market gap, do not attach an already superseded state to a later candle.
    if (delayed && observations.slice(index + 1).some(next => Date.parse(next.recordedAt) <= times[barIndex] && (next.label !== row.label || next.modelVersion !== row.modelVersion || next.coverage <= 0))) continue
    result.push({ recordedAt: row.recordedAt, time, barTime: times[barIndex], price: row.label === 'bullish' ? bars[barIndex].low : bars[barIndex].high,
      label: row.label, score: row.score, initial, previousLabel, modelVersion: row.modelVersion, delayed })
  }
  return result
}

export function groupedMarkers(markers: BiasMarker[], label: BiasMarker['label']) {
  const groups = new Map<number, BiasMarker[]>()
  for (const marker of markers.filter(row => row.label === label)) groups.set(marker.barTime, [...(groups.get(marker.barTime) ?? []), marker])
  return [...groups].map(([time, events]) => ({ time, price: events[0].price, events, initial: events.every(event => event.initial) }))
}
