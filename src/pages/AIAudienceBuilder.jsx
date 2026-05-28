import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'

const API = import.meta.env.VITE_API_URL

function SuggestionBlock({ title, rows, checkedMap, onToggle }) {
  return (
    <div className="targeting-group">
      <div className="targeting-group-head">
        <span className="targeting-facet">{title}</span>
      </div>
      <div className="targeting-chips">
        {rows.map((row) => (
          <label key={row.id} className="targeting-chip" style={{ display: 'inline-flex', gap: 8, alignItems: 'center' }}>
            <input
              type="checkbox"
              checked={Boolean(checkedMap[row.id])}
              onChange={(e) => onToggle(row.id, e.target.checked)}
            />
            <span>{row.name}</span>
            <span style={{ opacity: 0.75 }}>({row.score})</span>
          </label>
        ))}
        {rows.length === 0 && <span style={{ opacity: 0.8 }}>Geen suggesties</span>}
      </div>
    </div>
  )
}

export default function AIAudienceBuilder() {
  const [accounts, setAccounts] = useState([])
  const [campaignGroups, setCampaignGroups] = useState([])
  const [loadingAccounts, setLoadingAccounts] = useState(true)
  const [loadingGroups, setLoadingGroups] = useState(false)
  const [running, setRunning] = useState(false)
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [result, setResult] = useState(null)

  const [form, setForm] = useState({
    url: '',
    accountId: '',
    campaignGroupId: '',
    campaignName: '',
    objectiveType: 'WEBSITE_VISIT',
    dailyBudget: '50',
    localeLanguage: 'en',
    localeCountry: 'US',
  })

  const [selected, setSelected] = useState({
    titles: {},
    industries: {},
    locations: {},
  })

  useEffect(() => {
    const loadAccounts = async () => {
      setLoadingAccounts(true)
      try {
        const { data, error: accErr } = await supabase
          .from('linkedin_ad_accounts')
          .select('id, name, currency')
          .order('name')
        if (accErr) throw accErr
        setAccounts(data || [])
        if ((data || []).length > 0) {
          setForm((prev) => ({ ...prev, accountId: String(data[0].id) }))
        }
      } catch (e) {
        setError(e.message || 'Accounts laden mislukt.')
      } finally {
        setLoadingAccounts(false)
      }
    }
    loadAccounts()
  }, [])

  useEffect(() => {
    if (!form.accountId) return
    const loadGroups = async () => {
      setLoadingGroups(true)
      try {
        const res = await fetch(`${API}/api/linkedin-ads/ai/campaign-groups/${form.accountId}`)
        const data = await res.json()
        if (!res.ok) throw new Error(data.error || 'Campaign groups laden mislukt.')
        setCampaignGroups(data.groups || [])
        setForm((prev) => ({
          ...prev,
          campaignGroupId: data.groups?.[0]?.id ? String(data.groups[0].id) : '',
        }))
      } catch (e) {
        setCampaignGroups([])
        setForm((prev) => ({ ...prev, campaignGroupId: '' }))
        setError(e.message || 'Campaign groups laden mislukt.')
      } finally {
        setLoadingGroups(false)
      }
    }
    loadGroups()
  }, [form.accountId])

  const runSuggestion = async () => {
    setError('')
    setSuccess('')
    setResult(null)
    if (!form.url.trim()) {
      setError('Vul een URL in.')
      return
    }
    setRunning(true)
    try {
      const res = await fetch(`${API}/api/linkedin-ads/ai/audience-from-url`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          url: form.url.trim(),
          localeLanguage: form.localeLanguage,
          localeCountry: form.localeCountry,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Audience voorstel mislukt.')
      setResult(data)

      const mapFrom = (arr) => Object.fromEntries((arr || []).map((x) => [x.id, true]))
      setSelected({
        titles: mapFrom(data?.suggestions?.titles),
        industries: mapFrom(data?.suggestions?.industries),
        locations: mapFrom(data?.suggestions?.locations),
      })

      if (!form.campaignName) {
        const base = data?.signals?.title || 'AI Audience Campaign'
        setForm((prev) => ({ ...prev, campaignName: `AI - ${base}`.slice(0, 140) }))
      }
    } catch (e) {
      setError(e.message || 'Audience voorstel mislukt.')
    } finally {
      setRunning(false)
    }
  }

  const selectedIds = useMemo(() => {
    const pick = (obj) => Object.entries(obj || {}).filter(([, on]) => on).map(([id]) => id)
    return {
      titleIds: pick(selected.titles),
      industryIds: pick(selected.industries),
      locationIds: pick(selected.locations),
    }
  }, [selected])

  const createDraftCampaign = async () => {
    setError('')
    setSuccess('')
    if (!result) {
      setError('Genereer eerst een audience voorstel.')
      return
    }
    if (!form.accountId) {
      setError('Kies een account.')
      return
    }
    if (!form.campaignName.trim()) {
      setError('Vul campaign naam in.')
      return
    }
    if (selectedIds.locationIds.length === 0) {
      setError('Selecteer minimaal 1 locatie.')
      return
    }

    setCreating(true)
    try {
      const res = await fetch(`${API}/api/linkedin-ads/ai/create-draft-campaign`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          accountId: Number(form.accountId),
          campaignGroupId: form.campaignGroupId ? Number(form.campaignGroupId) : null,
          campaignName: form.campaignName.trim(),
          objectiveType: form.objectiveType,
          dailyBudget: Number(form.dailyBudget || 50),
          localeLanguage: form.localeLanguage,
          localeCountry: form.localeCountry,
          selected: selectedIds,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Draft campaign aanmaken mislukt.')
      setSuccess(`Draft campaign aangemaakt. ID: ${data.campaign_id || data.campaign_restli_id || 'onbekend'}`)
    } catch (e) {
      setError(e.message || 'Draft campaign aanmaken mislukt.')
    } finally {
      setCreating(false)
    }
  }

  if (loadingAccounts) return <div className="loading">AI Builder laden...</div>

  return (
    <div className="zenith-page">
      <div className="zenith-shell">
        <div className="zenith-header" style={{ marginTop: 14 }}>
          <div className="zenith-eyebrow">Knackpunkt Pulse</div>
          <h1 className="zenith-title">AI Audience Builder</h1>
        </div>

        <div className="table-wrapper" style={{ marginBottom: 20 }}>
          <div style={{ padding: 16 }}>
            <div className="section-title" style={{ marginBottom: 12 }}>Bron + campagne-instellingen</div>
            <div className="dropdown-filters" style={{ marginBottom: 12 }}>
              <input
                value={form.url}
                onChange={(e) => setForm((prev) => ({ ...prev, url: e.target.value }))}
                placeholder="https://voorbeeld.nl/dienst"
                style={{ minWidth: 380 }}
              />
              <select value={form.accountId} onChange={(e) => setForm((prev) => ({ ...prev, accountId: e.target.value }))}>
                {accounts.map((acc) => <option key={acc.id} value={acc.id}>{acc.name}</option>)}
              </select>
              <select value={form.campaignGroupId} onChange={(e) => setForm((prev) => ({ ...prev, campaignGroupId: e.target.value }))} disabled={loadingGroups}>
                {(campaignGroups || []).map((g) => <option key={g.id} value={g.id}>{g.name} ({g.status || '—'})</option>)}
              </select>
              <select value={form.objectiveType} onChange={(e) => setForm((prev) => ({ ...prev, objectiveType: e.target.value }))}>
                <option value="WEBSITE_VISIT">WEBSITE_VISIT</option>
                <option value="LEAD_GENERATION">LEAD_GENERATION</option>
                <option value="BRAND_AWARENESS">BRAND_AWARENESS</option>
                <option value="ENGAGEMENT">ENGAGEMENT</option>
              </select>
              <input
                value={form.dailyBudget}
                onChange={(e) => setForm((prev) => ({ ...prev, dailyBudget: e.target.value }))}
                placeholder="Dagbudget"
                style={{ width: 120 }}
              />
              <select value={form.localeLanguage} onChange={(e) => setForm((prev) => ({ ...prev, localeLanguage: e.target.value }))}>
                <option value="en">en</option>
                <option value="nl">nl</option>
                <option value="fr">fr</option>
                <option value="de">de</option>
              </select>
              <select value={form.localeCountry} onChange={(e) => setForm((prev) => ({ ...prev, localeCountry: e.target.value }))}>
                <option value="US">US</option>
                <option value="NL">NL</option>
                <option value="BE">BE</option>
                <option value="DE">DE</option>
                <option value="FR">FR</option>
                <option value="GB">GB</option>
              </select>
            </div>

            <input
              value={form.campaignName}
              onChange={(e) => setForm((prev) => ({ ...prev, campaignName: e.target.value }))}
              placeholder="Campagne naam (Draft)"
              style={{ width: '100%', marginBottom: 12 }}
            />

            <button className="add-btn" onClick={runSuggestion} disabled={running}>
              {running ? 'Analyseren...' : 'Genereer doelgroepvoorstel'}
            </button>
            <button className="add-btn" onClick={createDraftCampaign} disabled={creating || !result} style={{ marginLeft: 8 }}>
              {creating ? 'Aanmaken...' : 'Maak Draft Campaign in LinkedIn'}
            </button>

            {error && <div className="form-msg form-error" style={{ marginTop: 10 }}>{error}</div>}
            {success && <div className="form-msg form-success" style={{ marginTop: 10 }}>{success}</div>}
          </div>
        </div>

        {result && (
          <div className="table-wrapper">
            <div style={{ padding: 16, borderBottom: '1px solid rgba(255,127,58,0.2)' }}>
              <strong>Bron:</strong> {result.url}
              <div style={{ marginTop: 6, opacity: 0.85 }}>{result.signals?.title || '—'}</div>
              {result.signals?.description && <div style={{ marginTop: 4, opacity: 0.72 }}>{result.signals.description}</div>}
            </div>
            <div style={{ padding: 16 }}>
              <div className="targeting-groups">
                <SuggestionBlock
                  title="Job Titles"
                  rows={result?.suggestions?.titles || []}
                  checkedMap={selected.titles}
                  onToggle={(id, on) => setSelected((prev) => ({ ...prev, titles: { ...prev.titles, [id]: on } }))}
                />
                <SuggestionBlock
                  title="Industries"
                  rows={result?.suggestions?.industries || []}
                  checkedMap={selected.industries}
                  onToggle={(id, on) => setSelected((prev) => ({ ...prev, industries: { ...prev.industries, [id]: on } }))}
                />
                <SuggestionBlock
                  title="Locations"
                  rows={result?.suggestions?.locations || []}
                  checkedMap={selected.locations}
                  onToggle={(id, on) => setSelected((prev) => ({ ...prev, locations: { ...prev.locations, [id]: on } }))}
                />
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
