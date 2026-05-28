import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useNavigate } from 'react-router-dom'

const ACCOUNTS_CACHE_KEY = 'knackpunkt_pulse_accounts_cache_v1'
const ACCOUNTS_CACHE_TTL_MS = 10 * 60 * 1000

const STATUS_COLORS = {
  RUNNABLE: '#22c55e',
  BILLING_HOLD: '#f59e0b',
  STOPPED: '#6b7280',
  REMOVED: '#ef4444',
  DRAFT: '#a855f7',
  ACCOUNT_END_DATE_HOLD: '#f97316',
}

function readAccountsCache() {
  try {
    const raw = localStorage.getItem(ACCOUNTS_CACHE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw)
    if (!parsed?.storedAt || !parsed?.payload) return null
    return parsed
  } catch {
    return null
  }
}

function writeAccountsCache(payload) {
  try {
    localStorage.setItem(
      ACCOUNTS_CACHE_KEY,
      JSON.stringify({ storedAt: Date.now(), payload })
    )
  } catch {
    // ignore cache write failures
  }
}

export default function Accounts() {
  const navigate = useNavigate()
  const [accounts, setAccounts] = useState([])
  const [campaignCountByAccount, setCampaignCountByAccount] = useState({})
  const [spendByAccount, setSpendByAccount] = useState({})
  const [totals, setTotals] = useState({ campaigns: 0, spend: 0 })
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState('all')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [cacheInfo, setCacheInfo] = useState(null)
  const [form, setForm] = useState({
    id: '',
    name: '',
    status: 'ACTIVE',
    servingStatus: 'RUNNABLE',
    type: 'BUSINESS',
    currency: 'EUR',
  })

  const applyAccountsPayload = (payload) => {
    setAccounts(payload.accounts || [])
    setCampaignCountByAccount(payload.campaignCountByAccount || {})
    setSpendByAccount(payload.spendByAccount || {})
    setTotals(payload.totals || { campaigns: 0, spend: 0 })
  }

  const loadAccounts = async ({ background = false } = {}) => {
    if (!background) setLoading(true)
    setError('')
    try {
      const [accountsRes, rollupRes] = await Promise.all([
        supabase.from('linkedin_ad_accounts').select('*').order('name'),
        supabase.rpc('knackpunkt_accounts_rollup'),
      ])

      if (accountsRes.error) throw accountsRes.error

      const accountRows = accountsRes.data || []
      let campaignMap = {}
      let spendMap = {}
      let totalCampaigns = 0
      let totalSpend = 0

      if (!rollupRes.error) {
        const rollupRows = rollupRes.data || []
        campaignMap = rollupRows.reduce((acc, row) => {
          const key = String(row.account_id)
          const count = Number(row.campaigns_total || 0)
          acc[key] = count
          return acc
        }, {})
        spendMap = rollupRows.reduce((acc, row) => {
          const key = String(row.account_id)
          const amount = Number(row.spend_total || 0)
          acc[key] = amount
          return acc
        }, {})
        totalCampaigns = rollupRows.reduce((sum, row) => sum + Number(row.campaigns_total || 0), 0)
        totalSpend = rollupRows.reduce((sum, row) => sum + Number(row.spend_total || 0), 0)
      } else {
        const [campaignsRes] = await Promise.all([
          supabase.from('linkedin_ad_campaigns').select('account_id'),
        ])
        if (campaignsRes.error) throw campaignsRes.error
        const campaignRows = campaignsRes.data || []

        campaignMap = campaignRows.reduce((acc, row) => {
          const key = String(row.account_id)
          acc[key] = (acc[key] || 0) + 1
          return acc
        }, {})

        // Fallback zonder PostgREST aggregates: haal analytics in pagina's op en tel lokaal op.
        const pageSize = 5000
        let from = 0
        spendMap = {}
        while (true) {
          const { data: chunk, error: analyticsError } = await supabase
            .from('linkedin_ad_analytics')
            .select('account_id,cost_in_local_currency')
            .range(from, from + pageSize - 1)

          if (analyticsError) throw analyticsError

          const rows = chunk || []
          for (const row of rows) {
            const key = String(row.account_id)
            spendMap[key] = (spendMap[key] || 0) + Number(row.cost_in_local_currency || 0)
          }

          if (rows.length < pageSize) break
          from += pageSize
        }

        totalCampaigns = campaignRows.length
        totalSpend = Object.values(spendMap).reduce((sum, v) => sum + Number(v || 0), 0)

        setError('RPC ontbreekt nog; fallback gebruikt. Draai SQL functie in Supabase voor stabiele en snellere totalen.')
      }

      const payload = {
        accounts: accountRows,
        campaignCountByAccount: campaignMap,
        spendByAccount: spendMap,
        totals: {
        campaigns: totalCampaigns,
        spend: totalSpend,
        },
      }
      applyAccountsPayload(payload)
      writeAccountsCache(payload)
      setCacheInfo({ source: 'live', storedAt: Date.now() })
    } catch (e) {
      if (background && accounts.length > 0) {
        setError(`Live verversen mislukt; cached data getoond. (${e.message || 'onbekende fout'})`)
      } else {
        setError(e.message || 'Laden mislukt.')
        setAccounts([])
        setCampaignCountByAccount({})
        setSpendByAccount({})
        setTotals({ campaigns: 0, spend: 0 })
      }
    } finally {
      if (!background) setLoading(false)
    }
  }

  useEffect(() => {
    const cached = readAccountsCache()
    const hasFreshCache = cached && (Date.now() - cached.storedAt <= ACCOUNTS_CACHE_TTL_MS)

    if (cached?.payload) {
      applyAccountsPayload(cached.payload)
      setCacheInfo({ source: 'cache', storedAt: cached.storedAt })
      setLoading(false)
    }

    loadAccounts({ background: Boolean(hasFreshCache || cached?.payload) })
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

  const handleChange = (e) => {
    const { name, value } = e.target
    setForm(prev => ({ ...prev, [name]: value }))
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    setSuccess('')

    if (!form.id.trim() || !form.name.trim()) {
      setError('ID en naam zijn verplicht.')
      return
    }

    setSaving(true)
    const payload = {
      id: form.id.trim(),
      name: form.name.trim(),
      status: form.status,
      serving_statuses: [form.servingStatus],
      type: form.type || null,
      currency: form.currency || null,
    }

    const { error: insertError } = await supabase
      .from('linkedin_ad_accounts')
      .insert(payload)

    if (insertError) {
      setError(insertError.message)
      setSaving(false)
      return
    }

    setForm(prev => ({ ...prev, id: '', name: '' }))
    setSuccess('Account toegevoegd.')
    setSaving(false)
    loadAccounts()
  }

  if (loading) return <div className="loading">Laden...</div>

  const eur = (n) => `€${Number(n || 0).toLocaleString('nl-NL', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

  return (
    <div>
<h1 className="page-title">Accounts <span className="count">{accounts.length}</span></h1>

<div className="accounts-overview">
  <div className="accounts-overview-item">
    <span>Accounts</span>
    <strong>{accounts.length}</strong>
  </div>
  <div className="accounts-overview-item">
    <span>Totaal campagnes</span>
    <strong>{totals.campaigns.toLocaleString('nl-NL')}</strong>
  </div>
  <div className="accounts-overview-item">
    <span>Totaal uitgegeven</span>
    <strong>{eur(totals.spend)}</strong>
  </div>
</div>

<form className="account-form" onSubmit={handleSubmit}>
  <input name="id" value={form.id} onChange={handleChange} placeholder="Account ID" />
  <input name="name" value={form.name} onChange={handleChange} placeholder="Account naam" />
  <select name="servingStatus" value={form.servingStatus} onChange={handleChange}>
    <option value="RUNNABLE">RUNNABLE</option>
    <option value="BILLING_HOLD">BILLING_HOLD</option>
    <option value="STOPPED">STOPPED</option>
    <option value="DRAFT">DRAFT</option>
    <option value="REMOVED">REMOVED</option>
  </select>
  <select name="status" value={form.status} onChange={handleChange}>
    <option value="ACTIVE">ACTIVE</option>
    <option value="REMOVED">REMOVED</option>
    <option value="DRAFT">DRAFT</option>
  </select>
  <input name="type" value={form.type} onChange={handleChange} placeholder="Type" />
  <input name="currency" value={form.currency} onChange={handleChange} placeholder="Valuta" />
  <button type="submit" className="add-btn" disabled={saving}>
    {saving ? 'Opslaan...' : 'Account toevoegen'}
  </button>
</form>

{error && <div className="form-msg form-error">{error}</div>}
{success && <div className="form-msg form-success">{success}</div>}
{cacheInfo?.storedAt && (
  <div className="form-msg" style={{ opacity: 0.8 }}>
    Data bron: {cacheInfo.source === 'cache' ? 'cache' : 'live'} · bijgewerkt: {new Date(cacheInfo.storedAt).toLocaleString('nl-NL')}
  </div>
)}

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
              <th>Campagnes</th>
              <th>Uitgegeven</th>
              <th>Valuta</th>
              <th>ID</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map(a => (
              <tr key={a.id} style={{ cursor: 'pointer' }} onClick={() => navigate(`/accounts/${a.id}`)}>
                <td className="name-cell">{a.name}</td>
                <td>
                  <span className="badge" style={{ background: STATUS_COLORS[a.serving_statuses?.[0]] + '20', color: STATUS_COLORS[a.serving_statuses?.[0]] }}>
                    {a.serving_statuses?.[0] || a.status}
                  </span>
                </td>
                <td>{a.type}</td>
                <td>{(campaignCountByAccount[String(a.id)] || 0).toLocaleString('nl-NL')}</td>
                <td>{eur(spendByAccount[String(a.id)] || 0)}</td>
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
