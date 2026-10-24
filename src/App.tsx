import { useEffect, useMemo, useRef, useState } from 'react'
import { Empty } from './components/Chart'
import { HistoryExplorer, PositionChart, StrengthChart } from './components/ResearchPanels'
import { AnalystBriefing, MacroMap, PositionMetrics, Scorecard, ScoreJournal } from './components/ResearchTools'
import { reportFamilies } from './domain/reportFamilies'
import { assetClass, splitForexPair, normalizeInstrument } from './domain/instruments'
import type { BiasLabel, DashboardSnapshot } from './domain/types'
import { loadArchive, loadSnapshot } from './lib/data'
import { formatTime, readTheme, saveTheme } from './lib/presentation'

const tabs = ['Home', 'Data', 'Bias', 'Macro Map', 'CFTC', 'Historical Data', 'Crypto', 'Analysis', 'Top Setups', 'Economic Calendar', 'News'] as const
type Tab = (typeof tabs)[number]

function NavIcon({ name }: { name: Tab }) {
  const paths: Record<Tab, string> = {
    Home: 'M3 10 12 3l9 7M5 9v12h5v-7h4v7h5V9',
    Data: 'M4 4h16v16H4zM4 10h16M10 4v16',
    Bias: 'M4 18V9m5 9V4m6 14v-7m5 7V6',
    'Macro Map': 'M3 3h7v7H3zM14 3h7v7h-7zM3 14h7v7H3zM14 14h7v7h-7z',
    CFTC: 'M4 20V10h4v10m4 0V4h4v16m4 0v-7M2 20h20',
    'Historical Data': 'M3 12a9 9 0 1 0 3-6M3 3v6h6m3-3v6l4 2',
    Crypto: 'M12 3 4 8v8l8 5 8-5V8zM4 8l8 5 8-5m-8 5v8',
    Analysis: 'M4 4h12v16H4zM8 8h4m-4 4h5m-5 4h3m6-2 5 5m-2-7a3 3 0 1 0-6 0 3 3 0 0 0 6 0',
    'Top Setups': 'm3 17 6-6 4 3 8-9m-6 0h6v6',
    'Economic Calendar': 'M4 5h16v16H4zM8 3v4m8-4v4M4 10h16M8 14h2m4 0h2m-8 4h2',
    News: 'M4 4h13v16H4zM17 8h4v12h-4M7 8h7m-7 4h7m-7 4h4',
  }
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={paths[name]} /></svg>
}

const formatScore = (value: number) => `${value >= 0 ? '+' : ''}${value !== 0 && Math.abs(value) < 0.005 ? value.toPrecision(2) : value.toFixed(2)}`
const formatNumber = (value: number) => new Intl.NumberFormat(undefined, { maximumFractionDigits: value < 10 ? 4 : 2 }).format(value)
const eventValue = (value: number | null, unit: string | null) => value == null || !Number.isFinite(value) ? '—' : `${new Intl.NumberFormat('en', { notation: Math.abs(value) >= 10_000 ? 'compact' : 'standard', maximumFractionDigits: 3 }).format(value)}${unit === '%' ? '%' : ''}`

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

function CoverageDetails({ snapshot }: { snapshot: DashboardSnapshot }) {
  const available = snapshot.currencies.filter((row) => row.shortTerm.label !== 'unavailable').length
  return <details className="coverage-details"><summary>Evidence coverage · {available}/{snapshot.currencies.length} currencies have current inputs</summary>
    <p className="muted">Coverage measures available model inputs, not accuracy. A currency can have a directional reading from only one release. Independent factor breadth, freshness and conflicting inputs determine evidence quality. Sparse evidence is not a confident forecast.</p>
    <div className="table-wrap"><table><thead><tr><th>Currency</th><th>Short-term releases</th><th>Long-term releases</th><th>Coverage S/L</th><th>Latest actual</th></tr></thead><tbody>{snapshot.currencies.map((row) => {
      const latest = snapshot.events.filter((event) => event.currency === row.symbol && event.actual !== null && Date.parse(event.occurredAt) <= Date.now()).sort((a, b) => b.occurredAt.localeCompare(a.occurredAt))[0]
      return <tr key={row.symbol}><td>{row.symbol}</td><td>{row.shortTerm.eventCount}</td><td>{row.longTerm.eventCount}</td><td>{Math.round(row.shortTerm.coverage * 100)}% / {Math.round(row.longTerm.coverage * 100)}%</td><td>{latest ? formatTime(latest.occurredAt) : 'Unavailable'}</td></tr>
    })}</tbody></table></div>
  </details>
}

