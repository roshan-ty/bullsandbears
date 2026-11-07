import { expect, it } from 'vitest'
import { accountGroups, accountOption, dayKey, exportJournal, journalStats } from './journal'
import type { JournalData, JournalTrade } from './journal'

const trade = (id: string, accountId: string, pnl: number | null, complete = true): JournalTrade => ({ id, accountId, symbol: 'ES', side: 'long', status: 'closed', openedAt: '2026-10-24T23:00:00Z', closedAt: '2026-10-25T00:30:00Z', quantity: 1, openQuantity: 0, entry: 100, exit: 110, stopLoss: null, takeProfit: null, pnl, realizedPnl: pnl ?? 0, unrealizedPnl: null, complete, origin: 'manual' })
const data: JournalData = {
  accounts: [{ id: 'a', name: 'A', type: 'manual', currency: 'USD', status: 'ready', enabled: true }, { id: 'b', name: 'B', type: 'mt5', currency: 'USD', status: 'connected', enabled: true }, { id: 'c', name: 'C', type: 'tradersyard', currency: 'EUR', status: 'connected', enabled: true }],
  trades: [trade('1', 'a', 100), trade('2', 'a', -40), trade('3', 'b', 0), trade('4', 'c', 1000), trade('5', 'a', null, false)],
  flows: [{ id: '1', accountId: 'a', time: '2026-10-25T00:30:00Z', amount: 100 }, { id: '2', accountId: 'a', time: '2026-10-25T00:30:00Z', amount: -40 }, { id: '4', accountId: 'c', time: '2026-10-25T00:30:00Z', amount: 1000 }],
}
it('keeps currencies separate and counts break-even trades in win rate', () => {
  const stats = journalStats(data, 'all', 'USD', '2026-10', 'UTC')
  expect(stats.realized).toBe(60)
  expect(stats.winRate).toBeCloseTo(100 / 3)
  expect(stats.profitFactor).toBe(2.5)
  expect(stats.expectancy).toBe(20)
  expect(stats.days['2026-10-25']).toEqual({ pnl: 60, trades: 3 })
  expect(journalStats(data, 'a', 'USD', null, 'UTC').winRate).toBe(50)
  expect(journalStats(data, 'c', 'EUR', null, 'UTC').realized).toBe(1000)
})
it('uses actual cash event dates, the chosen time zone and month', () => {
  expect(dayKey('2026-10-25T00:30:00Z', 'America/New_York')).toBe('2026-10-24')
  expect(journalStats(data, 'all', 'USD', '2026-11', 'UTC').realized).toBe(0)
  expect(journalStats(data, 'all', 'USD', null, 'America/New_York').days['2026-10-24'].pnl).toBe(60)
})
it('does not turn unavailable floating P&L into zero', () => {
  const open = { ...trade('open', 'a', null), status: 'open' as const, closedAt: null }
  expect(journalStats({ ...data, trades: [...data.trades, open] }, 'all', 'USD', null, 'UTC').floating).toBeNull()
})
it('exports quoted notes and blocks spreadsheet formulas in text', () => {
  const csv = exportJournal([{ ...trade('1', 'a', -40), notes: '=HYPERLINK("https://example.com")', setup: 'A, B\nC' }], data.accounts)
  expect(csv).toContain('"\'=HYPERLINK(""https://example.com"")"')
  expect(csv).toContain('"-40"')
  expect(csv).toContain('"A, B\nC"')
})

it('preserves original account numbers and platform labels in selection and export', () => {
  const account = { ...data.accounts[2], accountNumber: 'F-00001', platformName: 'Exact platform name', remoteId: 'id-001', platformStatus: 'Failed', accountCategory: 'failed' as const }
  expect(accountOption(account)).toBe('F-00001 · Exact platform name · Failed · EUR')
  expect(accountGroups([account])[0].label).toBe('TradersYard · Failed')
  const csv = exportJournal([trade('1', 'c', -40)], [account])
  expect(csv).toContain('"F-00001","F-00001","Exact platform name","id-001","Failed"')
})
