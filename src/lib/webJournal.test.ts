// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest'
import { backupJournal, journalKey, parseJournalBackup, readJournal, webJournal } from './webJournal'
import { journalStats } from '../domain/journal'

afterEach(() => { vi.restoreAllMocks(); localStorage.clear() })
const fields = { symbol: 'EURUSD', side: 'long', status: 'closed', openedAt: '2026-11-01T10:00:00Z', closedAt: '2026-11-01T11:00:00Z', quantity: 1, entry: 1.1, exit: 1.2, stopLoss: 1.05, takeProfit: 1.2, pnl: 75, notes: 'My notes' }
async function withTrade() {
  const { accounts } = await webJournal('journalCreate', { name: 'Main', currency: 'USD' })
  return webJournal('journalTrade', { ...fields, accountId: accounts[0].id })
}

it('keeps accounts separate, persists edits and computes net P&L without duplicate flows', async () => {
  let data = await withTrade()
  const first = data.accounts[0], saved = data.trades[0]
  data = await webJournal('journalCreate', { name: 'Second', currency: 'USD' })
  data = await webJournal('journalTrade', { ...fields, accountId: data.accounts[1].id, symbol: 'GBPUSD', pnl: -25 })
  expect(journalStats(readJournal(), 'all', 'USD', null, 'UTC').realized).toBe(50)
  expect(journalStats(readJournal(), first.id, 'USD', null, 'UTC').realized).toBe(75)
  data = await webJournal('journalTrade', { ...saved, pnl: 90 })
  expect(data.flows).toHaveLength(2)
  expect(journalStats(readJournal(), 'all', 'USD', null, 'UTC').realized).toBe(65)
  expect(journalStats(readJournal(), 'all', 'USD', null, 'UTC').winRate).toBe(50)
  await webJournal('journalRemoveTrade', { id: saved.id, accountId: saved.accountId })
  expect(readJournal().trades).toHaveLength(1)
  expect(readJournal().flows).toHaveLength(1)
})

it('records open trades with unknown floating P&L and realizes them only when closed', async () => {
  const { accounts } = await webJournal('journalCreate', { name: 'Main', currency: 'USD' })
  let data = await webJournal('journalTrade', { ...fields, accountId: accounts[0].id, status: 'open', unrealizedPnl: null })
  expect(data.flows).toEqual([])
  expect(journalStats(data, 'all', 'USD', null, 'UTC').floating).toBeNull()
  data = await webJournal('journalTrade', { ...data.trades[0], status: 'closed', closedAt: fields.closedAt, exit: 1.2, pnl: 70 })
  expect(data.flows[0].amount).toBe(70)
  expect(data.trades[0].openQuantity).toBe(0)
})

it('round trips backups and derives totals rather than accepting forged cash flows', async () => {
  const data = await withTrade()
  const raw = JSON.parse(backupJournal(data))
  raw.flows = [{ amount: 999999 }]
  const restored = parseJournalBackup(JSON.stringify(raw))
  expect(restored.flows[0].amount).toBe(75)
  expect(restored.trades[0].notes).toBe('My notes')
  localStorage.clear()
  await webJournal('journalRestore', { backup: JSON.stringify(raw) })
  expect(readJournal()).toEqual(restored)
})

it('rejects malformed imports without changing existing data', async () => {
  const data = await withTrade(), before = localStorage.getItem(journalKey)
  const raw = JSON.parse(backupJournal(data))
  raw.trades[0].pnl = '9999'
  await expect(webJournal('journalRestore', { backup: JSON.stringify(raw) })).rejects.toThrow('P&L')
  expect(localStorage.getItem(journalKey)).toBe(before)
  raw.trades[0].pnl = 75; raw.trades[0].accountId = 'missing'
  expect(() => parseJournalBackup(JSON.stringify(raw))).toThrow('existing account')
  raw.trades[0].accountId = data.accounts[0].id; raw.accounts[0].type = 'mt5'
  expect(() => parseJournalBackup(JSON.stringify(raw))).toThrow('manual accounts')
})

it('preserves corrupted saved data until the user restores a valid backup', async () => {
  localStorage.setItem(journalKey, '{broken')
  expect(() => readJournal()).toThrow('Your existing data has not been changed')
  await expect(webJournal('journalCreate', { name: 'Test', currency: 'USD' })).rejects.toThrow()
  expect(localStorage.getItem(journalKey)).toBe('{broken')
})

it('reports storage failures and preserves the previous save', async () => {
  const data = await withTrade(), before = localStorage.getItem(journalKey)
  vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new DOMException('full', 'QuotaExceededError') })
  await expect(webJournal('journalTrade', { ...data.trades[0], pnl: 200 })).rejects.toThrow('previous journal is unchanged')
  expect(localStorage.getItem(journalKey)).toBe(before)
})

it('rejects reversed dates, invalid quantities, duplicate IDs and deleting accounts with records', async () => {
  const data = await withTrade()
  await expect(webJournal('journalTrade', { ...data.trades[0], quantity: 0 })).rejects.toThrow('greater than zero')
  await expect(webJournal('journalTrade', { ...data.trades[0], closedAt: '2026-10-31T11:00:00Z' })).rejects.toThrow('Exit time')
  const raw = JSON.parse(backupJournal(data)); raw.trades.push(raw.trades[0])
  expect(() => parseJournalBackup(JSON.stringify(raw))).toThrow('Duplicate trade IDs')
  await expect(webJournal('journalRemoveAccount', { accountId: data.accounts[0].id })).rejects.toThrow('Remove this account’s trades first')
})
