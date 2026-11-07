// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { Journal } from './Journal'
import { readJournal, webJournal } from '../lib/webJournal'
vi.mock('./ChartRenderer', () => ({ default: () => <div data-testid="pnl-chart" /> }))

beforeEach(() => {
  Object.defineProperty(HTMLDialogElement.prototype, 'showModal', { configurable: true, value: function (this: HTMLDialogElement) { this.open = true } })
})
afterEach(() => { cleanup(); localStorage.clear(); vi.restoreAllMocks() })
const fields = { symbol: 'EURUSD', side: 'long', status: 'closed', openedAt: '2026-01-01T10:00:00Z', closedAt: '2026-01-01T11:00:00Z', quantity: 1, entry: 1.1, exit: 1.2, pnl: 100 }
it('works in a browser, separates open and closed trades, and remembers account selection', async () => {
  let data = await webJournal('journalCreate', { name: 'Trading account', currency: 'USD' })
  const first = data.accounts[0].id
  await webJournal('journalTrade', { ...fields, accountId: first })
  data = await webJournal('journalCreate', { name: 'Second account', currency: 'USD' })
  const second = data.accounts[1].id
  await webJournal('journalTrade', { ...fields, symbol: 'USDJPY', accountId: second, status: 'open', unrealizedPnl: 20 })
  const mounted = render(<Journal />)
  await screen.findByText('Cumulative realized P&L')
  fireEvent.change(screen.getByLabelText('Journal period'), { target: { value: 'all' } })
  expect(screen.getByText('EURUSD')).toBeTruthy()
  expect(screen.queryByText('USDJPY')).toBeNull()
  fireEvent.click(screen.getByRole('button', { name: 'Open' }))
  expect(screen.getByText('USDJPY')).toBeTruthy()
  expect(screen.queryByText('EURUSD')).toBeNull()
  fireEvent.change(screen.getByLabelText('Journal account'), { target: { value: first } })
  expect(screen.queryByText('USDJPY')).toBeNull()
  expect(localStorage.getItem('bb-journal-account')).toBe(first)
  mounted.unmount()
  render(<Journal />)
  await waitFor(() => expect((screen.getByLabelText('Journal account') as HTMLSelectElement).value).toBe(first))
})

it('creates a manual account from an empty journal without requesting platform credentials', async () => {
  render(<Journal />)
  await screen.findByText('Your trading record starts here')
  expect(screen.queryByTestId('pnl-chart')).toBeNull()
  fireEvent.click(screen.getByRole('button', { name: 'Add your first account' }))
  fireEvent.change(screen.getByLabelText('Account name'), { target: { value: 'My account' } })
  fireEvent.click(screen.getByRole('button', { name: 'Create account' }))
  await screen.findByText('Cumulative realized P&L')
  expect(readJournal().accounts[0].name).toBe('My account')
  expect(screen.queryByText('Investor password')).toBeNull()
  expect(screen.getByRole('button', { name: 'Download backup' })).toBeTruthy()
  expect(screen.getByRole('button', { name: 'Restore backup' })).toBeTruthy()
})
