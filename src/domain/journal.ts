export interface JournalAccount {
  id: string; name: string; type: 'manual' | 'mt5' | 'tradersyard'; currency: string
  status: string; enabled: boolean; remoteId?: string | null; server?: string; lastSync?: string; message?: string; balance?: number; equity?: number
  accountNumber?: string | null; platformName?: string | null; platformStatus?: string | null
  accountCategory?: 'active' | 'failed' | 'other'; environment?: string | null; historyAvailable?: boolean
}

export function accountLabel(account: JournalAccount) { return account.accountNumber || account.platformName || account.name || account.remoteId || account.id }
export function accountOption(account: JournalAccount) {
  return [accountLabel(account), account.platformName && account.platformName !== accountLabel(account) ? account.platformName : null,
    !account.accountNumber && account.remoteId !== accountLabel(account) ? account.remoteId : null, account.platformStatus, account.currency].filter(Boolean).join(' · ')
}

export function accountGroups(accounts: JournalAccount[]) {
  return [
    { label: 'TradersYard · Active', accounts: accounts.filter(row => row.type === 'tradersyard' && row.accountCategory === 'active') },
    { label: 'TradersYard · Failed', accounts: accounts.filter(row => row.type === 'tradersyard' && row.accountCategory === 'failed') },
    { label: 'TradersYard · Other', accounts: accounts.filter(row => row.type === 'tradersyard' && !['active', 'failed'].includes(row.accountCategory || 'other')) },
    { label: 'Other accounts', accounts: accounts.filter(row => row.type !== 'tradersyard') },
  ].filter(group => group.accounts.length)
}
export interface JournalTrade {
  id: string; accountId: string; symbol: string; side: 'long' | 'short'; status: 'open' | 'closed' | 'unresolved'
  openedAt: string | null; closedAt: string | null; quantity: number; openQuantity: number
  entry: number | null; exit: number | null; stopLoss: number | null; takeProfit: number | null; protectionBasis?: string
  pnl: number | null; realizedPnl: number | null; unrealizedPnl: number | null; complete: boolean; origin: string
  commission?: number | null; swap?: number | null; fee?: number | null; notes?: string; setup?: string; tags?: string
}
export interface JournalFlow { id: string; accountId: string; tradeId?: string; time: string; amount: number }
export interface JournalData { accounts: JournalAccount[]; trades: JournalTrade[]; flows: JournalFlow[]; connectionMessage?: string }

export function dayKey(time: string, zone: string) {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: zone, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date(time))
  return ['year', 'month', 'day'].map(key => parts.find(part => part.type === key)!.value).join('-')
}

export function journalStats(data: JournalData, accountId: string, currency: string, month: string | null, zone: string) {
  const accounts = data.accounts.filter(row => (accountId === 'all' || row.id === accountId) && row.currency === currency)
  const ids = new Set(accounts.map(row => row.id))
  const trades = data.trades.filter(row => ids.has(row.accountId))
  const eligible = trades.filter(row => row.status === 'closed' && row.closedAt && (!month || dayKey(row.closedAt, zone).startsWith(month)) && row.complete && row.pnl !== null)
  const wins = eligible.filter(row => row.pnl! > 0), losses = eligible.filter(row => row.pnl! < 0)
  const grossWin = wins.reduce((sum, row) => sum + row.pnl!, 0), grossLoss = -losses.reduce((sum, row) => sum + row.pnl!, 0)
  const flows = data.flows.filter(row => ids.has(row.accountId) && (!month || dayKey(row.time, zone).startsWith(month))).sort((a, b) => a.time.localeCompare(b.time) || a.id.localeCompare(b.id))
  const days: Record<string, { pnl: number; trades: number }> = {}
  for (const flow of flows) { const key = dayKey(flow.time, zone); days[key] ??= { pnl: 0, trades: 0 }; days[key].pnl += flow.amount }
  for (const trade of eligible) { const key = dayKey(trade.closedAt!, zone); days[key] ??= { pnl: 0, trades: 0 }; days[key].trades++ }
  let sum = 0, peak = 0, drawdown = 0
  const curve: [string, number][] = []
  for (const key of Object.keys(days).sort()) { sum += days[key].pnl; peak = Math.max(peak, sum); drawdown = Math.max(drawdown, peak - sum); curve.push([key, sum]) }
  const open = trades.filter(row => row.status === 'open')
  return { accounts, trades, eligible, flows, days, curve, realized: sum, drawdown,
    wins: wins.length, losses: losses.length, breakeven: eligible.length - wins.length - losses.length,
    winRate: eligible.length ? wins.length / eligible.length * 100 : null,
    profitFactor: grossLoss ? grossWin / grossLoss : grossWin ? Infinity : null,
    expectancy: eligible.length ? (grossWin - grossLoss) / eligible.length : null,
    open, floating: open.some(row => row.unrealizedPnl === null) ? null : open.reduce((total, row) => total + row.unrealizedPnl!, 0),
  }
}

export function exportJournal(trades: JournalTrade[], accounts: JournalAccount[]) {
  const accountMap = new Map(accounts.map(row => [row.id, row]))
  // Prevent spreadsheet formula execution when journal text is opened in a spreadsheet.
  const cell = (value: unknown) => { const raw = value == null ? '' : String(value); const safe = /^[=+@\-\t\r]/.test(raw) && typeof value !== 'number' ? "'" + raw : raw; return '"' + safe.replaceAll('"', '""') + '"' }
  const headers = ['Account', 'Account number', 'Platform name', 'Platform ID', 'Account status', 'Currency', 'Symbol', 'Side', 'Status', 'Entry time', 'Exit time', 'Quantity', 'Entry', 'Exit', 'Stop loss', 'Take profit', 'Realized P&L', 'Unrealized P&L', 'Setup', 'Tags', 'Notes']
  return '\uFEFF' + [headers, ...trades.map(row => { const account = accountMap.get(row.accountId); return [account ? accountLabel(account) : '', account?.accountNumber, account?.platformName, account?.remoteId, account?.platformStatus, account?.currency, row.symbol, row.side, row.status, row.openedAt, row.closedAt, row.quantity, row.entry, row.exit, row.stopLoss, row.takeProfit, row.realizedPnl, row.unrealizedPnl, row.setup, row.tags, row.notes] })].map(row => row.map(cell).join(',')).join('\r\n')
}
