import type { BiasLabel, DashboardSnapshot, HorizonBias } from '../domain/types'
import { researchView } from './privacy'

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
  score: 0,
  label: 'unavailable' as BiasLabel,
  coverage: 0,
  eventCount: 0,
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
  const response = await fetch(`${import.meta.env.BASE_URL}data/snapshot.json`, { cache: 'no-cache', signal })
  if (!response.ok) throw new Error(`Data request failed with status ${response.status}.`)
  const payload: unknown = await response.json()
  if (!isSnapshot(payload)) throw new Error('The published dataset does not match the supported schema.')
  const snapshot = researchView({ ...emptySnapshot, ...payload })
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

const archives = new Map<string, Promise<Pick<DashboardSnapshot, 'history' | 'cotHistory' | 'cryptoHistory' | 'scoreHistory' | 'positioningHistory'>>>()
export function loadArchive(filename: string) {
  if (!/^archive-[a-f0-9]{12}\.json$/.test(filename)) return Promise.reject(new Error('Invalid research archive name.'))
  let pending = archives.get(filename)
  if (!pending) {
    pending = fetch(`${import.meta.env.BASE_URL}data/${filename}`).then(async (response) => {
      if (!response.ok) throw new Error(`Research archive request failed: ${response.status}.`)
      const data = await response.json()
      if (!['history', 'cotHistory', 'cryptoHistory'].every((key) => Array.isArray(data[key]))) throw new Error('Invalid research archive.')
      return researchView(data) as Pick<DashboardSnapshot, 'history' | 'cotHistory' | 'cryptoHistory' | 'scoreHistory' | 'positioningHistory'>
    }).catch((error: unknown) => { archives.delete(filename); throw error })
    archives.clear() // retain only the active content-addressed archive
    archives.set(filename, pending)
  }
  return pending
}
