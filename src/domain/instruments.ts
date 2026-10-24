export const currencies = [
  'USD', 'EUR', 'GBP', 'AUD', 'NZD', 'CAD', 'JPY', 'CHF', 'CNY', 'HKD', 'HUF',
  'NOK', 'PLN', 'SEK', 'SGD', 'TRY', 'ZAR', 'BRL', 'CZK', 'DKK', 'MXN',
] as const

export const instruments = [
  'BRENT', 'COPPER', 'OIL', 'XAGUSD', 'XAUUSD', 'XPDUSD', 'XPTUSD',
  'AVAXUSD', 'BTCUSD', 'ETHUSD', 'LTCUSD', 'SOLUSD', 'SUIUSD', 'XLMUSD', 'XRPUSD',
  'AUDCAD', 'AUDCHF', 'AUDJPY', 'AUDNZD', 'AUDUSD', 'CADCHF', 'CADJPY', 'CHFJPY',
  'EURAUD', 'EURCAD', 'EURCHF', 'EURGBP', 'EURHKD', 'EURHUF', 'EURJPY', 'EURNOK',
  'EURNZD', 'EURPLN', 'EURSEK', 'EURSGD', 'EURTRY', 'EURUSD', 'EURZAR', 'GBPAUD',
  'GBPCAD', 'GBPCHF', 'GBPHKD', 'GBPHUF', 'GBPJPY', 'GBPNOK', 'GBPNZD', 'GBPPLN',
  'GBPSEK', 'GBPTRY', 'GBPUSD', 'GBPZAR', 'NZDCAD', 'NZDCHF', 'NZDJPY', 'NZDSGD',
  'NZDUSD', 'USDBRL', 'USDCAD', 'USDCHF', 'USDCNY', 'USDCZK', 'USDDKK', 'USDHUF',
  'USDJPY', 'USDMXN', 'USDNOK', 'USDPLN', 'USDSEK', 'USDSGD', 'AUS200', 'CH20',
  'ES35', 'EU50', 'FR40', 'GB100', 'GE40', 'HK50', 'JP225', 'US100', 'US30', 'US500',
] as const

const aliases: Record<string, string> = {
  AVAXUSDT: 'AVAXUSD', BTCUSDT: 'BTCUSD', ETHUSDT: 'ETHUSD', LTCUSDT: 'LTCUSD',
  SOLUSDT: 'SOLUSD', SUIUSDT: 'SUIUSD', XLMUSDT: 'XLMUSD', XRPUSDT: 'XRPUSD',
  GER40: 'GE40', NQ: 'US100', NASDAQ: 'US100', DJI: 'US30', 'S&P500': 'US500',
}

export function normalizeInstrument(value: string): string {
  const normalized = value.trim().toUpperCase().replace(/[\s/_-]/g, '')
  return aliases[normalized] ?? normalized
}

export function splitForexPair(symbol: string): { base: string; quote: string } | null {
  const normalized = normalizeInstrument(symbol)
  if (normalized.length !== 6) return null
  const base = normalized.slice(0, 3)
  const quote = normalized.slice(3)
  if (!currencies.includes(base as (typeof currencies)[number])) return null
  if (!currencies.includes(quote as (typeof currencies)[number])) return null
  return { base, quote }
}

export function assetClass(symbol: string): string {
  if (splitForexPair(symbol)) return 'Forex'
  if (['AVAXUSD', 'BTCUSD', 'ETHUSD', 'LTCUSD', 'SOLUSD', 'SUIUSD', 'XLMUSD', 'XRPUSD'].includes(symbol)) return 'Crypto'
  if (['BRENT', 'COPPER', 'OIL', 'XAGUSD', 'XAUUSD', 'XPDUSD', 'XPTUSD'].includes(symbol)) return 'Commodities'
  return 'Indices'
}
