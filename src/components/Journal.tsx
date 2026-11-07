import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { accountGroups, accountLabel, accountOption, dayKey, exportJournal, journalStats } from '../domain/journal'
import type { JournalAccount, JournalData, JournalTrade } from '../domain/journal'
import ChartRenderer from './ChartRenderer'
import { JournalAccounts } from './JournalAccounts'
import { downloadJournalFile, downloadSavedJournal, parseJournalBackup, webJournal } from '../lib/webJournal'
import { formatTime } from '../lib/presentation'

const empty: JournalData = { accounts: [], trades: [], flows: [] }
const localZone = Intl.DateTimeFormat().resolvedOptions().timeZone
const monthNow = () => dayKey(new Date().toISOString(), localZone).slice(0, 7)
const errorText = (reason: unknown) => reason instanceof Error ? reason.message.replace(/^Error invoking remote method '[^']+': Error: /, '') : 'Unable to load the journal.'
const number = (value: number | null | undefined, digits = 2) => value == null ? '—' : Number.isFinite(value) ? value.toLocaleString(undefined, { maximumFractionDigits: digits, minimumFractionDigits: digits }) : '∞'
const cls = (value: number | null | undefined) => value == null || value === 0 ? '' : value > 0 ? 'positive-text' : 'negative-text'
const call = webJournal

function JournalDialog({ title, children, close }: { title: string; children: ReactNode; close: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null)
  useEffect(() => { if (dialog.current && !dialog.current.open) dialog.current.showModal() }, [])
  return <dialog ref={dialog} className="journal-dialog panel" aria-label={title} onCancel={close}><header><h2>{title}</h2><button type="button" onClick={close}>Close</button></header>{children}</dialog>
}

function AccountForm({ close, saved }: { close: () => void; saved: () => Promise<void> }) {
  const [name, setName] = useState(''), [currency, setCurrency] = useState('USD')
  const [busy, setBusy] = useState(false), [error, setError] = useState('')
  return <JournalDialog title="Add account" close={close}><form className="journal-form" onSubmit={async event => {
    event.preventDefault(); setBusy(true); setError('')
    try { await call('journalCreate', { name, currency }); await saved(); close() }
    catch (reason) { setError(errorText(reason)) } finally { setBusy(false) }
  }}>
    <label>Account name<input required maxLength={80} value={name} onChange={event => setName(event.target.value)} placeholder="Account name" /></label>
    <label>Account currency<input required pattern="[A-Za-z]{3,8}" maxLength={8} value={currency} onChange={event => setCurrency(event.target.value.toUpperCase())} /></label>
    {error && <p className="warning-note" role="alert">{error}</p>}
    <button className="journal-primary" disabled={busy}>{busy ? 'Saving…' : 'Create account'}</button>
  </form></JournalDialog>
}

