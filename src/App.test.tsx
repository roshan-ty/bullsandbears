// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import App from './App'

vi.mock('./components/Chart', () => ({
  HistoryChart: () => <div>Historical chart</div>,
  Empty: ({ message }: { message: string }) => <div>{message}</div>,
}))

vi.mock('./components/ChartRenderer', () => ({ default: () => <div>Chart</div> }))

afterEach(() => { cleanup(); vi.unstubAllGlobals() })

it('renders the dashboard and every tab with an empty real-data snapshot', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({
    schemaVersion: 1, generatedAt: null, currencies: [], pairs: [], events: [], cot: [],
    history: [], prices: [], news: [], analysis: [], setups: [], feedHealth: [],
  }) }))
  render(<App />)
  await screen.findByText('No public news metadata is available.')
  for (const name of ['Data', 'Bias', 'CFTC', 'Historical Data', 'Analysis', 'Top Setups', 'Economic Calendar', 'Home']) {
    fireEvent.click(screen.getByRole('button', { name }))
    expect(document.querySelector('main')?.textContent?.length).toBeGreaterThan(0)
  }
})

it('filters visible bias rows and keeps positioning report families separate', async () => {
  const horizon = { score: 0.3, label: 'bullish', coverage: 0.7, eventCount: 4, updatedAt: null }
  const position = { marketId: '1', instrument: 'EUR', reportDate: '2026-10-20', category: 'Asset Manager', long: 100, short: 20, net: 80, openInterest: 200, spread: null, weeklyNetChange: null, normalizedScore: null }
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({
    schemaVersion: 1, generatedAt: null, currencies: [], events: [], history: [], prices: [], news: [], analysis: [], setups: [], feedHealth: [],
    pairs: ['EURUSD', 'GBPUSD'].map((symbol) => ({ symbol, base: symbol.slice(0, 3), quote: 'USD', shortTerm: horizon, longTerm: horizon })),
    cot: [{ ...position, reportFamily: 'tff' }, { ...position, reportFamily: 'legacy', category: 'Non-commercial' }],
  }) }))
  render(<App />)
  await screen.findByText('No public news metadata is available.')
  fireEvent.click(screen.getByRole('button', { name: 'Bias' }))
  fireEvent.change(screen.getByLabelText('Search pairs'), { target: { value: 'GBP' } })
  expect(screen.queryByText('EURUSD')).toBeNull()
  expect(screen.getByText('GBPUSD')).toBeTruthy()
  fireEvent.click(screen.getByRole('button', { name: 'CFTC' }))
  expect(screen.getByText('Asset Manager')).toBeTruthy()
  expect(screen.queryByText('Non-commercial')).toBeNull()
  fireEvent.change(screen.getByLabelText('Report family'), { target: { value: 'legacy' } })
  expect(screen.getByText('Non-commercial')).toBeTruthy()
  expect(screen.queryByText('Asset Manager')).toBeNull()
})

it('limits CFTC choices to report markets and synchronizes table with the selected market', async () => {
  const position = { reportFamily: 'tff', reportDate: '2026-10-20', category: 'Asset Manager', long: 100, short: 20, net: 80, openInterest: 200, spread: null, weeklyNetChange: null, normalizedScore: null }
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({
    schemaVersion: 1, generatedAt: null, currencies: [], pairs: [], events: [], history: [], prices: [], news: [], analysis: [], setups: [], feedHealth: [],
    cot: [{ ...position, instrument: 'EUR', marketId: 'Euro-contract' }, { ...position, instrument: 'JPY', marketId: 'Yen-contract' }],
  }) }))
  render(<App />)
  await screen.findByText('No public news metadata is available.')
  fireEvent.click(screen.getByRole('button', { name: 'CFTC' }))
  const selector = screen.getByLabelText('CFTC market') as HTMLSelectElement
  expect([...selector.options].map((option) => option.value)).toEqual(['EUR', 'JPY'])
  expect(screen.queryByRole('cell', { name: 'Yen-contract' })).toBeNull()
  fireEvent.change(selector, { target: { value: 'JPY' } })
  expect(screen.getByRole('cell', { name: 'Yen-contract' })).toBeTruthy()
  expect(screen.queryByRole('cell', { name: 'Euro-contract' })).toBeNull()
})

it('limits analysis selection to available narratives and switches horizons', async () => {
  const view = { instrument: 'BTCUSD', generatedAt: null, bias: 'bullish', score: .4, horizon: 'shortTerm', sections: [{ title: 'Short evidence', body: 'Short window.' }] }
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({
    schemaVersion: 1, generatedAt: null, currencies: [{symbol: 'USD'}], pairs: [], events: [], cot: [], history: [], prices: [], news: [], setups: [], feedHealth: [],
    analysis: [{ ...view, horizonViews: { shortTerm: view, longTerm: { ...view, horizon: 'longTerm', sections: [{ title: 'Long evidence', body: 'Long window.' }] } } }],
  }) }))
  render(<App />)
  await screen.findByText('No public news metadata is available.')
  fireEvent.click(screen.getByRole('button', { name: 'Analysis' }))
  const selector = screen.getByLabelText('Selected instrument') as HTMLSelectElement
  expect([...selector.options].map((option) => option.value)).toEqual(['BTCUSD'])
  expect(screen.getByText('Short window.')).toBeTruthy()
  fireEvent.click(screen.getByRole('button', { name: /^Long term$/ }))
  expect(screen.getByText('Long window.')).toBeTruthy()
  expect(screen.queryByText('Short window.')).toBeNull()
})
