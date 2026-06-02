import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'

const fmt = (n) => n ? Number(n).toLocaleString('nl-NL') : '0'
const eur = (n) => n ? `€${Number(n).toLocaleString('nl-NL', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : '€0,00'
const pct = (a, b) => (a && b && b > 0) ? `${((a / b) * 100).toFixed(2)}%` : '0%'
const metricValueClass = (value) => {
  const length = String(value || '').replace(/\s/g, '').length
  if (length >= 10) return 'zenith-value-extra-tight'
  if (length >= 8) return 'zenith-value-tight'
  return ''
}

const periodOptions = [
  ['this_month', 'Deze maand'],
  ['last_month', 'Vorige maand'],
  ['quarter_to_date', 'Dit kwartaal'],
  ['last_quarter', 'Vorig kwartaal'],
  ['year_to_date', 'Dit jaar'],
  ['last_12_months', 'Afgelopen 12 maanden'],
  ['all', 'Alles'],
]

function getDateRange(filter) {
  const now = new Date()
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
    const end = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59, 999)
    return [start, end]
  }

  if (filter === 'last_quarter') {
    const start = new Date(now.getFullYear(), quarterStartMonth - 3, 1)
    const end = new Date(now.getFullYear(), quarterStartMonth, 0, 23, 59, 59, 999)
    return [start, end]
  }

  if (filter === 'last_12_months') {
    const start = new Date(now.getFullYear(), now.getMonth() - 12, now.getDate(), 0, 0, 0, 0)
    return [start, todayEnd]
  }

  return [null, null]
}

export default function Totals() {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [dateFilter, setDateFilter] = useState('this_month')
  const [accounts, setAccounts] = useState([])
  const [campaigns, setCampaigns] = useState([])
  const [analytics, setAnalytics] = useState([])

  useEffect(() => {
    const load = async () => {
      setLoading(true)
      setError('')
      try {
        const [accountsRes, campaignsRes] = await Promise.all([
          supabase.from('linkedin_ad_accounts').select('id, name, serving_statuses'),
          supabase.from('linkedin_ad_campaigns').select('id, account_id, status, name'),
        ])

        if (accountsRes.error) throw accountsRes.error
        if (campaignsRes.error) throw campaignsRes.error

        setAccounts(accountsRes.data || [])
        setCampaigns(campaignsRes.data || [])

        const [start, end] = getDateRange(dateFilter)
        const pageSize = 5000
        let from = 0
        let rows = []

        while (true) {
          let query = supabase
            .from('linkedin_ad_analytics')
            .select('account_id, campaign_id, date_start, impressions, clicks, cost_in_local_currency, one_click_leads, one_click_lead_form_opens, video_views, video_completions, landing_page_clicks')
            .order('date_start', { ascending: false })
            .range(from, from + pageSize - 1)

          if (start && end) {
            const fromDate = start.toISOString().slice(0, 10)
            const toDate = end.toISOString().slice(0, 10)
            query = query.gte('date_start', fromDate).lte('date_start', toDate)
          }

          const { data, error: analyticsError } = await query
          if (analyticsError) throw analyticsError

          const chunk = data || []
          rows = rows.concat(chunk)

          if (chunk.length < pageSize) break
          from += pageSize
        }

        setAnalytics(rows)
      } catch (e) {
        setError(e.message || 'Laden mislukt.')
        setAnalytics([])
      } finally {
        setLoading(false)
      }
    }

    load()
  }, [dateFilter])

  const totals = useMemo(() => {
    return analytics.reduce((acc, row) => {
      acc.impressions += row.impressions || 0
      acc.clicks += row.clicks || 0
      acc.cost += Number(row.cost_in_local_currency || 0)
      acc.leads += row.one_click_leads || 0
      acc.leadFormOpens += row.one_click_lead_form_opens || 0
      acc.videoViews += row.video_views || 0
      acc.videoCompletions += row.video_completions || 0
      acc.landingPageClicks += row.landing_page_clicks || 0
      return acc
    }, {
      impressions: 0,
      clicks: 0,
      cost: 0,
      leads: 0,
      leadFormOpens: 0,
      videoViews: 0,
      videoCompletions: 0,
      landingPageClicks: 0,
    })
  }, [analytics])

  const activeCampaignCount = useMemo(
    () => campaigns.filter(c => c.status === 'ACTIVE' || c.status === 'RUNNABLE' || c.status === 'PAUSED').length,
    [campaigns]
  )

  const accountRows = useMemo(() => {
    const accountMap = new Map((accounts || []).map(a => [String(a.id), a]))
    const campaignCountByAccount = campaigns.reduce((acc, c) => {
      const key = String(c.account_id)
      acc[key] = (acc[key] || 0) + 1
      return acc
    }, {})

    const statByAccount = analytics.reduce((acc, row) => {
      const key = String(row.account_id)
      if (!acc[key]) {
        acc[key] = { spend: 0, impressions: 0, clicks: 0, leads: 0, videoViews: 0, landingPageClicks: 0 }
      }
      acc[key].spend += Number(row.cost_in_local_currency || 0)
      acc[key].impressions += row.impressions || 0
      acc[key].clicks += row.clicks || 0
      acc[key].leads += row.one_click_leads || 0
      acc[key].videoViews += row.video_views || 0
      acc[key].landingPageClicks += row.landing_page_clicks || 0
      return acc
    }, {})

    return Object.keys(statByAccount)
      .map((accountId) => ({
        accountId,
        accountName: accountMap.get(accountId)?.name || `Account ${accountId}`,
        campaigns: campaignCountByAccount[accountId] || 0,
        ...statByAccount[accountId],
      }))
      .sort((a, b) => b.spend - a.spend)
  }, [accounts, campaigns, analytics])

  const estimatedVideoHours = useMemo(
    () => totals.videoViews > 0 ? (totals.videoViews * 30) / 3600 : 0,
    [totals.videoViews]
  )

  const spendValue = eur(totals.cost)
  const impressionsValue = fmt(totals.impressions)
  const clicksValue = fmt(totals.clicks)
  const ctrValue = pct(totals.clicks, totals.impressions)
  const leadsValue = fmt(totals.leads)
  const leadFormOpensValue = fmt(totals.leadFormOpens)
  const videoViewsValue = fmt(totals.videoViews)
  const landingPageClicksValue = fmt(totals.landingPageClicks)
  const activeCampaignsValue = fmt(activeCampaignCount)
  const averageCpcValue = totals.clicks > 0 ? eur(totals.cost / totals.clicks) : '€0,00'
  const averageCpmValue = totals.impressions > 0 ? eur((totals.cost / totals.impressions) * 1000) : '€0,00'
  const estimatedVideoHoursValue = estimatedVideoHours.toFixed(1)

  if (loading) return <div className="loading">Totalen laden...</div>

  return (
    <div className="zenith-page">
      <div className="zenith-shell">
        <div className="zenith-topbar">
          <div className="zenith-account">Alle Accounts · Totalen</div>
          <div className="zenith-controls">
            <select value={dateFilter} onChange={e => setDateFilter(e.target.value)} className="zenith-period-select">
              {periodOptions.map(([key, label]) => <option key={key} value={key}>{label}</option>)}
            </select>
          </div>
        </div>

        {error && <div className="form-msg form-error">{error}</div>}

        <div className="zenith-header">
          <div className="zenith-eyebrow">Knackpunkt Pulse</div>
          <h1 className="zenith-title">Global Performance Totals</h1>
        </div>

        <div className="zenith-kpi-grid">
          <div className="zenith-card zenith-card-spend">
            <div className="zenith-label">Total Ad Spend</div>
            <div className={`zenith-value zenith-accent ${metricValueClass(spendValue)}`}>{spendValue}</div>
            <div className="zenith-progress"><span style={{ width: `${Math.min(100, Math.round((totals.cost / 250000) * 100))}%` }} /></div>
            <div className="zenith-subtle">{fmt(accounts.length)} accounts · {fmt(campaigns.length)} campagnes</div>
          </div>
          <div className="zenith-card"><div className="zenith-label">Impressions</div><div className={`zenith-value zenith-value-compact ${metricValueClass(impressionsValue)}`}>{impressionsValue}</div></div>
          <div className="zenith-card"><div className="zenith-label">Clicks</div><div className={`zenith-value zenith-value-compact ${metricValueClass(clicksValue)}`}>{clicksValue}</div></div>
          <div className="zenith-card"><div className="zenith-label">CTR</div><div className={`zenith-value zenith-value-compact zenith-accent ${metricValueClass(ctrValue)}`}>{ctrValue}</div></div>
          <div className="zenith-card"><div className="zenith-label">Leads</div><div className={`zenith-value zenith-value-compact ${metricValueClass(leadsValue)}`}>{leadsValue}</div></div>
          <div className="zenith-card"><div className="zenith-label">Lead Form Opens</div><div className={`zenith-value zenith-value-compact ${metricValueClass(leadFormOpensValue)}`}>{leadFormOpensValue}</div></div>
          <div className="zenith-card"><div className="zenith-label">Video Views</div><div className={`zenith-value zenith-value-compact ${metricValueClass(videoViewsValue)}`}>{videoViewsValue}</div></div>
          <div className="zenith-card"><div className="zenith-label">Landing Page Clicks</div><div className={`zenith-value zenith-value-compact ${metricValueClass(landingPageClicksValue)}`}>{landingPageClicksValue}</div></div>
          <div className="zenith-card"><div className="zenith-label">Actieve Campagnes</div><div className={`zenith-value zenith-value-compact ${metricValueClass(activeCampaignsValue)}`}>{activeCampaignsValue}</div></div>
          <div className="zenith-card"><div className="zenith-label">Gem. CPC</div><div className={`zenith-value zenith-value-compact ${metricValueClass(averageCpcValue)}`}>{averageCpcValue}</div></div>
          <div className="zenith-card"><div className="zenith-label">Gem. CPM</div><div className={`zenith-value zenith-value-compact ${metricValueClass(averageCpmValue)}`}>{averageCpmValue}</div></div>
          <div className="zenith-card"><div className="zenith-label">Video Uren (schatting)</div><div className={`zenith-value zenith-value-compact ${metricValueClass(estimatedVideoHoursValue)}`}>{estimatedVideoHoursValue}</div></div>
        </div>

        <div className="zenith-table-wrap">
          <div className="zenith-table-title">Top Accounts (op spend)</div>
          <table className="zenith-table">
            <thead>
              <tr>
                <th>Account</th>
                <th>Campagnes</th>
                <th>Spend</th>
                <th>Impressions</th>
                <th>Clicks</th>
                <th>CTR</th>
                <th>Leads</th>
              </tr>
            </thead>
            <tbody>
              {accountRows.map((row) => (
                <tr key={row.accountId}>
                  <td>{row.accountName}</td>
                  <td>{fmt(row.campaigns)}</td>
                  <td>{eur(row.spend)}</td>
                  <td>{fmt(row.impressions)}</td>
                  <td>{fmt(row.clicks)}</td>
                  <td>{pct(row.clicks, row.impressions)}</td>
                  <td>{fmt(row.leads)}</td>
                </tr>
              ))}
              {accountRows.length === 0 && (
                <tr>
                  <td colSpan={7}>Geen data beschikbaar voor deze periode.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
