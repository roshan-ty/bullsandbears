import type { PriceBar } from './types'

export function priceAverage(bars: PriceBar[], period: number, exponential = false) {
  let sum = 0, ema = 0
  const alpha = 2 / (period + 1)
  return bars.map((bar, index) => {
    sum += bar.close
    if (index >= period) sum -= bars[index - period].close
    if (index + 1 < period) return null
    ema = index + 1 === period ? sum / period : alpha * bar.close + (1 - alpha) * ema
    return exponential ? ema : sum / period
  })
}
