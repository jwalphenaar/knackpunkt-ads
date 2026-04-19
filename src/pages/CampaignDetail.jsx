import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts'

const fmt = (n) => n ? Number(n).toLocaleString('nl-NL') : '—'
const eur = (n) => n ? `€${Number(n).toLocaleString('nl-NL', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : '—'
const pct = (a, b) => (a && b && b > 0) ? `${((a / b) * 100).toFixed(2)}%` : '—'

const SENIORITY_MAP = {
  '1': 'Unpaid', '2': 'Training', '3': 'Entry', '4': 'Senior',
  '5': 'Manager', '6': 'Director', '7': 'VP', '8': 'CXO', '9': 'Partner', '10': 'Owner'
}

const COMPANY_SIZE_MAP = {
  'SIZE_1': '1', 'SIZE_2_TO_10': '2-10', 'SIZE_11_TO_50': '11-50',
  'SIZE_51_TO_200': '51-200', 'SIZE_201_TO_500': '201-500', 'SIZE_501_TO_1000': '501-1000',
  'SIZE_1001_TO_5000': '1001-5000', 'SIZE_5001_TO_10000': '5001-10000', 'SIZE_10001_OR_MORE': '10001+'
}

const SIZE_ORDER = ['SIZE_1','SIZE_2_TO_10','SIZE_11_TO_50','SIZE_51_TO_200','SIZE_201_TO_500','SIZE_501_TO_1000','SIZE_1001_TO_5000','SIZE_5001_TO_10000','SIZE_10001_OR_MORE']
const COLORS = ['#0077b5','#00a0dc','#f59e0b','#22c55e','#ef4444','#a855f7','#f97316','#06b6d4','#84cc16','#ec4899']

const heatColor = (value, allValues) => {
  if (!value || allValues.every(v => !v)) return {}
  const max = Math.max(...allValues.filter(v => v))
  const min = Math.min(...allValues.filter(v => v))
  if (max === min) return {}
  const ratio = (value - min) / (max - min)
  const r = Math.round(255 - ratio * 180)
  const g = Math.round(100 + ratio * 155)
  const b = Math.round(100 - ratio * 60)
  return { background: `rgba(${r},${g},${b},0.15)` }
}

const resolveLabel = (pivotType, pivotValue) => {
  const val = pivotValue.split(':').pop()
  if (pivotType === 'MEMBER_SENIORITY') return SENIORITY_MAP[val] || val
  if (pivotType === 'MEMBER_COMPANY_SIZE') return COMPANY_SIZE_MAP[val] || val
  return val
}

const STATUS_COLORS = {
  ACTIVE: '#22c55e', PAUSED: '#f59e0b', COMPLETED: '#6b7280',
  CANCELED: '#ef4444', DRAFT: '#a855f7', ARCHIVED: '#9ca3af',
}

export default function CampaignDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [campaign, setCampaign] = useState(null)
  const [account, setAccount] = useState(null)
  const [analytics, setAnalytics] = useState([])
  const [demographics, setDemographics] = useState({})
  const [loading, setLoading] = useState(true)
  const [sortField, setSortField] = useState('date_start')
  const [sortDir, setSortDir] = useState('desc')
  const [dateFilter, setDateFilter] = useState('all')
  const [customStart, setCustomStart] = useState('')
  const [customEnd, setCustomEnd] = useState('')

  useEffect(() => {
    Promise.all([
      supabase.from('linkedin_ad_campaigns').select('*').eq('id', id).single(),
      supabase.from('linkedin_ad_analytics').select('*').eq('campaign_id', id).order('date_start', { ascending: true }),
      supabase.from('linkedin_ad_demographics').select('*').eq('campaign_id', id).limit(15000),
    ]).then(async ([{ data: camp }, { data: an }, { data: demo }]) => {
      setCampaign(camp)
      setAnalytics(an || [])
      const grouped = {}
      for (const row of (demo || [])) {
        if (!grouped[row.pivot_type]) grouped[row.pivot_type] = []
        grouped[row.pivot_type].push(row)
      }
      setDemographics(grouped)
      if (camp?.account_id) {
        const { data: acc } = await supabase.from('linkedin_ad_accounts').select('name').eq('id', camp.account_id).single()
        setAccount(acc)
      }
      setLoading(false)
    })
  }, [id])

  if (loading) return <div className="loading">Loading...</div>
  if (!campaign) return <div className="loading">Campaign not found.</div>

  const handleSort = (field) => {
    if (sortField === field) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setSortField(field); setSortDir('desc') }
  }

  const SortIcon = ({ field }) => {
    if (sortField !== field) return <span style={{ color: 'rgba(255,255,255,0.4)', fontSize: 10 }}> ↕</span>
    return <span style={{ fontSize: 10 }}>{sortDir === 'asc' ? ' ↑' : ' ↓'}</span>
  }

  const getDateRange = () => {
    const now = new Date()
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
    if (dateFilter === 'today') return [today, today]
    if (dateFilter === 'yesterday') {
      const y = new Date(today); y.setDate(y.getDate() - 1)
      return [y, y]
    }
    if (dateFilter === 'month') return [new Date(now.getFullYear(), now.getMonth(), 1), today]
    if (dateFilter === 'quarter') {
      const q = Math.floor(now.getMonth() / 3)
      return [new Date(now.getFullYear(), q * 3, 1), today]
    }
    return [null, null]
  }

  const filteredAnalytics = analytics.filter(row => {
    if (dateFilter === 'all') return true
    if (dateFilter === 'custom') {
      if (!customStart || !customEnd) return true
      const d = new Date(row.date_start)
      return d >= new Date(customStart) && d <= new Date(customEnd)
    }
    const [start, end] = getDateRange()
    if (!start) return true
    const d = new Date(row.date_start)
    return d >= start && d <= end
  }).sort((a, b) => {
    let aVal = a[sortField]
    let bVal = b[sortField]
    if (sortField === 'ctr') {
      aVal = a.impressions > 0 ? a.clicks / a.impressions : 0
      bVal = b.impressions > 0 ? b.clicks / b.impressions : 0
    }
    if (!aVal && aVal !== 0) return 1
    if (!bVal && bVal !== 0) return -1
    if (aVal < bVal) return sortDir === 'asc' ? -1 : 1
    if (aVal > bVal) return sortDir === 'asc' ? 1 : -1
    return 0
  })

  const totals = filteredAnalytics.reduce((acc, row) => {
    acc.impressions += row.impressions || 0
    acc.clicks += row.clicks || 0
    acc.cost += parseFloat(row.cost_in_local_currency || 0)
    acc.leads += row.one_click_leads || 0
    acc.lead_opens += row.one_click_lead_form_opens || 0
    acc.conversions += row.external_website_conversions || 0
    acc.likes += row.likes || 0
    acc.follows += row.follows || 0
    acc.video_views += row.video_views || 0
    acc.video_completions += row.video_completions || 0
    acc.reach += row.approximate_member_reach || 0
    acc.engagements += row.total_engagements || 0
    return acc
  }, { impressions: 0, clicks: 0, cost: 0, leads: 0, lead_opens: 0, conversions: 0, likes: 0, follows: 0, video_views: 0, video_completions: 0, reach: 0, engagements: 0 })

  return (
    <div>
      <button className="back-btn" onClick={() => navigate('/campaigns')}>← Back</button>

      <div className="detail-hero">
        <div className="detail-hero-left">
          <div className="detail-account-name">{account?.name}</div>
          <h1 className="detail-title">{campaign.name}</h1>
          <div className="detail-meta">
            <span className="badge" style={{ background: (STATUS_COLORS[campaign.status] || '#9ca3af') + '30', color: STATUS_COLORS[campaign.status] || '#9ca3af', border: `1px solid ${STATUS_COLORS[campaign.status] || '#9ca3af'}` }}>{campaign.status}</span>
            {campaign.objective_type && <span className="meta-tag">{campaign.objective_type}</span>}
            {campaign.format && <span className="meta-tag">{campaign.format}</span>}
            {campaign.type && <span className="meta-tag">{campaign.type}</span>}
            {campaign.locale_language && <span className="meta-tag">{campaign.locale_language}-{campaign.locale_country}</span>}
          </div>
        </div>
      </div>

      <div className="info-grid">
        <div className="info-card info-card-blue">
          <h3>Budget & Bidding</h3>
          <div className="info-rows">
            {campaign.daily_budget_amount && <div><span>Daily budget</span><strong>{eur(campaign.daily_budget_amount)} {campaign.daily_budget_currency}</strong></div>}
            {campaign.total_budget_amount && <div><span>Total budget</span><strong>{eur(campaign.total_budget_amount)} {campaign.total_budget_currency}</strong></div>}
            {campaign.bid_amount && <div><span>Bid</span><strong>{eur(campaign.bid_amount)} {campaign.bid_currency}</strong></div>}
            {campaign.unit_cost_amount && <div><span>Unit cost</span><strong>{eur(campaign.unit_cost_amount)} {campaign.unit_cost_currency}</strong></div>}
            {campaign.cost_type && <div><span>Cost type</span><strong>{campaign.cost_type}</strong></div>}
          </div>
        </div>

        <div className="info-card info-card-blue">
          <h3>Schedule</h3>
          <div className="info-rows">
            {campaign.run_schedule_start && <div><span>Start</span><strong>{new Date(campaign.run_schedule_start).toLocaleDateString('en-GB')}</strong></div>}
            {campaign.run_schedule_end && <div><span>End</span><strong>{new Date(campaign.run_schedule_end).toLocaleDateString('en-GB')}</strong></div>}
            {campaign.created_at && <div><span>Created</span><strong>{new Date(campaign.created_at).toLocaleDateString('en-GB')}</strong></div>}
            {campaign.last_modified_at && <div><span>Last modified</span><strong>{new Date(campaign.last_modified_at).toLocaleDateString('en-GB')}</strong></div>}
          </div>
        </div>

        <div className="info-card info-card-blue">
          <h3>Optimization & Delivery</h3>
          <div className="info-rows">
            {campaign.optimization_target_type && <div><span>Optimization goal</span><strong>{campaign.optimization_target_type}</strong></div>}
            {campaign.creative_selection && <div><span>Ad selection</span><strong>{campaign.creative_selection}</strong></div>}
            {campaign.frequency_cap && <div><span>Frequency cap</span><strong>{campaign.frequency_cap}x</strong></div>}
            <div><span>Audience expansion</span><strong>{campaign.audience_expansion_enabled ? '✓ On' : '✗ Off'}</strong></div>
            <div><span>Off-platform delivery</span><strong>{campaign.off_platform_delivery_enabled ? '✓ On' : '✗ Off'}</strong></div>
          </div>
        </div>

        <div className="info-card info-card-blue">
          <h3>Targeting</h3>
          <div className="info-rows">
            {campaign.locale_language && <div><span>Language</span><strong>{campaign.locale_language}-{campaign.locale_country}</strong></div>}
            {campaign.associated_entity && <div><span>Associated entity</span><strong>{campaign.associated_entity.split(':').pop()}</strong></div>}
            {campaign.campaign_group_id && <div><span>Campaign group ID</span><strong>{campaign.campaign_group_id}</strong></div>}
            {campaign.targeting_criteria && <div><span>Targeting</span><strong style={{ fontSize: 11, color: '#93c5fd' }}>{Object.keys(campaign.targeting_criteria).length} criteria set</strong></div>}
          </div>
        </div>
      </div>

      <div className="kpi-grid">
        <div className="kpi-card"><div className="kpi-label">Impressions</div><div className="kpi-value">{fmt(totals.impressions)}</div></div>
        <div className="kpi-card"><div className="kpi-label">Reach</div><div className="kpi-value">{fmt(totals.reach)}</div></div>
        <div className="kpi-card"><div className="kpi-label">Clicks</div><div className="kpi-value">{fmt(totals.clicks)}</div></div>
        <div className="kpi-card"><div className="kpi-label">CTR</div><div className="kpi-value">{pct(totals.clicks, totals.impressions)}</div></div>
        <div className="kpi-card"><div className="kpi-label">Spent</div><div className="kpi-value">{eur(totals.cost)}</div></div>
        <div className="kpi-card"><div className="kpi-label">CPM</div><div className="kpi-value">{totals.impressions > 0 ? eur((totals.cost / totals.impressions) * 1000) : '—'}</div></div>
        <div className="kpi-card"><div className="kpi-label">CPC</div><div className="kpi-value">{totals.clicks > 0 ? eur(totals.cost / totals.clicks) : '—'}</div></div>
        <div className="kpi-card"><div className="kpi-label">Leads</div><div className="kpi-value">{fmt(totals.leads)}</div></div>
        <div className="kpi-card"><div className="kpi-label">Lead form opens</div><div className="kpi-value">{fmt(totals.lead_opens)}</div></div>
        <div className="kpi-card"><div className="kpi-label">Conversions</div><div className="kpi-value">{fmt(totals.conversions)}</div></div>
        <div className="kpi-card"><div className="kpi-label">Video views</div><div className="kpi-value">{fmt(totals.video_views)}</div></div>
        <div className="kpi-card"><div className="kpi-label">Video completions</div><div className="kpi-value">{fmt(totals.video_completions)}</div></div>
        <div className="kpi-card"><div className="kpi-label">Likes</div><div className="kpi-value">{fmt(totals.likes)}</div></div>
        <div className="kpi-card"><div className="kpi-label">Follows</div><div className="kpi-value">{fmt(totals.follows)}</div></div>
        <div className="kpi-card"><div className="kpi-label">Engagements</div><div className="kpi-value">{fmt(totals.engagements)}</div></div>
        <div className="kpi-card"><div className="kpi-label">Engagement rate</div><div className="kpi-value">{pct(totals.engagements, totals.impressions)}</div></div>
      </div>

      <h2 className="section-title">Daily data <span className="count">{filteredAnalytics.length} days</span></h2>

      <div className="date-filters">
        {[['all','All time'],['today','Today'],['yesterday','Yesterday'],['month','This month'],['quarter','This quarter'],['custom','Custom']].map(([key, label]) => (
          <button key={key} className={`filter-btn ${dateFilter === key ? 'active' : ''}`} onClick={() => setDateFilter(key)}>{label}</button>
        ))}
        {dateFilter === 'custom' && (
          <div className="custom-dates">
            <input type="date" value={customStart} onChange={e => setCustomStart(e.target.value)} />
            <span>→</span>
            <input type="date" value={customEnd} onChange={e => setCustomEnd(e.target.value)} />
          </div>
        )}
      </div>

      <div className="table-wrapper" style={{ overflowX: 'auto' }}>
        <table className="data-table" style={{ width: '100%' }}>
          <thead>
            <tr>
              {[['date_start','Date'],['impressions','Impressions'],['approximate_member_reach','Reach'],['clicks','Clicks'],['ctr','CTR'],['cost_in_local_currency','Cost'],['','CPM'],['','CPC'],['one_click_leads','Leads'],['one_click_lead_form_opens','Form opens'],['external_website_conversions','Conversions'],['video_views','Video views'],['likes','Likes'],['follows','Follows']].map(([field, label]) => (
                <th key={label} onClick={() => field && handleSort(field)} style={{ cursor: field ? 'pointer' : 'default' }}>
                  {label}{field && <SortIcon field={field} />}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {(() => {
              const allImpressions = filteredAnalytics.map(r => r.impressions)
              const allClicks = filteredAnalytics.map(r => r.clicks)
              const allCost = filteredAnalytics.map(r => parseFloat(r.cost_in_local_currency || 0))
              const allCtr = filteredAnalytics.map(r => r.impressions > 0 ? r.clicks / r.impressions : 0)
              const allLeads = filteredAnalytics.map(r => r.one_click_leads)
              const allViews = filteredAnalytics.map(r => r.video_views)

              return filteredAnalytics.map((row, i) => (
                <tr key={i}>
                  <td>{new Date(row.date_start).toLocaleDateString('en-GB')}</td>
                  <td style={heatColor(row.impressions, allImpressions)}>{fmt(row.impressions)}</td>
                  <td>{fmt(row.approximate_member_reach)}</td>
                  <td style={heatColor(row.clicks, allClicks)}>{fmt(row.clicks)}</td>
                  <td style={heatColor(row.impressions > 0 ? row.clicks/row.impressions : 0, allCtr)}>{pct(row.clicks, row.impressions)}</td>
                  <td style={heatColor(parseFloat(row.cost_in_local_currency || 0), allCost)}>{eur(row.cost_in_local_currency)}</td>
                  <td>{row.impressions > 0 ? eur((row.cost_in_local_currency / row.impressions) * 1000) : '—'}</td>
                  <td>{row.clicks > 0 ? eur(row.cost_in_local_currency / row.clicks) : '—'}</td>
                  <td style={heatColor(row.one_click_leads, allLeads)}>{fmt(row.one_click_leads)}</td>
                  <td>{fmt(row.one_click_lead_form_opens)}</td>
                  <td>{fmt(row.external_website_conversions)}</td>
                  <td style={heatColor(row.video_views, allViews)}>{fmt(row.video_views)}</td>
                  <td>{fmt(row.likes)}</td>
                  <td>{fmt(row.follows)}</td>
                </tr>
              ))
            })()}
          </tbody>
        </table>
      </div>

      {Object.keys(demographics).length > 0 && (
        <div className="demo-section">
          <h2 className="section-title">Audience insights</h2>
          <div className="demo-grid">

            {demographics.MEMBER_SENIORITY && (
              <div className="demo-card">
                <h3>Seniority level</h3>
                <ResponsiveContainer width="100%" height={250}>
                  <PieChart>
                    <Pie
                      data={demographics.MEMBER_SENIORITY
                        .sort((a,b) => b.impressions - a.impressions)
                        .map(d => ({ name: resolveLabel('MEMBER_SENIORITY', d.pivot_value), value: d.impressions }))}
                      cx="50%" cy="50%" outerRadius={90}
                      dataKey="value" nameKey="name"
                      label={({ name, percent }) => `${name} ${(percent*100).toFixed(0)}%`}
                    >
                      {demographics.MEMBER_SENIORITY.map((_, i) => (
                        <Cell key={i} fill={COLORS[i % COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip formatter={(v) => fmt(v)} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            )}

            {demographics.MEMBER_COMPANY_SIZE && (
              <div className="demo-card">
                <h3>Company size</h3>
                <ResponsiveContainer width="100%" height={250}>
                  <BarChart data={demographics.MEMBER_COMPANY_SIZE
                    .sort((a,b) => SIZE_ORDER.indexOf(a.pivot_value.split(':').pop()) - SIZE_ORDER.indexOf(b.pivot_value.split(':').pop()))
                    .map(d => ({ name: resolveLabel('MEMBER_COMPANY_SIZE', d.pivot_value), Impressions: d.impressions, Clicks: d.clicks }))}>
                    <XAxis dataKey="name" tick={{ fontSize: 10 }} />
                    <YAxis tick={{ fontSize: 11 }} />
                    <Tooltip />
                    <Bar dataKey="Impressions" fill="#0077b5" />
                    <Bar dataKey="Clicks" fill="#f59e0b" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}

            {demographics.MEMBER_INDUSTRY && (
              <div className="demo-card">
                <h3>Top 15 industries</h3>
                <ResponsiveContainer width="100%" height={350}>
                  <BarChart layout="vertical"
                    data={demographics.MEMBER_INDUSTRY
                      .sort((a,b) => b.impressions - a.impressions)
                      .slice(0, 15)
                      .map(d => ({ name: resolveLabel('MEMBER_INDUSTRY', d.pivot_value), Impressions: d.impressions }))}>
                    <XAxis type="number" tick={{ fontSize: 11 }} />
                    <YAxis type="category" dataKey="name" tick={{ fontSize: 11 }} width={180} />
                    <Tooltip />
                    <Bar dataKey="Impressions" fill="#0077b5" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}

            {demographics.MEMBER_JOB_TITLE && (
              <div className="demo-card">
                <h3>Top 20 job titles</h3>
                <ResponsiveContainer width="100%" height={450}>
                  <BarChart layout="vertical"
                    data={demographics.MEMBER_JOB_TITLE
                      .sort((a,b) => b.impressions - a.impressions)
                      .slice(0, 20)
                      .map(d => ({ name: resolveLabel('MEMBER_JOB_TITLE', d.pivot_value), Impressions: d.impressions, Clicks: d.clicks }))}>
                    <XAxis type="number" tick={{ fontSize: 11 }} />
                    <YAxis type="category" dataKey="name" tick={{ fontSize: 11 }} width={220} />
                    <Tooltip />
                    <Bar dataKey="Impressions" fill="#0077b5" />
                    <Bar dataKey="Clicks" fill="#f59e0b" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}

            {demographics.MEMBER_COMPANY && (
              <div className="demo-card">
                <h3>Top 20 companies</h3>
                <ResponsiveContainer width="100%" height={450}>
                  <BarChart layout="vertical"
                    data={demographics.MEMBER_COMPANY
                      .sort((a,b) => b.impressions - a.impressions)
                      .slice(0, 20)
                      .map(d => ({ name: resolveLabel('MEMBER_COMPANY', d.pivot_value), Impressions: d.impressions, Clicks: d.clicks }))}>
                    <XAxis type="number" tick={{ fontSize: 11 }} />
                    <YAxis type="category" dataKey="name" tick={{ fontSize: 11 }} width={220} />
                    <Tooltip />
                    <Bar dataKey="Impressions" fill="#0077b5" />
                    <Bar dataKey="Clicks" fill="#f59e0b" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}

            {demographics.MEMBER_COUNTRY && (
              <div className="demo-card">
                <h3>Top 20 countries</h3>
                <ResponsiveContainer width="100%" height={450}>
                  <BarChart layout="vertical"
                    data={demographics.MEMBER_COUNTRY
                      .sort((a,b) => b.impressions - a.impressions)
                      .slice(0, 20)
                      .map(d => ({ name: resolveLabel('MEMBER_COUNTRY', d.pivot_value), Impressions: d.impressions, Clicks: d.clicks }))}>
                    <XAxis type="number" tick={{ fontSize: 11 }} />
                    <YAxis type="category" dataKey="name" tick={{ fontSize: 11 }} width={220} />
                    <Tooltip />
                    <Bar dataKey="Impressions" fill="#0077b5" />
                    <Bar dataKey="Clicks" fill="#f59e0b" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}

            {demographics.MEMBER_REGION && (
              <div className="demo-card">
                <h3>Top 20 regions</h3>
                <ResponsiveContainer width="100%" height={450}>
                  <BarChart layout="vertical"
                    data={demographics.MEMBER_REGION
                      .sort((a,b) => b.impressions - a.impressions)
                      .slice(0, 20)
                      .map(d => ({ name: resolveLabel('MEMBER_REGION', d.pivot_value), Impressions: d.impressions, Clicks: d.clicks }))}>
                    <XAxis type="number" tick={{ fontSize: 11 }} />
                    <YAxis type="category" dataKey="name" tick={{ fontSize: 11 }} width={220} />
                    <Tooltip />
                    <Bar dataKey="Impressions" fill="#0077b5" />
                    <Bar dataKey="Clicks" fill="#f59e0b" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}

          </div>
        </div>
      )}
    </div>
  )
}