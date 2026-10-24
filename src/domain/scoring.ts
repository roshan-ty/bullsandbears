import type { BiasLabel, CotPosition, CurrencyBias, EconomicEvent, HorizonBias, PairBias, ScoredEvent } from './types'
import { splitForexPair } from './instruments'

const impactMultiplier = { low: 0.5, medium: 1, high: 1.75 } as const

export function labelForScore(score: number, threshold = 1e-9): BiasLabel {
  if (score > threshold) return 'bullish'
  if (score < -threshold) return 'bearish'
  return 'neutral'
}

export function scoreEvent(event: EconomicEvent): ScoredEvent {
  const comparisonKind = event.previous !== null ? 'previous' : null
  const comparison = event.previous

  if (event.actual === null || (event.direction !== 'text_policy' && comparison === null)) {
    return { ...event, comparison, comparisonKind, surprise: null, signal: null, contribution: 0, bias: 'unavailable' }
  }

  let signal: -1 | 0 | 1 | null = null
  let surprise: number | null = comparison === null ? null : event.actual - comparison

  if (event.direction === 'text_policy' || event.direction === 'custom') {
    signal = null
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
  const horizon: HorizonBias = {
    score,
    label: hasEvents || hasCot ? labelForScore(score) : 'unavailable',
    coverage: hasEvents || hasCot ? 1 : 0,
    eventCount: eligibleEvents.length,
    updatedAt,
    eventScore,
    cotScore,
  }

  return {
    symbol,
    score,
    label: horizon.label,
    eventScore,
    cotScore,
    eventCount: eligibleEvents.length,
    updatedAt,
    shortTerm: horizon,
    longTerm: { score: 0, label: 'unavailable', coverage: 0, eventCount: 0, updatedAt: null },
  }
}

function pairHorizon(base: HorizonBias, quote: HorizonBias): HorizonBias {
  const available = base.label !== 'unavailable' && quote.label !== 'unavailable'
  const score = available ? (base.score - quote.score) / 2 : 0
  return {
    score,
    label: available ? labelForScore(score) : 'unavailable',
    coverage: Math.min(base.coverage, quote.coverage),
    eventCount: base.eventCount + quote.eventCount,
    updatedAt: [base.updatedAt, quote.updatedAt].filter(Boolean).sort().at(-1) ?? null,
  }
}

export function calculatePairBias(symbol: string, currencies: CurrencyBias[]): PairBias | null {
  const pair = splitForexPair(symbol)
  if (!pair) return null
  const base = currencies.find((item) => item.symbol === pair.base)
  const quote = currencies.find((item) => item.symbol === pair.quote)
  if (!base || !quote) {
    const unavailable: HorizonBias = { score: 0, label: 'unavailable', coverage: 0, eventCount: 0, updatedAt: null }
    return {
      symbol,
      ...pair,
      score: 0,
      label: 'unavailable',
      updatedAt: null,
      rationale: ['Required currency bias data is not yet available.'],
      shortTerm: unavailable,
      longTerm: { ...unavailable },
    }
  }
  const shortTerm = pairHorizon(base.shortTerm, quote.shortTerm)
  const longTerm = pairHorizon(base.longTerm, quote.longTerm)
  return {
    symbol,
    ...pair,
    score: shortTerm.score,
    label: shortTerm.label,
    updatedAt: shortTerm.updatedAt,
    rationale: [
      `${pair.base} ${base.shortTerm.label} (${base.shortTerm.score.toFixed(2)})`,
      `${pair.quote} ${quote.shortTerm.label} (${quote.shortTerm.score.toFixed(2)})`,
      `Pair score equals normalized base strength minus quote strength.`,
    ],
    shortTerm,
    longTerm,
  }
}
