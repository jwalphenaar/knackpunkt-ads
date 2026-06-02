import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { buildAlerts, summarizeAlerts } from '../lib/alerts'

const API = import.meta.env.VITE_API_URL
const ALERT_LOOKBACK_DAYS = 21

const fmt = (n) => Number(n || 0).toLocaleString('nl-NL')

function getLookbackStartDate(days) {
  const date = new Date()
  date.setDate(date.getDate() - days)
  return date.toISOString().slice(0, 10)
}

async function fetchVisibleAccounts() {
  const res = await fetch(`${API}/api/linkedin-ads/db/accounts-overview?hidden=false`)
  const data = await res.json()
  if (!res.ok) throw new Error(data.error || 'Accounts laden mislukt.')
  return data.accounts || []
}

export default function Alerts() {
  const navigate = useNavigate()
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [severityFilter, setSeverityFilter] = useState('all')
  const [alerts, setAlerts] = useState([])

  useEffect(() => {
    const load = async () => {
      setLoading(true)
      setError('')
      try {
        const accounts = await fetchVisibleAccounts()
        const visibleAccountIds = accounts.map((account) => Number(account.id)).filter(Boolean)

        if (!visibleAccountIds.length) {
          setAlerts([])
          setLoading(false)
          return
        }

        let campaigns = []
        for (let i = 0; i < visibleAccountIds.length; i += 25) {
          const chunk = visibleAccountIds.slice(i, i + 25)
          const { data, error: campaignsError } = await supabase
            .from('linkedin_ad_campaigns')
            .select('id, account_id, name, status, run_schedule_start, run_schedule_end, total_budget_amount, total_budget_currency, locale_language, locale_country')
            .in('account_id', chunk)

          if (campaignsError) throw campaignsError
          campaigns = campaigns.concat(data || [])
        }

        let analytics = []
        const fromDate = getLookbackStartDate(ALERT_LOOKBACK_DAYS)
        for (let i = 0; i < visibleAccountIds.length; i += 25) {
          const chunk = visibleAccountIds.slice(i, i + 25)
          let from = 0
          const pageSize = 5000

          while (true) {
            const { data, error: analyticsError } = await supabase
              .from('linkedin_ad_analytics')
              .select('campaign_id, account_id, date_start, impressions, clicks, cost_in_local_currency')
              .in('account_id', chunk)
              .gte('date_start', fromDate)
              .order('date_start', { ascending: false })
              .range(from, from + pageSize - 1)

            if (analyticsError) throw analyticsError
            const rows = data || []
            analytics = analytics.concat(rows)
            if (rows.length < pageSize) break
            from += pageSize
          }
        }

        setAlerts(buildAlerts({
          accounts,
          campaigns,
          analytics,
          includeBudgetAlerts: false,
        }))
      } catch (e) {
        setError(e.message || 'Alerts laden mislukt.')
        setAlerts([])
      } finally {
        setLoading(false)
      }
    }

    load()
  }, [])

  const filteredAlerts = useMemo(() => {
    if (severityFilter === 'all') return alerts
    return alerts.filter((alert) => alert.severity === severityFilter)
  }, [alerts, severityFilter])

  const summary = useMemo(() => summarizeAlerts(alerts), [alerts])

  if (loading) return <div className="loading">Alerts laden...</div>

  return (
    <div className="zenith-page">
      <div className="zenith-shell">
        <div className="zenith-topbar">
          <div className="zenith-account">Alerts</div>
          <div className="zenith-controls">
            <select value={severityFilter} onChange={(e) => setSeverityFilter(e.target.value)} className="zenith-period-select">
              <option value="all">Alle severities</option>
              <option value="critical">Critical</option>
              <option value="warning">Warning</option>
              <option value="info">Info</option>
            </select>
          </div>
        </div>

        {error && <div className="form-msg form-error">{error}</div>}

        <div className="zenith-header">
          <div className="zenith-eyebrow">Knackpunkt Pulse</div>
          <h1 className="zenith-title">Campaign Alert Center</h1>
          <div className="zenith-subtle">Analytics-signalen op basis van de laatste {ALERT_LOOKBACK_DAYS} dagen.</div>
        </div>

        <div className="zenith-kpi-grid" style={{ marginBottom: 22 }}>
          <div className="zenith-card"><div className="zenith-label">Open alerts</div><div className="zenith-value zenith-value-compact">{fmt(summary.total)}</div></div>
          <div className="zenith-card"><div className="zenith-label">Critical</div><div className="zenith-value zenith-value-compact" style={{ color: '#f87171' }}>{fmt(summary.critical)}</div></div>
          <div className="zenith-card"><div className="zenith-label">Warning</div><div className="zenith-value zenith-value-compact" style={{ color: '#f59e0b' }}>{fmt(summary.warning)}</div></div>
          <div className="zenith-card"><div className="zenith-label">Info</div><div className="zenith-value zenith-value-compact" style={{ color: '#7dd3fc' }}>{fmt(summary.info)}</div></div>
        </div>

        <div className="zenith-table-wrap">
          <div className="zenith-table-title">Operationele signalen</div>
          <div className="alerts-feed">
            {filteredAlerts.map((alert) => (
              <article key={alert.id} className={`alert-feed-card alert-feed-card-${alert.severity}`}>
                <div className="alert-feed-top">
                  <span className={`alert-chip alert-chip-${alert.severity}`}>{alert.severity}</span>
                  <span className="alert-feed-scope">{alert.scope === 'account' ? 'Accountniveau' : 'Campagneniveau'}</span>
                </div>

                <h3 className="alert-feed-title">{alert.title}</h3>
                <p className="alert-feed-detail">{alert.detail}</p>

                <div className="alert-feed-meta">
                  <span className="alert-feed-meta-item">
                    <strong>Account</strong>
                    <span>{alert.account_name}</span>
                  </span>
                  {alert.campaign_name && (
                    <span className="alert-feed-meta-item">
                      <strong>Campagne</strong>
                      <span>{alert.campaign_name}</span>
                    </span>
                  )}
                </div>

                <div className="alert-feed-actions">
                  {alert.campaign_id ? (
                    <button className="targeting-link-btn" onClick={() => navigate(`/campaigns/${alert.campaign_id}`)}>
                      Open campagne
                    </button>
                  ) : (
                    <button className="targeting-link-btn" onClick={() => navigate(`/accounts/${alert.account_id}`)}>
                      Open account
                    </button>
                  )}
                </div>
              </article>
            ))}

            {filteredAlerts.length === 0 && (
              <div className="alert-feed-empty">Geen alerts voor deze filter.</div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
