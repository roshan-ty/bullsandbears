import { BrandLogo } from './components/BrandLogo'
import { lazy, Suspense, useEffect, useMemo, useRef, useState } from 'react'
import { FundamentalReport } from './components/FundamentalReport'
import { EconomicCalendar, EventTable } from './components/EconomicCalendar'
import { Partners } from './components/Partners'
const Journal = lazy(() => import('./components/Journal').then(module => ({ default: module.Journal })))
import { FullVersion } from './components/FullVersion'
import { Empty } from './components/Chart'
import { StrengthChart } from './components/ResearchPanels'
import { AnalystBriefing, Scorecard } from './components/ResearchTools'
import { assetClass, normalizeInstrument } from './domain/instruments'
import type { BiasLabel, DashboardSnapshot } from './domain/types'
import { loadSnapshot } from './lib/data'
import { formatTime, readTheme, saveTheme } from './lib/presentation'

const tabs = ['Home', 'Data', 'Bias', 'Journal', 'Analysis', 'Economical Calendar', 'Partners', 'Get Full Version'] as const
type Tab = (typeof tabs)[number]

const formatScore = (value: number) => `${value >= 0 ? '+' : ''}${value !== 0 && Math.abs(value) < 0.005 ? value.toPrecision(2) : value.toFixed(2)}`
const formatNumber = (value: number) => new Intl.NumberFormat(undefined, { maximumFractionDigits: value < 10 ? 4 : 2 }).format(value)

function BiasPill({ label }: { label: BiasLabel }) {
  return <span className={`pill ${label}`}>{label}</span>
}


function CoverageDetails({ snapshot }: { snapshot: DashboardSnapshot }) {
  const available = snapshot.currencies.filter((row) => row.shortTerm.label !== 'unavailable').length
  return <details className="coverage-details"><summary>Evidence coverage · {available}/{snapshot.currencies.length} currencies have current inputs</summary>

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
  const [menuOpen, setMenuOpen] = useState(false)
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
    window.addEventListener('bb-data-updated', refresh)
    return () => { controller.abort(); window.clearInterval(timer); window.removeEventListener('bb-data-updated', refresh) }
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
      <a className="skip-link" href="#workspace">Skip to research</a>
      <header className="topbar">
        <div className="brand"><BrandLogo /></div>
        <div className="status-line"><span>Fundamentals <strong>{formatTime(snapshot?.coreUpdatedAt ?? snapshot?.generatedAt ?? null)}</strong></span></div>

        <button className="theme-toggle" onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')} aria-label="Toggle color theme">
          {theme === 'dark' ? 'Light mode' : 'Dark mode'}
        </button>
      </header>

      <button className="mobile-nav-trigger" aria-expanded={menuOpen} aria-controls="mobile-navigation" onClick={() => setMenuOpen(!menuOpen)}>{tab}<span>{menuOpen ? 'Close' : 'Menu'}</span></button>
      <nav className="tabs desktop-navigation" aria-label="Primary navigation">{tabs.map(item => <button key={item} aria-current={tab === item ? 'page' : undefined} className={tab === item ? 'active' : ''} onClick={() => setTab(item)}>{item}</button>)}</nav>
      <nav id="mobile-navigation" className={`mobile-navigation ${menuOpen ? 'is-open' : ''}`} aria-label="Mobile navigation">{tabs.map(item => <button key={item} aria-current={tab === item ? 'page' : undefined} onClick={() => { setTab(item); setMenuOpen(false) }}>{item}</button>)}</nav>

      <main id="workspace" ref={workspace} tabIndex={-1}>
        {!['Journal', 'Partners', 'Get Full Version'].includes(tab) && snapshot?.coreUpdatedAt && Date.now() - Date.parse(snapshot.coreUpdatedAt) > 12 * 3600000 && <div className="error-banner" role="status">Fundamentals overdue · last update {formatTime(snapshot.coreUpdatedAt)}</div>}
        {!['Journal', 'Partners', 'Get Full Version'].includes(tab) && error && <div className="error-banner">{error}</div>}
        {tab === 'Get Full Version' ? <FullVersion /> : tab === 'Partners' ? <Partners /> : tab === 'Journal' ? <Suspense fallback={<p>Loading journal…</p>}><Journal /></Suspense> : !snapshot ? <div className="loading">Loading market data…</div> : (
          <>
            {tab === 'Home' && <Home snapshot={snapshot} onInspect={(symbol) => { setSelected(symbol); setTab('Analysis') }} />}
            {tab === 'Data' && <DataView snapshot={snapshot} selected={selected} setSelected={setSelected} events={selectedEvents} />}
            {tab === 'Bias' && <BiasView snapshot={snapshot} onInspect={(symbol) => { setSelected(symbol); setTab('Analysis') }} />}
            {tab === 'Analysis' && <AnalysisView snapshot={snapshot} selected={selected} setSelected={setSelected} />}
            {tab === 'Economical Calendar' && <EconomicCalendar snapshot={snapshot} />}
          </>
        )}
      </main>
    </div>
  )
}

