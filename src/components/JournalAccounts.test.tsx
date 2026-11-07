// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { JournalAccounts } from './JournalAccounts'
import type { JournalAccount } from '../domain/journal'
afterEach(cleanup)
const accounts: JournalAccount[] = [
  { id: 'a', name: 'Primary account', type: 'manual', currency: 'USD', enabled: true, status: 'ready' },
  { id: 'b', name: 'Second account', type: 'manual', currency: 'EUR', enabled: true, status: 'ready' },
]
it('searches and selects exact account, confirms before removal', () => {
  const choose = vi.fn(), remove = vi.fn()
  render(<JournalAccounts accounts={accounts} selected="a" busy={false} choose={choose} remove={remove} />)
  fireEvent.change(screen.getByLabelText('Search accounts'), { target: { value: 'Second' } })
  expect(screen.queryByText('Primary account')).toBeNull()
  fireEvent.click(screen.getByRole('button', { name: 'Open journal for Second account' }))
  expect(choose).toHaveBeenCalledExactlyOnceWith(accounts[1])
  fireEvent.click(screen.getByRole('button', { name: 'Remove empty account' }))
  expect(remove).not.toHaveBeenCalled()
  fireEvent.click(screen.getByRole('button', { name: 'Confirm removal' }))
  expect(remove).toHaveBeenCalledExactlyOnceWith(accounts[1])
})
