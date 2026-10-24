import { useEffect, useMemo, useState } from 'react'
import { Empty } from './components/Chart'
import { HistoryExplorer, PositionChart, StrengthChart } from './components/ResearchPanels'
import { currencies, instruments, normalizeInstrument } from './domain/instruments'
import type { BiasLabel, DashboardSnapshot } from './domain/types'
import { loadSnapshot } from './lib/data'
import { formatTime, readTheme, saveTheme } from './lib/presentation'

const tabs = ['Home', 'Data', 'Bias', 'CFTC', 'Historical Data', 'Analysis', 'Top Setups', 'Economic Calendar', 'News'] as const
type Tab = (typeof tabs)[number]

const formatScore = (value: number) => `${value >= 0 ? '+' : ''}${value.toFixed(2)}`
const formatNumber = (value: number) => new Intl.NumberFormat(undefined, { maximumFractionDigits: value < 10 ? 4 : 2 }).format(value)
const eventValue = (value: number | null, unit: string | null) => value === null ? '—' : `${new Intl.NumberFormat('en', { notation: Math.abs(value) >= 10_000 ? 'compact' : 'standard', maximumFractionDigits: 3 }).format(value)}${unit === '%' ? '%' : ''}`

function BiasPill({ label }: { label: BiasLabel }) {
  return <span className={`pill ${label}`}>{label}</span>
}

function HorizonCells({ item }: { item: DashboardSnapshot['pairs'][number] | DashboardSnapshot['currencies'][number] }) {
  return <div className="horizon-grid">
    {([['Short term', item.shortTerm], ['Long term', item.longTerm]] as const).map(([name, horizon]) => <div className="horizon" key={name}>
      <span>{name}</span><strong>{horizon.label === 'unavailable' ? '—' : formatScore(horizon.score)}</strong><BiasPill label={horizon.label} />
      <div className="coverage">{Math.round(horizon.coverage * 100)}% coverage · {horizon.eventCount} releases</div>
    </div>)}
  </div>
}

function FeedHealth({ snapshot }: { snapshot: DashboardSnapshot }) {
  return snapshot.feedHealth.length ? <div className="health-row">{snapshot.feedHealth.filter((feed) => !feed.feed.startsWith('http')).map((feed) => <span className={`health-badge ${feed.displayStatus ?? feed.status}`} key={feed.feed} title={`Last successful refresh: ${formatTime(feed.lastSuccessAt ?? null)}`}>{feed.feed === 'cftc' ? 'Positioning' : feed.feed}: {feed.displayStatus ?? feed.status} · {feed.itemCount}</span>)}</div> : null
}

