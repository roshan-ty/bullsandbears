import type { DashboardSnapshot, PositioningObservation } from './types'
import type { SignalPoint } from './chartSignals'

export function positioningRows(snapshot: DashboardSnapshot, instrument: string, now: number) {
  return [...new Map([...(snapshot.positioningHistory ?? []), ...(snapshot.positioning ?? [])]
    .filter(row => row.instrument === instrument && Date.parse(row.recordedAt) <= now)
    .map(row => [`${row.kind}:${row.recordedAt}`, row])).values()]
    .sort((a, b) => Date.parse(a.recordedAt) - Date.parse(b.recordedAt))
}

export function positioningPoints(rows: PositioningObservation[], kind: PositioningObservation['kind'], field: 'score' | 'longPercent' | 'shortPercent' = 'score'): SignalPoint[] {
  return rows.filter(row => row.kind === kind).map(row => ({
    time: Date.parse(row.recordedAt), end: Date.parse(row.expiresAt),
    value: typeof row[field] === 'number' && Number.isFinite(row[field]) ? row[field]! / (field === 'score' ? 1 : 100) : null,
    coverage: row.sample,
  }))
}
