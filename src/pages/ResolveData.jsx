import { useEffect, useMemo, useState } from 'react'

const API = import.meta.env.VITE_API_URL

const TYPE_OPTIONS = [
  { key: 'titles', label: 'Job Titles' },
  { key: 'industries', label: 'Industries' },
  { key: 'companies', label: 'Companies' },
  { key: 'geo', label: 'Geo / Locations' },
]

export default function ResolveData() {
  const [selected, setSelected] = useState({
    titles: true,
    industries: true,
    companies: true,
    geo: true,
  })
  const [job, setJob] = useState(null)
  const [error, setError] = useState('')
  const [starting, setStarting] = useState(false)

  const selectedTypes = useMemo(
    () => Object.entries(selected).filter(([, on]) => on).map(([k]) => k),
    [selected]
  )

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
      setJob({ id: data.job_id, status: data.status })
    } catch (e) {
      setError(e.message)
    } finally {
      setStarting(false)
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
      } catch {}
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
          <div className="zenith-eyebrow">Knackpunkt Ads</div>
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
            {error && <div className="form-msg form-error" style={{ marginTop: 10 }}>{error}</div>}
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
                {TYPE_OPTIONS.map(opt => {
                  const p = job.progress?.[opt.key]
                  if (!p) return null
                  return (
                    <div key={opt.key} className="targeting-group">
                      <div className="targeting-group-head">
                        <span className="targeting-facet">{opt.label}</span>
                        <span className="targeting-op-soft">{p.status || 'pending'}</span>
                      </div>
                      <div>IDs: {p.total || 0} · Cached: {p.cached || 0}</div>
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

