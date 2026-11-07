import { useState } from 'react'
import type { JournalAccount } from '../domain/journal'

export function JournalAccounts({ accounts, selected, busy, choose, remove }: {
  accounts: JournalAccount[]; selected: string; busy: boolean
  choose: (account: JournalAccount) => void; remove: (account: JournalAccount) => void
}) {
  const [query, setQuery] = useState(''), [confirm, setConfirm] = useState('')
  const visible = accounts.filter(row => row.name.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()))
  return <>
    <div className="journal-account-tools"><input aria-label="Search accounts" placeholder="Search accounts" value={query} onChange={event => setQuery(event.target.value)} /></div>
    <div className="journal-account-list">{visible.map(row => <article key={row.id} className={selected === row.id ? 'journal-account-selected' : ''}>
      <div className="journal-account-identity"><h3>{row.name}</h3><p>{row.currency}</p></div>
      <div className="journal-account-buttons"><button className="journal-primary" disabled={busy} onClick={() => choose(row)} aria-label={`Open journal for ${row.name}`}>{selected === row.id ? 'Current journal' : 'Open journal'}</button>
        <button disabled={busy} onClick={() => { if (confirm !== row.id) setConfirm(row.id); else { remove(row); setConfirm('') } }}>{confirm === row.id ? 'Confirm removal' : 'Remove empty account'}</button>
      </div>
    </article>)}</div>
    {!visible.length && <p className="muted">No matching accounts.</p>}
  </>
}
