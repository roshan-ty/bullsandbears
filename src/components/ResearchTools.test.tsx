// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { MacroMap, ScoreJournal, Scorecard } from './ResearchTools'
import type { DashboardSnapshot, HorizonBias, PairBias } from '../domain/types'
vi.mock('./ChartRenderer', () => ({ default: () => <div data-testid="research-chart">Chart</div> }))
afterEach(cleanup)
const snapshot: DashboardSnapshot = {schemaVersion:1,generatedAt:null,currencies:[],pairs:[],events:[],cot:[],history:[],prices:[],news:[],analysis:[],setups:[],feedHealth:[]}
const horizon: HorizonBias = {score:.2,label:'bullish',coverage:.5,eventCount:1,updatedAt:null,factors:[{name:'growth',score:1,count:1}]}
it('shows missing heatmap factors distinctly and includes a zero forecast as context', () => {
  const now=new Date().toISOString()
  render(<MacroMap snapshot={{...snapshot,methodology:[{id:'growth',name:'Growth',indicators:['gdp'],mechanism:'Output',mapping:'Conditional',limit:'Revisions matter'},{id:'policy',name:'Policy',indicators:['policy-rate'],mechanism:'Rates',mapping:'Conditional',limit:'Expectations matter'}],
    currencies:[{symbol:'USD',score:.2,label:'bullish',eventScore:.2,cotScore:0,eventCount:1,updatedAt:null,shortTerm:horizon,longTerm:horizon}],
    events:[{id:'x',currency:'USD',name:'GDP release',occurredAt:now,actual:1,previous:2,forecast:0,unit:'%',indicatorId:'gdp',impact:'high',direction:'higher_is_bullish',weight:1,comparison:2,comparisonKind:'previous',surprise:-1,signal:-1,contribution:-1,bias:'bearish'}]}} />)
  expect(screen.getByText('No eligible evidence')).toBeTruthy()
  expect(screen.getByText('+1.000 pp')).toBeTruthy()
  expect(screen.getByText(/official bias continues to compare actual with previous/)).toBeTruthy()
})
it('shows score contributions and missing inputs without creating votes', () => {
  const reading={...horizon,components:[{key:'macro',name:'Macro',score:.2,weight:1,contribution:.2,available:true,ruleId:'growth'},{key:'positioning',name:'Positioning',score:null,weight:0,contribution:0,available:false,ruleId:'positioning'}]}
  const pair: PairBias={symbol:'US500',base:'US500',quote:'USD',score:.2,label:'bullish',updatedAt:null,rationale:[],shortTerm:reading,longTerm:reading}
  render(<Scorecard pair={pair} reading={reading} snapshot={snapshot} />)
  expect(screen.getByText('Unavailable')).toBeTruthy()
  expect(screen.getByText('Total bias score')).toBeTruthy()
})
it('separates journal model versions and labels the initial sample as insufficient', () => {
  render(<ScoreJournal snapshot={{...snapshot,scoreHistory:[{instrument:'EURUSD',horizon:'shortTerm',recordedAt:'2026-10-24T12:00:00Z',modelVersion:'v3',score:.2,label:'bullish',coverage:.5,referencePrice:1.1,priceAsOf:'2026-10-23T00:00:00Z'}]}} instrument="EURUSD" horizon="shortTerm" />)
  expect(screen.getByText(/Insufficient observations for performance evaluation/)).toBeTruthy()
  expect(screen.getByTestId('research-chart')).toBeTruthy()
  fireEvent.change(screen.getByLabelText('Journal model version'),{target:{value:'v3'}})
  expect(screen.getByText(/1 recorded day/)).toBeTruthy()
})
