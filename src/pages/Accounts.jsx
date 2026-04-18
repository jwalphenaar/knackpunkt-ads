import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

const STATUS_COLORS = {
  RUNNABLE: '#22c55e',
  BILLING_HOLD: '#f59e0b',
  STOPPED: '#6b7280',
  REMOVED: '#ef4444',
  DRAFT: '#a855f7',
  ACCOUNT_END_DATE_HOLD: '#f97316',
}

export default function Accounts() {
  const [accounts, setAccounts] = useState([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState('all')

  useEffect(() => {
    supabase
      .from('linkedin_ad_accounts')
      .select('*')
      .order('name')
      .then(({ data }) => { setAccounts(data || []); setLoading(false) })
  }, [])

  const filtered = filter === 'all'
    ? accounts
    : accounts.filter(a => a.serving_statuses?.includes(filter))

  const counts = {
    all: accounts.length,
    RUNNABLE: accounts.filter(a => a.serving_statuses?.includes('RUNNABLE')).length,
    BILLING_HOLD: accounts.filter(a => a.serving_statuses?.includes('BILLING_HOLD')).length,
    STOPPED: accounts.filter(a => a.status === 'REMOVED').length,
  }

  if (loading) return <div className="loading">Laden...</div>

  return (
    <div>
      <h1 className="page-title">Ad Accounts <span className="count">{accounts.length}</span></h1>

      <div className="filter-bar">
        {[['all', 'Alle'], ['RUNNABLE', 'Actief'], ['BILLING_HOLD', 'Billing Hold'], ['STOPPED', 'Gestopt']].map(([key, label]) => (
          <button key={key} className={`filter-btn ${filter === key ? 'active' : ''}`} onClick={() => setFilter(key)}>
            {label} <span>{counts[key]}</span>
          </button>
        ))}
      </div>

      <div className="table-wrapper">
        <table className="data-table">
          <thead>
            <tr>
              <th>Naam</th>
              <th>Status</th>
              <th>Type</th>
              <th>Valuta</th>
              <th>ID</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map(a => (
              <tr key={a.id}>
                <td className="name-cell">{a.name}</td>
                <td>
                  <span className="badge" style={{ background: STATUS_COLORS[a.serving_statuses?.[0]] + '20', color: STATUS_COLORS[a.serving_statuses?.[0]] }}>
                    {a.serving_statuses?.[0] || a.status}
                  </span>
                </td>
                <td>{a.type}</td>
                <td>{a.currency}</td>
                <td className="id-cell">{a.id}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}