const inputTime = (value?: string | null) => { const time = new Date(value || Date.now()); return new Date(time.getTime() - time.getTimezoneOffset() * 60000).toISOString().slice(0, 16) }
function TradeForm({ accounts, trade, close, saved }: { accounts: JournalAccount[]; trade?: JournalTrade; close: () => void; saved: () => Promise<void> }) {
  const [form, setForm] = useState<Record<string, string>>({ accountId: trade?.accountId || accounts.find(row => row.type === 'manual')?.id || '', symbol: trade?.symbol || '', side: trade?.side || 'long', status: trade?.status || 'closed', openedAt: inputTime(trade?.openedAt), closedAt: inputTime(trade?.closedAt), quantity: String(trade?.quantity ?? ''), entry: String(trade?.entry ?? ''), exit: String(trade?.exit ?? ''), stopLoss: String(trade?.stopLoss ?? ''), takeProfit: String(trade?.takeProfit ?? ''), pnl: String(trade?.pnl ?? ''), unrealizedPnl: String(trade?.unrealizedPnl ?? ''), notes: trade?.notes || '', setup: trade?.setup || '', tags: trade?.tags || '' })
  const [error, setError] = useState(''), [busy, setBusy] = useState(false), [removing, setRemoving] = useState(false)
  const field = (key: string, value: string) => setForm(current => ({ ...current, [key]: value }))
  const input = (key: string, label: string, type = 'text', required = false) => <label>{label}<input type={type} step={type === 'number' ? 'any' : undefined} required={required} maxLength={type === 'text' ? 300 : undefined} value={form[key]} onChange={event => field(key, event.target.value)} /></label>
  return <JournalDialog title={trade ? 'Edit trade' : 'New trade'} close={close}><form className="journal-form" onSubmit={async event => {
    event.preventDefault(); setError(''); setBusy(true)
    try {
      const values: Record<string, unknown> = { ...form, id: trade?.id, openedAt: new Date(form.openedAt).toISOString(), closedAt: form.status === 'closed' ? new Date(form.closedAt).toISOString() : null }
      for (const key of ['quantity', 'entry', 'exit', 'stopLoss', 'takeProfit', 'pnl', 'unrealizedPnl']) values[key] = form[key] === '' ? null : Number(form[key])
      await call('journalTrade', values)
      await saved(); close()
    } catch (reason) { setError(errorText(reason)) } finally { setBusy(false) }
  }}>
    <>
      <label>Account<select required value={form.accountId} onChange={event => field('accountId', event.target.value)}>{accounts.filter(row => row.type === 'manual').map(row => <option key={row.id} value={row.id}>{row.name} · {row.currency}</option>)}</select></label>
      <div className="journal-form-grid">{input('symbol', 'Instrument', 'text', true)}<label>Side<select value={form.side} onChange={event => field('side', event.target.value)}><option value="long">Long</option><option value="short">Short</option></select></label><label>Status<select value={form.status} onChange={event => field('status', event.target.value)}><option value="closed">Closed</option><option value="open">Open</option></select></label>{input('quantity', 'Quantity', 'number', true)}{input('openedAt', 'Entry time', 'datetime-local', true)}{input('entry', 'Entry price', 'number', true)}{form.status === 'closed' && <>{input('closedAt', 'Exit time', 'datetime-local', true)}{input('exit', 'Exit price', 'number', true)}</>}{input('stopLoss', 'Stop loss', 'number')}{input('takeProfit', 'Take profit', 'number')}{form.status === 'closed' ? input('pnl', 'Net P&L · after fees', 'number', true) : input('unrealizedPnl', 'Floating P&L', 'number')}</div>
    </>
    <div className="journal-form-grid">{input('setup', 'Setup')}{input('tags', 'Tags')}</div>
    <label>Trade notes<textarea rows={5} maxLength={10000} value={form.notes} onChange={event => field('notes', event.target.value)} placeholder="Plan, execution, review…" /></label>
    {error && <p className="warning-note" role="alert">{error}</p>}
    <div className="journal-dialog-actions"><button className="journal-primary" disabled={busy}>{busy ? 'Saving…' : 'Save trade'}</button>{trade && <button type="button" className="negative-text" disabled={busy} onClick={async () => { if (!removing) { setRemoving(true); return } setBusy(true); try { await call('journalRemoveTrade', { accountId: trade.accountId, id: trade.id }); await saved(); close() } catch (reason) { setError(errorText(reason)); setBusy(false) } }}>{removing ? 'Confirm delete' : 'Delete trade'}</button>}</div>
  </form></JournalDialog>
}

