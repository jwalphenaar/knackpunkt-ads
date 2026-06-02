import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'

const ACCOUNTS_CACHE_TTL_MS = 10 * 60 * 1000
const API = import.meta.env.VITE_API_URL

const STATUS_COLORS = {
  RUNNABLE: '#22c55e',
  BILLING_HOLD: '#f59e0b',
  STOPPED: '#6b7280',
  REMOVED: '#ef4444',
  DRAFT: '#a855f7',
  ACCOUNT_END_DATE_HOLD: '#f97316',
}

function getAccountsCacheKey(hiddenMode) {
  return hiddenMode
    ? 'knackpunkt_pulse_accounts_hidden_cache_v1'
    : 'knackpunkt_pulse_accounts_cache_v1'
}

function readAccountsCache(hiddenMode) {
  try {
    const raw = localStorage.getItem(getAccountsCacheKey(hiddenMode))
    if (!raw) return null
    const parsed = JSON.parse(raw)
    if (!parsed?.storedAt || !parsed?.payload) return null
    return parsed
  } catch {
    return null
  }
}

function writeAccountsCache(hiddenMode, payload) {
  try {
    localStorage.setItem(
      getAccountsCacheKey(hiddenMode),
      JSON.stringify({ storedAt: Date.now(), payload })
    )
  } catch {
    // ignore cache write failures
  }
}

