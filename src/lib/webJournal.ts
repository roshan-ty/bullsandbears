import type { JournalAccount, JournalData, JournalTrade } from '../domain/journal'

export const journalKey = 'bb-web-journal-v1'
const maxBytes = 4_000_000
type Fields = Record<string, unknown>
const record = (value: unknown): Fields => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Invalid journal record.')
  return value as Fields
}
const text = (value: unknown, name: string, max: number, optional = false): string => {
  if (optional && (value === undefined || value === null)) return ''
  if (typeof value !== 'string' || value.length > max || (!optional && !value.trim())) throw new Error(`Invalid ${name}.`)
  return value.trim()
}
const numeric = (value: unknown, name: string, optional = false): number | null => {
  if (optional && (value === undefined || value === null || value === '')) return null
  if (typeof value !== 'number' || !Number.isFinite(value) || Math.abs(value) > 1e15) throw new Error(`Invalid ${name}.`)
  return value
}
const timestamp = (value: unknown, name: string): string => {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T/.test(value) || !Number.isFinite(Date.parse(value))) throw new Error(`Invalid ${name}.`)
  return new Date(value).toISOString()
}

function account(value: unknown): JournalAccount {
  const row = record(value)
  if (row.type !== 'manual') throw new Error('This journal accepts manual accounts only.')
  const currency = text(row.currency, 'currency', 8).toUpperCase()
  if (!/^[A-Z]{3,8}$/.test(currency)) throw new Error('Enter a valid account currency.')
  return { id: text(row.id, 'account ID', 100), name: text(row.name, 'account name', 80), currency, type: 'manual', enabled: true, status: 'ready' }
}

function trade(value: unknown, accounts: JournalAccount[]): JournalTrade {
  const row = record(value)
  const accountId = text(row.accountId, 'account ID', 100)
  if (!accounts.some(item => item.id === accountId)) throw new Error('Choose an existing account.')
  if (!['long', 'short'].includes(String(row.side))) throw new Error('Choose Long or Short.')
  if (!['open', 'closed'].includes(String(row.status))) throw new Error('Choose Open or Closed.')
  const closed = row.status === 'closed'
  const quantity = numeric(row.quantity, 'quantity')!
  if (quantity <= 0) throw new Error('Quantity must be greater than zero.')
  const openedAt = timestamp(row.openedAt, 'entry time')
  const closedAt = closed ? timestamp(row.closedAt, 'exit time') : null
  if (closedAt && closedAt < openedAt) throw new Error('Exit time must be on or after entry time.')
  const entry = numeric(row.entry, 'entry price')!
  const exit = closed ? numeric(row.exit, 'exit price') : null
  const pnl = closed ? numeric(row.pnl, 'net P&L') : null
  return {
    id: text(row.id, 'trade ID', 100), accountId, symbol: text(row.symbol, 'instrument', 80).toUpperCase(),
    side: row.side as 'long' | 'short', status: row.status as 'open' | 'closed', openedAt, closedAt,
    quantity, openQuantity: closed ? 0 : quantity, entry, exit,
    stopLoss: numeric(row.stopLoss, 'stop loss', true), takeProfit: numeric(row.takeProfit, 'take profit', true),
    pnl, realizedPnl: closed ? pnl : 0, unrealizedPnl: closed ? 0 : numeric(row.unrealizedPnl, 'floating P&L', true),
    complete: closed, origin: 'manual', notes: text(row.notes, 'notes', 10000, true),
    setup: text(row.setup, 'setup', 300, true), tags: text(row.tags, 'tags', 300, true),
  }
}

function normalized(value: unknown): JournalData {
  const raw = record(value)
  if (!Array.isArray(raw.accounts) || !Array.isArray(raw.trades) || raw.accounts.length > 100 || raw.trades.length > 10000) throw new Error('Invalid journal backup or journal size limit exceeded.')
  const accounts = raw.accounts.map(account)
  if (new Set(accounts.map(row => row.id)).size !== accounts.length) throw new Error('Duplicate account IDs in journal.')
  const trades = raw.trades.map(row => trade(row, accounts))
  if (new Set(trades.map(row => row.id)).size !== trades.length) throw new Error('Duplicate trade IDs in journal.')
  // Derive cash flows from the validated net P&L, never trust imported totals.
  const flows = trades.filter(row => row.status === 'closed').map(row => ({ id: row.id, tradeId: row.id, accountId: row.accountId, time: row.closedAt!, amount: row.pnl! }))
  return { accounts, trades, flows }
}

