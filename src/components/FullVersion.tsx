const purchase = 'mailto:bullsandbears@gmail.com?subject=Bulls%20%26%20Bears%20Full%20Version&body=Hello%2C%0D%0A%0D%0AI%20would%20like%20to%20purchase%20the%20full%20version%20of%20Bulls%20%26%20Bears%20Screener%20at%20the%20%24500%20offer%20price.%20Please%20send%20me%20the%20purchase%20details.%0D%0A'
const features = [
  ['Macro map', 'See the broader economic picture across markets.'],
  ['Positioning', 'Explore institutional commitments and market exposure.'],
  ['Retail sentiments', 'Assess where retail traders are positioned.'],
  ['Charts', 'Follow market prices in a dedicated charting workspace.'],
  ['Historical data', 'Research how economic conditions have changed over time.'],
  ['Crypto', 'Explore asset-specific fundamentals and market context.'],
  ['Top setups', 'Find the markets with the strongest fundamental alignment.'],
  ['News', 'Keep current developments alongside your research.'],
]

export function FullVersion() {
  return <div className="stack upgrade-page">
    <section className="upgrade-hero panel"><div><p className="eyebrow">THE FULL SCREENER</p><h1>Built for serious traders.</h1><p className="upgrade-intro">Go deeper with a complete research workspace. Connect the macro picture, market positioning and historical context to your trading decisions.</p><span className="upgrade-platform">Full Windows desktop application</span></div><div className="upgrade-offer"><span>Full version</span><div className="upgrade-price"><del>$1,000</del><strong>$500</strong><span>USD · current offer</span></div><a className="upgrade-cta" href={purchase}>Email to buy the full version</a><a className="upgrade-email" href={purchase}>bullsandbears@gmail.com</a></div></section>
    <section className="upgrade-features" aria-label="Full version features">{features.map(([title, description], i) => <article className="panel" key={title}><span className="feature-number">{String(i + 1).padStart(2, '0')}</span><h2>{title}</h2><p>{description}</p></article>)}</section>
  </div>
}
