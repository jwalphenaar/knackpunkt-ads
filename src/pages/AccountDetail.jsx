import { useCallback, useEffect, useMemo, useState } from 'react'
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
const API = import.meta.env.VITE_API_URL

export default function AccountDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [loading, setLoading] = useState(true)
  const [account, setAccount] = useState(null)
  const [campaigns, setCampaigns] = useState([])
  const [analytics, setAnalytics] = useState([])
  const [error, setError] = useState('')
  const [dateFilter, setDateFilter] = useState('this_month')
  const [syncJob, setSyncJob] = useState(null)
  const [syncBusy, setSyncBusy] = useState(false)
  const [syncMsg, setSyncMsg] = useState('')

  const periodOptions = [
    ['this_month', 'Deze maand'],
    ['last_month', 'Vorige maand'],
    ['quarter_to_date', 'Dit kwartaal'],
    ['last_quarter', 'Vorig kwartaal'],
    ['year_to_date', 'Dit jaar'],
    ['last_12_months', 'Afgelopen 12 maanden'],
    ['all', 'Alles'],
  ]

  const loadData = useCallback(async () => {
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
      .select('campaign_id, date_start, impressions, clicks, cost_in_local_currency, one_click_leads, one_click_lead_form_opens, video_views, landing_page_clicks, external_website_conversions, total_engagements, approximate_member_reach')
      .in('campaign_id', campaignIds)

    if (analyticsError) {
      setError(analyticsError.message)
      setAnalytics([])
    } else {
      setAnalytics(analyticsData || [])
    }

    setLoading(false)
  }, [id])

  useEffect(() => {
    loadData()
  }, [loadData])

  useEffect(() => {
    if (!syncJob?.id) return
    let timer = null
    let cancelled = false

    const poll = async () => {
      try {
        const res = await fetch(`${API}/api/linkedin-ads/sync/live/status/${syncJob.id}`)
        const data = await res.json()
        if (cancelled) return
        setSyncJob(data)
        if (data.status === 'done' || data.status === 'done_with_errors' || data.status === 'failed') {
          setSyncBusy(false)
          if (data.status === 'done') setSyncMsg('Live sync voltooid.')
          if (data.status === 'done_with_errors') setSyncMsg('Live sync klaar met fouten.')
          if (data.status === 'failed') setSyncMsg(data.error || 'Live sync mislukt.')
          await loadData()
          return
        }
      } catch (e) {
        if (!cancelled) {
          setSyncBusy(false)
          setSyncMsg(e.message || 'Sync status ophalen mislukt.')
        }
        return
      }
      if (!cancelled) timer = setTimeout(poll, 2000)
    }

    poll()
    return () => {
      cancelled = true
      if (timer) clearTimeout(timer)
    }
  }, [syncJob?.id, loadData])

  const startLiveSync = async () => {
    setSyncMsg('')
    setSyncBusy(true)
    try {
      const res = await fetch(`${API}/api/linkedin-ads/sync/live/account/${id}`, { method: 'POST' })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Live sync starten mislukt.')
      setSyncJob({ id: data.job_id, status: data.status })
      setSyncMsg('Live sync gestart...')
    } catch (e) {
      setSyncBusy(false)
      setSyncMsg(e.message || 'Live sync starten mislukt.')
    }
  }

  const getDateRange = (filter) => {
    const now = new Date()
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate())
    const todayEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999)
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1)
    const startOfYear = new Date(now.getFullYear(), 0, 1)
    const quarterStartMonth = Math.floor(now.getMonth() / 3) * 3
    const startOfQuarter = new Date(now.getFullYear(), quarterStartMonth, 1)

    if (filter === 'all') return [null, null]
    if (filter === 'this_month') return [startOfMonth, todayEnd]
    if (filter === 'year_to_date') return [startOfYear, todayEnd]
    if (filter === 'quarter_to_date') return [startOfQuarter, todayEnd]

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
      const start = new Date(now.getFullYear(), now.getMonth() - 12, now.getDate(), 0, 0, 0, 0)
      return [start, todayEnd]
    }

    return [null, null]
  }

  const filteredAnalytics = useMemo(() => {
    const [start, end] = getDateRange(dateFilter)
    if (!start || !end) return analytics

    return analytics.filter(row => {
      if (!row.date_start) return false
      const normalized = String(row.date_start).includes('T')
        ? new Date(row.date_start)
        : new Date(`${row.date_start}T12:00:00`)
      const d = normalized
      return d >= start && d <= end
    })
  }, [analytics, dateFilter])

  const totals = useMemo(() => {
    return filteredAnalytics.reduce((acc, row) => {
      acc.impressions += row.impressions || 0
      acc.clicks += row.clicks || 0
      acc.cost += parseFloat(row.cost_in_local_currency || 0)
      acc.leads += row.one_click_leads || 0
      acc.leadFormOpens += row.one_click_lead_form_opens || 0
      acc.videoViews += row.video_views || 0
      acc.landingPageClicks += row.landing_page_clicks || 0
      acc.conversions += row.external_website_conversions || 0
      acc.engagements += row.total_engagements || 0
      acc.reach += row.approximate_member_reach || 0
      return acc
    }, { impressions: 0, clicks: 0, cost: 0, leads: 0, leadFormOpens: 0, videoViews: 0, landingPageClicks: 0, conversions: 0, engagements: 0, reach: 0 })
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
      .map(c => ({
        id: c.id,
        name: c.name,
        status: c.status,
        ...perCampaign[c.id],
      }))
      .filter(c => (c.impressions || 0) > 0 || (c.clicks || 0) > 0 || (c.cost || 0) > 0 || (c.leads || 0) > 0)
      .sort((a, b) => (b.impressions || 0) - (a.impressions || 0))
  }, [filteredAnalytics, campaigns])

  const registryRows = useMemo(() => {
    return activeCampaigns.slice(0, 12).map(c => ({
      ...c,
      code: `CN-${String(c.id).slice(-4).toUpperCase()}`,
    }))
  }, [activeCampaigns])

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
    <div className="zenith-page">
      <button className="back-btn zenith-back" onClick={() => navigate('/')}>← Terug</button>

      <div className="zenith-shell">
        <div className="zenith-topbar">
          <div className="zenith-account">{account?.name}</div>
          <div className="zenith-controls">
            <select value={dateFilter} onChange={e => setDateFilter(e.target.value)} className="zenith-period-select">
              {periodOptions.map(([key, label]) => <option key={key} value={key}>{label}</option>)}
            </select>
            <button className="add-btn" onClick={startLiveSync} disabled={syncBusy}>
              {syncBusy ? 'Live sync bezig...' : 'Live sync account'}
            </button>
          </div>
        </div>
        {syncMsg && <div className={syncJob?.status === 'failed' ? 'form-msg form-error' : 'form-msg'}>{syncMsg}</div>}
        {syncJob?.progress && (
          <div className="form-msg" style={{ marginTop: -6 }}>
            Stage: {syncJob.stage}
            {' · '}Paginas: {syncJob.progress.campaign_pages_loaded || 0}
            {' · '}Campagnes ingeladen: {syncJob.progress.campaigns_synced || 0}
            {' · '}Campagnes verwerkt: {syncJob.progress.campaigns_done || 0}/{syncJob.progress.campaigns_total || 0}
            {' · '}Analytics rows: {syncJob.progress.analytics_rows_synced || 0}
            {' · '}Demo rows: {syncJob.progress.demographics_rows_synced || 0}
          </div>
        )}

        <div className="zenith-header">
          <div className="zenith-eyebrow">Knackpunkt Ads</div>
          <h1 className="zenith-title">Performance Overview</h1>
        </div>

        <div className="zenith-kpi-grid">
          <div className="zenith-card zenith-card-spend">
            <div className="zenith-label">Total Ad Spend</div>
            <div className="zenith-value zenith-accent">{eur(totals.cost)}</div>
            <div className="zenith-progress"><span style={{ width: `${Math.min(100, Math.round((totals.cost / 75000) * 100))}%` }} /></div>
            <div className="zenith-subtle">{Math.min(100, Math.round((totals.cost / 75000) * 100))}% van budgetindicatie</div>
          </div>
          <div className="zenith-card"><div className="zenith-label">Impressions</div><div className="zenith-value zenith-value-compact">{fmt(totals.impressions)}</div></div>
          <div className="zenith-card"><div className="zenith-label">Clicks</div><div className="zenith-value zenith-value-compact">{fmt(totals.clicks)}</div></div>
          <div className="zenith-card"><div className="zenith-label">CTR</div><div className="zenith-value zenith-value-compact zenith-accent">{pct(totals.clicks, totals.impressions)}</div></div>
          <div className="zenith-card"><div className="zenith-label">Leads</div><div className="zenith-value zenith-value-compact">{fmt(totals.leads)}</div></div>
          <div className="zenith-card"><div className="zenith-label">Lead Form Opens</div><div className="zenith-value zenith-value-compact">{fmt(totals.leadFormOpens)}</div></div>
          <div className="zenith-card"><div className="zenith-label">Video Views</div><div className="zenith-value zenith-value-compact">{fmt(totals.videoViews)}</div></div>
          <div className="zenith-card"><div className="zenith-label">Landing Page Clicks</div><div className="zenith-value zenith-value-compact">{fmt(totals.landingPageClicks)}</div></div>
          <div className="zenith-card"><div className="zenith-label">Average CPC</div><div className="zenith-value zenith-value-compact">{totals.clicks > 0 ? eur(totals.cost / totals.clicks) : '€0,00'}</div></div>
          <div className="zenith-card"><div className="zenith-label">Average CPM</div><div className="zenith-value zenith-value-compact">{totals.impressions > 0 ? eur((totals.cost / totals.impressions) * 1000) : '€0,00'}</div></div>
          <div className="zenith-card"><div className="zenith-label">Actieve Campagnes</div><div className="zenith-value zenith-value-compact">{fmt(activeCampaigns.length)}</div></div>
        </div>

        <div className="zenith-table-wrap">
          <div className="zenith-table-title">Campaign Registry</div>
          <table className="zenith-table">
            <thead>
              <tr>
                <th>Campaign Identity</th>
                <th>Status</th>
                <th>Impressions</th>
                <th>CTR</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {registryRows.map(c => (
                <tr key={c.id}>
                  <td>
                    <div className="zenith-campaign-name">{c.name}</div>
                    <div className="zenith-campaign-id">ID: {c.code}</div>
                  </td>
                  <td><span className="zenith-status-pill">{c.status || 'ACTIVE'}</span></td>
                  <td>{fmt(c.impressions)}</td>
                  <td>{pct(c.clicks, c.impressions)}</td>
                  <td>
                    <button className="zenith-action-btn" onClick={() => navigate(`/campaigns/${c.id}`)} aria-label="Open campagne">↗</button>
                  </td>
                </tr>
              ))}
              {registryRows.length === 0 && (
                <tr>
                  <td colSpan={5}>Geen actieve campagnes in deze periode.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
