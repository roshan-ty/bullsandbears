export type BiasLabel = 'bullish' | 'bearish' | 'neutral' | 'unavailable'
export type Impact = 'low' | 'medium' | 'high'
export type DirectionRule = 'higher_is_bullish' | 'lower_is_bullish' | 'text_policy' | 'custom'

export interface EconomicEvent {
  id: string
  occurredAt: string
  currency: string
  indicatorId: string
  name: string
  impact: Impact
  actual: number | null
  forecast: number | null
  previous: number | null
  unit: string | null
  direction: DirectionRule
  weight: number
  policySignal?: -1 | 0 | 1 | null
  affectedCurrencies?: string[]
}

export interface ScoredEvent extends EconomicEvent {
  comparison: number | null
  comparisonKind: 'forecast' | 'previous' | null
  surprise: number | null
  signal: -1 | 0 | 1 | null
  contribution: number
  bias: BiasLabel
}

export interface CotPosition {
  marketId: string
  instrument: string
  reportDate: string
  category: string
  long: number
  short: number
  spread: number | null
  openInterest: number | null
  net: number
  weeklyNetChange: number | null
  normalizedScore: number | null
}

export interface CurrencyBias {
  symbol: string
  score: number
  label: BiasLabel
  eventScore: number
  cotScore: number
  eventCount: number
  updatedAt: string | null
  shortTerm: HorizonBias
  longTerm: HorizonBias
}

export interface HorizonBias {
  score: number
  label: BiasLabel
  coverage: number
  eventCount: number
  updatedAt: string | null
  eventScore?: number
  cotScore?: number
}

export interface PairBias {
  symbol: string
  base: string
  quote: string
  score: number
  label: BiasLabel
  updatedAt: string | null
  rationale: string[]
  macroCurrencies?: string[]
  macroWeights?: Record<string, number>
  shortTerm: HorizonBias
  longTerm: HorizonBias
}

export interface NewsItem {
  id: string
  publishedAt: string
  headline: string
  summary: string | null
  url: string
  instruments: string[]
}

export interface HistoricalPoint {
  seriesId: string
  instrument: string
  name: string
  date: string
  value: number
  unit: string | null
}

export interface MarketPrice {
  instrument: string
  price: number
  previousClose: number | null
  change: number | null
  changePercent: number | null
  asOf: string
  currency: string | null
}

export interface AnalysisRecord {
  instrument: string
  generatedAt: string
  bias: BiasLabel
  score: number
  horizon: 'shortTerm' | 'longTerm'
  sections: Array<{ title: string; body: string }>
}

export interface TradeSetup {
  instrument: string
  direction: 'long' | 'short'
  conviction: number
  generatedAt: string
  horizon: 'shortTerm' | 'longTerm'
  reasons: string[]
  confirmations: string[]
  risks: string[]
}

export interface FeedHealth {
  feed: string
  status: 'healthy' | 'degraded' | 'unavailable'
  lastAttemptAt: string
  lastSuccessAt?: string | null
  staleAfterHours: number
  itemCount: number
  message: string
  displayStatus?: 'healthy' | 'degraded' | 'unavailable' | 'stale'
}

export interface DashboardSnapshot {
  schemaVersion: number
  generatedAt: string | null
  coreUpdatedAt?: string | null
  newsUpdatedAt?: string | null
  currencies: CurrencyBias[]
  pairs: PairBias[]
  events: ScoredEvent[]
  cot: CotPosition[]
  cotHistory?: CotPosition[]
  history: HistoricalPoint[]
  prices: MarketPrice[]
  news: NewsItem[]
  analysis: AnalysisRecord[]
  setups: TradeSetup[]
  feedHealth: FeedHealth[]
}