function App() {
  const [tab, setTab] = useState<Tab>('Home')
  const [theme, setTheme] = useState<'dark' | 'light'>(readTheme)
  const [selected, setSelected] = useState<string>('EURUSD')
  const [snapshot, setSnapshot] = useState<DashboardSnapshot | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [archiveError, setArchiveError] = useState<string | null>(null)
  const [archiveRetry, setArchiveRetry] = useState(0)
  const workspace = useRef<HTMLElement>(null)

  useEffect(() => { workspace.current?.scrollIntoView?.({ block: 'start' }) }, [tab])

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

  const archiveUrl = snapshot?.archiveUrl
  const needsArchive = ['Data', 'CFTC', 'Historical Data', 'Crypto', 'Analysis'].includes(tab)
  useEffect(() => {
    if (!archiveUrl || !needsArchive) return
    let active = true
    loadArchive(archiveUrl).then((data) => {
      if (!active) return
      setArchiveError(null)
      setSnapshot((current) => current?.archiveUrl === archiveUrl ? { ...current, ...data, archiveUrl: undefined } : current)
    }).catch((reason: unknown) => { if (active) setArchiveError(reason instanceof Error ? reason.message : 'Unable to load research archive.') })
    return () => { active = false }
  }, [archiveUrl, needsArchive, archiveRetry])

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
      <a className="skip-link" href="#workspace">Skip to research</a>
      <header className="topbar">
        <div className="brand-lockup"><span className="brand-monogram" aria-hidden="true">B<span>/</span>B</span><div><div className="brand">Bulls &amp; Bears</div><span className="brand-subtitle">FUNDAMENTAL RESEARCH</span></div></div>
        <div className="status-line"><span>Fundamentals <strong>{formatTime(snapshot?.coreUpdatedAt ?? snapshot?.generatedAt ?? null)}</strong></span><span>News <strong>{formatTime(snapshot?.newsUpdatedAt ?? null)}</strong></span></div>
        <button className="theme-toggle" onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')} aria-label="Toggle color theme">
          {theme === 'dark' ? 'Light mode' : 'Dark mode'}
        </button>
      </header>

      <nav className="tabs" aria-label="Primary navigation">
        <span className="nav-caption">WORKSPACE</span>
        {tabs.map((item) => <button key={item} aria-current={tab === item ? 'page' : undefined} className={tab === item ? 'active' : ''} onClick={() => setTab(item)}><NavIcon name={item} /><span>{item}</span></button>)}
        <div className="nav-note">Independent evidence.<br />Conditional conviction.</div>
      </nav>
      <div className="mobile-navigation"><label htmlFor="mobile-workspace">WORKSPACE</label><select id="mobile-workspace" aria-label="Workspace view" value={tab} onChange={(event) => setTab(event.target.value as Tab)}>{tabs.map((item) => <option key={item}>{item}</option>)}</select></div>

      <main id="workspace" ref={workspace} tabIndex={-1}>
        {snapshot?.coreUpdatedAt && Date.now() - Date.parse(snapshot.coreUpdatedAt) > 12 * 3600000 && <div className="error-banner" role="status">The core snapshot is more than 12 hours old. These readings may no longer reflect current evidence.</div>}
        {error && <div className="error-banner">{error}</div>}
        {needsArchive && archiveError && <div className="error-banner">{archiveError} <button onClick={() => setArchiveRetry((value) => value + 1)}>Retry research data</button></div>}
        {needsArchive && archiveUrl && !archiveError && <p role="status" className="muted">Loading research histories…</p>}
        {!snapshot ? <div className="loading">Loading validated market data…</div> : (
          <>
            {tab === 'Home' && <Home snapshot={snapshot} onInspect={(symbol) => { setSelected(symbol); setTab('Analysis') }} />}
            {tab === 'Data' && <DataView snapshot={snapshot} selected={selected} setSelected={setSelected} events={selectedEvents} />}
            {tab === 'Bias' && <BiasView snapshot={snapshot} onInspect={(symbol) => { setSelected(symbol); setTab('Analysis') }} />}
            {tab === 'Macro Map' && <MacroMap snapshot={snapshot} />}
            {tab === 'CFTC' && <CftcView snapshot={snapshot} />}
            {tab === 'Historical Data' && <HistoryExplorer points={[...snapshot.history, ...calendarHistory(snapshot.events), ...cryptoHistory(snapshot)]} />}
            {tab === 'Crypto' && <CryptoView snapshot={snapshot} />}
            {tab === 'Analysis' && <AnalysisView snapshot={snapshot} selected={selected} setSelected={setSelected} />}
            {tab === 'Top Setups' && <SetupsView snapshot={snapshot} />}
            {tab === 'Economic Calendar' && <CalendarView snapshot={snapshot} />}
            {tab === 'News' && <NewsView snapshot={snapshot} />}
          </>
        )}
      </main>
      <footer className="partner-footer" aria-label="Partnered prop firm">
        <a className="partner-banner" href="https://shop.tradersyard.com/ref/1486" target="_blank" rel="sponsored noopener noreferrer">
          <div className="partner-identity"><span>PARTNER OFFER</span><strong>TradersYard</strong></div>
          <span className="partner-message">Explore your next trading account.</span>
          <div className="partner-offer"><span className="partner-code"><span>DISCOUNT CODE</span><strong>RSHN</strong></span><span className="partner-cta">View accounts <span aria-hidden="true">↗</span></span></div>
        </a>
      </footer>
    </div>
  )
}

