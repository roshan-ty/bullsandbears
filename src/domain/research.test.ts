import { expect, it } from 'vitest'
import { positionContext } from './research'
import type { CotPosition } from './types'
const row: CotPosition = { instrument: 'EUR', reportFamily: 'tff', marketId: '1', category: 'Asset Manager', reportDate: '2026-10-20', long: 150, short: 100, net: 50, openInterest: 200, spread: null, normalizedScore: null, weeklyNetChange: null }
const history = Array.from({length: 13}, (_, i) => ({ ...row, reportDate: new Date(Date.parse(row.reportDate)-i*7*86400000).toISOString().slice(0,10), net: 50-i }))
it('compares only matching family contract and category, excludes future observations', () => {
  const noisy = [...history, {...row, reportFamily:'legacy',net:10000}, {...row,marketId:'2',net:10000}, {...row,category:'Dealer',net:10000}, {...row,reportDate:'2026-10-27',net:10000}]
  expect(positionContext(row,noisy)).toEqual(positionContext(row,history))
  expect(positionContext(row,history).change4w).toBe(2)
})
it('withholds velocity across missing weeks and percentiles for short history', () => {
  const short = history.slice(0,4)
  expect(positionContext(row,short).change4w).toBeNull()
  expect(positionContext(row,short).percentile).toBeNull()
  expect(positionContext({...row,openInterest:0},history).current).toBeNull()
})
it('ties have a middle percentile rather than a fabricated extreme', () => {
  expect(positionContext(row,history.map((item) => ({...item,net:50}))).percentile).toBe(50)
})
