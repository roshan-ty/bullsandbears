// @vitest-environment jsdom
import { afterEach, expect, it } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { EconomicCalendar, EventTable } from './EconomicCalendar'
import type { DashboardSnapshot, ScoredEvent } from '../domain/types'
afterEach(cleanup)
const event: ScoredEvent = { id: '1', occurredAt: '2026-10-23T12:30:00Z', currency: 'USD', name: 'CPI', indicatorId: 'inflation', impact: 'high', actual: null, forecast: 0, previous: 2.3, unit: '%', direction: 'higher_is_bullish', weight: 1, comparison: null, comparisonKind: null, surprise: null, signal: null, contribution: 0, bias: 'unavailable' }
it('shows pending releases and real zero forecasts, then replaces pending with actual', () => {
  const view = render(<EventTable events={[event]} />)
  expect(screen.getByText('Data releasing soon')).toBeTruthy()
  expect(screen.getByText('0%')).toBeTruthy()
  view.rerender(<EventTable events={[{ ...event, actual: 2.5 }]} />)
  expect(screen.queryByText('Data releasing soon')).toBeNull()
  expect(screen.getByText('2.5%')).toBeTruthy()
})
it('never turns missing forecasts into zero or speeches into pending economic values', () => {
  render(<EventTable events={[{ ...event, forecast: null }, { ...event, id: '2', name: 'Speech', hasNumericRelease: false, forecast: null, previous: null }]} />)
  expect(screen.getByText('Not published')).toBeTruthy()
  expect(screen.getAllByText('Not applicable')).toHaveLength(3)
  expect(screen.queryByText('0%')).toBeNull()
})
it('preserves complex actual values without exposing the feed identity', () => {
  render(<EventTable events={[{ ...event, actualText: '4.25|2.7', source: 'Forex Factory', sourceUrl: 'https://www.forexfactory.com/calendar' }]} />)
  expect(screen.getByText('4.25|2.7')).toBeTruthy()
  expect(screen.queryByText('Data releasing soon')).toBeNull()
  expect(screen.queryByRole('link')).toBeNull()
  expect(screen.queryByText('Forex Factory')).toBeNull()
})
it('shows disputes on the affected fields while preserving the reported values', () => {
  render(<EventTable events={[{ ...event, actual: 2.5, verification: { status: 'conflict', checkedAt: '2026-10-23T13:00:00Z', sourceCount: 2, fields: { actual: 'confirmed', forecast: 'conflict', previous: 'conflict' }, conflictingFields: ['forecast', 'previous'], note: 'Forex Factory / FX Blue comparison' } }]} />)
  expect(screen.getByText('2.5%')).toBeTruthy()
  expect(screen.getByText('2.3%')).toBeTruthy()
  expect(screen.getByText('Cross-checked')).toBeTruthy()
  expect(screen.getByText('Estimates differ')).toBeTruthy()
  expect(screen.getByText('Conflicting reports')).toBeTruthy()
  expect(screen.getByText('Bias withheld')).toBeTruthy()
  expect(screen.queryByText(/Forex Factory/)).toBeNull()
  expect(screen.getByText('23 Oct 2026, 12:30')).toBeTruthy()
})
it('filters disputed releases separately from consensus forecast differences', () => {
  const check = { checkedAt: '2026-10-23T13:00:00Z', sourceCount: 2, fields: { actual: 'confirmed' as const, forecast: 'conflict' as const, previous: 'confirmed' as const } }
  const events: ScoredEvent[] = [
    { ...event, name: 'Forecast difference', verification: { ...check, status: 'conflict', conflictingFields: ['forecast'] } },
    { ...event, id: '2', name: 'Disputed release', verification: { ...check, status: 'conflict', fields: { ...check.fields, previous: 'conflict' }, conflictingFields: ['previous'] } },
    { ...event, id: '3', name: 'Confirmed release', verification: { ...check, status: 'confirmed', fields: { actual: 'confirmed', previous: 'confirmed', forecast: 'confirmed' }, conflictingFields: [] } },
  ]
  render(<EconomicCalendar snapshot={{ events } as DashboardSnapshot} />)
  fireEvent.change(screen.getByLabelText('Calendar verification'), { target: { value: 'conflict' } })
  expect(screen.getByText('Disputed release')).toBeTruthy()
  expect(screen.queryByText('Forecast difference')).toBeNull()
  fireEvent.change(screen.getByLabelText('Calendar verification'), { target: { value: 'confirmed' } })
  expect(screen.getByText('Confirmed release')).toBeTruthy()
  expect(screen.queryByText('Disputed release')).toBeNull()
})