function Home({ snapshot, onInspect }: { snapshot: DashboardSnapshot; onInspect: (symbol: string) => void }) {
  const covered = snapshot.pairs.filter((row) => row.shortTerm.coverage >= .5).length
  const divergent = snapshot.pairs.filter((row) => row.shortTerm.score * row.longTerm.score < -.0064).length
  return <div className="stack">
    <section className="page-head"><div><h1>Market overview</h1></div><span className="live-label">{snapshot.pairs.length} markets covered</span></section>
    <section className="summary-strip"><div><span>Broader evidence</span><strong>{covered}<small> / {snapshot.pairs.length} markets</small></strong></div><div><span>Horizon divergence</span><strong>{divergent}</strong></div><div><span>Economic releases</span><strong>{snapshot.events.filter(event => event.actual !== null).length.toLocaleString()}</strong></div><div><span>Economies</span><strong>{snapshot.currencies.length}</strong></div></section>
    <BiasView snapshot={snapshot} onInspect={onInspect} compact />
    <section className="two-column"><div className="panel"><h2>Relative strength</h2><StrengthChart snapshot={snapshot} /></div><div className="panel"><h2>Coverage</h2><CoverageDetails snapshot={snapshot} /></div></section>
    <details className="panel"><summary>Market prices · latest available close</summary><PriceBoard snapshot={snapshot} /></details>
  </div>
}

function InstrumentSelect({ value, onChange, options }: { value: string; onChange: (value: string) => void; options: string[] }) {
  return <select aria-label="Selected instrument" value={value} onChange={(event) => onChange(event.target.value)}>{options.map((item) => <option key={item}>{item}</option>)}</select>
}



