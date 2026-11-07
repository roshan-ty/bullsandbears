// @vitest-environment jsdom
import { afterEach, expect, it } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { FundamentalReport } from './FundamentalReport'
import { explainTransmission } from '../domain/education'
import type { AnalysisRecord, DashboardSnapshot, PairBias, ScoredEvent } from '../domain/types'
afterEach(cleanup)
const reading = { score: -.2, label: 'bearish' as const, coverage: .5, eventCount: 1, updatedAt: '2026-10-24T00:00:00Z' }
const pair: PairBias = { symbol:'EURUSD',base:'EUR',quote:'USD',score:-.2,label:'bearish',updatedAt:reading.updatedAt,rationale:[],shortTerm:reading,longTerm:reading }
const event: ScoredEvent = { id:'cpi',occurredAt:'2026-10-14T00:00:00Z',currency:'USD',indicatorId:'inflation',name:'CPI',impact:'high',actual:3,previous:2,forecast:4,unit:'%',direction:'higher_is_bullish',weight:1.2,signal:1,comparison:2,comparisonKind:'previous',surprise:1,contribution:2.1,bias:'bullish' }
const evidence = { eventId:'cpi',ageDays:10,decay:.5,mappedContribution:2.1,assetSensitivity:null,regionWeight:null,affectedLegs:['USD'],factor:'inflation' }
const analysis: AnalysisRecord = {instrument:'EURUSD',generatedAt:reading.updatedAt,bias:'bearish',score:-.2,horizon:'shortTerm',sections:[],lessonEvidence:[evidence]}
const snapshot: DashboardSnapshot = {schemaVersion:1,generatedAt:reading.updatedAt,currencies:[],pairs:[pair],events:[event],cot:[],history:[],prices:[],news:[],analysis:[analysis],setups:[],feedHealth:[]}
it('distinguishes a quote-currency improvement from a forecast miss and explains decay', () => {
  render(<FundamentalReport pair={pair} horizon="shortTerm" snapshot={snapshot} analysis={analysis} />)
  fireEvent.click(screen.getByRole('button',{name:'Expand all lessons'}))
  expect(screen.getByText(/USD is the quote currency.*bearish marginal direction/)).toBeTruthy()
  expect(screen.getByText(/Actual minus forecast is -1 percentage points/)).toBeTruthy()
  expect(screen.getByText(/pre-aggregation vote, not an additive share/)).toBeTruthy()
  expect(screen.queryByText(/Read the institutional background/)).toBeNull()
})
it('does not invent a single pair direction for an event mapped to both legs', () => {
  const text = explainTransmission({...pair,symbol:'AUDNZD',base:'AUD',quote:'NZD'},event,{...evidence,affectedLegs:['AUD','NZD']})
  expect(text).toContain('No isolated pair direction is assigned')
})
it('distinguishes missing lesson evidence and positions from measured neutrality', () => {
  render(<FundamentalReport pair={pair} horizon="longTerm" snapshot={snapshot} />)
  expect(screen.getByText(/No release-level lesson evidence is published/)).toBeTruthy()
  expect(screen.getByText(/No eligible direct positioning is available/)).toBeTruthy()
})
it('teaches issuance growth rather than confusing it with a supply balance', () => {
  const crypto = {...pair,symbol:'BTCUSD',macroCurrencies:['USD']}
  render(<FundamentalReport pair={crypto} horizon="shortTerm" analysis={analysis} snapshot={{...snapshot,cryptoFundamentals:[{instrument:'BTCUSD',shortTerm:{available:true,score:.1,coverage:.33,groupCount:1,agreement:1,metrics:[{metric:'SplyCur',name:'Supply pressure',group:'supply',score:.1,change:-.2,changeUnit:'annualised percentage-point change in issuance',current:.0001,previous:.0002,windowDays:7,observations:14,asOf:'2026-10-23'}]},longTerm:{available:false,score:0,coverage:0,groupCount:0,agreement:0,metrics:[]}}]}} />)
  expect(screen.getByText(/daily log supply-growth rates, not token balances/)).toBeTruthy()
  expect(screen.getByText(/A slower positive growth rate still means supply is increasing/)).toBeTruthy()
})
