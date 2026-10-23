import { describe, expect, it } from 'vitest'
import { calculatePairBias, scoreEvent } from './scoring'
import type { CurrencyBias, EconomicEvent } from './types'

const event = (overrides: Partial<EconomicEvent> = {}): EconomicEvent => ({
  id: 'nfp-1', occurredAt: '2026-01-01T13:30:00Z', currency: 'USD', indicatorId: 'nfp',
  name: 'Non-Farm Employment Change', impact: 'high', actual: 200, forecast: 180,
  previous: 170, unit: 'K', direction: 'higher_is_bullish', weight: 1, ...overrides,
})

describe('scoreEvent', () => {
  it('uses forecast before previous and scores a positive surprise bullish', () => {
    const result = scoreEvent(event())
    expect(result.comparisonKind).toBe('forecast')
    expect(result.signal).toBe(1)
    expect(result.bias).toBe('bullish')
  })

  it('uses previous when forecast is unavailable', () => {
    const result = scoreEvent(event({ forecast: null, actual: 160, previous: 170 }))
    expect(result.comparisonKind).toBe('previous')
    expect(result.bias).toBe('bearish')
  })

  it('reverses lower-is-bullish indicators', () => {
    const result = scoreEvent(event({ actual: 3.9, forecast: 4.1, direction: 'lower_is_bullish' }))
    expect(result.bias).toBe('bullish')
  })

  it('is neutral when actual equals the comparison value', () => {
    expect(scoreEvent(event({ actual: 180 })).bias).toBe('neutral')
  })

  it('does not infer text policy without a validated signal', () => {
    expect(scoreEvent(event({ direction: 'text_policy', policySignal: null })).bias).toBe('unavailable')
  })
})

describe('calculatePairBias', () => {
  it('subtracts quote strength from base strength', () => {
    const biases: CurrencyBias[] = [
      { symbol: 'EUR', score: 0.3, label: 'bullish', eventScore: 0.3, cotScore: 0, eventCount: 3, updatedAt: null },
      { symbol: 'USD', score: 0.7, label: 'bullish', eventScore: 0.7, cotScore: 0, eventCount: 5, updatedAt: null },
    ]
    const result = calculatePairBias('EURUSD', biases)
    expect(result?.score).toBeCloseTo(-0.2)
    expect(result?.label).toBe('bearish')
  })
})