function DataView({ snapshot, selected, setSelected, events }: { snapshot: DashboardSnapshot; selected: string; setSelected: (value: string) => void; events: DashboardSnapshot['events'] }) {
  const currency = selected.slice(0, 3)
  const instrumentBias = snapshot.pairs.find((item) => item.symbol === selected)
  const currencyBias = snapshot.currencies.find((item) => item.symbol === currency)
  const bias = instrumentBias ?? currencyBias
  const price = snapshot.prices.find((item) => item.instrument === selected)
  return <div className="stack"><section className="page-head"><div><h1>{selected}</h1></div><InstrumentSelect value={selected} onChange={setSelected} options={[...snapshot.currencies.map((item) => item.symbol), ...snapshot.pairs.map((item) => item.symbol)]} /></section>
    <section className="summary-strip"><div><span>{price?.priceKind ?? 'Latest price'}</span><strong>{price ? formatNumber(price.price) : '—'}</strong>{price?.priceUnit && <small>{price.priceUnit}</small>}<small className={price?.changePercent !== null && price?.changePercent !== undefined && price.changePercent < 0 ? 'negative-text' : 'positive-text'}>{price?.changePercent !== null && price?.changePercent !== undefined ? `${price.changePercent >= 0 ? '+' : ''}${price.changePercent.toFixed(2)}%` : 'Unavailable'}</small></div><div><span>Short-term bias</span><strong>{bias && bias.shortTerm.label !== 'unavailable' ? formatScore(bias.shortTerm.score) : '—'}</strong>{bias && <BiasPill label={bias.shortTerm.label} />}</div><div><span>Long-term bias</span><strong>{bias && bias.longTerm.label !== 'unavailable' ? formatScore(bias.longTerm.score) : '—'}</strong>{bias && <BiasPill label={bias.longTerm.label} />}</div><div><span>Economic releases</span><strong>{events.length}</strong></div></section>
    {instrumentBias?.modelVersion && <p className="muted">{instrumentBias.rationale[0]}</p>}
    <section className="panel"><h2>Economic drivers</h2><EventTable events={events.slice(0, 100)} /></section>
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
  return <section className="panel"><div className="panel-head"><div><h2>Market bias</h2></div><HorizonToggle value={horizon} onChange={setHorizon} /></div>
    <div className="filter-bar"><input aria-label="Search pairs" placeholder="Search market or alias…" value={query} onChange={(event) => setQuery(event.target.value)} /><select aria-label="Asset class" value={group} onChange={(event) => setGroup(event.target.value)}><option value="all">All asset classes</option>{['Forex', 'Commodities', 'Indices'].map((item) => <option key={item}>{item}</option>)}</select><select aria-label="Bias direction" value={direction} onChange={(event) => setDirection(event.target.value)}>{['all', 'bullish', 'bearish', 'neutral', 'unavailable'].map((item) => <option key={item}>{item}</option>)}</select><select aria-label="Evidence filter" value={quality} onChange={(event) => setQuality(event.target.value)}><option value="all">All evidence levels</option><option value="covered">Moderate / broad evidence</option><option value="divergent">Horizon divergence</option><option value="watchlist">My watchlist</option></select><select aria-label="Sort pairs" value={order} onChange={(event) => setOrder(event.target.value)}><option value="strength">Strongest alignment</option><option value="coverage">Most evidence</option><option value="symbol">Instrument A–Z</option></select><span>{compact ? `${visible.length} of ` : ''}{pairs.length} instruments</span></div>
    {visible.length ? <div className="table-wrap"><table><thead><tr><th>Instrument / model</th><th>Short term</th><th>Long term</th><th>Selected score</th><th>Evidence breadth</th><th>Reading</th><th>Explore</th></tr></thead><tbody>{visible.map((pair) => <tr key={pair.symbol}><td className="symbol">{pair.symbol}<small className="model-scope">{assetClass(pair.symbol)} · {pair.modelScope === 'network-and-macro' ? 'Network + macro' : pair.modelScope === 'macro-only' ? 'Macro only' : 'Macro + positioning'}</small></td><td><BiasPill label={pair.shortTerm.label} /><small className="cell-note">{formatScore(pair.shortTerm.score)}</small></td><td><BiasPill label={pair.longTerm.label} /><small className="cell-note">{formatScore(pair.longTerm.score)}</small></td><td><div className="score-meter"><i style={{ width: `${Math.abs(pair[horizon].score) * 100}%`, background: pair[horizon].score >= 0 ? 'var(--positive)' : 'var(--negative)' }} /></div>{formatScore(pair[horizon].score)}</td><td><meter min="0" max="1" value={pair[horizon].coverage} aria-label={`${pair.symbol} evidence coverage`} /><small className="cell-note">{Math.round(pair[horizon].coverage * 100)}% · {pair[horizon].evidenceQuality ?? 'limited'}</small></td><td>{pair[horizon].componentConflict ? 'Conflicting inputs' : pair.shortTerm.score * pair.longTerm.score < -.0064 ? 'Horizons diverge' : pair[horizon].label === 'unavailable' ? 'Insufficient data' : 'Directional model'}</td><td><button className="text-button" onClick={() => onInspect(pair.symbol)}>Analyze</button> <button className="text-button" aria-label={`${watchlist.includes(pair.symbol) ? 'Remove' : 'Add'} ${pair.symbol} ${watchlist.includes(pair.symbol) ? 'from' : 'to'} watchlist`} aria-pressed={watchlist.includes(pair.symbol)} onClick={() => toggleWatch(pair.symbol)}>{watchlist.includes(pair.symbol) ? 'Watching' : 'Watch'}</button></td></tr>)}</tbody></table></div> : <Empty message="No instruments match these filters." />}

  </section>
}