export function parseJournalBackup(raw: string): JournalData {
  if (new Blob([raw]).size > maxBytes) throw new Error('Journal backup is too large (maximum 4 MB).')
  let value: Fields
  try { value = record(JSON.parse(raw)) } catch { throw new Error('The journal file is not valid JSON.') }
  if (value.schemaVersion !== 1) throw new Error('Unsupported journal backup version.')
  return normalized(value)
}

export function readJournal(): JournalData {
  let raw: string | null
  try { raw = localStorage.getItem(journalKey) } catch { throw new Error('Browser storage is unavailable. Allow site storage to use the journal.') }
  if (raw === null) return { accounts: [], trades: [], flows: [] }
  try { return parseJournalBackup(raw) } catch { throw new Error('Saved journal could not be read. Download the saved file before restoring a backup. Your existing data has not been changed.') }
}

export function backupJournal(data: JournalData): string {
  const valid = normalized(data)
  return JSON.stringify({ schemaVersion: 1, exportedAt: new Date().toISOString(), accounts: valid.accounts, trades: valid.trades }, null, 2)
}

function persist(data: JournalData) {
  const serialized = backupJournal(data)
  if (new Blob([serialized]).size > maxBytes) throw new Error('Journal is full. Export a backup before removing older trades.')
  try { localStorage.setItem(journalKey, serialized) } catch { throw new Error('Journal could not be saved. Browser storage may be full or blocked. Your previous journal is unchanged.') }
  window.dispatchEvent(new Event('bb-journal-changed'))
}

export function downloadJournalFile(content: string, filename: string, type = 'application/json') {
  const url = URL.createObjectURL(new Blob([content], { type }))
  const link = document.createElement('a'); link.href = url; link.download = filename
  document.body.append(link); link.click(); link.remove()
  window.setTimeout(() => URL.revokeObjectURL(url), 1000)
}

export function downloadSavedJournal() {
  const raw = localStorage.getItem(journalKey)
  if (raw === null) throw new Error('There is no saved journal to download yet.')
  downloadJournalFile(raw, `bulls-bears-journal-${new Date().toISOString().slice(0, 10)}.json`)
}

// Each mutation reads the latest state and writes synchronously. Web Locks also
// serialize writes from other tabs when supported by the browser.
export async function webJournal(method: string, args: Fields = {}): Promise<JournalData> {
  const operation = () => {
    if (method === 'journalRestore') {
      const data = parseJournalBackup(text(args.backup, 'backup', maxBytes))
      persist(data)
      return data
    }
    const data = readJournal()
    if (method === 'journal') return data
    if (method === 'journalCreate') {
      data.accounts.push(account({ ...args, type: 'manual', id: crypto.randomUUID() }))
    } else if (method === 'journalTrade') {
      const id = args.id === undefined ? crypto.randomUUID() : text(args.id, 'trade ID', 100)
      const next = trade({ ...args, id }, data.accounts)
      data.trades = [...data.trades.filter(row => row.id !== id), next]
    } else if (method === 'journalRemoveTrade') {
      data.trades = data.trades.filter(row => !(row.id === args.id && row.accountId === args.accountId))
    } else if (method === 'journalRemoveAccount') {
      if (data.trades.some(row => row.accountId === args.accountId)) throw new Error('Remove this account’s trades first. Export a backup before deleting records.')
      data.accounts = data.accounts.filter(row => row.id !== args.accountId)
    } else throw new Error('Unsupported journal action.')
    const valid = normalized(data)
    persist(valid)
    return valid
  }
  return navigator.locks?.request ? navigator.locks.request(journalKey, operation) : operation()
}
