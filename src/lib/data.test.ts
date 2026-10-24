import { describe, expect, it, vi } from 'vitest'
import { loadSnapshot } from './data'

describe('loadSnapshot', () => {
  it('accepts the complete published snapshot contract', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        schemaVersion: 1, generatedAt: null, currencies: [], pairs: [], events: [], cot: [],
        history: [], prices: [], news: [], analysis: [], setups: [], feedHealth: [],
      }),
    }))
    await expect(loadSnapshot()).resolves.toMatchObject({ schemaVersion: 1, prices: [] })
    vi.unstubAllGlobals()
  })

  it('does not invent horizon scores from legacy bias rows', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        schemaVersion: 1, generatedAt: null,
        currencies: [{ symbol: 'USD', score: 0.2, label: 'bullish', eventScore: 0.2, cotScore: 0, eventCount: 2, updatedAt: null }],
        pairs: [], events: [], cot: [], history: [], prices: [], news: [], analysis: [], setups: [],
      }),
    }))
    const snapshot = await loadSnapshot()
    expect(snapshot.currencies[0].shortTerm.label).toBe('unavailable')
    expect(snapshot.currencies[0].longTerm.label).toBe('unavailable')
    vi.unstubAllGlobals()
  })

  it('marks a feed stale when its success timestamp exceeds the freshness window', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        schemaVersion: 1, generatedAt: null, currencies: [], pairs: [], events: [], cot: [], history: [], prices: [], news: [], analysis: [], setups: [],
        feedHealth: [{ feed: 'news', status: 'healthy', lastAttemptAt: '2020-01-01T00:00:00Z', lastSuccessAt: '2020-01-01T00:00:00Z', staleAfterHours: 1, itemCount: 2, message: 'ok' }],
      }),
    }))
    const snapshot = await loadSnapshot()
    expect(snapshot.feedHealth[0].displayStatus).toBe('stale')
    vi.unstubAllGlobals()
  })

  it('rejects a partial snapshot', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ schemaVersion: 1, currencies: [], events: [] }),
    }))
    await expect(loadSnapshot()).rejects.toThrow('supported schema')
    vi.unstubAllGlobals()
  })
})