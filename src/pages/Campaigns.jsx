import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

export default function Campaigns() {
  const [campaigns, setCampaigns] = useState([])
  const [loading, setLoading] = useState(true)
  const [total, setTotal] = useState(0)

  useEffect(() => {
    supabase
      .from('linkedin_ad_campaigns')
      .select('*', { count: 'exact' })
      .order('last_modified_at', { ascending: false })
      .limit(100)
      .then(({ data, count }) => {
        setCampaigns(data || [])
        setTotal(count || 0)
        setLoading(false)
      })
  }, [])

  if (loading) return <div className="loading">Laden...</div>

  return (
    <div>
      <h1 className="page-title">Campagnes <span className="count">{total}</span></h1>
      <p className="subtitle">Toont de 100 meest recent gewijzigde campagnes. Sync loopt nog op de achtergrond.</p>

      <div className="table-wrapper">
        <table className="data-table">
          <thead>
            <tr>
              <th>Naam</th>
              <th>Status</th>
              <th>Type</th>
              <th>Doel</th>
              <th>Budget/dag</th>
              <th>Valuta</th>
            </tr>
          </thead>
          <tbody>
            {campaigns.map(c => (
              <tr key={c.id}>
                <td className="name-cell">{c.name}</td>
                <td><span className="badge">{c.status}</span></td>
                <td>{c.type}</td>
                <td>{c.objective_type}</td>
                <td>{c.daily_budget_amount ? `${c.daily_budget_amount}` : '—'}</td>
                <td>{c.daily_budget_currency}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}