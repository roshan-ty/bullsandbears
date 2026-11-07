import { expect, it } from 'vitest'
import { biasMarkers, groupedMarkers } from './biasMarkers'
import type { DashboardSnapshot, PriceBar, ScoreObservation } from './types'
const time = (seconds:number) => new Date(seconds*1000).toISOString()
const observation = (seconds:number,label:ScoreObservation['label'],extra:Partial<ScoreObservation>={}) => ({instrument:'EURUSD',horizon:'shortTerm',recordedAt:time(seconds),label,score:label==='bullish'?.5:-.5,coverage:1,modelVersion:'v1',...extra}) as ScoreObservation
const bars = [0,60,120,180,240].map(seconds=>({time:time(seconds),low:1,high:2,open:1.2,close:1.5,volume:null})) as PriceBar[]
const run = (rows:ScoreObservation[],candles=bars,now=300_000) => biasMarkers({scoreHistory:rows} as DashboardSnapshot,'EURUSD','shortTerm',candles,60_000,now)
it('uses recorded labels, with outlined initial readings and bubbles at candle extrema',()=>{
  const markers=run([observation(5,'bullish'),observation(70,'bullish',{score:.9}),observation(80,'neutral'),observation(90,'bearish'),observation(130,'bullish'),observation(160,'bearish'),observation(170,'bullish')])
  expect(markers.map(m=>[m.label,m.initial])).toEqual([['bullish',true],['bearish',false],['bullish',false],['bearish',false],['bullish',false]])
  expect(markers[0]).toMatchObject({time:5000,barTime:0,price:1})
  expect(markers[1]).toMatchObject({time:90000,barTime:60000,price:2,previousLabel:'neutral'})
  expect(groupedMarkers(markers,'bullish').at(-1)?.events).toHaveLength(2)
})
it('never invents changes before available history, across missing evidence, or in other instruments',()=>{
  const markers=run([observation(-100,'bullish'),observation(5,'bullish'),observation(70,'unavailable',{coverage:0}),observation(130,'bearish'),observation(180,'bullish',{modelVersion:'v2'}),observation(200,'bearish',{instrument:'GBPUSD'}),observation(210,'bearish',{horizon:'longTerm'}),observation(400,'bearish')])
  expect(markers).toHaveLength(2)
  expect(markers.every(m=>m.initial)).toBe(true)
})
it('places closed-market observations on the next real candle only while still applicable',()=>{
  const sparse=[bars[0],bars[4]]
  const markers=run([observation(90,'bullish'),observation(100,'bullish'),observation(130,'bearish')],sparse)
  expect(markers).toHaveLength(1)
  expect(markers[0]).toMatchObject({barTime:240000,delayed:true,label:'bearish',initial:false})
  expect(run([observation(90,'bullish')],[bars[0]])).toEqual([])
  expect(run([observation(90,'bullish')],[bars[0],{...bars[1],time:time(8*86400)}],9*86400_000)).toEqual([])
})
