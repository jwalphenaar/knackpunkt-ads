import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useNavigate } from 'react-router-dom'

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

  // Filters
  const [statusFilter, setStatusFilter] = useState('all')
  const [accountFilter, setAccountFilter] = useState('all')
  const [goalFilter, setGoalFilter] = useState('all')
  const [formatFilter, setFormatFilter] = useState('all')

  // Sortering
  const [sortField, setSortField] = useState('last_modified_at')
  const [sortDir, setSortDir] = useState('desc')

  const navigate = useNavigate()

  useEffect(() => {
    Promise.all([
      supabase
        .from('linkedin_ad_campaigns')
        .select('*', { count: 'exact' })
        .limit(1000),
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

  // Unieke waarden voor dropdowns
  const accounts = [...new Set(campaigns.map(c => c.account_name))].filter(Boolean).sort()
  const goals = [...new Set(campaigns.map(c => c.objective_type))].filter(Boolean).sort()
  const formats = [...new Set(campaigns.map(c => c.format))].filter(Boolean).sort()
  const statuses = [...new Set(campaigns.map(c => c.status))].filter(Boolean).sort()

  // Filteren
  let filtered = campaigns
  if (statusFilter !== 'all') filtered = filtered.filter(c => c.status === statusFilter)
  if (accountFilter !== 'all') filtered = filtered.filter(c => c.account_name === accountFilter)
  if (goalFilter !== 'all') filtered = filtered.filter(c => c.objective_type === goalFilter)
  if (formatFilter !== 'all') filtered = filtered.filter(c => c.format === formatFilter)

  // Sorteren
  filtered = [...filtered].sort((a, b) => {
    let aVal = a[sortField]
    let bVal = b[sortField]
    if (!aVal) return 1
    if (!bVal) return -1
    if (typeof aVal === 'string') aVal = aVal.toLowerCase()
    if (typeof bVal === 'string') bVal = bVal.toLowerCase()
    if (aVal < bVal) return sortDir === 'asc' ? -1 : 1
    if (aVal > bVal) return sortDir === 'asc' ? 1 : -1
    return 0
  })

  const handleSort = (field) => {
    if (sortField === field) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setSortField(field); setSortDir('asc') }
  }

  const SortIcon = ({ field }) => {
    if (sortField !== field) return <span style={{ color: '#d1d5db' }}> ↕</span>
    return <span style={{ color: '#0077b5' }}>{sortDir === 'asc' ? ' ↑' : ' ↓'}</span>
  }

  if (loading) return <div className="loading">Laden...</div>

  return (
    <div>
      <h1 className="page-title">Campagnes <span className="count">{filtered.length} / {total}</span></h1>

      {/* Status filter tabs */}
      <div className="filter-bar">
        <button className={`filter-btn ${statusFilter === 'all' ? 'active' : ''}`} onClick={() => setStatusFilter('all')}>
          Alle <span>{campaigns.length}</span>
        </button>
        {statuses.map(s => (
          <button key={s} className={`filter-btn ${statusFilter === s ? 'active' : ''}`} onClick={() => setStatusFilter(s)}
            style={statusFilter === s ? {} : { borderColor: (STATUS_COLORS[s] || '#9ca3af') + '60', color: STATUS_COLORS[s] || '#9ca3af' }}>
            {s.charAt(0) + s.slice(1).toLowerCase()} <span>{campaigns.filter(c => c.status === s).length}</span>
          </button>
        ))}
      </div>

      {/* Dropdown filters */}
      <div className="dropdown-filters">
        <select value={accountFilter} onChange={e => setAccountFilter(e.target.value)}>
          <option value="all">Alle accounts</option>
          {accounts.map(a => <option key={a} value={a}>{a}</option>)}
        </select>

        <select value={goalFilter} onChange={e => setGoalFilter(e.target.value)}>
          <option value="all">Alle doelen</option>
          {goals.map(g => <option key={g} value={g}>{g}</option>)}
        </select>

        <select value={formatFilter} onChange={e => setFormatFilter(e.target.value)}>
          <option value="all">Alle formaten</option>
          {formats.map(f => <option key={f} value={f}>{f}</option>)}
        </select>

        {(accountFilter !== 'all' || goalFilter !== 'all' || formatFilter !== 'all') && (
          <button className="reset-btn" onClick={() => { setAccountFilter('all'); setGoalFilter('all'); setFormatFilter('all') }}>
            Filters wissen ✕
          </button>
        )}
      </div>

      <div className="table-wrapper">
        <table className="data-table">
          <thead>
            <tr>
              <th onClick={() => handleSort('account_name')} style={{ cursor: 'pointer' }}>Account<SortIcon field="account_name" /></th>
              <th onClick={() => handleSort('name')} style={{ cursor: 'pointer' }}>Naam<SortIcon field="name" /></th>
              <th onClick={() => handleSort('status')} style={{ cursor: 'pointer' }}>Status<SortIcon field="status" /></th>
              <th onClick={() => handleSort('objective_type')} style={{ cursor: 'pointer' }}>Doel<SortIcon field="objective_type" /></th>
              <th onClick={() => handleSort('format')} style={{ cursor: 'pointer' }}>Formaat<SortIcon field="format" /></th>
              <th onClick={() => handleSort('daily_budget_amount')} style={{ cursor: 'pointer' }}>Budget/dag<SortIcon field="daily_budget_amount" /></th>
              <th onClick={() => handleSort('total_budget_amount')} style={{ cursor: 'pointer' }}>Totaal<SortIcon field="total_budget_amount" /></th>
              <th onClick={() => handleSort('last_modified_at')} style={{ cursor: 'pointer' }}>Gewijzigd<SortIcon field="last_modified_at" /></th>
              <th onClick={() => handleSort('created_at')} style={{ cursor: 'pointer' }}>Aangemaakt<SortIcon field="created_at" /></th>
              <th>ID</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map(c => (
              <tr key={c.id} onClick={() => navigate(`/campaigns/${c.id}`)} style={{ cursor: 'pointer' }}>
                <td>{c.account_name}</td>
                <td className="name-cell">{c.name}</td>
                <td>
                  <span className="badge" style={{ background: (STATUS_COLORS[c.status] || '#9ca3af') + '20', color: STATUS_COLORS[c.status] || '#9ca3af' }}>
                    {c.status}
                  </span>
                </td>
                <td>{c.objective_type || '—'}</td>
                <td>{c.format || '—'}</td>
                <td>{c.daily_budget_amount ? `€${c.daily_budget_amount}` : '—'}</td>
                <td>{c.total_budget_amount ? `€${c.total_budget_amount}` : '—'}</td>
                <td>{c.last_modified_at ? new Date(c.last_modified_at).toLocaleDateString('nl-NL') : '—'}</td>
                <td>{c.created_at ? new Date(c.created_at).toLocaleDateString('nl-NL') : '—'}</td>
                <td className="id-cell">{c.id}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}