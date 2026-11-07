import { useState } from 'react'
import type { DashboardSnapshot, ScoredEvent } from '../domain/types'
import { formatTime } from '../lib/presentation'
import { Empty } from './Chart'

function releaseValue(event: ScoredEvent, field: 'actual' | 'forecast' | 'previous') {
  const raw = event[`${field}Text`]
  if (raw && !['-', '—', 'n/a', 'null'].includes(raw.trim().toLowerCase())) return raw
  const value = event[field]
  if (value !== null && Number.isFinite(value)) return `${new Intl.NumberFormat('en', { maximumFractionDigits: 6 }).format(value)}${event.unit === '%' ? '%' : ''}`
  if (event.hasNumericRelease === false) return 'Not applicable'
  return field === 'actual' ? 'Data releasing soon' : 'Not published'
}

const released = (event: ScoredEvent) => event.actual !== null || !!event.actualText
export function EventTable({ events }: { events: ScoredEvent[] }) {
  return events.length ? <div className="table-wrap"><table className="calendar-table"><thead><tr><th>Time</th><th>Currency</th><th>Event</th><th>Impact</th><th>Previous</th><th>Forecast</th><th>Actual</th><th>Bias</th><th>Contribution</th></tr></thead><tbody>{events.map(event => <tr key={event.id}>
    <td>{event.timeLabel ? `${event.occurredAt.slice(0, 10)} · ${event.timeLabel}` : formatTime(event.occurredAt)}</td><td className="symbol">{event.currency}</td><td>{event.name}</td><td>{event.impact}</td>
    <td>{releaseValue(event, 'previous')}{event.originalPrevious != null && event.previous !== null && event.originalPrevious !== event.previous && <small className="cell-note">Revised from {event.originalPrevious}{event.unit === '%' ? '%' : ''}</small>}</td>
    <td>{releaseValue(event, 'forecast')}</td><td><span className={!released(event) ? 'muted' : 'released-value'}>{releaseValue(event, 'actual')}</span>{!released(event) && event.hasNumericRelease !== false && Date.parse(event.occurredAt) < Date.now() && <small className="cell-note">Release pending</small>}</td>
    <td><span className={`pill ${event.bias}`}>{event.bias}</span></td><td>{event.signal === null ? '—' : `${event.contribution >= 0 ? '+' : ''}${event.contribution.toFixed(2)}`}</td>
  </tr>)}</tbody></table></div> : <Empty message="No matching releases." />
}

export function EconomicCalendar({ snapshot }: { snapshot: DashboardSnapshot }) {
  const [currency, setCurrency] = useState('all')
  const [status, setStatus] = useState('all')
  const [query, setQuery] = useState('')
  const [start, setStart] = useState('')
  const [end, setEnd] = useState('')
  const [page, setPage] = useState(0)
  const [order, setOrder] = useState('newest')
  const events = snapshot.events.filter(event => (currency === 'all' || event.currency === currency)
    && event.name.toLowerCase().includes(query.toLowerCase())
    && (!start || event.occurredAt.slice(0, 10) >= start) && (!end || event.occurredAt.slice(0, 10) <= end)
    && (status === 'all' || (status === 'released' ? released(event) : !released(event) && event.hasNumericRelease !== false)))
    .sort((a, b) => order === 'oldest' ? a.occurredAt.localeCompare(b.occurredAt) : b.occurredAt.localeCompare(a.occurredAt))
  const pages = Math.max(1, Math.ceil(events.length / 100))
  const current = Math.min(page, pages - 1)
  return <section className="panel"><h1>Economic calendar</h1>
    <p className="muted">Updated {formatTime(snapshot.calendarUpdatedAt ?? snapshot.coreUpdatedAt ?? null)} · Dates: UTC</p>
    <div className="filter-bar">
      <input aria-label="Search events" placeholder="Search economic events" value={query} onChange={event => { setQuery(event.target.value); setPage(0) }} />
      <select aria-label="Calendar currency" value={currency} onChange={event => { setCurrency(event.target.value); setPage(0) }}><option value="all">All currencies</option>{[...new Set(snapshot.events.map(event => event.currency))].sort().map(symbol => <option key={symbol}>{symbol}</option>)}</select>
      <select aria-label="Release status" value={status} onChange={event => { setStatus(event.target.value); setPage(0) }}><option value="all">All events</option><option value="released">Actual available</option><option value="missing">Awaiting actual</option></select>
      <label>From <input aria-label="Calendar start date" type="date" value={start} onChange={event => { setStart(event.target.value); setPage(0) }} /></label>
      <label>To <input aria-label="Calendar end date" type="date" value={end} onChange={event => { setEnd(event.target.value); setPage(0) }} /></label>
      <select aria-label="Calendar order" value={order} onChange={event => { setOrder(event.target.value); setPage(0) }}><option value="newest">Newest first</option><option value="oldest">Oldest first</option></select>
    </div>

    <div className="calendar-pagination"><span>{events.length.toLocaleString()} events · page {current + 1} of {pages}</span><button disabled={current === 0} onClick={() => setPage(current - 1)}>Previous page</button><button disabled={current + 1 >= pages} onClick={() => setPage(current + 1)}>Next page</button></div>
    <EventTable events={events.slice(current * 100, (current + 1) * 100)} />
  </section>
}