function Home({ snapshot, onInspect }: { snapshot: DashboardSnapshot; onInspect: (symbol: string) => void }) {
  const covered = snapshot.pairs.filter((row) => row.shortTerm.coverage >= .5).length
  const divergent = snapshot.pairs.filter((row) => row.shortTerm.score * row.longTerm.score < -.0064).length
  return <div className="stack">
    <section className="page-head"><div><p className="eyebrow">MARKET INTELLIGENCE / OVERVIEW</p><h1>Markets, in perspective.</h1><p className="muted">Read the macro picture. Compare conviction. Understand the risks.</p></div><span className="live-label">{snapshot.pairs.length} markets covered</span></section>
    <section className="summary-strip"><div><span>Broader evidence</span><strong>{covered}<small> / {snapshot.pairs.length} markets</small></strong></div><div><span>Horizon divergence</span><strong>{divergent}</strong></div><div><span>Historical observations</span><strong>{((snapshot.archiveCounts?.history ?? snapshot.history.length) + (snapshot.archiveCounts?.cryptoHistory ?? snapshot.cryptoHistory?.length ?? 0)).toLocaleString()}</strong></div><div><span>Crypto coverage</span><strong>{snapshot.cryptoFundamentals?.filter((row) => row.shortTerm.available).length ?? 0}<small> assets with direct data</small></strong></div></section>
    <BiasView snapshot={snapshot} onInspect={onInspect} compact />
    <section className="two-column"><div className="panel"><p className="eyebrow">CURRENCY FACTORS</p><h2>Relative strength</h2><StrengthChart snapshot={snapshot} /></div><div className="panel"><p className="eyebrow">RESEARCH STATUS</p><h2>Know the limits of each reading</h2><p className="muted">Scores measure directional alignment, not the probability of a profitable trade. Short and long horizons use different decay and weighting; price, execution and event risk still matter.</p><CoverageDetails snapshot={snapshot} /><details><summary>Collection status</summary><FeedHealth snapshot={snapshot} /></details><h2>Latest headlines</h2><NewsList snapshot={snapshot} limit={5} /></div></section>
    <details className="panel"><summary>Market prices · latest available close</summary><PriceBoard snapshot={snapshot} /></details>
  </div>
}