export function Journal() {
  const [data, setData] = useState<JournalData>(empty), [error, setError] = useState(''), [loading, setLoading] = useState(true)
  const [selectedAccountId, setAccountId] = useState(() => { try { return localStorage.getItem('bb-journal-account') || 'all' } catch { return 'all' } }), [selectedCurrency, setCurrency] = useState('USD'), [month, setMonth] = useState(monthNow), [zone, setZone] = useState(localZone)
  const [period, setPeriod] = useState('month'), [view, setView] = useState('closed'), [day, setDay] = useState(''), [query, setQuery] = useState(''), [page, setPage] = useState(0)
  const [accountForm, setAccountForm] = useState(false), [tradeForm, setTradeForm] = useState<JournalTrade | 'new' | null>(null), [connections, setConnections] = useState(false), [busy, setBusy] = useState(false)
  const restoreInput = useRef<HTMLInputElement>(null)
  const [pendingRestore, setPendingRestore] = useState<string | null>(null)
  const refresh = useCallback(async () => { try { setData(await call('journal')); setError('') } catch (reason) { setError(errorText(reason)) } finally { setLoading(false) } }, [])
  useEffect(() => {
    void refresh()
    const changed = () => void refresh()
    const stored = (event: StorageEvent) => { if (event.key === 'bb-web-journal-v1' || event.key === null) void refresh() }
    window.addEventListener('bb-journal-changed', changed)
    window.addEventListener('storage', stored)
    return () => { window.removeEventListener('bb-journal-changed', changed); window.removeEventListener('storage', stored) }
  }, [refresh])
  const accountId = data.accounts.some(row => row.id === selectedAccountId) ? selectedAccountId : 'all'
  const selectedAccount = data.accounts.find(row => row.id === accountId)
  useEffect(() => { try { localStorage.setItem('bb-journal-account', selectedAccountId) } catch { /* A storage restriction must not prevent switching accounts. */ } }, [selectedAccountId])
  const currencies = [...new Set(data.accounts.filter(row => accountId === 'all' || row.id === accountId).map(row => row.currency))].sort()
  const currency = currencies.includes(selectedCurrency) ? selectedCurrency : currencies[0] || 'USD'
  const stats = useMemo(() => journalStats(data, accountId, currency, period === 'month' ? month : null, zone), [data, accountId, currency, period, month, zone])
  const calendarStats = useMemo(() => journalStats(data, accountId, currency, month, zone), [data, accountId, currency, month, zone])
  const realized = stats.realized
  const floating = stats.floating
  const trades = useMemo(() => stats.trades.filter(row => (view === 'all' || row.status === view) && `${row.symbol} ${row.setup || ''} ${row.tags || ''}`.toLowerCase().includes(query.toLowerCase()) && (row.status !== 'closed' || (row.closedAt && (!day ? period !== 'month' || dayKey(row.closedAt, zone).startsWith(month) : dayKey(row.closedAt, zone) === day)))).sort((a, b) => (b.closedAt || b.openedAt || '').localeCompare(a.closedAt || a.openedAt || '')), [stats.trades, view, query, day, period, month, zone])
  const currentPage = Math.min(page, Math.max(0, Math.ceil(trades.length / 50) - 1))
  const [year, monthNumber] = month.split('-').map(Number)
  const calendarStart = new Date(Date.UTC(year, monthNumber - 1, 1)); calendarStart.setUTCDate(1 - (calendarStart.getUTCDay() + 6) % 7)
  const dates = Array.from({ length: 42 }, (_, index) => { const date = new Date(calendarStart); date.setUTCDate(date.getUTCDate() + index); return date.toISOString().slice(0, 10) })
  const changeMonth = (offset: number) => { const date = new Date(Date.UTC(year, monthNumber - 1 + offset, 1)); setMonth(date.toISOString().slice(0, 7)); setDay(''); setPage(0) }
  const act = async (operation: () => Promise<unknown>) => { setBusy(true); try { await operation(); await refresh() } catch (reason) { setError(errorText(reason)) } finally { setBusy(false) } }
  const chooseAccount = (id: string) => { setAccountId(id); setPage(0); setDay('') }
  const download = (action: () => void) => { try { action() } catch (reason) { setError(errorText(reason)) } }
  return <div className="stack journal-workspace">
    <header className="page-head"><div><h1>Journal</h1></div><div className="journal-actions"><button onClick={() => setConnections(true)}>Accounts</button><button disabled={!data.accounts.some(row => row.type === 'manual')} onClick={() => setTradeForm('new')}>New trade</button><button className="journal-primary" onClick={() => setAccountForm(true)}>Add account</button></div></header>
    {error && <p className="error-banner" role="alert">{error}</p>}
    <div className="journal-toolbar"><select aria-label="Journal account" value={accountId} onChange={event => chooseAccount(event.target.value)}><option value="all">All accounts</option>{accountGroups(data.accounts).map(group => <optgroup key={group.label} label={group.label}>{group.accounts.map(row => <option key={row.id} value={row.id}>{accountOption(row)}</option>)}</optgroup>)}</select><select aria-label="Journal currency" value={currency} onChange={event => setCurrency(event.target.value)}>{(currencies.length ? currencies : ['USD']).map(value => <option key={value}>{value}</option>)}</select><select aria-label="Journal period" value={period} onChange={event => { setPeriod(event.target.value); setDay('') }}><option value="month">Selected month</option><option value="all">All time</option></select><select aria-label="Journal time zone" value={zone} onChange={event => { setZone(event.target.value); setDay('') }}><option value={localZone}>{localZone}</option>{localZone !== 'UTC' && <option value="UTC">UTC</option>}</select><button disabled={!trades.length} onClick={() => download(() => downloadJournalFile(exportJournal(trades, data.accounts), 'bulls-bears-trades.csv', 'text/csv;charset=utf-8'))}>Export CSV</button><button onClick={() => download(downloadSavedJournal)}>Download backup</button><button onClick={() => restoreInput.current?.click()}>Restore backup</button></div>
    {selectedAccount && <div className="journal-current-account"><strong>{accountLabel(selectedAccount)}</strong>{selectedAccount.platformName && selectedAccount.platformName !== accountLabel(selectedAccount) && <span>{selectedAccount.platformName}</span>}{selectedAccount.platformStatus && <span className={`journal-account-badge ${selectedAccount.accountCategory || 'other'}`}>{selectedAccount.platformStatus}</span>}{selectedAccount.remoteId && <span>ID: {selectedAccount.remoteId}</span>}{selectedAccount.message && <p role="status">{selectedAccount.message}</p>}</div>}
    {loading ? <div className="loading">Loading journal…</div> : !data.accounts.length ? <section className="panel journal-empty"><h2>Your trading record starts here</h2><p>Create an account to record your trades.</p><button className="journal-primary" onClick={() => setAccountForm(true)}>Add your first account</button></section> : <>
      <section className="journal-metrics" aria-label="Trading performance">{[
        ['Realized P&L', number(realized), currency, cls(realized)],
        ['Win rate', stats.winRate === null ? '—' : number(stats.winRate, 1) + '%', `${stats.wins}W · ${stats.losses}L · ${stats.breakeven}BE`, ''],
        ['Profit factor', number(stats.profitFactor), `${stats.eligible.length} completed trades`, ''],
        ['Avg. trade', number(stats.expectancy), currency, cls(stats.expectancy)],
        ['Floating P&L', number(floating), `${stats.open.length} open trades · ${currency}`, cls(floating)],
      ].map(([label, value, detail, color]) => <article key={label}><span>{label}</span><strong className={color}>{value}</strong><small>{detail}</small></article>)}</section>
      <section className="journal-performance panel"><div className="panel-head"><h2>Cumulative realized P&L</h2><span className="muted">{currency} · {period === 'month' ? month : 'All time'}</span></div>{stats.curve.length ? <ChartRenderer style={{ height: 230 }} option={{ animation: false, grid: { top: 20, left: 65, right: 20, bottom: 35 }, tooltip: { trigger: 'axis', valueFormatter: (value: number) => number(value) + ' ' + currency }, xAxis: { type: 'category', data: stats.curve.map(row => row[0]), boundaryGap: false }, yAxis: { type: 'value', scale: true }, series: [{ type: 'line', data: stats.curve.map(row => row[1]), showSymbol: stats.curve.length === 1, symbolSize: 7, smooth: false, lineStyle: { color: '#6ba5ff', width: 2 }, itemStyle: { color: '#6ba5ff' }, areaStyle: { color: '#6ba5ff', opacity: .06 } }] }} /> : <div className="journal-chart-empty">No realized trades in this period</div>}</section>
      <section className="panel journal-calendar"><header><div><h2>{new Date(Date.UTC(year, monthNumber - 1, 1)).toLocaleDateString(undefined, { month: 'long', year: 'numeric', timeZone: 'UTC' })}</h2><span className={cls(calendarStats.realized)}>{number(calendarStats.realized)} {currency}</span></div><div className="journal-actions"><button aria-label="Previous journal month" onClick={() => changeMonth(-1)}>Previous</button><button onClick={() => { setMonth(monthNow()); setDay('') }}>Today</button><button aria-label="Next journal month" onClick={() => changeMonth(1)}>Next</button></div></header><div className="journal-weekdays">{['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map(label => <span key={label}>{label}</span>)}</div><div className="journal-calendar-grid">{dates.map(date => { const value = calendarStats.days[date], inMonth = date.startsWith(month); return <button key={date} disabled={!inMonth} className={`${!inMonth ? 'outside' : ''} ${day === date ? 'selected' : ''} ${value ? value.pnl > 0 ? 'profit-day' : value.pnl < 0 ? 'loss-day' : '' : ''}`} aria-label={`${date}: ${value ? number(value.pnl) + ' ' + currency : 'No activity'}`} aria-pressed={day === date} onClick={() => { setDay(day === date ? '' : date); setView('closed'); setPage(0) }}><span>{Number(date.slice(-2))}</span>{value && <><strong className={cls(value.pnl)}>{number(value.pnl)}</strong><small>{value.trades} {value.trades === 1 ? 'close' : 'closes'}</small></>}</button> })}</div></section>
      <section className="panel journal-trades"><div className="panel-head"><h2>{day ? `Trades · ${day}` : 'Trades'}</h2>{day && <button onClick={() => setDay('')}>Clear day</button>}<span className="muted">{trades.length} records</span></div><div className="journal-toolbar"><div className="segmented">{[['closed', 'Closed'], ['open', 'Open'], ['all', 'All trades']].map(([key, label]) => <button key={key} aria-pressed={view === key} onClick={() => { setView(key); setDay(''); setPage(0) }}>{label}</button>)}</div><input aria-label="Search journal" placeholder="Instrument, setup or tag" value={query} onChange={event => { setQuery(event.target.value); setPage(0) }} /></div><div className="table-wrap"><table><thead><tr>{['Instrument', 'Account', 'Side', 'Entry / exit', 'Quantity', 'SL / TP', 'P&L', 'Date', 'Status', 'Journal'].map(label => <th key={label}>{label}</th>)}</tr></thead><tbody>{trades.slice(currentPage * 50, (currentPage + 1) * 50).map(row => <tr key={`${row.accountId}:${row.id}`}><td><strong>{row.symbol}</strong>{row.setup && <small>{row.setup}</small>}</td><td>{(() => { const account = data.accounts.find(account => account.id === row.accountId); return account ? accountLabel(account) : '—' })()}</td><td className={row.side === 'long' ? 'positive-text' : 'negative-text'}>{row.side}</td><td>{number(row.entry, 5)}<small>{row.exit == null ? '—' : number(row.exit, 5)}</small></td><td>{number(row.status === 'open' ? row.openQuantity : row.quantity, 4)}</td><td title={row.protectionBasis}>{number(row.stopLoss, 5)}<small>{number(row.takeProfit, 5)}</small></td><td className={cls(row.status === 'open' ? row.unrealizedPnl : row.pnl)}>{number(row.status === 'open' ? row.unrealizedPnl : row.pnl)}<small>{currency}</small></td><td>{row.closedAt || row.openedAt ? formatTime(row.closedAt || row.openedAt) : '—'}</td><td>{row.status}{row.status === 'closed' && !row.complete && <small>Incomplete history</small>}</td><td><button onClick={() => setTradeForm(row)}>{row.notes ? 'Review' : 'Add notes'}</button></td></tr>)}</tbody></table>{!trades.length && <div className="journal-chart-empty">No matching trades</div>}</div>{trades.length > 50 && <div className="journal-pagination"><button disabled={!currentPage} onClick={() => setPage(currentPage - 1)}>Previous</button><span>{currentPage + 1} / {Math.ceil(trades.length / 50)}</span><button disabled={(currentPage + 1) * 50 >= trades.length} onClick={() => setPage(currentPage + 1)}>Next</button></div>}</section>
    </>}
    {accountForm && <AccountForm close={() => setAccountForm(false)} saved={refresh} />}
    {tradeForm && <TradeForm accounts={data.accounts} trade={tradeForm === 'new' ? undefined : tradeForm} close={() => setTradeForm(null)} saved={refresh} />}
    {connections && <JournalDialog title="Accounts" close={() => setConnections(false)}>{error && <p className="error-banner" role="alert">{error}</p>}<JournalAccounts accounts={data.accounts} selected={accountId} busy={busy} choose={row => { chooseAccount(row.id); setConnections(false) }} remove={row => void act(() => call('journalRemoveAccount', { accountId: row.id }))} /><div className="journal-actions"><button onClick={() => { setConnections(false); setAccountForm(true) }}>Add account</button></div></JournalDialog>}
    <p className="muted">Saved in this browser. Download a backup before clearing site data or changing devices.</p>
    <input ref={restoreInput} hidden type="file" accept="application/json,.json" aria-label="Journal backup file" onChange={async event => {
      const file = event.target.files?.[0]; event.target.value = ''
      if (!file) return
      try {
        if (file.size > 4_000_000) throw new Error('Journal backup is too large (maximum 4 MB).')
        const raw = await file.text(); parseJournalBackup(raw); setError(''); setPendingRestore(raw)
      } catch (reason) { setError(errorText(reason)) }
    }} />
    {pendingRestore && <JournalDialog title="Restore journal backup" close={() => setPendingRestore(null)}>{error && <p className="error-banner" role="alert">{error}</p>}<p>This replaces the journal in this browser. Download your current backup first if you want to keep it.</p><div className="journal-dialog-actions"><button onClick={() => download(downloadSavedJournal)}>Download current backup</button><button className="journal-primary" disabled={busy} onClick={() => void act(async () => { await call('journalRestore', { backup: pendingRestore }); setPendingRestore(null) })}>Replace journal</button></div></JournalDialog>}
  </div>
}
