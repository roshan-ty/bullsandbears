// @vitest-environment jsdom
import { afterEach, expect, it } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { EventTable } from './EconomicCalendar'
import type { ScoredEvent } from '../domain/types'
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
