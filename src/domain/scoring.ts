import type { BiasLabel, CotPosition, CurrencyBias, EconomicEvent, PairBias, ScoredEvent } from './types'
import { splitForexPair } from './instruments'

const impactMultiplier = { low: 0.5, medium: 1, high: 1.75 } as const

export function labelForScore(score: number, threshold = 0.15): BiasLabel {
  if (score > threshold) return 'bullish'
  if (score < -threshold) return 'bearish'
  return 'neutral'
}

export function scoreEvent(event: EconomicEvent): ScoredEvent {
  const comparisonKind = event.forecast !== null ? 'forecast' : event.previous !== null ? 'previous' : null
  const comparison = comparisonKind === 'forecast' ? event.forecast : comparisonKind === 'previous' ? event.previous : null

  if (event.actual === null || (event.direction !== 'text_policy' && comparison === null)) {
    return { ...event, comparison, comparisonKind, surprise: null, signal: null, contribution: 0, bias: 'unavailable' }
  }

  let signal: -1 | 0 | 1 | null = null
  let surprise: number | null = comparison === null ? null : event.actual - comparison

  if (event.direction === 'text_policy') {
    signal = event.policySignal ?? null
    surprise = null
  } else if (surprise === 0) {
    signal = 0
  } else if (event.direction === 'higher_is_bullish') {
    signal = surprise !== null && surprise > 0 ? 1 : -1
  } else if (event.direction === 'lower_is_bullish') {
    signal = surprise !== null && surprise < 0 ? 1 : -1
  }

  if (signal === null) {
    return { ...event, comparison, comparisonKind, surprise, signal, contribution: 0, bias: 'unavailable' }
  }

  const contribution = signal * event.weight * impactMultiplier[event.impact]
  return { ...event, comparison, comparisonKind, surprise, signal, contribution, bias: labelForScore(signal, 0) }
}

export function aggregateCurrencyBias(
  symbol: string,
  events: ScoredEvent[],
  cot: CotPosition[],
  updatedAt: string | null,
): CurrencyBias {
  const eligibleEvents = events.filter((event) => event.currency === symbol && event.signal !== null)
  const rawEventScore = eligibleEvents.reduce((total, event) => total + event.contribution, 0)
  const eventDenominator = eligibleEvents.reduce(
    (total, event) => total + event.weight * impactMultiplier[event.impact],
    0,
  )
  const eventScore = eventDenominator === 0 ? 0 : rawEventScore / eventDenominator
  const cotValues = cot
    .filter((position) => position.instrument === symbol && position.normalizedScore !== null)
    .map((position) => position.normalizedScore as number)
  const cotScore = cotValues.length === 0 ? 0 : cotValues.reduce((a, b) => a + b, 0) / cotValues.length
  const hasEvents = eligibleEvents.length > 0
  const hasCot = cotValues.length > 0
  const score = hasEvents && hasCot ? eventScore * 0.8 + cotScore * 0.2 : hasEvents ? eventScore : hasCot ? cotScore : 0

  return {
    symbol,
    score,
    label: hasEvents || hasCot ? labelForScore(score) : 'unavailable',
    eventScore,
    cotScore,
    eventCount: eligibleEvents.length,
    updatedAt,
  }
}

export function calculatePairBias(symbol: string, currencies: CurrencyBias[]): PairBias | null {
  const pair = splitForexPair(symbol)
  if (!pair) return null
  const base = currencies.find((item) => item.symbol === pair.base)
  const quote = currencies.find((item) => item.symbol === pair.quote)
  if (!base || !quote || base.label === 'unavailable' || quote.label === 'unavailable') {
    return {
      symbol,
      ...pair,
      score: 0,
      label: 'unavailable',
      updatedAt: null,
      rationale: ['Required currency bias data is not yet available.'],
    }
  }
  const score = (base.score - quote.score) / 2
  return {
    symbol,
    ...pair,
    score,
    label: labelForScore(score),
    updatedAt: [base.updatedAt, quote.updatedAt].filter(Boolean).sort().at(-1) ?? null,
    rationale: [
      `${pair.base} ${base.label} (${base.score.toFixed(2)})`,
      `${pair.quote} ${quote.label} (${quote.score.toFixed(2)})`,
      `Pair score equals normalized base strength minus quote strength.`,
    ],
  }
}
