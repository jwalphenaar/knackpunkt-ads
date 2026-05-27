import { useEffect, useMemo, useState } from 'react'

const API = import.meta.env.VITE_API_URL

const TYPE_OPTIONS = [
  { key: 'titles', label: 'Job Titles' },
  { key: 'industries', label: 'Industries' },
  { key: 'companies', label: 'Companies' },
  { key: 'geo', label: 'Geo / Locations' },
  { key: 'skills', label: 'Skills' },
  { key: 'interests', label: 'Member Interests' },
]
const RESULT_PAGE_SIZE = 15

export default function ResolveData() {
  const [selected, setSelected] = useState({
    titles: true,
    industries: true,
    companies: true,
    geo: true,
    skills: true,
    interests: true,
  })
  const [job, setJob] = useState(null)
  const [error, setError] = useState('')
  const [starting, setStarting] = useState(false)
  const [seedingIndustries, setSeedingIndustries] = useState(false)
  const [seedMsg, setSeedMsg] = useState('')
  const [pageByType, setPageByType] = useState({
    titles: 1,
    industries: 1,
    companies: 1,
    geo: 1,
    skills: 1,
    interests: 1,
  })
  const [filterByType, setFilterByType] = useState({
    titles: 'all',
    industries: 'all',
    companies: 'all',
    geo: 'all',
    skills: 'all',
    interests: 'all',
  })

  const selectedTypes = useMemo(
    () => Object.entries(selected).filter(([, on]) => on).map(([k]) => k),
    [selected]
  )
  const statusOptions = useMemo(() => {
    if (!job?.types?.length) return TYPE_OPTIONS
    return TYPE_OPTIONS.filter(opt => job.types.includes(opt.key))
  }, [job])
  const resultTypeOptions = [
    { key: 'all', label: 'Alles' },
    { key: 'resolved', label: 'Resolved' },
    { key: 'missing', label: 'Missend' },
  ]

  const startResolve = async () => {
    setError('')
    if (selectedTypes.length === 0) {
      setError('Selecteer minimaal één type.')
      return
    }

    setStarting(true)
    try {
      const res = await fetch(`${API}/api/linkedin-ads/resolve/cache-targeting/start`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ types: selectedTypes }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Start mislukt')
      setJob({ id: data.job_id, status: data.status, types: data.types || selectedTypes })
      setPageByType({
        titles: 1,
        industries: 1,
        companies: 1,
        geo: 1,
        skills: 1,
        interests: 1,
      })
    } catch (e) {
      setError(e.message)
    } finally {
      setStarting(false)
    }
  }

  const seedIndustriesV2 = async () => {
    setSeedMsg('')
    setError('')
    setSeedingIndustries(true)
    try {
      const res = await fetch(`${API}/api/linkedin-ads/resolve/industries/seed-v2`, { method: 'POST' })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Seed industries mislukt')
      setSeedMsg(`Industries bijgewerkt: ${data.cached || 0}`)
    } catch (e) {
      setError(e.message || 'Seed industries mislukt')
    } finally {
      setSeedingIndustries(false)
    }
  }

  useEffect(() => {
    if (!job?.id) return
    let timer = null
    let cancelled = false

    const poll = async () => {
      try {
        const res = await fetch(`${API}/api/linkedin-ads/resolve/cache-targeting/status/${job.id}`)
        const data = await res.json()
        if (!cancelled) setJob(data)
      } catch (pollErr) {
        void pollErr
      }
      if (!cancelled && (job.status === 'running' || job.status === 'queued')) {
        timer = setTimeout(poll, 2000)
      }
    }

    poll()
    return () => {
      cancelled = true
      if (timer) clearTimeout(timer)
    }
  }, [job?.id, job?.status])

  return (
    <div className="zenith-page">
      <div className="zenith-shell">
        <div className="zenith-header" style={{ marginTop: 14 }}>
          <div className="zenith-eyebrow">Knackpunkt Pulse</div>
          <h1 className="zenith-title">Resolve Data</h1>
        </div>

        <div className="table-wrapper" style={{ marginBottom: 20 }}>
          <div style={{ padding: 16 }}>
            <div className="section-title" style={{ marginBottom: 12 }}>Wat wil je resolven?</div>
            <div className="targeting-chips" style={{ marginBottom: 16 }}>
              {TYPE_OPTIONS.map(opt => (
                <label key={opt.key} className="targeting-chip" style={{ display: 'inline-flex', gap: 8, alignItems: 'center' }}>
                  <input
                    type="checkbox"
                    checked={selected[opt.key]}
                    onChange={e => setSelected(prev => ({ ...prev, [opt.key]: e.target.checked }))}
                  />
                  {opt.label}
                </label>
              ))}
            </div>

            <button className="add-btn" onClick={startResolve} disabled={starting || (job?.status === 'running')}>
              {starting ? 'Starten...' : (job?.status === 'running' ? 'Bezig...' : 'Start Resolve Job')}
            </button>
            <button
              type="button"
              className="add-btn"
              onClick={seedIndustriesV2}
              disabled={seedingIndustries}
              style={{ marginLeft: 8 }}
            >
              {seedingIndustries ? 'Seeding...' : 'Seed Industries V2'}
            </button>
            {error && <div className="form-msg form-error" style={{ marginTop: 10 }}>{error}</div>}
            {seedMsg && <div className="form-msg form-success" style={{ marginTop: 10 }}>{seedMsg}</div>}
          </div>
        </div>

        {job && (
          <div className="table-wrapper">
            <div style={{ padding: 16, borderBottom: '1px solid rgba(255,127,58,0.2)' }}>
              <strong>Status:</strong> {job.status} {job.stage ? `· ${job.stage}` : ''}
            </div>
            <div style={{ padding: 16 }}>
              <div style={{ marginBottom: 8 }}>Job ID: <code>{job.id}</code></div>
              <div style={{ marginBottom: 8 }}>Campagnes gescand: {job.progress?.campaigns_scanned || 0}</div>
              <div className="targeting-groups">
                {statusOptions.map(opt => {
                  const p = job.progress?.[opt.key]
                  if (!p) return null
                  const rows = Array.isArray(p.rows) ? p.rows : []
                  const activeFilter = filterByType[opt.key] || 'all'
                  const filteredRows = rows.filter((row) => {
                    if (activeFilter === 'resolved') return row.resolved
                    if (activeFilter === 'missing') return !row.resolved
                    return true
                  })
                  const totalPages = Math.max(1, Math.ceil(filteredRows.length / RESULT_PAGE_SIZE))
                  const currentPage = Math.min(pageByType[opt.key] || 1, totalPages)
                  const from = (currentPage - 1) * RESULT_PAGE_SIZE
                  const pageRows = filteredRows.slice(from, from + RESULT_PAGE_SIZE)

                  return (
                    <div key={opt.key} className="targeting-group">
                      <div className="targeting-group-head">
                        <span className="targeting-facet">{opt.label}</span>
                        <span className="targeting-op-soft">{p.status || 'pending'}</span>
                      </div>
                      <div>
                        IDs: {p.total || 0}
                        {' · '}In DB: {p.from_db || 0}
                        {' · '}Nieuw: {p.new_cached || 0}
                        {' · '}Resolved: {p.cached || 0}
                        {' · '}Missen: {p.missing || 0}
                        {' · '}Dekking: {p.coverage_pct ?? 0}%
                      </div>
                      {rows.length > 0 && (
                        <div style={{ marginTop: 10 }}>
                          <div className="targeting-chips" style={{ marginBottom: 8 }}>
                            {resultTypeOptions.map(ft => (
                              <button
                                key={ft.key}
                                type="button"
                                className="targeting-chip"
                                onClick={() => {
                                  setFilterByType(prev => ({ ...prev, [opt.key]: ft.key }))
                                  setPageByType(prev => ({ ...prev, [opt.key]: 1 }))
                                }}
                                style={{
                                  borderColor: activeFilter === ft.key ? 'rgba(255,127,58,0.7)' : undefined,
                                  color: activeFilter === ft.key ? '#fff' : undefined,
                                }}
                              >
                                {ft.label}
                              </button>
                            ))}
                          </div>
                          <div style={{ border: '1px solid rgba(102,182,255,0.18)', borderRadius: 8, overflow: 'hidden' }}>
                            <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 2fr 0.8fr', gap: 10, padding: '8px 10px', background: 'rgba(255,255,255,0.04)', fontSize: 12 }}>
                              <strong>ID</strong>
                              <strong>Naam</strong>
                              <strong>Status</strong>
                            </div>
                            {pageRows.map((row) => (
                              <div key={`${opt.key}-${row.lookup_id}`} style={{ display: 'grid', gridTemplateColumns: '1.2fr 2fr 0.8fr', gap: 10, padding: '8px 10px', borderTop: '1px solid rgba(102,182,255,0.12)' }}>
                                <span>{row.lookup_id}</span>
                                <span>{row.display_name}</span>
                                <span className="targeting-op-soft">{row.source}</span>
                              </div>
                            ))}
                            {pageRows.length === 0 && (
                              <div style={{ padding: '8px 10px', borderTop: '1px solid rgba(102,182,255,0.12)' }}>
                                Geen resultaten voor deze filter.
                              </div>
                            )}
                          </div>
                          <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 8 }}>
                            <button
                              type="button"
                              className="targeting-chip"
                              disabled={currentPage <= 1}
                              onClick={() => setPageByType(prev => ({ ...prev, [opt.key]: Math.max(1, currentPage - 1) }))}
                            >
                              Vorige
                            </button>
                            <span style={{ fontSize: 13 }}>
                              Pagina {currentPage} / {totalPages} · {filteredRows.length} resultaten
                            </span>
                            <button
                              type="button"
                              className="targeting-chip"
                              disabled={currentPage >= totalPages}
                              onClick={() => setPageByType(prev => ({ ...prev, [opt.key]: Math.min(totalPages, currentPage + 1) }))}
                            >
                              Volgende
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
              {job.error && <div className="form-msg form-error" style={{ marginTop: 10 }}>{job.error}</div>}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
