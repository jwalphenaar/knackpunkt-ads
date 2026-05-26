import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'

const fmt = (n) => n ? Number(n).toLocaleString('nl-NL') : '0'
const eur = (n) => n ? `€${Number(n).toLocaleString('nl-NL', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : '€0,00'
const pct = (a, b) => (a && b && b > 0) ? `${((a / b) * 100).toFixed(2)}%` : '0%'

const STATUS_COLORS = {
  RUNNABLE: '#22c55e',
  BILLING_HOLD: '#f59e0b',
  STOPPED: '#6b7280',
  REMOVED: '#ef4444',
  DRAFT: '#a855f7',
  ACCOUNT_END_DATE_HOLD: '#f97316',
}

export default function AccountDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [loading, setLoading] = useState(true)
  const [account, setAccount] = useState(null)
  const [campaigns, setCampaigns] = useState([])
  const [analytics, setAnalytics] = useState([])
  const [error, setError] = useState('')
  const [dateFilter, setDateFilter] = useState('this_month')

  useEffect(() => {
    const load = async () => {
      setLoading(true)
      setError('')

      const { data: acc, error: accError } = await supabase
        .from('linkedin_ad_accounts')
        .select('*')
        .eq('id', id)
        .single()

      if (accError || !acc) {
        setError(accError?.message || 'Account niet gevonden.')
        setLoading(false)
        return
      }

      setAccount(acc)

      const { data: campData, error: campError } = await supabase
        .from('linkedin_ad_campaigns')
        .select('id, name, status, last_modified_at')
        .eq('account_id', id)
        .order('last_modified_at', { ascending: false })

      if (campError) {
        setError(campError.message)
        setCampaigns([])
        setAnalytics([])
        setLoading(false)
        return
      }

      const allCampaigns = campData || []
      setCampaigns(allCampaigns)

      if (allCampaigns.length === 0) {
        setAnalytics([])
        setLoading(false)
        return
      }

      const campaignIds = allCampaigns.map(c => c.id)
      const { data: analyticsData, error: analyticsError } = await supabase
        .from('linkedin_ad_analytics')
        .select('campaign_id, date_start, impressions, clicks, cost_in_local_currency, one_click_leads, external_website_conversions, total_engagements, approximate_member_reach')
        .in('campaign_id', campaignIds)

      if (analyticsError) {
        setError(analyticsError.message)
        setAnalytics([])
      } else {
        setAnalytics(analyticsData || [])
      }

      setLoading(false)
    }

    load()
  }, [id])

  const getDateRange = (filter) => {
    const now = new Date()
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1)
    const startOfYear = new Date(now.getFullYear(), 0, 1)
    const quarterStartMonth = Math.floor(now.getMonth() / 3) * 3
    const startOfQuarter = new Date(now.getFullYear(), quarterStartMonth, 1)

    if (filter === 'all') return [null, null]
    if (filter === 'this_month') return [startOfMonth, today]
    if (filter === 'year_to_date') return [startOfYear, today]
    if (filter === 'quarter_to_date') return [startOfQuarter, today]

    if (filter === 'last_month') {
      const start = new Date(now.getFullYear(), now.getMonth() - 1, 1)
      const end = new Date(now.getFullYear(), now.getMonth(), 0)
      return [start, end]
    }

    if (filter === 'last_quarter') {
      const start = new Date(now.getFullYear(), quarterStartMonth - 3, 1)
      const end = new Date(now.getFullYear(), quarterStartMonth, 0)
      return [start, end]
    }

    if (filter === 'last_12_months') {
      const start = new Date(now.getFullYear(), now.getMonth() - 12, now.getDate())
      return [start, today]
    }

    return [null, null]
  }

  const filteredAnalytics = useMemo(() => {
    const [start, end] = getDateRange(dateFilter)
    if (!start || !end) return analytics

    return analytics.filter(row => {
      if (!row.date_start) return false
      const d = new Date(row.date_start)
      return d >= start && d <= end
    })
  }, [analytics, dateFilter])

  const totals = useMemo(() => {
    return filteredAnalytics.reduce((acc, row) => {
      acc.impressions += row.impressions || 0
      acc.clicks += row.clicks || 0
      acc.cost += parseFloat(row.cost_in_local_currency || 0)
      acc.leads += row.one_click_leads || 0
      acc.conversions += row.external_website_conversions || 0
      acc.engagements += row.total_engagements || 0
      acc.reach += row.approximate_member_reach || 0
      return acc
    }, { impressions: 0, clicks: 0, cost: 0, leads: 0, conversions: 0, engagements: 0, reach: 0 })
  }, [filteredAnalytics])

  const activeCampaigns = useMemo(() => {
    const perCampaign = {}
    for (const row of filteredAnalytics) {
      if (!perCampaign[row.campaign_id]) {
        perCampaign[row.campaign_id] = { impressions: 0, clicks: 0, cost: 0, leads: 0 }
      }
      perCampaign[row.campaign_id].impressions += row.impressions || 0
      perCampaign[row.campaign_id].clicks += row.clicks || 0
      perCampaign[row.campaign_id].cost += parseFloat(row.cost_in_local_currency || 0)
      perCampaign[row.campaign_id].leads += row.one_click_leads || 0
    }

    return campaigns
      .filter(c => (c.status || '').toUpperCase() === 'ACTIVE')
      .map(c => ({
        id: c.id,
        name: c.name,
        status: c.status,
        ...perCampaign[c.id],
      }))
      .sort((a, b) => (b.impressions || 0) - (a.impressions || 0))
  }, [filteredAnalytics, campaigns])

  if (loading) return <div className="loading">Laden...</div>

  if (error) {
    return (
      <div>
        <button className="back-btn" onClick={() => navigate('/')}>← Terug</button>
        <div className="form-msg form-error">{error}</div>
      </div>
    )
  }

  return (
    <div>
      <button className="back-btn" onClick={() => navigate('/')}>← Terug naar accounts</button>

      <div className="detail-hero">
        <div className="detail-account-name">{account?.name}</div>
        <h1 className="detail-title">Account Dashboard</h1>
        <div className="detail-meta">
          <span className="meta-tag">{account?.type || 'Onbekend type'}</span>
          <span className="meta-tag">{account?.currency || '—'}</span>
          <span className="badge" style={{ background: (STATUS_COLORS[account?.serving_statuses?.[0]] || '#9ca3af') + '30', color: STATUS_COLORS[account?.serving_statuses?.[0]] || '#9ca3af', border: `1px solid ${STATUS_COLORS[account?.serving_statuses?.[0]] || '#9ca3af'}` }}>
            {account?.serving_statuses?.[0] || account?.status || 'Unknown'}
          </span>
        </div>
      </div>

      <div className="date-filters">
        {[
          ['this_month', 'Deze maand'],
          ['last_month', 'Vorige maand'],
          ['quarter_to_date', 'Dit kwartaal'],
          ['last_quarter', 'Vorig kwartaal'],
          ['year_to_date', 'Dit jaar'],
          ['last_12_months', 'Afgelopen 12 maanden'],
          ['all', 'Alles'],
        ].map(([key, label]) => (
          <button key={key} className={`filter-btn ${dateFilter === key ? 'active' : ''}`} onClick={() => setDateFilter(key)}>
            {label}
          </button>
        ))}
      </div>

      <div className="kpi-grid">
        <div className="kpi-card"><div className="kpi-label">Campagnes</div><div className="kpi-value">{fmt(campaigns.length)}</div></div>
        <div className="kpi-card"><div className="kpi-label">Impressions</div><div className="kpi-value">{fmt(totals.impressions)}</div></div>
        <div className="kpi-card"><div className="kpi-label">Reach</div><div className="kpi-value">{fmt(totals.reach)}</div></div>
        <div className="kpi-card"><div className="kpi-label">Clicks</div><div className="kpi-value">{fmt(totals.clicks)}</div></div>
        <div className="kpi-card"><div className="kpi-label">CTR</div><div className="kpi-value">{pct(totals.clicks, totals.impressions)}</div></div>
        <div className="kpi-card"><div className="kpi-label">Spent</div><div className="kpi-value">{eur(totals.cost)}</div></div>
        <div className="kpi-card"><div className="kpi-label">CPC</div><div className="kpi-value">{totals.clicks > 0 ? eur(totals.cost / totals.clicks) : '€0,00'}</div></div>
        <div className="kpi-card"><div className="kpi-label">Leads</div><div className="kpi-value">{fmt(totals.leads)}</div></div>
        <div className="kpi-card"><div className="kpi-label">Conversions</div><div className="kpi-value">{fmt(totals.conversions)}</div></div>
      </div>

      <h2 className="section-title">Actieve campagnes</h2>
      <div className="table-wrapper">
        <table className="data-table">
          <thead>
            <tr>
              <th>Naam</th>
              <th>Status</th>
              <th>Impressions</th>
              <th>Clicks</th>
              <th>CTR</th>
              <th>Spent</th>
              <th>Leads</th>
            </tr>
          </thead>
          <tbody>
            {activeCampaigns.map(c => (
              <tr key={c.id} onClick={() => navigate(`/campaigns/${c.id}`)} style={{ cursor: 'pointer' }}>
                <td className="name-cell">{c.name}</td>
                <td><span className="badge">{c.status || '—'}</span></td>
                <td>{fmt(c.impressions)}</td>
                <td>{fmt(c.clicks)}</td>
                <td>{pct(c.clicks, c.impressions)}</td>
                <td>{eur(c.cost)}</td>
                <td>{fmt(c.leads)}</td>
              </tr>
            ))}
            {activeCampaigns.length === 0 && (
              <tr>
                <td colSpan={7}>Geen actieve campagnes in deze periode.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