export default function Accounts({ hiddenMode = false }) {
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
    setAccounts(payload?.accounts || [])
    setCampaignCountByAccount(payload?.campaignCountByAccount || {})
    setSpendByAccount(payload?.spendByAccount || {})
    setTotals(payload?.totals || { campaigns: 0, spend: 0 })
  }

  const hideModeLabel = hiddenMode ? 'uitgezette accounts' : 'accounts'

  const loadAccounts = async ({ background = false, runSync = false } = {}) => {
    if (!background) setLoading(true)
    setError('')
    try {
      if (runSync) {
        const syncRes = await fetch(`${API}/api/linkedin-ads/sync/accounts`, { method: 'POST' })
        const syncData = await syncRes.json()
        if (!syncRes.ok) throw new Error(syncData.error || 'LinkedIn account sync mislukt.')
      }

      const res = await fetch(`${API}/api/linkedin-ads/db/accounts-overview?hidden=${hiddenMode ? 'true' : 'false'}`)
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Accounts laden mislukt.')

      const payload = {
        accounts: data.accounts || [],
        campaignCountByAccount: data.campaignCountByAccount || {},
        spendByAccount: data.spendByAccount || {},
        totals: data.totals || { campaigns: 0, spend: 0 },
      }
      applyAccountsPayload(payload)
      writeAccountsCache(hiddenMode, payload)
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
    const cached = readAccountsCache(hiddenMode)
    const hasFreshCache = cached && (Date.now() - cached.storedAt <= ACCOUNTS_CACHE_TTL_MS)

    if (cached?.payload) {
      applyAccountsPayload(cached.payload)
      setCacheInfo({ source: 'cache', storedAt: cached.storedAt })
      setLoading(false)
    }

    loadAccounts({ background: Boolean(hasFreshCache || cached?.payload), runSync: true })
  }, [hiddenMode])

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
    const res = await fetch(`${API}/api/linkedin-ads/db/accounts`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id: Number(form.id.trim()),
        name: form.name.trim(),
        status: form.status,
        servingStatus: form.servingStatus,
        type: form.type || null,
        currency: form.currency || null,
      }),
    })
    const data = await res.json()
    if (!res.ok) {
      setError(data.error || 'Account toevoegen mislukt.')
      setSaving(false)
      return
    }

    applyAccountsPayload(data)
    writeAccountsCache(hiddenMode, {
      accounts: data.accounts || [],
      campaignCountByAccount: data.campaignCountByAccount || {},
      spendByAccount: data.spendByAccount || {},
      totals: data.totals || { campaigns: 0, spend: 0 },
    })
    setCacheInfo({ source: 'live', storedAt: Date.now() })
    setForm(prev => ({ ...prev, id: '', name: '' }))
    setSuccess('Account toegevoegd.')
    setSaving(false)
    loadAccounts({ background: true, runSync: false })
  }

  const toggleVisibility = async (accountId, hidden) => {
    setError('')
    setSuccess('')
    try {
      const res = await fetch(`${API}/api/linkedin-ads/db/accounts/${accountId}/visibility`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ hidden }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Account status wijzigen mislukt.')

      const payload = {
        accounts: data.accounts || [],
        campaignCountByAccount: data.campaignCountByAccount || {},
        spendByAccount: data.spendByAccount || {},
        totals: data.totals || { campaigns: 0, spend: 0 },
      }
      applyAccountsPayload(payload)
      writeAccountsCache(hiddenMode, payload)
      setCacheInfo({ source: 'live', storedAt: Date.now() })
      setSuccess(hidden ? 'Account uitgezet.' : 'Account weer aangezet.')
    } catch (e) {
      setError(e.message || 'Account status wijzigen mislukt.')
    }
  }

  if (loading) return <div className="loading">Laden...</div>

  const eur = (n) => `€${Number(n || 0).toLocaleString('nl-NL', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

  return (
    <div>
<h1 className="page-title">{hiddenMode ? 'Uitgezette accounts' : 'Accounts'} <span className="count">{accounts.length}</span></h1>

<div className="accounts-overview">
  <div className="accounts-overview-item">
    <span>{hiddenMode ? 'Uitgezet' : 'Accounts'}</span>
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

{!hiddenMode && (
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
)}

{error && <div className="form-msg form-error">{error}</div>}
{success && <div className="form-msg form-success">{success}</div>}
{cacheInfo?.storedAt && (
  <div className="form-msg" style={{ opacity: 0.8 }}>
    Data bron: {cacheInfo.source === 'cache' ? 'cache' : 'live'} · bijgewerkt: {new Date(cacheInfo.storedAt).toLocaleString('nl-NL')} · lijst: {hideModeLabel}
  </div>
)}

{!hiddenMode && (
<div className="filter-bar">
  {[['all', 'Alle'], ['RUNNABLE', 'Actief'], ['BILLING_HOLD', 'Billing Hold'], ['STOPPED', 'Gestopt']].map(([key, label]) => (
    <button key={key} className={`filter-btn ${filter === key ? 'active' : ''}`} onClick={() => setFilter(key)}>
      {label} <span>{counts[key]}</span>
    </button>
  ))}
</div>
)}

      <div className="table-wrapper">
        <table className="data-table">
          <thead>
            <tr>
              <th>Naam</th>
              <th>Status</th>
              <th>API toegang</th>
              <th>Type</th>
              <th>Campagnes</th>
              <th>Uitgegeven</th>
              <th>Valuta</th>
              <th>ID</th>
              <th>Actie</th>
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
                <td>
                  <span
                    className="badge"
                    style={
                      a.api_accessible
                        ? { background: '#22c55e20', color: '#22c55e', border: '1px solid #22c55e66' }
                        : { background: '#ef444420', color: '#ef4444', border: '1px solid #ef444466' }
                    }
                    title={a.api_access_error || ''}
                  >
                    {a.api_accessible ? 'Ja' : 'Nee'}
                  </span>
                </td>
                <td>{a.type}</td>
                <td>{(campaignCountByAccount[String(a.id)] || 0).toLocaleString('nl-NL')}</td>
                <td>{eur(spendByAccount[String(a.id)] || 0)}</td>
                <td>{a.currency}</td>
                <td className="id-cell">{a.id}</td>
                <td onClick={(e) => e.stopPropagation()}>
                  <button
                    type="button"
                    className="row-action-btn"
                    onClick={() => toggleVisibility(a.id, !hiddenMode)}
                  >
                    {hiddenMode ? 'Aanzetten' : 'Uitzetten'}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
