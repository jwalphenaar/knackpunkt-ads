import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'

const fmt = (n) => Number(n || 0).toLocaleString('nl-NL')
const eur = (n) => `€${Number(n || 0).toLocaleString('nl-NL', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
const pct = (a, b) => (a && b && b > 0) ? `${((a / b) * 100).toFixed(2)}%` : '0%'

function getTodayLocalDateString() {
  const now = new Date()
  const y = now.getFullYear()
  const m = String(now.getMonth() + 1).padStart(2, '0')
  const d = String(now.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

export default function Monitoring() {
  const navigate = useNavigate()
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [rows, setRows] = useState([])
  const [todayStr, setTodayStr] = useState(getTodayLocalDateString())

  const load = async () => {
    setLoading(true)
    setError('')
    try {
      const currentDate = getTodayLocalDateString()
      setTodayStr(currentDate)

      const { data: analyticsRows, error: analyticsError } = await supabase
        .from('linkedin_ad_analytics')
        .select('campaign_id, account_id, date_start, impressions, clicks, cost_in_local_currency, one_click_leads, one_click_lead_form_opens, landing_page_clicks, video_views')
        .eq('date_start', currentDate)
        .gt('impressions', 0)

      if (analyticsError) throw analyticsError

      const groupedByCampaign = new Map()
      for (const row of (analyticsRows || [])) {
        const campaignId = String(row.campaign_id || '')
        if (!campaignId) continue
        const existing = groupedByCampaign.get(campaignId)
        if (!existing) {
          groupedByCampaign.set(campaignId, {
            campaign_id: row.campaign_id,
            account_id: row.account_id,
            impressions: Number(row.impressions || 0),
            clicks: Number(row.clicks || 0),
            spend: Number(row.cost_in_local_currency || 0),
            leads: Number(row.one_click_leads || 0),
            lead_form_opens: Number(row.one_click_lead_form_opens || 0),
            landing_page_clicks: Number(row.landing_page_clicks || 0),
            video_views: Number(row.video_views || 0),
          })
          continue
        }
        existing.impressions += Number(row.impressions || 0)
        existing.clicks += Number(row.clicks || 0)
        existing.spend += Number(row.cost_in_local_currency || 0)
        existing.leads += Number(row.one_click_leads || 0)
        existing.lead_form_opens += Number(row.one_click_lead_form_opens || 0)
        existing.landing_page_clicks += Number(row.landing_page_clicks || 0)
        existing.video_views += Number(row.video_views || 0)
      }

      const campaignIds = [...groupedByCampaign.keys()]
      const accountIds = [...new Set([...groupedByCampaign.values()].map(r => String(r.account_id)).filter(Boolean))]

      const campaignMap = {}
      for (let i = 0; i < campaignIds.length; i += 500) {
        const chunk = campaignIds.slice(i, i + 500).map(Number)
        if (!chunk.length) continue
        const { data, error: campaignsError } = await supabase
          .from('linkedin_ad_campaigns')
          .select('id, name, status')
          .in('id', chunk)
        if (campaignsError) throw campaignsError
        for (const c of (data || [])) campaignMap[String(c.id)] = c
      }

      const accountMap = {}
      for (let i = 0; i < accountIds.length; i += 500) {
        const chunk = accountIds.slice(i, i + 500).map(Number)
        if (!chunk.length) continue
        const { data, error: accountsError } = await supabase
          .from('linkedin_ad_accounts')
          .select('id, name')
          .in('id', chunk)
        if (accountsError) throw accountsError
        for (const a of (data || [])) accountMap[String(a.id)] = a
      }

      const resultRows = [...groupedByCampaign.values()]
        .map((r) => {
          const campaign = campaignMap[String(r.campaign_id)] || {}
          const account = accountMap[String(r.account_id)] || {}
          return {
            ...r,
            campaign_name: campaign.name || `Campaign ${r.campaign_id}`,
            campaign_status: campaign.status || '—',
            account_name: account.name || `Account ${r.account_id}`,
            ctr: r.impressions > 0 ? (r.clicks / r.impressions) * 100 : 0,
            cpc: r.clicks > 0 ? r.spend / r.clicks : 0,
            cpm: r.impressions > 0 ? (r.spend / r.impressions) * 1000 : 0,
          }
        })
        .sort((a, b) => b.spend - a.spend)

      setRows(resultRows)
    } catch (e) {
      setError(e.message || 'Monitoring laden mislukt.')
      setRows([])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [])

  const totals = useMemo(() => {
    return rows.reduce((acc, row) => {
      acc.impressions += row.impressions || 0
      acc.clicks += row.clicks || 0
      acc.spend += row.spend || 0
      acc.leads += row.leads || 0
      acc.leadFormOpens += row.lead_form_opens || 0
      acc.landingPageClicks += row.landing_page_clicks || 0
      acc.videoViews += row.video_views || 0
      return acc
    }, {
      impressions: 0,
      clicks: 0,
      spend: 0,
      leads: 0,
      leadFormOpens: 0,
      landingPageClicks: 0,
      videoViews: 0,
    })
  }, [rows])

  const accountsWithDelivery = useMemo(
    () => new Set(rows.map(r => String(r.account_id))).size,
    [rows]
  )

  if (loading) return <div className="loading">Monitoring laden...</div>

  return (
    <div className="zenith-page">
      <div className="zenith-shell">
        <div className="zenith-topbar">
          <div className="zenith-account">Monitoring · Vandaag ({todayStr})</div>
          <div className="zenith-controls">
            <button className="add-btn" onClick={load}>Ververs nu</button>
          </div>
        </div>

        {error && <div className="form-msg form-error">{error}</div>}

        <div className="zenith-header">
          <div className="zenith-eyebrow">Knackpunkt Pulse</div>
          <h1 className="zenith-title">Live Delivery Monitor</h1>
        </div>

        <div className="zenith-kpi-grid" style={{ marginBottom: 22 }}>
          <div className="zenith-card"><div className="zenith-label">Actieve Campagnes (vandaag)</div><div className="zenith-value zenith-value-compact">{fmt(rows.length)}</div></div>
          <div className="zenith-card"><div className="zenith-label">Accounts met delivery</div><div className="zenith-value zenith-value-compact">{fmt(accountsWithDelivery)}</div></div>
          <div className="zenith-card"><div className="zenith-label">Impressions</div><div className="zenith-value zenith-value-compact">{fmt(totals.impressions)}</div></div>
          <div className="zenith-card"><div className="zenith-label">Clicks</div><div className="zenith-value zenith-value-compact">{fmt(totals.clicks)}</div></div>
          <div className="zenith-card"><div className="zenith-label">Spend</div><div className="zenith-value zenith-value-compact zenith-accent">{eur(totals.spend)}</div></div>
          <div className="zenith-card"><div className="zenith-label">CTR</div><div className="zenith-value zenith-value-compact">{pct(totals.clicks, totals.impressions)}</div></div>
          <div className="zenith-card"><div className="zenith-label">Leads</div><div className="zenith-value zenith-value-compact">{fmt(totals.leads)}</div></div>
          <div className="zenith-card"><div className="zenith-label">Lead Form Opens</div><div className="zenith-value zenith-value-compact">{fmt(totals.leadFormOpens)}</div></div>
          <div className="zenith-card"><div className="zenith-label">Landing Page Clicks</div><div className="zenith-value zenith-value-compact">{fmt(totals.landingPageClicks)}</div></div>
          <div className="zenith-card"><div className="zenith-label">Video Views</div><div className="zenith-value zenith-value-compact">{fmt(totals.videoViews)}</div></div>
        </div>

        <div className="table-wrapper">
          <table className="data-table">
            <thead>
              <tr>
                <th>Account</th>
                <th>Campagne</th>
                <th>Status</th>
                <th>Impressions</th>
                <th>Clicks</th>
                <th>CTR</th>
                <th>Spend</th>
                <th>CPC</th>
                <th>CPM</th>
                <th>Leads</th>
                <th>Leadform Opens</th>
                <th>LP Clicks</th>
                <th>Video Views</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.campaign_id} style={{ cursor: 'pointer' }} onClick={() => navigate(`/campaigns/${row.campaign_id}`)}>
                  <td>{row.account_name}</td>
                  <td className="name-cell">{row.campaign_name}</td>
                  <td>{row.campaign_status}</td>
                  <td>{fmt(row.impressions)}</td>
                  <td>{fmt(row.clicks)}</td>
                  <td>{row.ctr.toFixed(2)}%</td>
                  <td>{eur(row.spend)}</td>
                  <td>{eur(row.cpc)}</td>
                  <td>{eur(row.cpm)}</td>
                  <td>{fmt(row.leads)}</td>
                  <td>{fmt(row.lead_form_opens)}</td>
                  <td>{fmt(row.landing_page_clicks)}</td>
                  <td>{fmt(row.video_views)}</td>
                </tr>
              ))}
              {rows.length === 0 && (
                <tr>
                  <td colSpan={13} style={{ textAlign: 'center', opacity: 0.8 }}>
                    Geen campagnes met impressions &gt; 0 voor vandaag.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
