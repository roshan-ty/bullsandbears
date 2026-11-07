// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import App from './App'
vi.mock('./components/ChartRenderer', () => ({ default: () => <div>Chart</div> }))
afterEach(() => { cleanup(); vi.unstubAllGlobals() })
const snapshot = { schemaVersion: 1, generatedAt: null, currencies: [], pairs: [], events: [], cot: [], history: [], prices: [], news: [], analysis: [], setups: [], feedHealth: [] }
it('offers exactly the free tabs and email purchase with the advertised price', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => snapshot }))
  render(<App />)
  await screen.findByRole('heading', { name: 'Market overview' })
  const nav = within(screen.getByRole('navigation', { name: 'Primary navigation' }))
  expect(nav.getAllByRole('button').map(button => button.textContent)).toEqual(['Home','Data','Bias','Journal','Analysis','Economical Calendar','Partners','Get Full Version'])
  for (const name of ['Data','Bias','Analysis','Economical Calendar','Partners']) {
    fireEvent.click(nav.getByRole('button', { name }))
    expect(document.querySelector('main')?.textContent?.length).toBeGreaterThan(0)
  }
  fireEvent.click(nav.getByRole('button', { name: 'Get Full Version' }))
  const link = screen.getByRole('link', { name: 'Email to buy the full version' })
  expect(link.getAttribute('href')).toContain('mailto:bullsandbears@gmail.com?')
  expect(screen.getByText('$500')).toBeTruthy()
  expect(screen.getByText('$1,000')).toBeTruthy()
})
it('keeps mobile navigation separate and closes it when choosing a tab', () => {
  vi.stubGlobal('fetch', vi.fn().mockImplementation(() => new Promise(() => {})))
  render(<App />)
  const toggle = document.querySelector('.mobile-nav-trigger')!
  fireEvent.click(toggle)
  expect(toggle.getAttribute('aria-expanded')).toBe('true')
  fireEvent.click(within(screen.getByRole('navigation', { name: 'Mobile navigation' })).getByRole('button', { name: 'Get Full Version' }))
  expect(toggle.getAttribute('aria-expanded')).toBe('false')
  expect(screen.getByRole('heading', { name: 'Built for serious traders.' })).toBeTruthy()
})
