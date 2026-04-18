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
  'A': '1', 'B': '2-10', 'C': '11-50', 'D': '51-200',
  'E': '201-500', 'F': '501-1000', 'G': '1001-5000', 'H': '5001-10000', 'I': '10000+'
}

const resolveLabel = (pivotType, pivotValue) => {
  const val = pivotValue.split(':').pop()
  if (pivotType === 'MEMBER_SENIORITY') return SENIORITY_MAP[val] || val
  if (pivotType === 'MEMBER_COMPANY_SIZE') return COMPANY_SIZE_MAP[val] || val
  return val
}

export default function CampaignDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [campaign, setCampaign] = useState(null)
  const [account, setAccount] = useState(null)
  const [analytics, setAnalytics] = useState([])
  const [demographics, setDemographics] = useState({})
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    Promise.all([
      supabase.from('linkedin_ad_campaigns').select('*').eq('id', id).single(),
      supabase.from('linkedin_ad_analytics').select('*').eq('campaign_id', id).order('date_start', { ascending: true }),
supabase.from('linkedin_ad_demographics').select('*').eq('campaign_id', id).limit(25000),
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

  if (loading) return <div className="loading">Laden...</div>
  if (!campaign) return <div className="loading">Campagne niet gevonden.</div>

  const totals = analytics.reduce((acc, row) => {
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

  const STATUS_COLORS = {
    ACTIVE: '#22c55e', PAUSED: '#f59e0b', COMPLETED: '#6b7280',
    CANCELED: '#ef4444', DRAFT: '#a855f7', ARCHIVED: '#9ca3af',
  }

  return (
    <div>
      <button className="back-btn" onClick={() => navigate('/campaigns')}>← Terug</button>

      <div className="detail-header">
        <div>
          <div className="detail-account">{account?.name}</div>
          <h1 className="detail-title">{campaign.name}</h1>
          <div className="detail-meta">
            <span className="badge" style={{ background: (STATUS_COLORS[campaign.status] || '#9ca3af') + '20', color: STATUS_COLORS[campaign.status] || '#9ca3af' }}>{campaign.status}</span>
            {campaign.objective_type && <span className="meta-tag">{campaign.objective_type}</span>}
            {campaign.format && <span className="meta-tag">{campaign.format}</span>}
            {campaign.locale_language && <span className="meta-tag">{campaign.locale_language}-{campaign.locale_country}</span>}
          </div>
        </div>
        <div className="detail-budget">
          {campaign.daily_budget_amount && <div><span>Budget/dag</span><strong>{eur(campaign.daily_budget_amount)}</strong></div>}
          {campaign.total_budget_amount && <div><span>Totaal budget</span><strong>{eur(campaign.total_budget_amount)}</strong></div>}
          {campaign.run_schedule_start && <div><span>Start</span><strong>{new Date(campaign.run_schedule_start).toLocaleDateString('nl-NL')}</strong></div>}
          {campaign.run_schedule_end && <div><span>Einde</span><strong>{new Date(campaign.run_schedule_end).toLocaleDateString('nl-NL')}</strong></div>}
        </div>
      </div>

      <div className="kpi-grid">
        <div className="kpi-card"><div className="kpi-label">Impressies</div><div className="kpi-value">{fmt(totals.impressions)}</div></div>
        <div className="kpi-card"><div className="kpi-label">Bereik</div><div className="kpi-value">{fmt(totals.reach)}</div></div>
        <div className="kpi-card"><div className="kpi-label">Clicks</div><div className="kpi-value">{fmt(totals.clicks)}</div></div>
        <div className="kpi-card"><div className="kpi-label">CTR</div><div className="kpi-value">{pct(totals.clicks, totals.impressions)}</div></div>
        <div className="kpi-card"><div className="kpi-label">Uitgegeven</div><div className="kpi-value">{eur(totals.cost)}</div></div>
        <div className="kpi-card"><div className="kpi-label">CPM</div><div className="kpi-value">{totals.impressions > 0 ? eur((totals.cost / totals.impressions) * 1000) : '—'}</div></div>
        <div className="kpi-card"><div className="kpi-label">CPC</div><div className="kpi-value">{totals.clicks > 0 ? eur(totals.cost / totals.clicks) : '—'}</div></div>
        <div className="kpi-card"><div className="kpi-label">Leads</div><div className="kpi-value">{fmt(totals.leads)}</div></div>
        <div className="kpi-card"><div className="kpi-label">Lead form opens</div><div className="kpi-value">{fmt(totals.lead_opens)}</div></div>
        <div className="kpi-card"><div className="kpi-label">Conversies</div><div className="kpi-value">{fmt(totals.conversions)}</div></div>
        <div className="kpi-card"><div className="kpi-label">Video views</div><div className="kpi-value">{fmt(totals.video_views)}</div></div>
        <div className="kpi-card"><div className="kpi-label">Video compleet</div><div className="kpi-value">{fmt(totals.video_completions)}</div></div>
        <div className="kpi-card"><div className="kpi-label">Likes</div><div className="kpi-value">{fmt(totals.likes)}</div></div>
        <div className="kpi-card"><div className="kpi-label">Follows</div><div className="kpi-value">{fmt(totals.follows)}</div></div>
        <div className="kpi-card"><div className="kpi-label">Engagements</div><div className="kpi-value">{fmt(totals.engagements)}</div></div>
        <div className="kpi-card"><div className="kpi-label">Engagement rate</div><div className="kpi-value">{pct(totals.engagements, totals.impressions)}</div></div>
      </div>

      <h2 className="section-title">Dagelijkse data <span className="count">{analytics.length} dagen</span></h2>
      <div className="table-wrapper" style={{ overflowX: 'auto' }}>
        <table className="data-table" style={{ width: '100%' }}>
          <thead>
            <tr>
              <th>Datum</th>
              <th>Impressies</th>
              <th>Bereik</th>
              <th>Clicks</th>
              <th>CTR</th>
              <th>Kosten</th>
              <th>CPM</th>
              <th>CPC</th>
              <th>Leads</th>
              <th>Form opens</th>
              <th>Conversies</th>
              <th>Video views</th>
              <th>Likes</th>
              <th>Follows</th>
            </tr>
          </thead>
          <tbody>
            {analytics.map((row, i) => (
              <tr key={i}>
                <td>{new Date(row.date_start).toLocaleDateString('nl-NL')}</td>
                <td>{fmt(row.impressions)}</td>
                <td>{fmt(row.approximate_member_reach)}</td>
                <td>{fmt(row.clicks)}</td>
                <td>{pct(row.clicks, row.impressions)}</td>
                <td>{eur(row.cost_in_local_currency)}</td>
                <td>{row.impressions > 0 ? eur((row.cost_in_local_currency / row.impressions) * 1000) : '—'}</td>
                <td>{row.clicks > 0 ? eur(row.cost_in_local_currency / row.clicks) : '—'}</td>
                <td>{fmt(row.one_click_leads)}</td>
                <td>{fmt(row.one_click_lead_form_opens)}</td>
                <td>{fmt(row.external_website_conversions)}</td>
                <td>{fmt(row.video_views)}</td>
                <td>{fmt(row.likes)}</td>
                <td>{fmt(row.follows)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {Object.keys(demographics).length > 0 && (
        <div className="demo-section">
          <h2 className="section-title">Doelgroep analyse</h2>
          <div className="demo-grid">

            {demographics.MEMBER_SENIORITY && (
              <div className="demo-card wide">
                <h3>Senioriteitsniveau</h3>
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
                        <Cell key={i} fill={['#0077b5','#00a0dc','#5bc4f5','#0e4f7a','#1e88e5','#42a5f5','#90caf9','#bbdefb'][i % 8]} />
                      ))}
                    </Pie>
                    <Tooltip formatter={(v) => fmt(v)} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            )}

            {demographics.MEMBER_COMPANY_SIZE && (
              <div className="demo-card wide">
                <h3>Bedrijfsgrootte</h3>
                <ResponsiveContainer width="100%" height={250}>
                  <BarChart data={demographics.MEMBER_COMPANY_SIZE
                    .sort((a,b) => b.impressions - a.impressions)
                    .map(d => ({ name: resolveLabel('MEMBER_COMPANY_SIZE', d.pivot_value), impressies: d.impressions, clicks: d.clicks }))}>
                    <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                    <YAxis tick={{ fontSize: 11 }} />
                    <Tooltip />
                    <Bar dataKey="impressies" fill="#0077b5" />
                    <Bar dataKey="clicks" fill="#00a0dc" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}

            {demographics.MEMBER_INDUSTRY && (
              <div className="demo-card wide">
                <h3>Top 15 sectoren</h3>
                <ResponsiveContainer width="100%" height={350}>
                  <BarChart layout="vertical"
                    data={demographics.MEMBER_INDUSTRY
                      .sort((a,b) => b.impressions - a.impressions)
                      .slice(0, 15)
                      .map(d => ({ name: resolveLabel('MEMBER_INDUSTRY', d.pivot_value), impressies: d.impressions }))}>
                    <XAxis type="number" tick={{ fontSize: 11 }} />
                    <YAxis type="category" dataKey="name" tick={{ fontSize: 11 }} width={180} />
                    <Tooltip />
                    <Bar dataKey="impressies" fill="#0077b5" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}

            {demographics.MEMBER_JOB_TITLE && (
              <div className="demo-card wide">
                <h3>Top 20 functietitels</h3>
                <ResponsiveContainer width="100%" height={450}>
                  <BarChart layout="vertical"
                    data={demographics.MEMBER_JOB_TITLE
                      .sort((a,b) => b.impressions - a.impressions)
                      .slice(0, 20)
                      .map(d => ({ name: resolveLabel('MEMBER_JOB_TITLE', d.pivot_value), impressies: d.impressions, clicks: d.clicks }))}>
                    <XAxis type="number" tick={{ fontSize: 11 }} />
                    <YAxis type="category" dataKey="name" tick={{ fontSize: 11 }} width={220} />
                    <Tooltip />
                    <Bar dataKey="impressies" fill="#0077b5" />
                    <Bar dataKey="clicks" fill="#00a0dc" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}

            {demographics.MEMBER_COMPANY && (
              <div className="demo-card wide">
                <h3>Top 20 bedrijven</h3>
                <ResponsiveContainer width="100%" height={450}>
                  <BarChart layout="vertical"
                    data={demographics.MEMBER_COMPANY
                      .sort((a,b) => b.impressions - a.impressions)
                      .slice(0, 20)
                      .map(d => ({ name: resolveLabel('MEMBER_COMPANY', d.pivot_value), impressies: d.impressions, clicks: d.clicks }))}>
                    <XAxis type="number" tick={{ fontSize: 11 }} />
                    <YAxis type="category" dataKey="name" tick={{ fontSize: 11 }} width={220} />
                    <Tooltip />
                    <Bar dataKey="impressies" fill="#0077b5" />
                    <Bar dataKey="clicks" fill="#00a0dc" />
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