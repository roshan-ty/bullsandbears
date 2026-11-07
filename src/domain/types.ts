export type BiasLabel = 'bullish' | 'bearish' | 'neutral' | 'unavailable'
export type Impact = 'low' | 'medium' | 'high'
export type DirectionRule = 'higher_is_bullish' | 'lower_is_bullish' | 'text_policy' | 'custom'

export type VerificationStatus = 'confirmed' | 'single-source' | 'conflict' | 'pending'
export interface EventVerification {
  status: VerificationStatus
  checkedAt: string
  sourceCount: number
  fields: Record<'actual' | 'forecast' | 'previous', VerificationStatus>
  conflictingFields: Array<'actual' | 'forecast' | 'previous'>
  previousRevisionPending?: boolean
  note?: string
}

export interface EconomicEvent {
  verification?: EventVerification
  source?: string
  sourceUrl?: string
  retrievedAt?: string
  hasNumericRelease?: boolean
  actualText?: string | null
  forecastText?: string | null
  previousText?: string | null
  originalPrevious?: number | null
  originalPreviousText?: string | null
  timeLabel?: string | null
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
  seriesKey?: string
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
  reportFamily?: string
  marketName?: string
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

export interface ScoreComponent {
  key: string
  name: string
  score: number | null
  weight: number
  contribution: number
  available: boolean
  ruleId: string
}

export interface HorizonBias {
  components?: ScoreComponent[]
  score: number
  label: BiasLabel
  coverage: number
  eventCount: number
  updatedAt: string | null
  eventScore?: number
  cotScore?: number
  factorCount?: number
  factors?: Array<{ name: string; score: number; count: number }>
  agreement?: number
  directScore?: number | null
  directGroupCount?: number
  componentConflict?: boolean
  evidenceQuality?: string
}

export interface PairBias {
  symbol: string
  base: string
  quote: string
  score: number
  label: BiasLabel
  updatedAt: string | null
  rationale: string[]
  modelScope?: string
  modelVersion?: string
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

export interface CryptoPoint {
  instrument: string
  metric: string
  name: string
  group: string
  date: string
  value: number
  unit: string
}

export interface CryptoHorizon {
  score: number
  coverage: number
  groupCount: number
  available: boolean
  agreement: number
  metrics: Array<{ metric: string; name: string; group: string; score: number; change: number; changeUnit: string; current: number; previous: number; observations: number; asOf: string; windowDays: number }>
}

export interface HistoricalPoint {
  period?: string
  frequency?: string
  releaseDateKnown?: boolean
  seriesId: string
  instrument: string
  name: string
  date: string
  value: number
  unit: string | null
}

export interface MarketPrice {
  bars?: PriceBar[]
  ticker?: string
  source?: string
  sourceUrl?: string
  retrievedAt?: string
  context?: { asOf: string; close: number; observations: number; averages: Record<string, number | null>; trend: string; realizedVolatility20: number | null; annualizationDays: number; return20: number | null; scope: string } | null
  priceKind?: string
  priceUnit?: string | null
  instrument: string
  price: number
  previousClose: number | null
  change: number | null
  changePercent: number | null
  asOf: string
  currency: string | null
}

export interface PriceBar { time: string; open: number; high: number; low: number; close: number; volume: number | null; partial?: boolean }
export interface PriceChartData {
  instrument: string; interval: string; ticker?: string; source?: string; sourceUrl?: string; feedLabel?: string
  priceKind: string; priceUnit: string; delayNotice: string; asOf: string; retrievedAt: string; bars: PriceBar[]
}
export interface PriceChartResponse {
  instrument: string; interval: string; channel?: string; data: PriceChartData | null; updating: boolean; message: string
  stream?: { state: 'connecting' | 'reconnecting' | 'streaming' | 'waiting' | 'stale' | 'unavailable'; updates: number; lastPrice?: number | null; lastTickAt: string | null; lastReceivedAt: string | null; reference?: { price: number; asOf: string; unit: string } | null }
}

export interface AnalysisRecord {
  lessonEvidence?: Array<{ eventId: string; ageDays: number; decay: number; mappedContribution: number; assetSensitivity: number | null; regionWeight: number | null; affectedLegs: string[]; factor: string }>
  instrument: string
  generatedAt: string
  bias: BiasLabel
  score: number
  horizon: 'shortTerm' | 'longTerm'
  horizonViews?: Partial<Record<'shortTerm' | 'longTerm', AnalysisRecord>>
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

export interface FundamentalRule {
  id: string
  name: string
  indicators: string[]
  mechanism: string
  mapping: string
  limit: string
}
export interface ScoreObservation {
  instrument: string
  horizon: 'shortTerm' | 'longTerm'
  recordedAt: string
  modelVersion: string
  score: number
  label: BiasLabel
  coverage: number
  referencePrice: number | null
  priceAsOf: string | null
}
export interface DashboardSnapshot {
  positioningUpdatedAt?: string
  positioning?: PositioningObservation[]
  positioningHistory?: PositioningObservation[]
  calendarUpdatedAt?: string | null
  methodology?: FundamentalRule[]
  scoreHistory?: ScoreObservation[]
  archiveUrl?: string
  archiveCounts?: { history: number; cotHistory: number; cryptoHistory: number; scoreHistory?: number; positioningHistory?: number }
  schemaVersion: number
  generatedAt: string | null
  coreUpdatedAt?: string | null
  newsUpdatedAt?: string | null
  currencies: CurrencyBias[]
  pairs: PairBias[]
  events: ScoredEvent[]
  cot: CotPosition[]
  researchUpdatedAt?: string | null
  cryptoHistory?: CryptoPoint[]
  cryptoFundamentals?: Array<{ instrument: string; shortTerm: CryptoHorizon; longTerm: CryptoHorizon }>
  cotHistory?: CotPosition[]
  history: HistoricalPoint[]
  prices: MarketPrice[]
  news: NewsItem[]
  analysis: AnalysisRecord[]
  setups: TradeSetup[]
  feedHealth: FeedHealth[]
}

export interface PositioningObservation {
  kind: 'retail' | 'options' | 'cot'
  instrument: string
  recordedAt: string
  expiresAt: string
  score: number | null
  sample: string
  longPercent?: number
  shortPercent?: number
  longVolume?: number
  shortVolume?: number
  longPositions?: number
  shortPositions?: number
  tradeCount?: number
  supportiveVolume?: number
  opposingVolume?: number
  windowStart?: string
  windowEnd?: string
  truncated?: boolean
  reportDate?: string
}