function App() {
  const [tab, setTab] = useState<Tab>('Home')
  const [theme, setTheme] = useState<'dark' | 'light'>(readTheme)
  const [selected, setSelected] = useState<string>('EURUSD')
  const [snapshot, setSnapshot] = useState<DashboardSnapshot | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    document.documentElement.dataset.theme = theme
    saveTheme(theme)
  }, [theme])

  useEffect(() => {
    const controller = new AbortController()
    const refresh = () => loadSnapshot(controller.signal).then((data) => { setSnapshot(data); setError(null) }).catch((reason: unknown) => {
      if (reason instanceof DOMException && reason.name === 'AbortError') return
      setError(reason instanceof Error ? reason.message : 'Unable to load published data.')
    })
    void refresh()
    const timer = window.setInterval(() => void refresh(), 300_000)
    return () => { controller.abort(); window.clearInterval(timer) }
  }, [])

  const selectedCurrency = selected.length === 3 ? selected : selected.slice(0, 3)
  const selectedEvents = useMemo(() => {
    if (!snapshot) return []
    const bias = snapshot.pairs.find((item) => item.symbol === selected)
    const currencies = bias?.macroCurrencies?.length
      ? bias.macroCurrencies
      : selected.length === 6
        ? [selected.slice(0, 3), selected.slice(3)]
        : [selectedCurrency]
    return snapshot.events.filter((event) => (event.affectedCurrencies ?? [event.currency]).some((symbol) => currencies.includes(symbol) || symbol === selected))
      .sort((a, b) => Number(b.actual !== null) - Number(a.actual !== null) || b.occurredAt.localeCompare(a.occurredAt))
  }, [snapshot, selected, selectedCurrency])

  return (
    <div className="app-shell">
      <header className="topbar">
        <div>
          <div className="brand">Bulls &amp; Bears Fundamentals</div>
          <div className="status-line">Data {formatTime(snapshot?.coreUpdatedAt ?? snapshot?.generatedAt ?? null)} · News {formatTime(snapshot?.newsUpdatedAt ?? null)}</div>
        </div>
        <button className="theme-toggle" onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')} aria-label="Toggle color theme">
          {theme === 'dark' ? 'Light mode' : 'Dark mode'}
        </button>
      </header>

      <nav className="tabs" aria-label="Primary navigation">
        {tabs.map((item) => <button key={item} className={tab === item ? 'active' : ''} onClick={() => setTab(item)}>{item}</button>)}
      </nav>

      <main>
        {error && <div className="error-banner">{error}</div>}
        {!snapshot ? <div className="loading">Loading validated market data…</div> : (
          <>
            {tab === 'Home' && <Home snapshot={snapshot} />}
            {tab === 'Data' && <DataView snapshot={snapshot} selected={selected} setSelected={setSelected} events={selectedEvents} />}
            {tab === 'Bias' && <BiasView snapshot={snapshot} />}
            {tab === 'CFTC' && <div className="stack"><section className="panel"><PositionChart rows={snapshot.cot} history={snapshot.cotHistory} /></section><CftcView snapshot={snapshot} /></div>}
            {tab === 'Historical Data' && <HistoryExplorer points={[...snapshot.history, ...calendarHistory(snapshot.events)]} />}
            {tab === 'Analysis' && <AnalysisView snapshot={snapshot} selected={selected} setSelected={setSelected} />}
            {tab === 'Top Setups' && <SetupsView snapshot={snapshot} />}
            {tab === 'Economic Calendar' && <CalendarView snapshot={snapshot} />}
            {tab === 'News' && <NewsView snapshot={snapshot} />}
          </>
        )}
      </main>
    </div>
  )
}

function Home({ snapshot }: { snapshot: DashboardSnapshot }) {
  return <div className="stack">
    <section className="hero-grid">
      <div><p className="eyebrow">MACRO OVERVIEW</p><h1>Fundamental strength across currencies and markets.</h1><p className="muted">Explore economic releases, positioning and relative strength across your markets.</p></div>
      <div className="metric"><span>Tracked events</span><strong>{snapshot.events.length}</strong><small>validated releases</small></div>
      <div className="metric"><span>Position records</span><strong>{snapshot.cot.length}</strong><small>published reports</small></div>
    </section>
    <section className="panel"><div className="panel-head"><div><p className="eyebrow">MARKET PRICES</p><h2>Latest available close</h2></div></div><PriceBoard snapshot={snapshot} /></section>
    <section className="panel"><div className="panel-head"><div><p className="eyebrow">CURRENCY BIAS</p><h2>Current strength</h2></div></div>
      {!snapshot.events.some((event) => event.actual !== null) && <div className="error-banner" role="status">Calendar actual values are missing. Available scores use positioning only; economic-release coverage is incomplete.</div>}
      <StrengthChart snapshot={snapshot} />
      <FeedHealth snapshot={snapshot} />
      {snapshot.currencies.length ? <div className="bias-grid">{[...snapshot.currencies, ...snapshot.pairs.filter((item) => ['XAUUSD', 'XAGUSD', 'OIL', 'BRENT', 'COPPER'].includes(item.symbol))].map((item) => <article className="bias-card" key={item.symbol}><div><strong>{item.symbol}</strong><BiasPill label={item.shortTerm.label} /></div><HorizonCells item={item} /></article>)}</div> : <Empty message="No validated currency scores have been published yet." />}
    </section>
    <section className="two-column"><div className="panel"><p className="eyebrow">LATEST RELEASES</p><EventTable events={snapshot.events.filter((event) => event.actual !== null).slice(0, 8)} /></div><div className="panel"><p className="eyebrow">MARKET NEWS</p><NewsList snapshot={snapshot} /></div></section>
  </div>
}