function HorizonToggle({ value, onChange }: { value: 'shortTerm' | 'longTerm'; onChange: (value: 'shortTerm' | 'longTerm') => void }) {
  return <div className="segmented" aria-label="Analysis horizon">{(['shortTerm', 'longTerm'] as const).map((key) => <button key={key} aria-pressed={value === key} onClick={() => onChange(key)}>{key === 'shortTerm' ? 'Short term' : 'Long term'}</button>)}</div>
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
  return <div className="stack"><section className="page-head"><div><h1>{active ?? 'No analysis available'}</h1></div><HorizonToggle value={horizon} onChange={setHorizon} /><InstrumentSelect value={active ?? ''} onChange={setSelected} options={options} /></section>
    {upcoming.length > 0 && <div className="warning-note"><strong>Next high-impact release:</strong> {upcoming[0].currency} · {upcoming[0].name} · {formatTime(upcoming[0].occurredAt)}. This can change the current reading.</div>}
    {pair && bias && <><AnalystBriefing pair={pair} horizon={horizon} /><FundamentalReport pair={pair} horizon={horizon} snapshot={snapshot} analysis={analysis} /><Scorecard pair={pair} reading={bias} snapshot={snapshot} /></>}
    {analysis ? <section className="analysis-grid"><aside className="panel"><span>{horizon === 'shortTerm' ? 'Short-term' : 'Long-term'} score</span><div className="giant-score">{formatScore(analysis.score)}</div><BiasPill label={analysis.bias} /><p className="muted">{Math.round((bias?.coverage ?? 0) * 100)}% evidence breadth · {bias?.evidenceQuality ?? 'limited'}</p>{bias?.componentConflict && <p className="warning-note">Macro, positioning or direct fundamentals disagree.</p>}<div className="factor-list">{bias?.factors?.map((factor) => <div key={factor.name}><span>{factor.name}</span><strong className={factor.score < 0 ? 'negative-text' : 'positive-text'}>{formatScore(factor.score)}</strong></div>)}</div></aside><div className="panel prose">{analysis.sections.map((section) => <section key={`${section.title}-${section.body}`}><h2>{section.title}</h2><p>{section.body}</p></section>)}</div></section> : <Empty message="Analysis is unavailable for this horizon until validated evidence is present." />}
  </div>
}





function PriceBoard({ snapshot }: { snapshot: DashboardSnapshot }) {
  return snapshot.prices.length ? <div className="price-grid">{snapshot.prices.slice(0, 24).map((item) => <article className="price-card" key={item.instrument}><div><strong>{item.instrument}</strong><time>{formatTime(item.asOf)}</time></div><span>{formatNumber(item.price)}</span>{item.priceKind && <small>{item.priceKind} · {item.priceUnit}</small>}<small className={item.changePercent !== null && item.changePercent < 0 ? 'negative-text' : 'positive-text'}>{item.changePercent !== null ? `${item.changePercent >= 0 ? '+' : ''}${item.changePercent.toFixed(2)}%` : '—'}</small></article>)}</div> : <Empty message="No market-price snapshot is available." />
}

export default App
