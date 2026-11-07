import { expect, it } from 'vitest'
import { alignSignals, signalHistory, signalCurve, signalFocus, smoothedSignalCurve, readingAt } from './chartSignals'
import type { DashboardSnapshot, PositioningObservation, PriceBar } from './types'

const start = Date.parse('2026-10-26T00:00:00Z')
const point = (kind: PositioningObservation['kind'], minute: number, score: number | null, expires: number) => ({ kind, instrument: 'EURUSD', score, recordedAt: new Date(start + minute * 60_000).toISOString(), expiresAt: new Date(start + expires * 60_000).toISOString(), sample: '' })
it('never maps a later observation into an earlier completed candle or invents missing evidence', () => {
  const bars = [0, 5, 10, 15].map(minute => ({ time: new Date(start + minute * 60_000).toISOString() }) as PriceBar)
  const points = [{ time: start + 6 * 60_000, end: start + 13 * 60_000, value: .5, coverage: '' }]
  const values = alignSignals(points, bars, 300_000, start + 60 * 60_000).map(row => row?.value ?? null)
  expect(values).toEqual([null, null, .5, null])
  expect(alignSignals(points, bars.slice(0, 2), 300_000, start + 7 * 60_000)[1]?.value).toBe(.5)
})
it('shows available-component coverage, removes expired inputs, and does not average missing data as zero', () => {
  const snapshot = { positioning: [point('retail', 0, .8, 10), point('options', 5, -.4, 20)] } as DashboardSnapshot
  const blue = signalHistory(snapshot, 'EURUSD', 'shortTerm').blue
  expect(blue.map(row => row.value)).toEqual([.8, .2, -.4, null])
  expect(blue[0].coverage).toContain('Retail only')
  expect(blue[1].coverage).toContain('Retail + options')
  expect(blue[2].coverage).toContain('Options only')
})
it('isolates instruments and horizons, withholds small samples and never synthesizes journal history', () => {
  const snapshot = { positioning: [point('retail', 0, null, 20)], scoreHistory: [{ instrument:'EURUSD',horizon:'longTerm',recordedAt:new Date(start).toISOString(),score:.6,label:'bullish',coverage:.8,modelVersion:'v1' }] } as DashboardSnapshot
  expect(signalHistory(snapshot,'EURUSD','shortTerm').red).toEqual([])
  expect(signalHistory(snapshot,'EURUSD','longTerm').red[0].value).toBe(.6)
  expect(signalHistory(snapshot,'GBPUSD','longTerm').red).toEqual([])
  expect(signalHistory(snapshot,'EURUSD','shortTerm').blue.every(row => row.value === null)).toBe(true)
})

it('draws visible last-known segments from exact recording times without backdating or bridging expiries', () => {
  const points = [{time: 106, end: 113, value: .5, coverage: ''}, {time: 116, end: 130, value: -.2, coverage: ''}]
  const curve = signalCurve(points, 120)
  expect(curve[0]).toEqual([106, 50])
  expect(curve).toContainEqual([113, 50])
  expect(curve).toContainEqual([113, null])
  expect(curve.at(-1)).toEqual([120, -20])
  expect(signalCurve(points, 105)).toEqual([])
  expect(signalCurve([{time:106,end:130,value:0,coverage:''}],120)).toEqual([[106,0],[120,0]])
})
it('focuses recent evidence while preserving enough surrounding price context', () => {
  const range=signalFocus([[{time:90,end:200,value:.1,coverage:''}]],0,100,1)
  expect(range).toEqual({startValue:88,endValue:100})
  expect(signalFocus([],0,200,1)).toEqual({startValue:80,endValue:200})
})

it('keeps the last real candles visible when a closed market has newer signal observations', () => {
  const range=signalFocus([[{time:95,end:200,value:.5,coverage:''}]],0,100,1,50)
  expect(range).toEqual({startValue:42,endValue:100})
})

it('smooths only after an actual change, without price input or future information', () => {
  const points = [{time:0,end:1000,value:.2,coverage:''},{time:100,end:1000,value:.8,coverage:''}]
  const before = smoothedSignalCurve(points, 90, 10, 6, 0)
  expect(before.every(([,value])=>value===20)).toBe(true)
  const curve = smoothedSignalCurve(points, 200, 10, 6, 0)
  expect(curve.filter(([time])=>time<=100).every(([,value])=>value===20)).toBe(true)
  const values = curve.filter(([time])=>time>100).map(([,value])=>value!)
  expect(values.every(value=>value>20 && value<80)).toBe(true)
  expect(values).toEqual([...values].sort((a,b)=>a-b))
  expect(smoothedSignalCurve([...points,{time:300,end:1000,value:-1,coverage:''}],200,10,6,0)).toEqual(curve)
  expect(readingAt(points, 150)).toBe(.8)
  expect(smoothedSignalCurve(points,200,10,1,0)).toEqual(signalCurve(points,200))
})
it('keeps stable scores flat and resets at missing evidence or model changes', () => {
  const points = [{time:0,end:100,value:.2,coverage:'',basis:'v1'}, {time:200,end:300,value:-.5,coverage:'',basis:'v1'}, {time:300,end:500,value:.7,coverage:'',basis:'v2'}]
  const curve = smoothedSignalCurve(points,400,10,6,0)
  expect(curve).toContainEqual([100,null])
  expect(curve.filter(([t,v])=>t>100 && t<200 && v!==null)).toEqual([])
  expect(curve).toContainEqual([200,-50])
  expect(curve).toContainEqual([300,70])
  expect(readingAt(points,150)).toBeNull()
  expect(smoothedSignalCurve([{time:0,end:1000,value:.3,coverage:''}],100,10,6,0).every(([,v])=>v===30)).toBe(true)
})
