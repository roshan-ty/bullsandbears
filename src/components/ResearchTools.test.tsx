// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { AnalystBriefing, Scorecard } from './ResearchTools'
import type { DashboardSnapshot, HorizonBias, PairBias } from '../domain/types'
vi.mock('./ChartRenderer', () => ({ default: () => <div data-testid="research-chart">Chart</div> }))
afterEach(cleanup)
const snapshot: DashboardSnapshot = {schemaVersion:1,generatedAt:null,currencies:[],pairs:[],events:[],cot:[],history:[],prices:[],news:[],analysis:[],setups:[],feedHealth:[]}
const horizon: HorizonBias = {score:.2,label:'bullish',coverage:.5,eventCount:1,updatedAt:null,factors:[{name:'growth',score:1,count:1}]}
it('flags opposing horizons, counter-evidence and stale readings in the analyst briefing', () => {
  const reading: HorizonBias = {...horizon,components:[{key:'macro',name:'Macro',score:.6,weight:.5,contribution:.3,available:true,ruleId:'growth'},{key:'positioning',name:'Positioning',score:-.2,weight:.5,contribution:-.1,available:true,ruleId:'positioning'}]}
  const pair: PairBias = {symbol:'US500',base:'US500',quote:'USD',score:.2,label:'bullish',updatedAt:null,rationale:[],shortTerm:reading,longTerm:{...horizon,score:-.2,label:'bearish'}}
  const view = render(<AnalystBriefing pair={pair} horizon="shortTerm" />)
  expect(screen.getByText(/other horizon points the opposite way/)).toBeTruthy()
  expect(screen.getByText(/Positioning pushes against the selected bias \(-0.100\)/)).toBeTruthy()
  expect(screen.getByText(/timestamp is missing or over 12 hours old/)).toBeTruthy()
  view.rerender(<AnalystBriefing pair={{...pair,shortTerm:{...horizon,label:'unavailable',score:0}}} horizon="shortTerm" />)
  expect(screen.getByText(/cannot establish a directional thesis/)).toBeTruthy()
  expect(screen.getByText(/Wait for fresh, dated inputs/)).toBeTruthy()
})
it('shows score contributions and missing inputs without creating votes', () => {
  const reading={...horizon,components:[{key:'macro',name:'Macro',score:.2,weight:1,contribution:.2,available:true,ruleId:'growth'},{key:'positioning',name:'Positioning',score:null,weight:0,contribution:0,available:false,ruleId:'positioning'}]}
  const pair: PairBias={symbol:'US500',base:'US500',quote:'USD',score:.2,label:'bullish',updatedAt:null,rationale:[],shortTerm:reading,longTerm:reading}
  render(<Scorecard pair={pair} reading={reading} snapshot={snapshot} />)
  expect(screen.getByText('Unavailable')).toBeTruthy()
  expect(screen.getByText('Total bias score')).toBeTruthy()
})
