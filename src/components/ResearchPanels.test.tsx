// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { HistoryExplorer, PositionChart } from './ResearchPanels'

vi.mock('./ChartRenderer', () => ({ default: () => <div data-testid="chart">Chart</div> }))
afterEach(cleanup)

it('makes available history discoverable without a matching currency selection', () => {
  render(<HistoryExplorer points={[
    { seriesId: 'test', instrument: 'USD', name: 'Test series', date: '2026-01-01', value: 4, unit: 'Percent' },
  ]} />)
  expect(screen.getByLabelText('Historical series')).toBeTruthy()
  expect(screen.getByTestId('chart')).toBeTruthy()
  fireEvent.change(screen.getByLabelText('History range'), { target: { value: 'all' } })
  expect(screen.getByText('View latest 50 observations')).toBeTruthy()
})

it('keeps positioning unavailable rather than generating chart data', () => {
  render(<PositionChart rows={[]} />)
  expect(screen.queryByTestId('chart')).toBeNull()
})
it('only lists series belonging to the chosen historical instrument', () => {
  render(<HistoryExplorer points={[
    { seriesId: 'no', instrument: 'NOK', name: 'Norway inflation', date: '2026-08-01', value: 3, unit: '%', frequency: 'monthly', releaseDateKnown: false },
    { seriesId: 'sg', instrument: 'SGD', name: 'Singapore inflation', date: '2026-07-01', value: 2, unit: '%', frequency: 'monthly', releaseDateKnown: false },
  ]} />)
  fireEvent.change(screen.getByLabelText('History instrument'), { target: { value: 'SGD' } })
  const selector = screen.getByLabelText('Historical series') as HTMLSelectElement
  expect([...selector.options].map((option) => option.value)).toEqual(['sg'])
  expect(screen.getByText(/These dates are not publication dates/)).toBeTruthy()
})
