import { expect,it } from 'vitest'
import { positioningRows,positioningPoints } from './positioningCurves'
import { priceAverage } from './priceIndicators'
import type {DashboardSnapshot,PositioningObservation,PriceBar} from './types'
const row=(instrument:string,recordedAt:string,kind:PositioningObservation['kind']='retail')=>({instrument,recordedAt,expiresAt:'2026-10-27T00:00:00Z',kind,score:-.4,longPercent:70,shortPercent:30,sample:''})
it('isolates instruments, excludes future records, and keeps the latest copy of genuine observations',()=>{
  const current=row('EURUSD','2026-10-26T10:00:00Z')
  const rows=positioningRows({positioning:[{...current,score:0}],positioningHistory:[current,row('GBPUSD',current.recordedAt),row('EURUSD','2026-10-28T00:00:00Z'),row('EURUSD','2026-10-25T00:00:00Z','cot')]} as DashboardSnapshot,'EURUSD',Date.parse('2026-10-26T12:00:00Z'))
  expect(rows).toHaveLength(2)
  expect(positioningPoints(rows,'retail')[0].value).toBe(0)
  expect(positioningPoints(rows,'retail','longPercent')[0].value).toBe(.7)
  expect(positioningPoints(rows,'cot')[0].value).toBe(-.4)
  expect(positioningPoints([{...current,score:null}],'retail')[0].value).toBeNull()
})
it('calculates causal SMA and EMA only after enough real candle closes',()=>{
  const bars=[1,2,3,10,5].map(close=>({close} as PriceBar))
  expect(priceAverage(bars,3)).toEqual([null,null,2,5,6])
  expect(priceAverage(bars,3,true)).toEqual([null,null,2,6,5.5])
  expect(priceAverage(bars.slice(0,4),3,true)).toEqual(priceAverage(bars,3,true).slice(0,4))
})
