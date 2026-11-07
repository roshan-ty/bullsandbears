// Keep evidence IDs stable for joins; only presentation labels are neutralized.
const providers = /Yahoo(?: Finance)?|Forex Factory|Fair Economy|CoinMetrics|Coin Metrics|CoinGecko|Coinbase|Binance|Myfxbook|Deribit|DefiLlama|DeFi Llama|GDELT|World Bank|FRED|OECD|BIS|CFTC/gi
const textFields = new Set(['name', 'body', 'scope', 'note', 'notes', 'title', 'description', 'delayNotice'])
export function researchView<T>(value: T, field = ''): T {
  if (Array.isArray(value)) return value.map(item => researchView(item, field)) as T
  if (typeof value === 'string' && textFields.has(field)) return value.replace(providers, 'market research') as T
  if (!value || typeof value !== 'object') return value
  return Object.fromEntries(Object.entries(value).filter(([key]) => !['source', 'sourceUrl', 'provider', 'providerUrl', 'reference'].includes(key)).map(([key, item]) => [key,
    key === 'marketName' && typeof item === 'string' ? item.split(' - ')[0].trim() :
    key === 'feedHealth' && Array.isArray(item) ? item.map((row, index) => ({ ...row, feed: `Collection ${String(index + 1).padStart(2, '0')}`, message: row.status === 'healthy' ? 'Collection completed.' : 'Some observations are unavailable. Saved observations are retained.' })) : researchView(item, key)])) as T
}
