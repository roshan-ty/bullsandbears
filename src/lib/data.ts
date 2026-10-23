import type { BiasLabel, DashboardSnapshot, HorizonBias } from '../domain/types'

const emptySnapshot: DashboardSnapshot = {
  schemaVersion: 1,
  generatedAt: null,
  currencies: [],
  pairs: [],
  events: [],
  cot: [],
  history: [],
  prices: [],
  news: [],
  analysis: [],
  setups: [],
  feedHealth: [],
}

const legacyHorizon = (item: Record<string, unknown>): HorizonBias => ({
  score: typeof item.score === 'number' ? item.score : 0,
  label: (['bullish', 'bearish', 'neutral', 'unavailable'].includes(String(item.label)) ? item.label : 'unavailable') as BiasLabel,
  coverage: 0,
  eventCount: typeof item.eventCount === 'number' ? item.eventCount : 0,
  updatedAt: typeof item.updatedAt === 'string' ? item.updatedAt : null,
})

function isSnapshot(value: unknown): value is DashboardSnapshot {
  if (!value || typeof value !== 'object') return false
  const item = value as Record<string, unknown>
  return item.schemaVersion === 1
    && ['currencies', 'pairs', 'events', 'cot', 'history', 'prices', 'news', 'analysis', 'setups']
      .every((key) => Array.isArray(item[key]))
}

export async function loadSnapshot(signal?: AbortSignal): Promise<DashboardSnapshot> {
  const response = await fetch(`${import.meta.env.BASE_URL}data/snapshot.json`, { cache: 'no-store', signal })
  if (!response.ok) throw new Error(`Data request failed with status ${response.status}.`)
  const payload: unknown = await response.json()
  if (!isSnapshot(payload)) throw new Error('The published dataset does not match the supported schema.')
  const snapshot = { ...emptySnapshot, ...payload }
  return {
    ...snapshot,
    currencies: snapshot.currencies.map((item) => ({ ...item, shortTerm: item.shortTerm ?? legacyHorizon(item as unknown as Record<string, unknown>), longTerm: item.longTerm ?? legacyHorizon(item as unknown as Record<string, unknown>) })),
    pairs: snapshot.pairs.map((item) => ({ ...item, shortTerm: item.shortTerm ?? legacyHorizon(item as unknown as Record<string, unknown>), longTerm: item.longTerm ?? legacyHorizon(item as unknown as Record<string, unknown>) })),
    analysis: snapshot.analysis.map((item) => ({ ...item, horizon: item.horizon ?? 'shortTerm' })),
    setups: snapshot.setups.map((item) => ({ ...item, horizon: item.horizon ?? 'shortTerm' })),
    feedHealth: snapshot.feedHealth.map((feed) => ({
      ...feed,
      displayStatus: !feed.lastSuccessAt || Date.now() - new Date(feed.lastSuccessAt).getTime() > feed.staleAfterHours * 3_600_000 ? 'stale' : feed.status,
    })),
  }
}
