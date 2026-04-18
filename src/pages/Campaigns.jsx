import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

const STATUS_COLORS = {
  ACTIVE: '#22c55e',
  PAUSED: '#f59e0b',
  COMPLETED: '#6b7280',
  CANCELED: '#ef4444',
  DRAFT: '#a855f7',
  ARCHIVED: '#9ca3af',
}

export default function Campaigns() {
  const [campaigns, setCampaigns] = useState([])
  const [loading, setLoading] = useState(true)
  const [total, setTotal] = useState(0)
  const [filter, setFilter] = useState('all')

  useEffect(() => {
    Promise.all([
      supabase
        .from('linkedin_ad_campaigns')
        .select('*', { count: 'exact' })
        .order('last_modified_at', { ascending: false })
        .limit(500),
      supabase
        .from('linkedin_ad_accounts')
        .select('id, name')
    ]).then(([{ data: camps, count }, { data: accs }]) => {
      const accountMap = Object.fromEntries((accs || []).map(a => [a.id, a.name]))
      setCampaigns((camps || []).map(c => ({ ...c, account_name: accountMap[c.account_id] || c.account_id })))
      setTotal(count || 0)
      setLoading(false)
    })
  }, [])

  const statuses = ['ACTIVE', 'PAUSED', 'COMPLETED', 'CANCELED', 'DRAFT', 'ARCHIVED']
  const counts = Object.fromEntries(statuses.map(s => [s, campaigns.filter(c => c.status === s).length]))
  counts.all = campaigns.length

  const filtered = filter === 'all' ? campaigns : campaigns.filter(c => c.status === filter)

  if (loading) return <div className="loading">Laden...</div>

  return (
    <div>
      <h1 className="page-title">Campagnes <span className="count">{total}</span></h1>

      <div className="filter-bar">
        <button className={`filter-btn ${filter === 'all' ? 'active' : ''}`} onClick={() => setFilter('all')}>
          Alle <span>{counts.all}</span>
        </button>
        {statuses.filter(s => counts[s] > 0).map(s => (
          <button key={s} className={`filter-btn ${filter === s ? 'active' : ''}`} onClick={() => setFilter(s)}
            style={filter === s ? {} : { borderColor: STATUS_COLORS[s] + '40', color: STATUS_COLORS[s] }}>
            {s.charAt(0) + s.slice(1).toLowerCase()} <span>{counts[s]}</span>
          </button>
        ))}
      </div>

<div className="table-wrapper" style={{ overflowX: 'auto' }}>
  <table className="data-table" style={{ width: '100%', tableLayout: 'fixed' }}>
    <colgroup>
      <col style={{ width: '150px' }} /> {/* Account */}
      <col style={{ width: '250px' }} /> {/* Naam */}
      <col style={{ width: '100px' }} /> {/* Status */}
      <col style={{ width: '160px' }} /> {/* Type */}
      <col style={{ width: '160px' }} /> {/* Doel */}
      <col style={{ width: '140px' }} /> {/* Formaat */}
      <col style={{ width: '100px' }} /> {/* Budget/dag */}
      <col style={{ width: '110px' }} /> {/* Totaal budget */}
      <col style={{ width: '80px' }} />  {/* Valuta */}
    </colgroup>
          <tbody>
            {filtered.map(c => (
              <tr key={c.id}>
                <td>{c.account_name}</td>
                <td className="name-cell">{c.name}</td>
                <td>
                  <span className="badge" style={{ background: (STATUS_COLORS[c.status] || '#9ca3af') + '20', color: STATUS_COLORS[c.status] || '#9ca3af' }}>
                    {c.status}
                  </span>
                </td>
                <td>{c.type}</td>
                <td>{c.objective_type}</td>
                <td>{c.format || '—'}</td>
                <td>{c.daily_budget_amount ? c.daily_budget_amount : '—'}</td>
                <td>{c.total_budget_amount ? c.total_budget_amount : '—'}</td>
                <td>{c.daily_budget_currency || c.total_budget_currency || '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}