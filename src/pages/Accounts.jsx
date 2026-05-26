import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useNavigate } from 'react-router-dom'

const STATUS_COLORS = {
  RUNNABLE: '#22c55e',
  BILLING_HOLD: '#f59e0b',
  STOPPED: '#6b7280',
  REMOVED: '#ef4444',
  DRAFT: '#a855f7',
  ACCOUNT_END_DATE_HOLD: '#f97316',
}

export default function Accounts() {
  const navigate = useNavigate()
  const [accounts, setAccounts] = useState([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState('all')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [form, setForm] = useState({
    id: '',
    name: '',
    status: 'ACTIVE',
    servingStatus: 'RUNNABLE',
    type: 'BUSINESS',
    currency: 'EUR',
  })

  const loadAccounts = () => {
    setLoading(true)
    setError('')
    supabase
      .from('linkedin_ad_accounts')
      .select('*')
      .order('name')
      .then(({ data, error: loadError }) => {
        if (loadError) {
          setError(loadError.message)
          setAccounts([])
        } else {
          setAccounts(data || [])
        }
        setLoading(false)
      })
  }

  useEffect(() => {
    loadAccounts()
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

  return (
    <div>
<h1 className="page-title">Accounts <span className="count">{accounts.length}</span></h1>

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
              <tr key={a.id} style={{ cursor: 'pointer' }} onClick={() => navigate(`/accounts/${a.id}`)}>
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