function InstrumentSelect({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  return <select aria-label="Selected instrument" value={value} onChange={(event) => onChange(event.target.value)}><optgroup label="Currencies">{currencies.map((item) => <option key={item}>{item}</option>)}</optgroup><optgroup label="Markets">{instruments.map((item) => <option key={item}>{item}</option>)}</optgroup></select>
}

function calendarHistory(events: DashboardSnapshot['events']): DashboardSnapshot['history'] {
  return events.filter((event) => event.actual !== null).map((event) => ({
    seriesId: `release:${event.currency}:${event.name}`, instrument: event.currency,
    name: event.name, date: event.occurredAt, value: event.actual!, unit: event.unit,
  }))
}

function DataView({ snapshot, selected, setSelected, events }: { snapshot: DashboardSnapshot; selected: string; setSelected: (value: string) => void; events: DashboardSnapshot['events'] }) {
  const currency = selected.slice(0, 3)
  const instrumentBias = snapshot.pairs.find((item) => item.symbol === selected)
  const currencyBias = snapshot.currencies.find((item) => item.symbol === currency)
  const bias = instrumentBias ?? currencyBias
  const price = snapshot.prices.find((item) => item.instrument === selected)
  const related = new Set([selected, currency, ...(instrumentBias?.macroCurrencies ?? [selected.slice(3)])])
  const news = snapshot.news.filter((item) => item.instruments.some((symbol) => related.has(symbol)))
  const positions = snapshot.cot.filter((item) => related.has(item.instrument))
  const history = [...snapshot.history.filter((item) => related.has(item.instrument)), ...calendarHistory(events)]
  return <div className="stack"><section className="page-head"><div><p className="eyebrow">INSTRUMENT DATA</p><h1>{selected}</h1></div><InstrumentSelect value={selected} onChange={setSelected} /></section>
    <section className="summary-strip"><div><span>Latest price</span><strong>{price ? formatNumber(price.price) : '—'}</strong><small className={price?.changePercent !== null && price?.changePercent !== undefined && price.changePercent < 0 ? 'negative-text' : 'positive-text'}>{price?.changePercent !== null && price?.changePercent !== undefined ? `${price.changePercent >= 0 ? '+' : ''}${price.changePercent.toFixed(2)}%` : 'Unavailable'}</small></div><div><span>Short-term bias</span><strong>{bias && bias.shortTerm.label !== 'unavailable' ? formatScore(bias.shortTerm.score) : '—'}</strong>{bias && <BiasPill label={bias.shortTerm.label} />}</div><div><span>Long-term bias</span><strong>{bias && bias.longTerm.label !== 'unavailable' ? formatScore(bias.longTerm.score) : '—'}</strong>{bias && <BiasPill label={bias.longTerm.label} />}</div><div><span>Position records</span><strong>{snapshot.cot.filter((item) => item.instrument === selected || item.instrument === currency).length}</strong></div></section>
    <section className="two-column wide-left"><div className="panel"><p className="eyebrow">ECONOMIC DRIVERS</p><EventTable events={events} /></div><div className="panel"><p className="eyebrow">RELEVANT NEWS</p>{news.length ? <NewsList snapshot={{ ...snapshot, news }} /> : <Empty message="No relevant public news metadata is available." />}</div></section>
    <section className="panel"><PositionChart rows={positions} history={snapshot.cotHistory?.filter((item) => related.has(item.instrument))} /></section>
    <HistoryExplorer points={history} />
  </div>
}

function BiasView({ snapshot }: { snapshot: DashboardSnapshot }) {
  const [query, setQuery] = useState('')
  const [direction, setDirection] = useState('all')
  const [order, setOrder] = useState('strength')
  const pairs = snapshot.pairs.filter((pair) => pair.symbol.includes(normalizeInstrument(query)) && (direction === 'all' || pair.shortTerm.label === direction))
    .sort((a, b) => order === 'symbol' ? a.symbol.localeCompare(b.symbol) : Math.abs(b.shortTerm.score) - Math.abs(a.shortTerm.score))
  snapshot = { ...snapshot, pairs }
  return <section className="panel"><div className="panel-head"><div><p className="eyebrow">PAIR BIAS</p><h1>Relative fundamental strength</h1></div></div><div className="filter-bar"><input aria-label="Search pairs" placeholder="Search pair or alias" value={query} onChange={(event) => setQuery(event.target.value)} /><select aria-label="Bias direction" value={direction} onChange={(event) => setDirection(event.target.value)}>{['all', 'bullish', 'bearish', 'neutral', 'unavailable'].map((item) => <option key={item}>{item}</option>)}</select><select aria-label="Sort pairs" value={order} onChange={(event) => setOrder(event.target.value)}><option value="strength">Strongest alignment</option><option value="symbol">Instrument A–Z</option></select><span>{pairs.length} instruments</span></div>{snapshot.pairs.length ? <div className="table-wrap"><table><thead><tr><th>Instrument</th><th>Base</th><th>Quote</th><th>Short score</th><th>Short bias</th><th>Long score</th><th>Long bias</th><th>Coverage S/L</th><th>Updated</th></tr></thead><tbody>{snapshot.pairs.map((pair) => <tr key={pair.symbol}><td className="symbol">{pair.symbol}</td><td>{pair.base}</td><td>{pair.quote}</td><td>{pair.shortTerm.label === 'unavailable' ? '—' : formatScore(pair.shortTerm.score)}</td><td><BiasPill label={pair.shortTerm.label} /></td><td>{pair.longTerm.label === 'unavailable' ? '—' : formatScore(pair.longTerm.score)}</td><td><BiasPill label={pair.longTerm.label} /></td><td>{Math.round(pair.shortTerm.coverage * 100)}% / {Math.round(pair.longTerm.coverage * 100)}%</td><td>{formatTime(pair.shortTerm.updatedAt ?? pair.longTerm.updatedAt)}</td></tr>)}</tbody></table></div> : <Empty message="Pair bias will appear after both component currencies have validated scores." />}</section>
}

function CftcView({ snapshot }: { snapshot: DashboardSnapshot }) {
  return <section className="panel"><p className="eyebrow">POSITIONING</p><h1>Commitments and weekly change</h1>{snapshot.cot.length ? <div className="table-wrap"><table><thead><tr><th>Market</th><th>Category</th><th>Long</th><th>Short</th><th>Net</th><th>Weekly Δ</th><th>Report date</th></tr></thead><tbody>{snapshot.cot.map((row) => <tr key={`${row.marketId}-${row.category}`}><td className="symbol">{row.instrument}</td><td>{row.category}</td><td>{row.long.toLocaleString()}</td><td>{row.short.toLocaleString()}</td><td>{row.net.toLocaleString()}</td><td>{row.weeklyNetChange?.toLocaleString() ?? '—'}</td><td>{row.reportDate}</td></tr>)}</tbody></table></div> : <Empty message="No validated positioning report has been published yet." />}</section>
}

function AnalysisView({ snapshot, selected, setSelected }: { snapshot: DashboardSnapshot; selected: string; setSelected: (value: string) => void }) {
  const analysis = snapshot.analysis.find((item) => item.instrument === selected)
  return <div className="stack"><section className="page-head"><div><p className="eyebrow">FUNDAMENTAL ANALYSIS</p><h1>{selected}</h1></div><InstrumentSelect value={selected} onChange={setSelected} /></section>{analysis ? <section className="analysis-grid"><aside className="panel"><span>{analysis.horizon === 'shortTerm' ? 'Short-term' : 'Long-term'} score</span><div className="giant-score">{formatScore(analysis.score)}</div><BiasPill label={analysis.bias} /></aside><div className="panel prose">{analysis.sections.map((section) => <section key={`${section.title}-${section.body}`}><h2>{section.title}</h2><p>{section.body}</p></section>)}</div></section> : <Empty message="Analysis is withheld until enough validated economic and positioning data is available." />}</div>
}

function SetupsView({ snapshot }: { snapshot: DashboardSnapshot }) {
  return <section className="panel"><p className="eyebrow">TOP SETUPS</p><h1>Strongest fundamental alignment</h1>{snapshot.setups.length ? <div className="setup-grid">{snapshot.setups.map((setup) => <article className="setup" key={setup.instrument}><div><strong>{setup.instrument}</strong><span className={`pill ${setup.direction === 'long' ? 'bullish' : 'bearish'}`}>{setup.direction}</span></div><small>{setup.horizon === 'shortTerm' ? 'Short-term' : 'Long-term'} model</small><div className="score">{Math.round(setup.conviction * 100)}<small> / 100 alignment</small></div><h3>Reasons</h3><ul>{setup.reasons.map((reason) => <li key={reason}>{reason}</li>)}</ul><h3>Confirmation</h3><ul>{setup.confirmations.map((item) => <li key={item}>{item}</li>)}</ul><h3>Risks</h3><ul>{setup.risks.map((item) => <li key={item}>{item}</li>)}</ul></article>)}</div> : <Empty message="No setup is published unless minimum data coverage and conviction thresholds are met." />}</section>
}

function CalendarView({ snapshot }: { snapshot: DashboardSnapshot }) {
  const [currency, setCurrency] = useState('all')
  const [status, setStatus] = useState('all')
  const [query, setQuery] = useState('')
  const events = snapshot.events.filter((event) => (currency === 'all' || event.currency === currency)
    && event.name.toLowerCase().includes(query.toLowerCase())
    && (status === 'all' || (status === 'released' ? event.actual !== null : event.actual === null)))
    .sort((a, b) => b.occurredAt.localeCompare(a.occurredAt))
  return <section className="panel"><p className="eyebrow">ECONOMIC CALENDAR</p><h1>Past, current and scheduled releases</h1><div className="filter-bar">
    <input aria-label="Search events" placeholder="Search economic events" value={query} onChange={(event) => setQuery(event.target.value)} />
    <select aria-label="Calendar currency" value={currency} onChange={(event) => setCurrency(event.target.value)}><option value="all">All currencies</option>{[...new Set(snapshot.events.map((event) => event.currency))].sort().map((symbol) => <option key={symbol}>{symbol}</option>)}</select>
    <select aria-label="Release status" value={status} onChange={(event) => setStatus(event.target.value)}><option value="all">All events</option><option value="released">Actual available</option><option value="missing">Actual unavailable / upcoming</option></select>
    <span>{events.length} events</span></div><EventTable events={events} /></section>
}

function NewsView({ snapshot }: { snapshot: DashboardSnapshot }) {
  const [query, setQuery] = useState('')
  const [instrument, setInstrument] = useState('all')
  const news = snapshot.news.filter((item) => item.headline.toLowerCase().includes(query.toLowerCase()) && (instrument === 'all' || item.instruments.includes(instrument)))
  return <section className="panel"><p className="eyebrow">FINANCIAL AND GEOPOLITICAL NEWS</p><h1>News</h1><div className="filter-bar"><input aria-label="Search news" placeholder="Search headlines" value={query} onChange={(event) => setQuery(event.target.value)} /><select aria-label="News instrument" value={instrument} onChange={(event) => setInstrument(event.target.value)}><option value="all">All instruments</option>{[...new Set(snapshot.news.flatMap((item) => item.instruments))].sort().map((symbol) => <option key={symbol}>{symbol}</option>)}</select><span>{news.length} headlines</span></div><NewsList snapshot={{ ...snapshot, news }} limit={100} /></section>
}

function EventTable({ events }: { events: DashboardSnapshot['events'] }) {
  return events.length ? <div className="table-wrap"><table><thead><tr><th>Time</th><th>Currency</th><th>Event</th><th>Impact</th><th>Previous</th><th>Forecast</th><th>Actual</th><th>Bias</th><th>Contribution</th></tr></thead><tbody>{events.map((event) => <tr key={event.id}><td>{formatTime(event.occurredAt)}</td><td className="symbol">{event.currency}</td><td>{event.name}</td><td>{event.impact}</td><td>{eventValue(event.previous, event.unit)}</td><td>{eventValue(event.forecast, event.unit)}</td><td>{eventValue(event.actual, event.unit)}</td><td><BiasPill label={event.bias} /></td><td>{event.signal === null ? '—' : formatScore(event.contribution)}</td></tr>)}</tbody></table></div> : <Empty message="No validated economic releases are available." />
}

function NewsList({ snapshot, limit = 12 }: { snapshot: DashboardSnapshot; limit?: number }) {
  return snapshot.news.length ? <div className="news-list">{snapshot.news.slice(0, limit).map((item) => <a key={item.id} href={item.url} target="_blank" rel="noreferrer"><time>{formatTime(item.publishedAt)}</time><strong>{item.headline}</strong>{item.summary && <p>{item.summary}</p>}</a>)}</div> : <Empty message="No public news metadata is available." />
}

function PriceBoard({ snapshot }: { snapshot: DashboardSnapshot }) {
  return snapshot.prices.length ? <div className="price-grid">{snapshot.prices.slice(0, 24).map((item) => <article className="price-card" key={item.instrument}><div><strong>{item.instrument}</strong><time>{formatTime(item.asOf)}</time></div><span>{formatNumber(item.price)}</span><small className={item.changePercent !== null && item.changePercent < 0 ? 'negative-text' : 'positive-text'}>{item.changePercent !== null ? `${item.changePercent >= 0 ? '+' : ''}${item.changePercent.toFixed(2)}%` : '—'}</small></article>)}</div> : <Empty message="No market-price snapshot is available." />
}

export default App