function InstrumentSelect({ value, onChange, options }: { value: string; onChange: (value: string) => void; options: string[] }) {
  return <select aria-label="Selected instrument" value={value} onChange={(event) => onChange(event.target.value)}>{options.map((item) => <option key={item}>{item}</option>)}</select>
}

function cryptoHistory(snapshot: DashboardSnapshot): DashboardSnapshot['history'] {
  return (snapshot.cryptoHistory ?? []).map((point) => ({ ...point, seriesId: `crypto:${point.instrument}:${point.metric}`, frequency: 'daily', releaseDateKnown: false }))
}

function calendarHistory(events: DashboardSnapshot['events']): DashboardSnapshot['history'] {
  return events.filter((event) => event.actual !== null).map((event) => ({
    seriesId: `release:${event.currency}:${event.seriesKey ?? event.name}`, instrument: event.currency,
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
  const positionSymbols = new Set(splitForexPair(selected) ? [selected.slice(0, 3), selected.slice(3)] : [selected])
  const positions = snapshot.cot.filter((item) => positionSymbols.has(item.instrument))
  const history = [...snapshot.history.filter((item) => related.has(item.instrument)), ...calendarHistory(events), ...cryptoHistory(snapshot).filter((item) => item.instrument === selected)]
  return <div className="stack"><section className="page-head"><div><p className="eyebrow">INSTRUMENT DATA</p><h1>{selected}</h1></div><InstrumentSelect value={selected} onChange={setSelected} options={[...snapshot.currencies.map((item) => item.symbol), ...snapshot.pairs.map((item) => item.symbol)]} /></section>
    <section className="summary-strip"><div><span>{price?.priceKind === 'Futures benchmark' ? 'Futures benchmark close' : 'Latest price'}</span><strong>{price ? formatNumber(price.price) : '—'}</strong>{price?.priceUnit && <small>{price.priceUnit}</small>}<small className={price?.changePercent !== null && price?.changePercent !== undefined && price.changePercent < 0 ? 'negative-text' : 'positive-text'}>{price?.changePercent !== null && price?.changePercent !== undefined ? `${price.changePercent >= 0 ? '+' : ''}${price.changePercent.toFixed(2)}%` : 'Unavailable'}</small></div><div><span>Short-term bias</span><strong>{bias && bias.shortTerm.label !== 'unavailable' ? formatScore(bias.shortTerm.score) : '—'}</strong>{bias && <BiasPill label={bias.shortTerm.label} />}</div><div><span>Long-term bias</span><strong>{bias && bias.longTerm.label !== 'unavailable' ? formatScore(bias.longTerm.score) : '—'}</strong>{bias && <BiasPill label={bias.longTerm.label} />}</div><div><span>Position records</span><strong>{positions.length}</strong></div></section>
    {instrumentBias?.modelVersion && <p className="muted">{instrumentBias.rationale[0]}</p>}
    <section className="two-column wide-left"><div className="panel"><p className="eyebrow">ECONOMIC DRIVERS</p><EventTable events={events} /></div><div className="panel"><p className="eyebrow">RELEVANT NEWS</p>{news.length ? <NewsList snapshot={{ ...snapshot, news }} /> : <Empty message="No relevant public news metadata is available." />}</div></section>
    <section className="panel"><PositionChart rows={positions} history={snapshot.cotHistory?.filter((item) => positionSymbols.has(item.instrument))} /></section>
    <HistoryExplorer points={history} />
  </div>
}

function BiasView({ snapshot, onInspect, compact = false }: { snapshot: DashboardSnapshot; onInspect: (symbol: string) => void; compact?: boolean }) {
  const [query, setQuery] = useState('')
  const [direction, setDirection] = useState('all')
  const [order, setOrder] = useState('strength')
  const [group, setGroup] = useState('all')
  const [quality, setQuality] = useState('all')
  const [watchlist, setWatchlist] = useState<string[]>(() => { try { const value: unknown = JSON.parse(localStorage.getItem('bb-watchlist') ?? '[]'); return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [] } catch { return [] } })
  const toggleWatch = (symbol: string) => { const next = watchlist.includes(symbol) ? watchlist.filter((item) => item !== symbol) : [...watchlist, symbol]; setWatchlist(next); try { localStorage.setItem('bb-watchlist', JSON.stringify(next)) } catch { /* browsing storage may be disabled */ } }
  const [horizon, setHorizon] = useState<'shortTerm' | 'longTerm'>('shortTerm')
  const pairs = snapshot.pairs.filter((pair) => pair.symbol.includes(normalizeInstrument(query))
    && (direction === 'all' || pair[horizon].label === direction) && (group === 'all' || assetClass(pair.symbol) === group)
    && (quality === 'all' || (quality === 'watchlist' ? watchlist.includes(pair.symbol) : quality === 'divergent' ? pair.shortTerm.score * pair.longTerm.score < -.0064 : pair[horizon].coverage >= .5 && pair[horizon].evidenceQuality !== 'limited')))
    .sort((a, b) => order === 'symbol' ? a.symbol.localeCompare(b.symbol) : order === 'coverage' ? b[horizon].coverage - a[horizon].coverage : Math.abs(b[horizon].score) - Math.abs(a[horizon].score))
  const visible = compact ? pairs.slice(0, 12) : pairs
  return <section className="panel"><div className="panel-head"><div><p className="eyebrow">FUNDAMENTAL SCREENER</p><h2>Find alignment. Inspect the evidence.</h2></div><HorizonToggle value={horizon} onChange={setHorizon} /></div>
    <div className="filter-bar"><input aria-label="Search pairs" placeholder="Search market or alias…" value={query} onChange={(event) => setQuery(event.target.value)} /><select aria-label="Asset class" value={group} onChange={(event) => setGroup(event.target.value)}><option value="all">All asset classes</option>{['Forex', 'Commodities', 'Indices', 'Crypto'].map((item) => <option key={item}>{item}</option>)}</select><select aria-label="Bias direction" value={direction} onChange={(event) => setDirection(event.target.value)}>{['all', 'bullish', 'bearish', 'neutral', 'unavailable'].map((item) => <option key={item}>{item}</option>)}</select><select aria-label="Evidence filter" value={quality} onChange={(event) => setQuality(event.target.value)}><option value="all">All evidence levels</option><option value="covered">Moderate / broad evidence</option><option value="divergent">Horizon divergence</option><option value="watchlist">My watchlist</option></select><select aria-label="Sort pairs" value={order} onChange={(event) => setOrder(event.target.value)}><option value="strength">Strongest alignment</option><option value="coverage">Most evidence</option><option value="symbol">Instrument A–Z</option></select><span>{compact ? `${visible.length} of ` : ''}{pairs.length} instruments</span></div>
    {visible.length ? <div className="table-wrap"><table><thead><tr><th>Instrument / model</th><th>Short term</th><th>Long term</th><th>Selected score</th><th>Evidence breadth</th><th>Reading</th><th>Explore</th></tr></thead><tbody>{visible.map((pair) => <tr key={pair.symbol}><td className="symbol">{pair.symbol}<small className="model-scope">{assetClass(pair.symbol)} · {pair.modelScope === 'network-and-macro' ? 'Network + macro' : pair.modelScope === 'macro-only' ? 'Macro only' : 'Macro + positioning'}</small></td><td><BiasPill label={pair.shortTerm.label} /><small className="cell-note">{formatScore(pair.shortTerm.score)}</small></td><td><BiasPill label={pair.longTerm.label} /><small className="cell-note">{formatScore(pair.longTerm.score)}</small></td><td><div className="score-meter"><i style={{ width: `${Math.abs(pair[horizon].score) * 100}%`, background: pair[horizon].score >= 0 ? 'var(--positive)' : 'var(--negative)' }} /></div>{formatScore(pair[horizon].score)}</td><td><meter min="0" max="1" value={pair[horizon].coverage} aria-label={`${pair.symbol} evidence coverage`} /><small className="cell-note">{Math.round(pair[horizon].coverage * 100)}% · {pair[horizon].evidenceQuality ?? 'limited'}</small></td><td>{pair[horizon].componentConflict ? 'Conflicting inputs' : pair.shortTerm.score * pair.longTerm.score < -.0064 ? 'Horizons diverge' : pair[horizon].label === 'unavailable' ? 'Insufficient data' : 'Directional model'}</td><td><button className="text-button" onClick={() => onInspect(pair.symbol)}>Analyze →</button> <button className="text-button" aria-label={`${watchlist.includes(pair.symbol) ? 'Remove' : 'Add'} ${pair.symbol} ${watchlist.includes(pair.symbol) ? 'from' : 'to'} watchlist`} aria-pressed={watchlist.includes(pair.symbol)} onClick={() => toggleWatch(pair.symbol)}>{watchlist.includes(pair.symbol) ? 'Watching' : 'Watch'}</button></td></tr>)}</tbody></table></div> : <Empty message="No instruments match these filters." />}
    <p className="footnote">Coverage is input breadth, not accuracy. Scores within ±0.08 are neutral. Select a market to inspect both horizons.</p>
  </section>
}

function HorizonToggle({ value, onChange }: { value: 'shortTerm' | 'longTerm'; onChange: (value: 'shortTerm' | 'longTerm') => void }) {
  return <div className="segmented" aria-label="Analysis horizon">{(['shortTerm', 'longTerm'] as const).map((key) => <button key={key} aria-pressed={value === key} onClick={() => onChange(key)}>{key === 'shortTerm' ? 'Short term' : 'Long term'}</button>)}</div>
}

function CftcView({ snapshot }: { snapshot: DashboardSnapshot }) {
  const [family, setFamily] = useState('tff')
  const [query, setQuery] = useState('')
  const [chosenMarket, setMarket] = useState('')
  const [chosenContract, setContract] = useState('all')
  const families = [...new Set(snapshot.cot.map((row) => row.reportFamily ?? 'tff'))]
  const activeFamily = families.includes(family) ? family : families[0]
  const familyRows = snapshot.cot.filter((row) => (row.reportFamily ?? 'tff') === activeFamily)
  const markets = [...new Set(familyRows.map((row) => row.instrument))].sort()
  const market = markets.includes(chosenMarket) ? chosenMarket : markets[0]
  const marketRows = familyRows.filter((row) => row.instrument === market)
  const contracts = [...new Set(marketRows.map((row) => row.marketId))]
  const contract = contracts.includes(chosenContract) ? chosenContract : 'all'
  const selectedRows = marketRows.filter((row) => contract === 'all' || row.marketId === contract)
  const rows = selectedRows.filter((row) => `${row.instrument} ${row.marketName ?? ''} ${row.category}`.toLowerCase().includes(query.toLowerCase()))
  return <div className="stack"><section className="panel stack"><p className="eyebrow">POSITIONING</p><h1>Commitments and weekly change</h1>
    <div className="filter-bar"><select aria-label="Report family" value={activeFamily ?? ''} onChange={(event) => setFamily(event.target.value)}>{families.map((key) => <option key={key} value={key}>{reportFamilies[key] ?? key}</option>)}</select><select aria-label="CFTC market" value={market ?? ''} onChange={(event) => { setMarket(event.target.value); setContract('all') }}>{markets.map((symbol) => <option key={symbol}>{symbol}</option>)}</select><select aria-label="CFTC contract" value={contract} onChange={(event) => setContract(event.target.value)}><option value="all">All contracts</option>{contracts.map((id) => <option key={id}>{id}</option>)}</select><input aria-label="Search positioning" placeholder="Category in selected market" value={query} onChange={(event) => setQuery(event.target.value)} /><span>{rows.length} records</span></div>
    <p className="muted">One futures-only family and the largest open-interest contract per instrument contribute to bias. Combined and supplemental reports provide context. Weekly change is shown only for consecutive report weeks.</p>
    <PositionChart rows={selectedRows} history={snapshot.cotHistory?.filter((row) => row.instrument === market && (row.reportFamily ?? 'tff') === activeFamily && (contract === 'all' || row.marketId === contract))} />
    <PositionMetrics rows={selectedRows} history={snapshot.cotHistory ?? []} />
    {rows.length ? <div className="table-wrap"><table><thead><tr><th>Market</th><th>Contract</th><th>Category</th><th>Long</th><th>Short</th><th>Net</th><th>Spread</th><th>Open interest</th><th>Weekly Δ</th><th>Report date</th><th>Bias input</th></tr></thead><tbody>{rows.map((row) => <tr key={`${row.reportFamily}-${row.marketId}-${row.category}`}><td className="symbol">{row.instrument}</td><td title={row.marketName}>{row.marketId}</td><td>{row.category}</td><td>{row.long.toLocaleString()}</td><td>{row.short.toLocaleString()}</td><td>{row.net.toLocaleString()}</td><td>{row.spread?.toLocaleString() ?? '—'}</td><td>{row.openInterest?.toLocaleString() ?? '—'}</td><td>{row.weeklyNetChange?.toLocaleString() ?? '—'}</td><td>{row.reportDate}</td><td>{row.normalizedScore === null ? 'Context' : 'Selected'}</td></tr>)}</tbody></table></div> : <Empty message="No matching positioning records are available for this report family." />}
  </section></div>
}

function AnalysisView({ snapshot, selected, setSelected }: { snapshot: DashboardSnapshot; selected: string; setSelected: (value: string) => void }) {
  const [horizon, setHorizon] = useState<'shortTerm' | 'longTerm'>('shortTerm')
  const options = snapshot.analysis.map((item) => item.instrument).sort()
  const active = options.includes(selected) ? selected : options[0]
  const record = snapshot.analysis.find((item) => item.instrument === active)
  const analysis = record?.horizonViews?.[horizon] ?? (record?.horizon === horizon ? record : undefined)
  const pair = snapshot.pairs.find((item) => item.symbol === active)
  const bias = pair?.[horizon]
  const relevant = pair?.macroCurrencies ?? [pair?.base, pair?.quote]
  const upcoming = snapshot.events.filter((event) => event.impact === 'high' && relevant.includes(event.currency) && Date.parse(event.occurredAt) > Date.now() && Date.parse(event.occurredAt) - Date.now() <= 48 * 3600000).sort((a,b) => a.occurredAt.localeCompare(b.occurredAt))
  return <div className="stack"><section className="page-head"><div><p className="eyebrow">FUNDAMENTAL ANALYSIS</p><h1>{active ?? 'No analysis available'}</h1></div><HorizonToggle value={horizon} onChange={setHorizon} /><InstrumentSelect value={active ?? ''} onChange={setSelected} options={options} /></section>
    {upcoming.length > 0 && <div className="warning-note"><strong>Next high-impact release:</strong> {upcoming[0].currency} · {upcoming[0].name} · {formatTime(upcoming[0].occurredAt)}. This can change the current reading.</div>}
    {pair && bias && <><AnalystBriefing pair={pair} horizon={horizon} /><Scorecard pair={pair} reading={bias} snapshot={snapshot} /></>}
    {analysis ? <section className="analysis-grid"><aside className="panel"><span>{horizon === 'shortTerm' ? 'Short-term' : 'Long-term'} score</span><div className="giant-score">{formatScore(analysis.score)}</div><BiasPill label={analysis.bias} /><p className="muted">{Math.round((bias?.coverage ?? 0) * 100)}% evidence breadth · {bias?.evidenceQuality ?? 'limited'}</p>{bias?.componentConflict && <p className="warning-note">Macro, positioning or direct fundamentals disagree.</p>}<div className="factor-list">{bias?.factors?.map((factor) => <div key={factor.name}><span>{factor.name}</span><strong className={factor.score < 0 ? 'negative-text' : 'positive-text'}>{formatScore(factor.score)}</strong></div>)}</div><p className="footnote">Heuristic alignment, not a calibrated forecast. Long term describes slower fundamental evidence, not a promised holding period.</p></aside><div className="panel prose">{analysis.sections.map((section) => <section key={`${section.title}-${section.body}`}><h2>{section.title}</h2><p>{section.body}</p></section>)}</div></section> : <Empty message="Analysis is unavailable for this horizon until validated evidence is present." />}
    {active && <ScoreJournal snapshot={snapshot} instrument={active} horizon={horizon} />}
  </div>
}

function CryptoView({ snapshot }: { snapshot: DashboardSnapshot }) {
  const records = snapshot.cryptoFundamentals ?? []
  const [selected, setSelected] = useState('BTCUSD')
  const [horizon, setHorizon] = useState<'shortTerm' | 'longTerm'>('shortTerm')
  const record = records.find((row) => row.instrument === selected) ?? records[0]
  const direct = record?.[horizon]
  const pair = snapshot.pairs.find((row) => row.symbol === record?.instrument)
  return <div className="stack"><section className="page-head"><div><p className="eyebrow">DIGITAL ASSET RESEARCH</p><h1>Beyond the macro backdrop.</h1></div><HorizonToggle value={horizon} onChange={setHorizon} /><InstrumentSelect value={record?.instrument ?? ''} onChange={setSelected} options={records.map((row) => row.instrument).sort()} /></section>
    <p className="muted">Compare complete daily observations: the latest {horizon === 'shortTerm' ? '7' : '30'} days against the preceding window. Network metrics share one vote; supply and chain liquidity are separate factors. Missing and stale metrics are excluded.</p>
    {pair && <HorizonCells item={pair} />}
    {direct?.available ? <section className="panel"><div className="panel-head"><h2>{record.instrument} · direct fundamentals</h2><span>{direct.groupCount} / 3 factor groups</span></div><div className="table-wrap"><table><thead><tr><th>Metric</th><th>Factor</th><th>Window change</th><th>Directional score</th><th>Observations</th><th>As of UTC</th></tr></thead><tbody>{direct.metrics.map((metric) => <tr key={metric.metric}><td>{metric.name}</td><td>{metric.group}</td><td title={metric.changeUnit}>{formatScore(metric.change)}{metric.metric === 'SplyCur' ? ' pp annualized' : '%'}</td><td className={metric.score < 0 ? 'negative-text' : 'positive-text'}>{formatScore(metric.score)}</td><td>{metric.observations} / {metric.windowDays * 2}</td><td>{metric.asOf}</td></tr>)}</tbody></table></div><p className="footnote">More transactions or fees can reflect congestion or automated activity. Stablecoin supply measures liquidity available on a chain, not guaranteed demand for its token. Issuance changes measure supply pressure; unlock schedules and token-holder value capture are not fully covered.</p></section> : <Empty message="No sufficiently complete, recent direct-fundamental windows are available." />}
    <HistoryExplorer key={record?.instrument} points={cryptoHistory(snapshot).filter((row) => row.instrument === record?.instrument)} />
  </div>
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
  return snapshot.news.length ? <div className="news-list">{snapshot.news.slice(0, limit).map((item) => <a key={item.id} href={item.url} target="_blank" rel="noopener noreferrer"><time>{formatTime(item.publishedAt)}</time><strong>{item.headline}</strong>{item.summary && <p>{item.summary}</p>}<span className="news-open">Read original article ↗</span></a>)}</div> : <Empty message="No public news metadata is available." />
}

function PriceBoard({ snapshot }: { snapshot: DashboardSnapshot }) {
  return snapshot.prices.length ? <div className="price-grid">{snapshot.prices.slice(0, 24).map((item) => <article className="price-card" key={item.instrument}><div><strong>{item.instrument}</strong><time>{formatTime(item.asOf)}</time></div><span>{formatNumber(item.price)}</span>{item.priceKind === 'Futures benchmark' && <small>{item.priceKind} · {item.priceUnit}</small>}<small className={item.changePercent !== null && item.changePercent < 0 ? 'negative-text' : 'positive-text'}>{item.changePercent !== null ? `${item.changePercent >= 0 ? '+' : ''}${item.changePercent.toFixed(2)}%` : '—'}</small></article>)}</div> : <Empty message="No market-price snapshot is available." />
}

export default App
