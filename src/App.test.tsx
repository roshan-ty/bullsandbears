// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import App from './App'

vi.mock('./components/Chart', () => ({
  HistoryChart: () => <div>Historical chart</div>,
  Empty: ({ message }: { message: string }) => <div>{message}</div>,
}))

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