import { useState } from 'react'
import { Empty } from './Chart'

const partnerCategories = ['All', 'Futures Prop Firms', 'CFDs Prop Firms', 'Brokers'] as const
type Category = (typeof partnerCategories)[number]

// Add future partners here; every listing supplies its own category, code and destination.
const partners: { name: string; category: Exclude<Category, 'All'>; description: string; code: string; url: string; cta: string }[] = [
  { name: 'TradersYard', category: 'Futures Prop Firms', description: 'Take the next step in your futures trading journey. Explore TradersYard account options and choose the challenge that fits your approach.', code: 'RSHN', url: 'https://shop.tradersyard.com/ref/1486', cta: 'Explore TradersYard accounts' },
]

export function Partners() {
  const [category, setCategory] = useState<Category>('All')
  const visible = partners.filter(partner => category === 'All' || partner.category === category)
  return <div className="stack partners-page">
    <section className="page-head"><div><p className="eyebrow">PARTNER DIRECTORY</p><h1>Partners</h1><p className="muted">Explore trading firms and brokers, with offers for the Bulls &amp; Bears community.</p></div>
      <label className="partner-filter">Partner category<select aria-label="Partner category" value={category} onChange={event => setCategory(event.target.value as Category)}>{partnerCategories.map(item => <option key={item}>{item}</option>)}</select></label>
    </section>
    <p className="muted" role="status">{visible.length} {visible.length === 1 ? 'partner' : 'partners'} · {category}</p>
    <div className="partner-directory">{visible.map(partner => <article className="panel partner-card" key={partner.name}>
      <p className="eyebrow">{partner.category}</p><h2>{partner.name}</h2><p className="muted">{partner.description}</p>
      <div className="partner-promotion"><div><span>YOUR DISCOUNT CODE</span><strong>{partner.code}</strong></div><p className="muted">Use this code at checkout for the best available partner offer.</p></div>
      <a className="partner-account-link" href={partner.url} target="_blank" rel="sponsored noopener noreferrer">{partner.cta}</a>
    </article>)}</div>
    {!visible.length && <section className="panel"><Empty message={`No ${category.toLowerCase()} have been added yet. Select All to explore our current partners.`} /></section>}
  </div>
}
